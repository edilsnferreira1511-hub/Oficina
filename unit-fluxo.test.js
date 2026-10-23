'use strict';
/* Testes unitários do fluxo operacional: entrada confirmada, reentrada, ambulância, bipagem, saída, encerramento, QR. */
const { NS, test, eq, ok, done, NOW, fresh } = require('./helpers');
const A = NS.ambulance, R = NS.registry;
const ctx = (extra) => Object.assign({ nowMs: NOW, operator: 'Op Teste', authorized: true }, extra);
const loc = (lat, lng) => ({ kind: 'marcada', lat, lng, regionId: null });
function enter(D, xpt, code, l) {
  return R.registerEntries(D, xpt, [{ code, size: 'M', reasonId: 'r_ausente', note: '', location: l || loc(-16.33, -48.95) }], ctx());
}
function mk(D, codes, xpt) {
  xpt = xpt || 'x1';
  const ids = codes.map((c) => enter(D, xpt, c).created[0].id);
  return A.createAmbulance(D, xpt, { name: 'Amb 1', responsible: 'Resp', packageIds: ids }, ctx());
}

// ---------- Entrada e reentrada
test('entrada confirmada cria pacote com XPT, localização, operador e histórico', () => {
  const D = fresh(), n = D.packages.length;
  const r = enter(D, 'x1', 'ent-1'); const p = r.created[0];
  eq(D.packages.length, n + 1); eq(p.code, 'ENT-1'); eq(p.xptId, 'x1'); eq(p.state, 'em_estoque');
  eq(p.location.lat, -16.33); eq(p.history[0].type, 'entrada'); eq(p.history[0].operator, 'Op Teste');
});
test('código já existente (qualquer base) não vira duplicata', () => {
  const D = fresh(), n = D.packages.length, code = D.packages.find((p) => p.xptId === 'x2').code;
  const r = enter(D, 'x1', code); eq(r.created.length, 0); eq(r.skipped[0].reason, 'ja_existe'); eq(D.packages.length, n);
});
test('entrada rejeita coordenada inválida e não cria o pacote', () => {
  const D = fresh(), n = D.packages.length;
  eq(enter(D, 'x1', 'bad-1', loc(95, 0)).skipped[0].reason, 'dados_invalidos'); eq(D.packages.length, n);
});
test('reentrada: evento registrado, sem duplicar, localização anterior preservada', () => {
  const D = fresh(), n0 = enter(D, 'x1', 're-1').created[0], n = D.packages.length;
  const r = R.registerReentry(D, 'x1', 're-1', ctx({ location: loc(-16.4, -48.8) }));
  ok(r.ok); eq(D.packages.length, n);
  const p = D.packages.find((x) => x.code === 'RE-1');
  eq(p.location.lat, -16.33); eq(p.location.lng, -48.95); ok(p.history.length > n0.history.length);
  ok(p.history.some((e) => e.type === 'reentrada')); ok(p.history.some((e) => e.type === 'localizacao_proposta'));
  eq(p.history[0].type, 'entrada'); // histórico anterior intacto
});
test('reentrada: pacote em rota volta ao estoque com novo ciclo', () => {
  const D = fresh(), p0 = D.packages.find((p) => p.xptId === 'x1' && p.state === 'em_rota');
  const r = R.registerReentry(D, 'x1', p0.code, ctx());
  ok(r.ok); eq(r.pkg.state, 'em_estoque'); eq(r.pkg.cycle, p0.cycle + 1); eq(r.pkg.returns, p0.returns + 1);
});
test('reentrada de código de outra base: não encontrado (sem revelar)', () => {
  const D = fresh(), code = D.packages.find((p) => p.xptId === 'x2').code;
  const r = R.registerReentry(D, 'x1', code, ctx()); eq(r.ok, false); ok(!/x2|Beta/.test(r.reason));
});

