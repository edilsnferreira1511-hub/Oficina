const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');
admin.initializeApp();
const db = admin.firestore();
const FV = admin.firestore.FieldValue;
const AI_KEY = defineSecret('ANTHROPIC_API_KEY');
const BASE_URL = defineString('BASE_URL', { default: 'https://SEU-PROJETO.web.app' });
const AI_MODEL = defineString('AI_MODEL', { default: 'claude-sonnet-5' });
const opts = { region: 'southamerica-east1' };
const AVISO = 'Esta sugestão é apenas um auxílio técnico. O diagnóstico final deve ser realizado e validado pelo profissional responsável.';

async function roleOf(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Faça login para continuar.');
  const u = await db.doc('users/' + req.auth.uid).get();
  if (!u.exists) throw new HttpsError('permission-denied', 'Usuário sem perfil cadastrado.');
  return u.data().role;
}
const audit = (uid, action, ref) => db.collection('auditLogs').add({ uid, action, ref, at: FV.serverTimestamp() });
const calc = d => {
  const s = t => (d.items || []).filter(i => i.type === t).reduce((a, i) => a + Math.round(i.qty) * Math.round(i.unitCents), 0);
  return Math.max(0, s('Serviço') + s('Peça') + s('Outros') - (d.discountCents || 0));
};

// Assistente WKK: a chave da IA fica só aqui, nunca no frontend.
exports.askAssistant = onCall({ ...opts, secrets: [AI_KEY] }, async req => {
  const role = await roleOf(req);
  if (!['admin', 'mecanico'].includes(role)) throw new HttpsError('permission-denied', 'Sem acesso ao assistente.');
  const { osId, question } = req.data || {};
  if (!osId || !question || question.length > 2000) throw new HttpsError('invalid-argument', 'Informe a OS e a pergunta (até 2000 caracteres).');
  const os = (await db.doc('workOrders/' + osId).get()).data();
  if (!os) throw new HttpsError('not-found', 'OS não encontrada.');
  if (role === 'mecanico' && os.mechanicUid !== req.auth.uid) throw new HttpsError('permission-denied', 'Esta OS não está atribuída a você.');
  let key = '';
  try { key = AI_KEY.value(); } catch (_) {}
  if (!key) return { demo: true, aviso: AVISO, text: 'Modo demonstração: a chave da IA ainda não foi configurada (veja o README).' };
  const ctx = `Veículo: ${os.vehicleLabel || ''} ${os.year || ''}, ${os.km || ''} km\nRelato do cliente: ${os.complaint || ''}\nDiagnóstico atual: ${os.diagnosis || ''}`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: AI_MODEL.value(), max_tokens: 900,
      system: 'Você é o Assistente WKK, auxiliar técnico de uma oficina mecânica. Responda em português do Brasil com: possíveis causas, pontos de inspeção, testes recomendados e perguntas adicionais. Nunca apresente a resposta como diagnóstico definitivo.',
      messages: [{ role: 'user', content: ctx + '\n\nPergunta do mecânico: ' + question }]
    })
  });
  if (!r.ok) throw new HttpsError('unavailable', 'A IA não respondeu. Tente novamente.');
  const j = await r.json();
  await audit(req.auth.uid, 'ia_consulta', 'workOrders/' + osId);
  return { demo: false, aviso: AVISO, text: (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n') };
});

// Envia o orçamento: recalcula o total no servidor e gera o link único.
exports.sendBudget = onCall(opts, async req => {
  const role = await roleOf(req);
  if (!['admin', 'financeiro'].includes(role)) throw new HttpsError('permission-denied', 'Sem permissão.');
  const ref = db.doc('budgets/' + (req.data || {}).budgetId);
  const b = await ref.get();
  if (!b.exists) throw new HttpsError('not-found', 'Orçamento não encontrado.');
  const d = b.data();
  if (!(d.items || []).length) throw new HttpsError('failed-precondition', 'Adicione itens antes de enviar.');
  const token = crypto.randomBytes(24).toString('hex');
  await ref.update({ status: 'enviado', approvalToken: token, totalCents: calc(d), sentAt: FV.serverTimestamp(), version: (d.version || 0) + 1 });
  await db.doc('workOrders/' + d.workOrderId).update({ status: 'AGUARDANDO APROVAÇÃO' });
  await audit(req.auth.uid, 'orcamento_enviado', ref.path);
  return { link: `${BASE_URL.value()}/aprovar?t=${token}` };
});

async function byToken(t) {
  if (typeof t !== 'string' || t.length < 32) throw new HttpsError('invalid-argument', 'Link inválido.');
  const q = await db.collection('budgets').where('approvalToken', '==', t).limit(1).get();
  if (q.empty) throw new HttpsError('not-found', 'Link inválido ou já utilizado.');
  return q.docs[0];
}
exports.getBudgetByToken = onCall(opts, async req => {
  const d = (await byToken((req.data || {}).token)).data();
  return { items: d.items, discountCents: d.discountCents || 0, totalCents: d.totalCents, vehicle: d.vehicleLabel, plate: d.plate, complaint: d.complaint, osNumber: d.osNumber, notes: d.notes || '' };
});
exports.decideBudget = onCall(opts, async req => {
  const { token, decision, reason } = req.data || {};
  if (!['aprovado', 'recusado'].includes(decision)) throw new HttpsError('invalid-argument', 'Decisão inválida.');
  const snap = await byToken(token);
  await db.runTransaction(async tx => {
    const d = (await tx.get(snap.ref)).data();
    if (d.status !== 'enviado') throw new HttpsError('failed-precondition', 'Este orçamento já foi respondido.');
    tx.update(snap.ref, { status: decision, decidedAt: FV.serverTimestamp(), decisionReason: String(reason || '').slice(0, 500), decisionIp: req.rawRequest.ip || null, approvedVersion: d.version || 1, approvalToken: FV.delete() });
    tx.update(db.doc('workOrders/' + d.workOrderId), { status: decision === 'aprovado' ? 'EM ANDAMENTO' : 'AGUARDANDO ORÇAMENTO' });
    tx.set(db.collection('notifications').doc(), { toRole: 'financeiro', text: `Orçamento da OS #${d.osNumber} ${decision}`, at: FV.serverTimestamp(), read: false });
  });
  return { ok: true };
});
