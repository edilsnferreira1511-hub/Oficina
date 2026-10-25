'use strict';
const { NS, test, eq, ok, done, NOW, fresh } = require('./helpers');
const DAY = 86400000;

// ---------- Dados e estados
test('dados demo são determinísticos', () => { eq(JSON.stringify(fresh()), JSON.stringify(fresh())); });
test('dados demo: 3 XPTs, pacotes por XPT e códigos únicos', () => {
  const D = fresh(); eq(D.xpts.length, 3);
  const codes = D.packages.map(p => p.code); eq(new Set(codes).size, codes.length);
  ok(D.packages.every(p => /^DEMO-\d{6}$/.test(p.code)));
});
test('nenhum pacote demo tem coordenadas', () => {
  ok(fresh().packages.every(p => p.location.lat === null && p.location.lng === null));
});
test('estados canônicos presentes', () => {
  eq(fresh().states.map(s => s.id), ['em_estoque','em_separacao','em_rota','entregue','aguardando_devolucao','devolvido','divergente']);
});
test('ciclo = retornos + 1 nos dados demo', () => { ok(fresh().packages.every(p => p.cycle === p.returns + 1)); });
test('histórico coerente: um evento de entrada por ciclo', () => {
  fresh().packages.forEach(p => eq(p.history.filter(e => e.type === 'entrada').length, p.cycle));
});
test('operações demo usam pacotes da própria XPT', () => {
  const D = fresh(); D.operations.forEach(o => NS.operations.opPackages(D, o).forEach(p => eq(p.xptId, o.xptId)));
});

// ---------- Transições
const P = () => fresh().packages.find(p => p.state === 'em_estoque');
test('transição permitida registra evento e não altera original', () => {
  const p = P(), h = p.history.length;
  const r = NS.packages.transition(p, 'em_separacao', { nowMs: NOW });
  ok(r.ok); eq(r.pkg.state, 'em_separacao'); eq(p.state, 'em_estoque'); eq(p.history.length, h); eq(r.pkg.history.length, h + 1);
});
test('transição arbitrária é rejeitada', () => {
  eq(NS.packages.transition(P(), 'devolvido', { nowMs: NOW }).ok, false);
  eq(NS.packages.transition(P(), 'inexistente', { nowMs: NOW }).ok, false);
});
test('estados finais não têm saída', () => { eq(NS.packages.TRANSITIONS.entregue, []); eq(NS.packages.TRANSITIONS.devolvido, []); });
test('retorno de rota incrementa ciclo, retornos e reinicia permanência', () => {
  const p = Object.assign({}, P(), { state: 'em_rota', cycle: 2, returns: 1 });
  const r = NS.packages.transition(p, 'em_estoque', { nowMs: NOW });
  ok(r.ok); eq(r.pkg.cycle, 3); eq(r.pkg.returns, 2); eq(r.pkg.entryAt, NOW); eq(r.event.type, 'retorno');
});
test('transição comum NÃO incrementa ciclo', () => {
  const p = Object.assign({}, P(), { state: 'divergente' });
  const r = NS.packages.transition(p, 'em_estoque', { nowMs: NOW }); eq(r.pkg.cycle, p.cycle);
});
test('transição exige data válida', () => { eq(NS.packages.transition(P(), 'em_separacao', { nowMs: NaN }).ok, false); });
test('correção exige motivo e registra valor anterior', () => {
  const p = P();
  eq(NS.packages.correct(p, 'size', 'G', '', { nowMs: NOW }).ok, false);
  eq(NS.packages.correct(p, 'xptId', 'x2', 'x', { nowMs: NOW }).ok, false); // origem permanente
  const r = NS.packages.correct(p, 'size', 'G', 'erro de digitação', { nowMs: NOW });
  ok(r.ok); ok(/erro de digitação/.test(r.pkg.history.at(-1).note)); eq(r.pkg.xptId, p.xptId);
});