// ---------- Ambulância
test('criar ambulância: id único, vínculos, estado e pacotes em separação com evento', () => {
  const D = fresh(), r = mk(D, ['a-1', 'a-2']);
  ok(r.ok); ok(/^OP-\d{4}$/.test(r.op.id)); eq(r.op.packageIds.length, 2); eq(r.op.state, 'em_separacao'); eq(r.op.xptId, 'x1');
  eq(r.op.history[0].type, 'operacao_criada');
  const p = D.packages.find((x) => x.code === 'A-1'); eq(p.state, 'em_separacao'); ok(/OP-\d{4}/.test(p.history.at(-1).note));
  const r2 = mk(D, ['a-3']); ok(r2.op.id !== r.op.id);
});
test('mesmo pacote não entra em duas operações ativas', () => {
  const D = fresh(), r = mk(D, ['b-1']);
  const again = A.createAmbulance(D, 'x1', { name: 'Amb 2', responsible: 'R', packageIds: r.op.packageIds }, ctx());
  eq(again.ok, false); ok(/não elegíveis/.test(again.errors.packageIds));
});
test('regra independente: pacote vinculado a operação ativa é recusado mesmo se o estado estiver "em_estoque"', () => {
  const D = fresh(), r = mk(D, ['b-2']);
  const p = D.packages.find((x) => x.code === 'B-2'); p.state = 'em_estoque'; // dado inconsistente de propósito
  const again = A.createAmbulance(D, 'x1', { name: 'Amb 2', responsible: 'R', packageIds: [p.id] }, ctx());
  eq(again.ok, false); ok(new RegExp(r.op.id).test(again.errors.packageIds));
});
test('criar exige permissão, nome, responsável e pacote de estoque da própria base', () => {
  const D = fresh(), id = enter(D, 'x1', 'c-1').created[0].id;
  eq(A.createAmbulance(D, 'x1', { name: 'A', responsible: 'R', packageIds: [id] }, ctx({ authorized: false })).reason, 'sem_permissao');
  ok(A.createAmbulance(D, 'x1', { name: '', responsible: 'R', packageIds: [id] }, ctx()).errors.name);
  ok(A.createAmbulance(D, 'x1', { name: 'A', responsible: '', packageIds: [id] }, ctx()).errors.responsible);
  ok(A.createAmbulance(D, 'x1', { name: 'A', responsible: 'R', packageIds: [] }, ctx()).errors.packageIds);
  const other = D.packages.find((p) => p.xptId === 'x2' && p.state === 'em_estoque');
  eq(A.createAmbulance(D, 'x1', { name: 'A', responsible: 'R', packageIds: [other.id] }, ctx()).ok, false);
  eq(other.state, 'em_estoque');
});

// ---------- Bipagem
test('bipagem correta confirma sem mudar o estado do pacote; repetida não conta', () => {
  const D = fresh(), op = mk(D, ['d-1', 'd-2']).op, st = JSON.stringify(D.packages);
  eq(A.scan(D, op, '  d-1 ', ctx()).status, 'ok'); eq(A.summary(D, op).done, 1);
  eq(A.scan(D, op, 'D-1', ctx()).status, 'repetido'); eq(A.summary(D, op).done, 1); eq(A.summary(D, op).pending.length, 1);
  eq(JSON.stringify(D.packages), st);
});
test('código desconhecido, inválido e não vinculado não alteram nada', () => {
  const D = fresh(), op = mk(D, ['e-1']).op, loose = enter(D, 'x1', 'e-loose').created[0].code, st = JSON.stringify([D.packages, D.operations]);
  eq(A.scan(D, op, 'ZZZ-1', ctx()).status, 'inexistente'); eq(A.scan(D, op, 'AB CD', ctx()).status, 'invalido');
  eq(A.scan(D, op, loose, ctx()).status, 'nao_vinculado');
  eq(JSON.stringify([D.packages, D.operations]), st.replace(/"history":\[\]/g, '"history":[]')); // nada mudou
});
test('pacote de outra ambulância: aviso específico; de outra base: inexistente sem revelar', () => {
  const D = fresh(), a = mk(D, ['f-1']).op, b = mk(D, ['f-2']).op;
  const r = A.scan(D, a, 'F-2', ctx()); eq(r.status, 'outra_operacao'); eq(A.summary(D, a).done, 0);
  const x2 = D.packages.find((p) => p.xptId === 'x2').code, r2 = A.scan(D, a, x2, ctx());
  eq(r2.status, 'inexistente'); ok(!/x2|Beta|XPT Demo/.test(r2.message)); void b;
});
test('remover leitura incorreta', () => {
  const D = fresh(), op = mk(D, ['g-1']).op; A.scan(D, op, 'G-1', ctx());
  eq(A.unscan(D, op, 'G-1', ctx()), true); eq(A.summary(D, op).done, 0);
});

