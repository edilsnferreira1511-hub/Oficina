'use strict';
/* Testes da camada de serviços/Firestore contra o backend SIMULADO (fake-firebase.js): integração lógica, NÃO é o Firebase real.
 * Cobrem: login/perfil/sessão, leitura/gravação, persistência e recuperação, transações, permissões por perfil/base (modelo das regras),
 * conflito entre aparelhos, atomicidade e isolamento em env/teste. */
const path = require('path');
const { NS } = require('./helpers');
require(path.join(__dirname, 'services.js'));
const FAKE = require('./fake-firebase.js');
const SV = NS.services;
const NOW = Date.now();
let pass = 0, fail = 0;
const queue = [];
function atest(name, fn) { queue.push([name, fn]); }
function eq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'eq') + ': esperado ' + JSON.stringify(b) + ', obtido ' + JSON.stringify(a)); }
function ok(c, m) { if (!c) throw new Error(m || 'esperado verdadeiro'); }
async function denied(p, m) { try { await p; } catch (e) { if (/permission-denied/.test(e.code)) return; throw new Error((m || '') + ' erro inesperado: ' + e.message); } throw new Error((m || '') + ' deveria ter sido recusado (permission-denied)'); }

const U = 'env/teste/';
function world(extra) {
  const base = FAKE.create(extra);
  const a = base._admin;
  const users = [
    ['sys@t.com', 'admin_sistema', []], ['desp@t.com', 'despacho', ['x1']], ['coord@t.com', 'coord_base', ['x1']], ['sup@t.com', 'supervisor', ['x1']],
    ['coord2@t.com', 'coord_base', ['x2']], ['desp2@t.com', 'despacho', ['x2']], ['geral@t.com', 'coord_geral', []], ['mot@t.com', 'motorista', []], ['off@t.com', 'despacho', ['x1']],
  ];
  users.forEach(([e, role, x]) => {
    a.addAccount(e, 'senha-' + e, 'uid-' + e);
    a.setDoc(U + 'users/uid-' + e, { name: 'Nome ' + e, email: e, role, xptIds: x, active: e !== 'off@t.com', driverId: role === 'motorista' ? 'm1' : null });
  });
  a.addAccount('semcad@t.com', 'senha-semcad@t.com', 'uid-semcad');
  const demo = NS.data.createDemoData(NOW);
  demo.xpts.forEach((x) => a.setDoc(U + 'xpts/' + x.id, { name: x.name, active: x.active }));
  demo.regions.forEach((r) => a.setDoc(U + 'regions/' + r.id, { xptId: r.xptId, label: r.label }));
  demo.drivers.forEach((d) => a.setDoc(U + 'drivers/' + d.id, { name: d.name, ident: d.ident, xptId: d.xptId, state: d.state }));
  a.setDoc(U + 'settings/main', { stayLimitDays: 4, sizes: demo.sizes, reasons: demo.reasons });
  a.setDoc('pacotes/legado-1', { code: 'LEGADO', nota: 'dado pré-existente fora de env/teste' });
  return base;
}
/** "Aparelho" novo ligado ao mesmo banco: faz login real pelo backend simulado e monta o serviço remoto. */
async function device(base, email, opts) {
  const fb = FAKE.create(Object.assign({ state: base._admin.state() }, opts));
  const au = await fb.auth.signIn(email, 'senha-' + email);
  const p = await SV.loadProfile(fb, au);
  if (!p.ok) return { fb, profile: p };
  const D = SV.applyLoaded(SV.emptyD(), await SV.loadAll(fb, p.user));
  const svc = SV.createRemote({ backend: fb, D, store: null, user: p.user });
  return { fb, D, svc, user: p.user, who: { profile: p.user.role, operator: p.user.name } };
}
const item = (code, extra) => Object.assign({ code, size: 'M', reasonId: 'r_ausente', note: '', location: { kind: 'marcada', lat: -16.33, lng: -48.95, regionId: null } }, extra);