// ---------- Permanência e alertas
test('limite de 4 dias: exatamente 4 dias não alerta; 4 dias e 1 h alerta', () => {
  const base = Object.assign({}, P(), { state: 'em_estoque' });
  eq(NS.alerts.stay([Object.assign({}, base, { entryAt: NOW - 4 * DAY })], NOW, 4).over.length, 0);
  eq(NS.alerts.stay([Object.assign({}, base, { entryAt: NOW - 4 * DAY - 3600000 })], NOW, 4).over.length, 1);
});
test('data inválida não gera alerta falso', () => {
  const b = P();
  [NaN, null, undefined, 'x', -5, NOW + DAY].forEach(v => {
    const r = NS.alerts.stay([Object.assign({}, b, { entryAt: v })], NOW, 4);
    eq(r.over.length, 0); eq(r.invalid.length, 1);
  });
});
test('saída do estoque encerra o alerta de permanência', () => {
  const old = { entryAt: NOW - 20 * DAY };
  ['em_rota', 'entregue', 'devolvido'].forEach(s => eq(NS.alerts.stay([Object.assign({}, P(), old, { state: s })], NOW, 4).over.length, 0));
});
test('retorno ao estoque inicia novo ciclo de permanência', () => {
  const p = Object.assign({}, P(), { state: 'em_rota', entryAt: NOW - 30 * DAY });
  const r = NS.packages.transition(p, 'em_estoque', { nowMs: NOW }).pkg;
  eq(NS.packages.stayDays(r, NOW), 0); eq(NS.alerts.stay([r], NOW, 4).over.length, 0);
});
test('terceiro retorno = atenção; quarto = avaliar devolução; nunca automática', () => {
  eq(NS.packages.returnFlag({ returns: 2 }), null);
  eq(NS.packages.returnFlag({ returns: 3 }), 'atencao');
  eq(NS.packages.returnFlag({ returns: 4 }), 'avaliar_devolucao');
  eq(NS.packages.returnFlag({ returns: 7 }), 'avaliar_devolucao');
  eq(NS.packages.TRANSITIONS.em_estoque.includes('devolvido'), false);
});
test('alertas por XPT não vazam pacotes de outra base; filtro por estado', () => {
  const D = fresh();
  ['x1', 'x2'].forEach(x => {
    const a = NS.alerts.compute(D, x, NOW);
    [a.stay, a.noLocation, a.divergent, a.awaitingReturn, a.repeatedReturns].flat().forEach(p => eq(p.xptId, x));
  });
  const f = NS.alerts.compute(D, 'x1', NOW, { state: 'divergente' });
  ok(f.stay.every(p => p.state === 'divergente'));
});
test('limite configurável', () => {
  const D = fresh(); const a4 = NS.alerts.compute(D, 'x1', NOW).stay.length;
  D.settings.stayLimitDays = 8; const a8 = NS.alerts.compute(D, 'x1', NOW).stay.length;
  ok(a8 <= a4); eq(NS.alerts.compute(D, 'x1', NOW).limitDays, 8);
});

// ---------- Códigos
test('normalização: trim e maiúsculas', () => { eq(NS.codes.normalize('  ab-12.x_9  '), 'AB-12.X_9'); eq(NS.codes.normalize(null), ''); });
test('validação provisória', () => {
  eq(NS.codes.validate('').error, 'vazio'); eq(NS.codes.validate('   ').error, 'vazio');
  eq(NS.codes.validate('A'.repeat(64)).ok, true); eq(NS.codes.validate('A'.repeat(65)).error, 'longo');
  eq(NS.codes.validate('AB CD').error, 'caracteres'); eq(NS.codes.validate('AB/CD').error, 'caracteres'); eq(NS.codes.validate('ÁB').error, 'caracteres');
  eq(NS.codes.validate(123).ok, false);
});
test('índice global não revela dados de outra base', () => {
  const idx = NS.codes.createIndex(fresh().packages);
  const c1 = fresh().packages.find(p => p.xptId === 'x1').code;
  eq(idx.check(c1, 'x1'), 'nesta_xpt'); eq(idx.check(c1, 'x2'), 'outra_xpt'); eq(idx.check('NOVO-1', 'x2'), 'livre');
  eq(typeof idx.check(c1, 'x2'), 'string');
  ok(!NS.codes.DUP_MSG.outra_xpt.match(/x1|Alfa|XPT Demo/));
});