// ---------- Saída e encerramento
test('saída confirmada só dos conferidos; pendentes permanecem em separação', () => {
  const D = fresh(), op = mk(D, ['h-1', 'h-2', 'h-3']).op; A.scan(D, op, 'H-1', ctx()); A.scan(D, op, 'H-2', ctx());
  eq(A.confirmExit(D, op, ctx({ authorized: false })).reason, 'sem_permissao');
  const r = A.confirmExit(D, op, ctx()); ok(r.ok); eq(r.departed.sort().join(), 'H-1,H-2'); eq(r.pending.join(), 'H-3');
  const st = (c) => D.packages.find((p) => p.code === c);
  eq(st('H-1').state, 'em_rota'); eq(st('H-3').state, 'em_separacao');
  const ev = st('H-1').history.at(-1); eq(ev.from, 'em_separacao'); eq(ev.to, 'em_rota'); eq(ev.xptId, 'x1'); ok(new RegExp(op.id).test(ev.note) && /Resp/.test(ev.note));
  eq(op.state, 'saida_confirmada');
});
test('sem conferidos não há saída', () => {
  const D = fresh(), op = mk(D, ['i-1']).op; eq(A.confirmExit(D, op, ctx()).reason, 'nada_a_confirmar'); eq(D.packages.find((p) => p.code === 'I-1').state, 'em_separacao');
});
test('encerrar exige permissão, bloqueia novas conferências e preserva pendências com evento', () => {
  const D = fresh(), op = mk(D, ['j-1', 'j-2']).op; A.scan(D, op, 'J-1', ctx()); A.confirmExit(D, op, ctx());
  eq(A.closeOperation(D, op, ctx({ authorized: false })).reason, 'sem_permissao');
  const r = A.closeOperation(D, op, ctx()); ok(r.ok); eq(r.pending.join(), 'J-2'); eq(op.state, 'encerrada'); eq(op.pendingAtClose.join(), 'J-2');
  eq(A.scan(D, op, 'J-2', ctx()).status, 'bloqueado'); eq(A.summary(D, op).done, 1);
  eq(A.unscan(D, op, 'J-1', ctx()), false); eq(A.confirmExit(D, op, ctx()).reason, 'encerrada'); eq(A.closeOperation(D, op, ctx()).reason, 'encerrada');
  const p = D.packages.find((x) => x.code === 'J-2'); eq(p.state, 'em_estoque'); ok(/pendência preservada/.test(p.history.at(-1).note));
  ok(D.packages.find((x) => x.code === 'J-2')); // nunca removido do estoque
  // pendente liberado pode entrar numa nova operação
  ok(A.createAmbulance(D, 'x1', { name: 'Amb 2', responsible: 'R', packageIds: [p.id] }, ctx()).ok);
});

// ---------- QR Code
test('QR: endereço da operação sem dados sensíveis', () => {
  const u = A.qrUrl('https://ex.github.io/app/index.html#/map', 'OP-0007');
  eq(u, 'https://ex.github.io/app/index.html#/separation/OP-0007');
  ok(!/FLX|DEMO|Resp/i.test(u));
});
test('QR: codificação estrutural (finders, tamanho, determinismo, versões)', () => {
  const q = NS.qr.encode('https://ex.io/#/separation/OP-0001', 'M');
  eq(q.size, 17 + 4 * q.version); eq(q.modules.length, q.size);
  // padrão localizador 7x7 nos três cantos
  [[0, 0], [0, q.size - 7], [q.size - 7, 0]].forEach(([y, x]) => { ok(q.modules[y][x] && q.modules[y + 3][x + 3] && !q.modules[y + 1][x + 1] && q.modules[y][x + 6] && q.modules[y + 6][x + 6]); });
  eq(JSON.stringify(NS.qr.encode('abc', 'M').modules), JSON.stringify(NS.qr.encode('abc', 'M').modules));
  ok(NS.qr.encode('x'.repeat(100), 'L').version > NS.qr.encode('x', 'L').version);
  ok(/^M\d/.test(NS.qr.toPath(q, 4)));
});
test('QR: texto grande demais é recusado (não gera QR inválido)', () => {
  let threw = false; try { NS.qr.encode('x'.repeat(5000), 'M'); } catch (e) { threw = true; } ok(threw);
});

// ---------- Permissões e isolamento
test('permissões propostas: criar/confirmar/encerrar', () => {
  const P = NS.permissions;
  ['coord_base', 'supervisor', 'administrador'].forEach((p) => ok(P.can(p, 'operacao'), p));
  ['coord_geral', 'despacho', 'motorista'].forEach((p) => eq(P.can(p, 'operacao'), false, p));
});