atest('login: senha errada, e-mail inválido, usuário sem cadastro, usuário inativo, sessão e logout', async () => {
  const w = world(), fb = FAKE.create({ state: w._admin.state() });
  await fb.auth.signIn('desp@t.com', 'errada').then(() => { throw new Error('deveria falhar'); }, (e) => eq(e.code, 'auth/invalid-credential'));
  await fb.auth.signIn('invalido', 'x').then(() => { throw new Error('deveria falhar'); }, (e) => eq(e.code, 'auth/invalid-email'));
  const sem = await device(w, 'semcad@t.com'); ok(!sem.profile.ok && sem.profile.reason === 'sem_cadastro');
  const off = await device(w, 'off@t.com'); ok(!off.profile.ok && off.profile.reason === 'inativo');
  const d = await device(w, 'desp@t.com'); eq(d.user.role, 'despacho'); eq(d.user.xptIds, ['x1']);
  let seen = 'init'; d.fb.auth.onChange((u) => { seen = u; }); await Promise.resolve(); await Promise.resolve();
  ok(seen && seen.email === 'desp@t.com');
  d.fb.auth.signOut(); await Promise.resolve(); eq(seen, null);
});
atest('sessão expira no meio do uso: gravação é recusada e nada muda no cache', async () => {
  const w = world(), d = await device(w, 'desp@t.com');
  d.fb._admin.expireSession();
  const n = d.D.packages.length, r = await d.svc.registerEntries('x1', [item('EXP-1')], d.who);
  eq(r.created.length, 0); ok(r.skipped[0].reason === 'sem_permissao' || /Nada foi gravado/.test(r.error || ''), JSON.stringify(r)); eq(d.D.packages.length, n);
  eq(w._admin.listDocs('env/teste/packages').length, 0);
});
atest('perfil vem do Firestore e ninguém altera o próprio perfil nem o de outros sem ser administrador', async () => {
  const w = world(), d = await device(w, 'desp@t.com');
  await denied(d.fb.db.runTransaction((tx) => { tx.set(U + 'users/uid-desp@t.com', { name: 'x', role: 'admin_sistema', xptIds: ['x1', 'x2'], active: true }); return Promise.resolve(); }), 'auto-promoção');
  await denied(d.fb.db.runTransaction((tx) => { tx.set(U + 'users/uid-coord@t.com', { name: 'x', role: 'despacho', xptIds: [], active: true }); return Promise.resolve(); }), 'alterar outro');
  await denied(d.fb.db.get(U + 'users/uid-coord@t.com'), 'ler cadastro de outro');
  eq(w._admin.getDoc(U + 'users/uid-desp@t.com').role, 'despacho');
  const s = await device(w, 'sys@t.com');
  await s.fb.db.runTransaction((tx) => { tx.set(U + 'users/uid-novo', { name: 'Novo', role: 'despacho', xptIds: ['x1'], active: true }); return Promise.resolve(); });
  ok(w._admin.getDoc(U + 'users/uid-novo'), 'admin do sistema cria usuário');
  await denied(s.fb.db.runTransaction((tx) => { tx.set(U + 'users/uid-sys@t.com', { name: 's', role: 'admin_sistema', xptIds: [], active: true }); return Promise.resolve(); }), 'admin não edita o próprio perfil');
});
atest('leitura por base: perfil de base vê só a própria; perfil global vê todas; outra base é recusada', async () => {
  const w = world(), a = w._admin;
  const s = await device(w, 'sys@t.com');
  const e = await device(w, 'desp2@t.com'); await e.svc.registerEntries('x2', [item('B2-1')], e.who);
  const d = await device(w, 'desp@t.com'); await d.svc.registerEntries('x1', [item('B1-1')], d.who);
  const c1 = await device(w, 'coord@t.com'); eq(c1.D.packages.map((p) => p.code), ['B1-1']); eq(c1.D.xpts.map((x) => x.id), ['x1']);
  const g = await device(w, 'geral@t.com'); eq(g.D.packages.map((p) => p.code).sort(), ['B1-1', 'B2-1']); eq(g.D.xpts.length, 3);
  await denied(c1.fb.db.list(U + 'packages', [['xptId', '==', 'x2']]), 'listar outra base');
  await denied(c1.fb.db.get(U + 'packages/pk-B2-1'), 'ler pacote de outra base');
  const m = await device(w, 'mot@t.com'); eq(m.D.packages.length, 0, 'motorista não lê pacotes');
  ok(s.user.role === 'admin_sistema');
});
atest('entrada: grava pacote+índice+evento, evita duplicata (inclusive entre bases sem revelar a base) e só despacho registra', async () => {
  const w = world(), a = w._admin;
  const d = await device(w, 'desp@t.com');
  const r = await d.svc.registerEntries('x1', [item('ent-1'), item('ENT-2', { location: { kind: 'pendente', lat: null, lng: null, regionId: null } }), item('ENT-1')], d.who);
  eq(r.created.map((p) => p.code), ['ENT-1', 'ENT-2']); eq(r.skipped.length, 1);
  const doc = a.getDoc(U + 'packages/pk-ENT-1');
  ok(doc && doc.xptId === 'x1' && doc.state === 'em_estoque' && doc.location.lat === -16.33 && doc.history.length === 1 && doc.history[0].type === 'entrada');
  ok(a.getDoc(U + 'codes/ENT-1') && a.listDocs(U + 'events').length === 2, 'índice e eventos gravados');
  ok(a.listDocs(U + 'events').every((e) => e.data.uid === 'uid-desp@t.com' && e.data.xptId === 'x1'), 'evento com o usuário autenticado');
  const d2 = await device(w, 'desp2@t.com');
  const r2 = await d2.svc.registerEntries('x2', [item('ENT-1'), item('ENT-9')], d2.who);
  eq(r2.created.map((p) => p.code), ['ENT-9']); eq(r2.skipped[0].reason, 'ja_existe'); ok(!JSON.stringify(r2).includes('x1'), 'não revela a outra base');
  const c = await device(w, 'coord@t.com');
  const r3 = await c.svc.registerEntries('x1', [item('ENT-5')], c.who); eq(r3.created.length, 0, 'coordenador não registra entrada');
  ok(!a.getDoc(U + 'packages/pk-ENT-5'));
  await denied(d.fb.db.runTransaction((tx) => { tx.set(U + 'packages/pk-HACK', { code: 'HACK', xptId: 'x2', state: 'em_estoque', activeOpId: null, history: [{}] }); return Promise.resolve(); }), 'criar pacote em outra base / sem índice');
});
atest('recuperação: outro aparelho / recarga recupera pacotes, coordenadas e histórico', async () => {
  const w = world(), d = await device(w, 'desp@t.com');
  await d.svc.registerEntries('x1', [item('REC-1')], d.who);
  const again = await device(w, 'coord@t.com');
  const p = again.D.packages.find((x) => x.code === 'REC-1');
  ok(p && p.location.lat === -16.33 && p.location.lng === -48.95 && p.history.length === 1 && p.xptId === 'x1');
});
atest('reentrada: grava evento, não duplica e preserva a localização anterior', async () => {
  const w = world(), d = await device(w, 'desp@t.com');
  await d.svc.registerEntries('x1', [item('RE-1')], d.who);
  const r = await d.svc.registerReentry('x1', 're-1', { location: { kind: 'marcada', lat: -16.4, lng: -49.0, regionId: null } }, d.who);
  ok(r.ok, JSON.stringify(r));
  const doc = w._admin.getDoc(U + 'packages/pk-RE-1');
  eq(doc.location.lat, -16.33); ok(doc.history.length >= 3 && doc.history[0].type === 'entrada'); eq(w._admin.listDocs(U + 'packages').length, 1);
  const bad = await d.svc.registerReentry('x1', 'NAO-EXISTE', {}, d.who); ok(!bad.ok);
});
async function setupOp(w, codes) {
  const d = await device(w, 'desp@t.com'); await d.svc.registerEntries('x1', codes.map((c) => item(c)), d.who);
  const c = await device(w, 'coord@t.com');
  const r = await c.svc.createAmbulance('x1', { driverId: 'm6', name: 'Amb 1', responsible: 'Resp', packageIds: codes.map((x) => 'pk-' + x) }, c.who);
  return { d, c, r };
}
atest('ambulância: id único sequencial, pacotes vinculados e em separação, QR abre a operação gravada em outro aparelho', async () => {
  const w = world(), { c, r } = await setupOp(w, ['A-1', 'A-2']);
  ok(r.ok, JSON.stringify(r)); eq(r.op.id, 'OP-0001'); eq(r.op.state, 'em_separacao'); eq(r.op.packageIds.length, 2);
  const p = w._admin.getDoc(U + 'packages/pk-A-1'); eq(p.state, 'em_separacao'); eq(p.activeOpId, 'OP-0001'); eq(p.history.at(-1).type, 'mudanca_estado');
  eq(w._admin.getDoc(U + 'counters/operations').n, 1);
  const r2 = await c.svc.registerEntries; ok(r2);
  const s = await device(w, 'sup@t.com'); const op = s.D.operations.find((o) => o.id === 'OP-0001');
  ok(op && op.name === 'Amb 1' && op.responsible === 'Resp' && op.createdBy === c.user.name, 'operação recuperada por outro usuário (QR)');
  const d = await device(w, 'desp@t.com');
  await d.svc.registerEntries('x1', [item('A-3')], d.who);
  const r3 = await c.svc.createAmbulance('x1', { driverId: 'm7', name: 'Amb 2', responsible: 'R', packageIds: ['pk-A-3'] }, c.who); ok(r3.ok); eq(r3.op.id, 'OP-0002', 'sequencial');
});
atest('o mesmo pacote nunca fica em duas operações ativas (validado no servidor/transação, mesmo com cache velho)', async () => {
  const w = world(), { c, r } = await setupOp(w, ['L-1', 'L-2']); ok(r.ok);
  const c2 = await device(w, 'sup@t.com');
  c2.D.packages.forEach((p) => { p.state = 'em_estoque'; p.activeOpId = null; }); // cache adulterado/velho
  const r2 = await c2.svc.createAmbulance('x1', { driverId: 'm1', name: 'Outra', responsible: 'R', packageIds: ['pk-L-1'] }, c2.who);
  eq(r2.ok, false); ok(/operação ativa|estoque/.test(r2.message || ''), r2.message);
  eq(w._admin.getDoc(U + 'counters/operations').n, 1, 'contador não avançou'); eq(w._admin.listDocs(U + 'operations').length, 1);
  await denied(c2.fb.db.runTransaction((tx) => tx.get(U + 'packages/pk-L-1').then((s) => { tx.set(U + 'packages/pk-L-1', Object.assign({}, s.data, { activeOpId: 'OP-9999' })); })), 'trocar vínculo diretamente');
});
atest('atomicidade: se uma parte da criação é recusada nada é gravado', async () => {
  const w = world(), d = await device(w, 'desp@t.com'); await d.svc.registerEntries('x1', [item('AT-1'), item('AT-2')], d.who);
  const c = await device(w, 'coord@t.com');
  const before = JSON.stringify(w._admin.state().docs);
  const r = await c.svc.createAmbulance('x1', { driverId: 'm1', name: 'X', responsible: 'R', packageIds: ['pk-AT-1', 'pk-INEXISTENTE'] }, c.who);
  eq(r.ok, false); eq(JSON.stringify(w._admin.state().docs), before, 'nenhum documento mudou');
});
atest('gravação que falha na rede não aparece como salva (cache e banco intactos)', async () => {
  const w = world(); let fail = false;
  const d = await device(w, 'desp@t.com', { failCommit: () => fail });
  fail = true; const n = d.D.packages.length;
  const r = await d.svc.registerEntries('x1', [item('NET-1')], d.who);
  eq(r.created.length, 0); ok(/conexão|gravad/i.test(r.error || '')); eq(d.D.packages.length, n); ok(!w._admin.getDoc(U + 'packages/pk-NET-1'));
  fail = false; const r2 = await d.svc.registerEntries('x1', [item('NET-1')], d.who); eq(r2.created.length, 1);
});
atest('bipagem remota: ok → repetido → desconhecido → pacote de outra operação; persistência e bloqueio após encerrar', async () => {
  const w = world(), { d, c, r } = await setupOp(w, ['S-1', 'S-2', 'S-3']); ok(r.ok);
  const op = c.D.operations[0];
  eq((await c.svc.scan(op, 's-1', c.who)).status, 'ok');
  eq(w._admin.getDoc(U + 'operations/OP-0001').checked['S-1'].operator, c.user.name);
  eq((await c.svc.scan(op, 'S-1', c.who)).status, 'repetido');
  eq(Object.keys(w._admin.getDoc(U + 'operations/OP-0001').checked).length, 1, 'repetido não incrementa');
  eq((await c.svc.scan(op, 'XYZ-9', c.who)).status, 'inexistente');
  await d.svc.registerEntries('x1', [item('S-9')], d.who);
  const r2 = await c.svc.createAmbulance('x1', { driverId: 'm2', name: 'Amb B', responsible: 'R', packageIds: ['pk-S-9'] }, c.who); ok(r2.ok);
  const out = await c.svc.scan(op, 'S-9', c.who); eq(out.status, 'outra_operacao'); ok(!w._admin.getDoc(U + 'operations/OP-0001').checked['S-9']);
  eq((await d.svc.scan(op, 'S-2', d.who)).status, 'ok', 'despacho também confere');
  eq((await c.svc.unscan(op, 'S-2', c.who)), true); ok(!w._admin.getDoc(U + 'operations/OP-0001').checked['S-2']);
  eq((await c.svc.scan(op, 'S-2', c.who)).status, 'ok');
});
atest('dois aparelhos bipando ao mesmo tempo: nenhuma leitura se perde (conflito resolvido por nova tentativa)', async () => {
  const w = world(), { c, r } = await setupOp(w, ['P-1', 'P-2', 'P-3', 'P-4']); ok(r.ok);
  const s = await device(w, 'sup@t.com'); const opC = c.D.operations[0], opS = s.D.operations[0];
  const res = await Promise.all([c.svc.scan(opC, 'P-1', c.who), s.svc.scan(opS, 'P-2', s.who), c.svc.scan(opC, 'P-3', c.who), s.svc.scan(opS, 'P-4', s.who)]);
  eq(res.map((x) => x.status), ['ok', 'ok', 'ok', 'ok']);
  eq(Object.keys(w._admin.getDoc(U + 'operations/OP-0001').checked).sort(), ['P-1', 'P-2', 'P-3', 'P-4']);
});
atest('saída: só os conferidos saem (em_rota); pendentes ficam em separação e na operação; perfis sem permissão são recusados', async () => {
  const w = world(), { d, c, r } = await setupOp(w, ['X-1', 'X-2', 'X-3']); ok(r.ok);
  const op = c.D.operations[0];
  await c.svc.scan(op, 'X-1', c.who); await c.svc.scan(op, 'X-2', c.who);
  const dop = d.D.operations[0] || (await device(w, 'desp@t.com')).D.operations[0];
  const rd = await (await device(w, 'desp@t.com')).svc.confirmExit({ id: 'OP-0001' }, { profile: 'despacho', operator: 'x' }); eq(rd.ok, false); // despacho não confirma saída
  eq(w._admin.getDoc(U + 'packages/pk-X-1').state, 'em_separacao');
  const ex = await c.svc.confirmExit(op, c.who); ok(ex.ok, JSON.stringify(ex)); eq(ex.departed.sort(), ['X-1', 'X-2']); eq(ex.pending, ['X-3']);
  eq(w._admin.getDoc(U + 'packages/pk-X-1').state, 'em_rota'); eq(w._admin.getDoc(U + 'packages/pk-X-3').state, 'em_separacao');
  eq(w._admin.getDoc(U + 'operations/OP-0001').state, 'saida_confirmada'); eq(w._admin.getDoc(U + 'operations/OP-0001').packageIds.length, 3);
  const h = w._admin.getDoc(U + 'packages/pk-X-1').history.at(-1); ok(/OP-0001/.test(h.note) && h.operator === c.user.name && h.at > 0 && h.xptId === 'x1', 'movimentação registrada com operação, usuário, base, data');
  ok(w._admin.listDocs(U + 'events').some((e) => e.data.pkgId === 'pk-X-1' && e.data.opId === 'OP-0001' && e.data.uid === 'uid-coord@t.com'));
});
atest('encerrar: só perfil autorizado; bloqueia novas leituras; libera vínculo; pendentes voltam ao estoque COM evento e continuam listados', async () => {
  const w = world(), { c, r } = await setupOp(w, ['C-1', 'C-2']); ok(r.ok);
  const op = c.D.operations[0]; await c.svc.scan(op, 'C-1', c.who); await c.svc.confirmExit(op, c.who);
  const rc = await c.svc.closeOperation(op, c.who); eq(rc.ok, false, 'coordenador de base não encerra'); eq(w._admin.getDoc(U + 'operations/OP-0001').state, 'saida_confirmada');
  const s = await device(w, 'sup@t.com'); const rs = await s.svc.closeOperation(s.D.operations[0], s.who); ok(rs.ok, JSON.stringify(rs)); eq(rs.pending, ['C-2']);
  const dop = w._admin.getDoc(U + 'operations/OP-0001'); eq(dop.state, 'encerrada'); eq(dop.pendingAtClose, ['C-2']); eq(dop.packageIds.length, 2);
  const p2 = w._admin.getDoc(U + 'packages/pk-C-2'); eq(p2.state, 'em_estoque'); eq(p2.activeOpId, null); ok(/pendência preservada/.test(p2.history.at(-1).note));
  eq(w._admin.getDoc(U + 'packages/pk-C-1').activeOpId, null);
  eq((await c.svc.scan(op, 'C-2', c.who)).status, 'bloqueado');
  await denied(c.fb.db.runTransaction((tx) => tx.get(U + 'operations/OP-0001').then((x) => { tx.set(U + 'operations/OP-0001', Object.assign({}, x.data, { checked: Object.assign({}, x.data.checked, { 'C-2': { at: 1, operator: 'x' } }) })); })), 'gravar direto em operação encerrada');
  const d = await device(w, 'desp@t.com'); const r2 = await c.svc.createAmbulance('x1', { driverId: 'm7', name: 'Nova', responsible: 'R', packageIds: ['pk-C-2'] }, c.who); ok(r2.ok, 'pendente liberado entra em nova operação');
});
atest('permissões no servidor (modelo das regras): perfis sem direito são recusados mesmo burlando a interface', async () => {
  const w = world(), { d, c, r } = await setupOp(w, ['R-1']); ok(r.ok);
  const raw = (dev, fn) => dev.fb.db.runTransaction((tx) => fn(tx));
  const dd = await device(w, 'desp@t.com');
  await denied(raw(dd, (tx) => tx.get(U + 'counters/operations').then(() => { tx.set(U + 'operations/OP-0777', { id: 'OP-0777', xptId: 'x1', state: 'em_separacao', history: [], packageIds: [] }); tx.set(U + 'counters/operations', { n: 2 }); })), 'despacho criando operação');
  await denied(raw(dd, (tx) => tx.get(U + 'packages/pk-R-1').then((s) => { tx.set(U + 'packages/pk-R-1', Object.assign({}, s.data, { state: 'em_rota' })); })), 'despacho dando saída');
  const cc = await device(w, 'coord2@t.com');
  await denied(raw(cc, (tx) => tx.get(U + 'packages/pk-R-1').then((s) => { tx.set(U + 'packages/pk-R-1', Object.assign({}, s.data, { note: 'invasão' })); })), 'coordenador de outra base alterando');
  const g = await device(w, 'geral@t.com');
  await denied(raw(g, (tx) => tx.get(U + 'packages/pk-R-1').then((s) => { tx.set(U + 'packages/pk-R-1', Object.assign({}, s.data, { note: 'x', history: s.data.history.concat([{ id: 'e', type: 'x', at: 1 }]) })); })), 'coordenador geral só lê');
  const cb = await device(w, 'coord@t.com');
  await denied(raw(cb, (tx) => tx.get(U + 'packages/pk-R-1').then((s) => { tx.set(U + 'packages/pk-R-1', Object.assign({}, s.data, { xptId: 'x2' })); })), 'trocar XPT de origem');
  await denied(raw(cb, (tx) => tx.get(U + 'packages/pk-R-1').then((s) => { tx.set(U + 'packages/pk-R-1', Object.assign({}, s.data, { code: 'OUTRO' })); })), 'trocar código');
  await denied(raw(cb, (tx) => tx.get(U + 'packages/pk-R-1').then((s) => { tx.set(U + 'packages/pk-R-1', Object.assign({}, s.data, { history: [] })); })), 'apagar histórico');
  await denied(raw(cb, (tx) => tx.get(U + 'packages/pk-R-1').then((s) => { const h = s.data.history.slice(); h[0] = Object.assign({}, h[0], { note: 'reescrito' }); tx.set(U + 'packages/pk-R-1', Object.assign({}, s.data, { history: h.concat([{ id: 'z', type: 'x', at: 1 }]) })); })), 'reescrever histórico');
  const evs = w._admin.listDocs(U + 'events');
  await denied(raw(cb, (tx) => { tx.set(evs[0].path, { x: 1 }); return Promise.resolve(); }), 'editar evento');
  await denied(raw(cb, (tx) => { tx.set(U + 'events/novo', { uid: 'uid-outro', xptId: 'x1', type: 'x' }); return Promise.resolve(); }), 'evento em nome de outro usuário');
  await denied(raw(cb, (tx) => { tx.set(U + 'xpts/x9', { name: 'Nova' }); return Promise.resolve(); }), 'criar XPT sem ser admin');
  await denied(raw(cb, (tx) => { tx.set('pacotes/legado-1', { x: 1 }); return Promise.resolve(); }), 'escrever fora de env/teste');
  await denied(dd.fb.db.get('pacotes/legado-1'), 'ler fora de env/teste');
  ok(d && c);
});
atest('reentrada de retorno (em_rota→estoque) por despacho é permitida; correções exigem perfil com direito', async () => {
  const w = world(), { d, c, r } = await setupOp(w, ['T-1']); ok(r.ok);
  const op = c.D.operations[0]; await c.svc.scan(op, 'T-1', c.who); await c.svc.confirmExit(op, c.who);
  const rr = await d.svc.registerReentry('x1', 'T-1', { note: 'voltou' }, d.who); ok(rr.ok, JSON.stringify(rr));
  const p = w._admin.getDoc(U + 'packages/pk-T-1'); eq(p.state, 'em_estoque'); eq(p.returns, 1); eq(p.cycle, 2);
  const tr = await d.svc.transition(d.D.packages.find((x) => x.code === 'T-1'), 'divergente', {}, d.who); eq(tr.ok, false, 'despacho não corrige estado');
});
atest('administrador do sistema cria dados iniciais de teste só quando não existem (sem sobrescrever)', async () => {
  const w = world(); w._admin.reset(); const a = w._admin; a.addAccount('sys@t.com', 'senha-sys@t.com', 'uid-sys'); a.setDoc(U + 'users/uid-sys', { name: 'Sys', role: 'admin_sistema', xptIds: [], active: true });
  a.setDoc(U + 'xpts/x1', { name: 'XPT existente', active: true });
  const s = await device(w, 'sys@t.com');
  const demo = NS.data.createDemoData(NOW);
  const r = await SV.seedTest(s.fb, s.user, { xpts: demo.xpts, regions: demo.regions, drivers: demo.drivers, settings: { stayLimitDays: 4 } }); ok(r.ok, JSON.stringify(r)); ok(r.existing >= 1);
  eq(a.getDoc(U + 'xpts/x1').name, 'XPT existente', 'existente preservado'); ok(a.getDoc(U + 'xpts/x2'));
  const again = await SV.seedTest(s.fb, s.user, { xpts: demo.xpts, regions: [], drivers: [] , settings: {} }); eq(again.created, 0);
});
atest('isolamento: toda gravação fica em env/teste; dado pré-existente fora dele permanece intacto', async () => {
  const w = world(), { r } = await setupOp(w, ['I-1']); ok(r.ok);
  const paths = Object.keys(w._admin.state().docs);
  ok(paths.every((p) => p.startsWith('env/teste/') || p === 'pacotes/legado-1'), paths.filter((p) => !p.startsWith('env/teste/')).join(','));
  eq(w._admin.getDoc('pacotes/legado-1'), { code: 'LEGADO', nota: 'dado pré-existente fora de env/teste' });
});

(async () => {
  for (const [name, fn] of queue) {
    try { await fn(); pass++; } catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + e.message); }
  }
  console.log('unit-firebase.test.js: ' + pass + ' aprovados, ' + fail + ' reprovados');
  process.exit(fail ? 1 : 0);
})();