// ---------- Geo
test('validação de coordenadas', () => {
  const g = NS.geo; eq(g.validCoord(-16.3, -48.9), true); eq(g.validCoord(90.01, 0), false); eq(g.validCoord(0, 180.1), false);
  eq(g.validCoord(NaN, 0), false); eq(g.validCoord('1', 2), false); eq(g.validCoord(null, null), false);
});
test('normalizeLocation: regras por classificação', () => {
  const n = NS.geo.normalizeLocation;
  eq(n({ kind: 'marcada', lat: null, lng: null }).ok, false);
  eq(n({ kind: 'marcada', lat: 91, lng: 0 }).ok, false);
  eq(n({ kind: 'marcada', lat: -16.1234567, lng: -48.9 }).loc.lat, -16.123457);
  eq(n({ kind: 'desconhecida', lat: 1, lng: 1 }).ok, false);
  eq(n({ kind: 'desconhecida', regionId: 'x1-r1' }).ok, false);
  eq(n({ kind: 'pendente' }).ok, true);
  eq(n({ kind: 'aproximada', lat: 1 }).ok, false);
  eq(n({ kind: 'aproximada' }).ok, true);
  eq(n({ kind: 'foo' }).ok, false);
});
test('Web Mercator: ida e volta e ladrilhos', () => {
  const g = NS.geo, p = g.project(-16.3281, -48.9534, 13), u = g.unproject(p.x, p.y, 13);
  ok(Math.abs(u.lat + 16.3281) < 1e-6 && Math.abs(u.lng + 48.9534) < 1e-6);
  const t = g.tilesFor({ lat: -16.3281, lng: -48.9534, zoom: 13 }, 600, 400); ok(t.length >= 4);
  eq(g.wrapLng(190), -170); eq(g.wrapLng(-180), -180);
});
test('seleção por retângulo ignora pontos sem coordenadas; agrupa por região', () => {
  const pts = [{ id: 'a', lat: 1, lng: 1, regionId: 'r1' }, { id: 'b', lat: null, lng: null }, { id: 'c', lat: 5, lng: 5 }];
  eq(NS.geo.pointsInBounds(pts, { minLat: 0, maxLat: 2, minLng: 0, maxLng: 2 }).map(p => p.id), ['a']);
  eq(Object.keys(NS.geo.groupByRegion(pts.filter(p => p.lat !== null))).sort(), ['r1', 'sem_regiao']);
});
test('fitView centraliza e respeita limites', () => {
  const v = NS.geo.fitView([{ lat: -16.3, lng: -48.9 }, { lat: -16.4, lng: -48.8 }], 600, 400, { lat: 0, lng: 0, zoom: 5 }, 10, 19);
  ok(v.zoom >= 10 && v.zoom <= 19);
  eq(NS.geo.fitView([], 600, 400, { lat: 1, lng: 2, zoom: 7 }, 10, 19).zoom, 7);
});