// ---------- Zona poligonal (geometria e seleção)
const G = NS.geo;
const SQ = [{ lat: 0, lng: 0 }, { lat: 0, lng: 10 }, { lat: 10, lng: 10 }, { lat: 10, lng: 0 }];
test('polígono: ponto dentro/fora, na concavidade e fora do retângulo envolvente', () => {
  ok(G.pointInPolygon(5, 5, SQ)); eq(G.pointInPolygon(11, 5, SQ), false); eq(G.pointInPolygon(5, -1, SQ), false);
  const L = [{ lat: 0, lng: 0 }, { lat: 0, lng: 10 }, { lat: 4, lng: 10 }, { lat: 4, lng: 4 }, { lat: 10, lng: 4 }, { lat: 10, lng: 0 }]; // formato em L
  ok(G.pointInPolygon(2, 8, L)); ok(G.pointInPolygon(8, 2, L)); eq(G.pointInPolygon(8, 8, L), false, 'dentro do retângulo envolvente mas fora do L');
});
test('polígono inválido: <3 pontos, área nula, arestas cruzadas, coordenadas inválidas', () => {
  eq(G.polygonValid([{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }]), false);
  eq(G.polygonValid([{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, { lat: 2, lng: 2 }]), false, 'colineares');
  eq(G.polygonValid([{ lat: 0, lng: 0 }, { lat: 10, lng: 10 }, { lat: 0, lng: 10 }, { lat: 10, lng: 0 }]), false, 'gravata');
  eq(G.polygonValid([{ lat: 0, lng: 0 }, { lat: 95, lng: 1 }, { lat: 1, lng: 5 }]), false);
  ok(G.polygonValid(SQ)); eq(G.pointInPolygon(5, 5, [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }]), false);
});
test('pointsInPolygon ignora pontos sem coordenadas válidas (nunca inventa)', () => {
  const r = G.pointsInPolygon([{ id: 1, lat: 5, lng: 5 }, { id: 2, lat: 50, lng: 5 }, { id: 3, lat: null, lng: null }, { id: 4 }], SQ);
  eq(r.inside.map((p) => p.id), [1]); eq(r.outside.map((p) => p.id), [2]);
});
test('zoneSummary: separa dentro/fora, exclui pacotes em operação ativa e rascunhos; zona inválida = vazio', () => {
  const pts = [
    { id: 'a', lat: 5, lng: 5, eligible: true, source: 'pacote' }, { id: 'b', lat: 6, lng: 6, eligible: false, source: 'pacote' },
    { id: 'c', lat: 7, lng: 7, eligible: true, source: 'rascunho' }, { id: 'd', lat: 50, lng: 50, eligible: true, source: 'pacote' },
  ];
  const s = NS.operations.zoneSummary(pts, SQ);
  eq(s.inside.length, 3); eq(s.outside.length, 1); eq(s.eligible.map((p) => p.id), ['a']); eq(s.blocked.map((p) => p.id), ['b']); eq(s.drafts.map((p) => p.id), ['c']);
  const bad = NS.operations.zoneSummary(pts, SQ.slice(0, 2)); eq(bad.valid, false); eq(bad.eligible.length, 0);
});
test('zona + ambulância: pacotes de uma operação ativa deixam de ser elegíveis na mesma zona', () => {
  const D = fresh(), codes = ['zn-1', 'zn-2', 'zn-3'];
  const ids = codes.map((c) => enter(D, 'x1', c, loc(5, 5)).created[0].id);
  const st = NS.store.createStore(D, { nowMs: NOW });
  const inZone = () => NS.operations.zoneSummary(st.mapPoints('x1'), SQ);
  eq(inZone().eligible.length, 3);
  const r = A.createAmbulance(D, 'x1', { name: 'Z', responsible: 'R', packageIds: ids.slice(0, 2) }, ctx()); ok(r.ok, JSON.stringify(r));
  const s = inZone(); eq(s.eligible.length, 1); eq(s.blocked.length, 2);
  eq(A.createAmbulance(D, 'x1', { name: 'Z2', responsible: 'R', packageIds: ids.slice(0, 1) }, ctx()).ok, false, 'mesmo pacote em duas operações ativas é recusado');
});
done('unit-fluxo.test.js');