// ---------- Rascunho de entrada
const X = (x) => { const D = fresh(); const s = NS.store.createStore(D); return { D, s, d: s.draft(x || 'x1') }; };
const F = (o) => Object.assign({ code: 'NOVO-1', size: 'P', reasonId: 'r_ausente', note: '', location: { kind: 'pendente' } }, o);
test('entrada: adiciona e normaliza', () => { const { d } = X(); const r = d.add(F({ code: ' novo-1 ' })); ok(r.ok); eq(r.item.code, 'NOVO-1'); eq(d.count(), 1); });
test('entrada: campos obrigatórios', () => {
  const { d } = X(); const r = d.add({ code: '', size: '', reasonId: '', location: { kind: 'pendente' } });
  eq(r.ok, false); ok(r.errors.code && r.errors.size && r.errors.reasonId); eq(d.count(), 0);
});
test('entrada: leitura repetida não infla o rascunho', () => {
  const { d } = X(); d.add(F()); const r = d.add(F()); eq(r.ok, false); eq(r.duplicate, 'rascunho'); eq(d.count(), 1);
});
test('entrada: duplicidade com pacote da própria base e de outra base (sem revelar)', () => {
  const { D, d } = X('x1'); const own = D.packages.find(p => p.xptId === 'x1').code, other = D.packages.find(p => p.xptId === 'x2').code;
  eq(d.add(F({ code: own })).duplicate, 'nesta_xpt'); const r = d.add(F({ code: other }));
  eq(r.duplicate, 'outra_xpt'); ok(!/x2|Beta/.test(JSON.stringify(r)));
});
test('entrada: duplicidade entre rascunhos de XPTs diferentes via índice global', () => {
  const { s } = X(); s.draft('x1').add(F({ code: 'CRUZ-1' })); eq(s.draft('x2').add(F({ code: 'CRUZ-1' })).duplicate, 'outra_xpt');
});
test('entrada: cada item tem a sua localização (sem herdar)', () => {
  const { d } = X(); d.add(F({ code: 'A-1', location: { kind: 'marcada', lat: -16.33, lng: -48.95 } })); const b = d.add(F({ code: 'B-2' }));
  eq(b.item.location.kind, 'pendente'); eq(b.item.location.lat, null);
});
test('entrada: coordenada vinculada ao código correto; corrigir, limpar, remover', () => {
  const { d } = X(); const a = d.add(F({ code: 'A-1', location: { kind: 'marcada', lat: -16.33, lng: -48.95 } })).item; const b = d.add(F({ code: 'B-2', location: { kind: 'aproximada', lat: -16.34, lng: -48.96 } })).item;
  eq(d.geoPoints().map(p => [p.code, p.lat]), [['A-1', -16.33], ['B-2', -16.34]]);
  ok(d.setLocation(a.id, { kind: 'marcada', lat: -16.35, lng: -48.97 }).ok); eq(d.get(a.id).location.lat, -16.35); eq(d.get(b.id).location.lat, -16.34);
  ok(d.clearLocation(a.id).ok); eq(d.geoPoints().map(p => p.code), ['B-2']); eq(d.get(a.id).location.kind, 'pendente');
  ok(d.remove(b.id)); eq(d.geoPoints().length, 0); eq(d.remove('nada'), false);
});
test('entrada: coordenadas inválidas são rejeitadas e item não é criado', () => {
  const { d } = X(); eq(d.add(F({ location: { kind: 'marcada', lat: 123, lng: 0 } })).ok, false); eq(d.count(), 0);
});
test('entrada: região de outra base é rejeitada', () => {
  const { d } = X('x1'); eq(d.add(F({ location: { kind: 'aproximada', lat: -16.3, lng: -48.9, regionId: 'x2-r1' } })).ok, false);
  eq(d.add(F({ code: 'R-1', location: { kind: 'aproximada', lat: -16.3, lng: -48.9, regionId: 'x1-r1' } })).ok, true);
});
test('entrada: observação limitada e código imutável na edição', () => {
  const { d } = X(); const it = d.add(F()).item; eq(d.update(it.id, { note: 'x'.repeat(201) }).ok, false); eq(d.update(it.id, { code: 'OUTRO' }).ok, false); eq(d.update(it.id, { size: 'G' }).ok, true);
});
test('entrada: rascunho isolado por XPT', () => {
  const { s } = X(); s.draft('x1').add(F({ code: 'ISO-1', location: { kind: 'marcada', lat: -16.3, lng: -48.9 } }));
  eq(s.draft('x2').count(), 0); eq(s.draft('x2').geoPoints().length, 0); eq(s.mapPoints('x2').length, 0); eq(s.mapPoints('x1').length, 1);
});
test('entrada não altera os dados demonstrativos', () => {
  const D = fresh(), before = JSON.stringify(D.packages); const s = NS.store.createStore(D); s.draft('x1').add(F({ location: { kind: 'marcada', lat: -16.3, lng: -48.9 } }));
  eq(JSON.stringify(D.packages), before);
});

// ---------- Conferência
test('conferência: esperado, repetido, inválido, outra operação, inexistente, progresso, remoção', () => {
  const D = fresh(), op = D.operations.find(o => o.xptId === 'x1' && o.packageIds.length >= 3), c = NS.operations.createConference(D, op);
  const exp = c.expected(); eq(c.progress(), { done: 0, total: exp.length });
  eq(c.scan(exp[0].code.toLowerCase() + ' ').status, 'ok'); eq(c.scan(exp[0].code).status, 'repetido'); eq(c.progress().done, 1);
  eq(c.scan('').status, 'invalido'); eq(c.scan('a b').status, 'invalido'); eq(c.scan('NAO-EXISTE').status, 'inexistente');
  // requisito V2: distinguir "não vinculado a nenhuma operação" de "pertence a OUTRA ambulância"
  const inOther = D.operations.find(o => o.xptId === 'x1' && o.id !== op.id).packageIds[0], pOther = D.packages.find(p => p.id === inOther); eq(c.scan(pOther.code).status, 'outra_operacao');
  const free = D.packages.find(p => p.xptId === 'x1' && !D.operations.some(o => o.packageIds.includes(p.id))); eq(c.scan(free.code).status, 'nao_vinculado');
  const x2 = D.packages.find(p => p.xptId === 'x2'); const r = c.scan(x2.code); eq(r.status, 'inexistente'); ok(!/x2|Beta/.test(JSON.stringify(r)));
  eq(c.remove(exp[0].code), true); eq(c.progress().done, 0); eq(c.remove(exp[0].code), false);
  exp.forEach(p => c.scan(p.code)); eq(c.complete(), true);
});
test('conferência não altera estados nem confirma saída', () => {
  const D = fresh(), before = JSON.stringify(D.packages), op = D.operations[0], c = NS.operations.createConference(D, op);
  c.expected().forEach(p => c.scan(p.code)); eq(JSON.stringify(D.packages), before); eq(typeof c.confirm, 'undefined');
});
test('conferências isoladas por operação', () => {
  const D = fresh(), s = NS.store.createStore(D), ops = D.operations.filter(o => o.xptId === 'x1');
  const a = s.conference(ops[0]); a.expected().forEach(p => a.scan(p.code)); eq(s.conference(ops[1]).progress().done, 0);
});

// ---------- Grupo geográfico (rascunho visual)
const PTS = () => [
  { id: 'p1', code: 'A-1', xptId: 'x1', lat: -16.3, lng: -48.9 }, { id: 'p2', code: 'B-2', xptId: 'x1', lat: -16.31, lng: -48.91 }, { id: 'p3', code: 'C-3', xptId: 'x1', lat: -16.32, lng: -48.92 },
];
test('grupo: seleciona e desmarca vários, contagem e desfazer', () => {
  const g = NS.operations.createGroupDraft('x1'), pts = PTS();
  g.toggle('p1', pts); g.toggle('p2', pts); eq(g.count(), 2); g.toggle('p1', pts); eq(g.ids(), ['p2']);
  ok(g.undo()); eq(g.ids(), ['p1', 'p2']); ok(g.undo()); ok(g.undo()); eq(g.count(), 0); eq(g.undo(), false);
  g.selectMany(['p1', 'p2', 'p3'], pts); eq(g.count(), 3); g.clear(); eq(g.count(), 0); ok(g.undo()); eq(g.count(), 3);
});
test('grupo: pacote sem coordenadas ou de outra XPT não é selecionável', () => {
  const g = NS.operations.createGroupDraft('x1'), pts = PTS();
  eq(g.toggle('sem-coord', pts).ok, false); eq(g.toggle('p1', [{ id: 'p1', xptId: 'x2', lat: 1, lng: 1 }]).ok, false);
  eq(g.toggle('p1', [{ id: 'p1', xptId: 'x1', lat: null, lng: null }]).ok, false); eq(g.count(), 0);
  const r = g.selectMany(['p1', 'zzz'], pts); eq(r.skipped, ['zzz']); eq(g.count(), 1);
});
test('grupo: consistência quando item é removido do rascunho', () => {
  const { s } = X(); const d = s.draft('x1'), g = s.group('x1');
  const a = d.add(F({ code: 'A-1', location: { kind: 'marcada', lat: -16.3, lng: -48.9 } })).item; const b = d.add(F({ code: 'B-2', location: { kind: 'marcada', lat: -16.4, lng: -48.8 } })).item;
  g.toggle(a.id, s.mapPoints('x1')); g.toggle(b.id, s.mapPoints('x1')); eq(g.count(), 2);
  d.remove(a.id); eq(s.mapPoints('x1').length, 1); eq(g.ids(), [b.id]);
  d.clearLocation(b.id); s.mapPoints('x1'); eq(g.count(), 0);
});
test('grupo é isolado por XPT e não persiste nem toca nos dados', () => {
  const D = fresh(), before = JSON.stringify(D), s = NS.store.createStore(D);
  eq(s.group('x1') === s.group('x2'), false);
  s.draft('x1').add(F({ code: 'G-1', location: { kind: 'marcada', lat: -16.3, lng: -48.9 } })); const g = s.group('x1'); g.toggle(s.draft('x1').list()[0].id, s.mapPoints('x1'));
  eq(JSON.stringify(D), before); eq(typeof g.save, 'undefined');
  const s2 = NS.store.createStore(fresh()); eq(s2.group('x1').count(), 0); // "recarregar"
});

// ---------- Filtros, paginação, permissões, auditoria
test('filtros da listagem', () => {
  const D = fresh(), pk = D.packages;
  eq(NS.packages.filter(pk, { xptId: 'x2' }).every(p => p.xptId === 'x2'), true);
  eq(NS.packages.filter(pk, { code: 'demo-000001' }).length, 1);
  ok(NS.packages.filter(pk, { state: 'em_estoque', size: 'P' }).every(p => p.state === 'em_estoque' && p.size === 'P'));
  eq(NS.packages.filter(pk, { geo: 'com' }).length, 0); eq(NS.packages.filter(pk, { geo: 'sem' }).length, pk.length);
  ok(NS.packages.filter(pk, { from: NOW - 2 * DAY }).every(p => p.entryAt >= NOW - 2 * DAY));
});
test('paginação limita linhas', () => {
  const r = NS.packages.paginate(fresh().packages, 2, 20); eq(r.items.length, 20); eq(r.page, 2); eq(NS.packages.paginate([], 5, 20).page, 1);
  eq(NS.packages.paginate(fresh().packages, 999, 20).page, r.pages);
});
test('permissões: matriz proposta, motorista restrito, ninguém com tudo', () => {
  const P = NS.permissions; eq(P.PROFILES.length, 7); eq(P.can('motorista', 'entrada'), false); eq(P.can('despacho', 'entrada'), true);
  eq(P.can('despacho', 'usuarios'), false);
  ['ver_global', 'ver_base', 'entrada', 'conferir', 'operacao', 'correcao', 'confirmar_saida', 'encerrar', 'devolucao', 'usuarios', 'config'].forEach(a => eq(P.can('admin_sistema', a), true, 'admin_sistema ' + a));
  eq(P.can('admin_sistema', 'conferir_propria'), false); eq(P.can('motorista', 'usuarios'), false);
  P.PROFILES.forEach(p => eq(P.ACTIONS.every(a => P.can(p.id, a.id)), false));
  // matriz editável: aplica, nunca mexe em admin_sistema/motorista, e volta ao padrão
  P.setOverrides({ entrada: ['despacho', 'supervisor'], operacao: ['despacho'], motorista: ['x'] });
  eq(P.can('supervisor', 'entrada'), true); eq(P.can('despacho', 'operacao'), true); eq(P.can('coord_base', 'operacao'), false);
  eq(P.can('admin_sistema', 'operacao'), true); eq(P.can('motorista', 'entrada'), false); eq(P.can('motorista', 'operacao'), false);
  eq(JSON.stringify(P.toDoc().entrada), JSON.stringify(['supervisor', 'despacho']));
  P.setOverrides(null); eq(P.can('supervisor', 'entrada'), false); eq(P.can('coord_base', 'operacao'), true); eq(P.can('despacho', 'operacao'), false);
});
test('auditoria só acrescenta e é imutável', () => {
  const a = NS.audit.createAudit(() => NOW); const e = a.log('x', 'x1', 'd'); eq(a.count(), 1); eq(Object.isFrozen(e), true); eq(typeof a.remove, 'undefined');
});
done('unit.test.js');
