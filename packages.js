/* COOPMETRO XPT — regras de pacote: estados, transições, histórico, filtros, paginação.
 * Funções PURAS: nunca alteram o argumento; devolvem cópias. As transições são DEMONSTRATIVAS
 * (regras propostas, pendentes de aprovação — D-04) e não representam expedição real. */
(function (root) {
  'use strict';
  var NS = (root.CXPT = root.CXPT || {});
  var DAY = 86400000;

  var TRANSITIONS = {
    em_estoque: ['em_separacao', 'divergente', 'aguardando_devolucao'],
    em_separacao: ['em_estoque', 'em_rota', 'divergente'],
    em_rota: ['entregue', 'em_estoque', 'divergente'],
    entregue: [],
    aguardando_devolucao: ['devolvido', 'em_estoque'],
    devolvido: [],
    divergente: ['em_estoque', 'aguardando_devolucao'],
  };
  var IN_WAREHOUSE = ['em_estoque', 'em_separacao', 'aguardando_devolucao', 'divergente'];
  var CORRECTABLE = ['size', 'reasonId', 'note'];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function validTs(ms) { return typeof ms === 'number' && isFinite(ms) && ms > 0; }
  function inWarehouse(p) { return !!p && IN_WAREHOUSE.indexOf(p.state) >= 0; }
  function canTransition(from, to) { return !!TRANSITIONS[from] && TRANSITIONS[from].indexOf(to) >= 0; }

  /** Dias inteiros no ciclo atual; null se fora do galpão, data inválida ou no futuro. */
  function stayDays(p, nowMs) {
    if (!inWarehouse(p) || !validTs(p.entryAt) || !validTs(nowMs) || p.entryAt > nowMs) return null;
    return Math.floor((nowMs - p.entryAt) / DAY);
  }
  /** 3º retorno = atenção; 4º ou mais = avaliar devolução (nunca automática). */
  function returnFlag(p) {
    var r = p && p.returns;
    if (typeof r !== 'number' || r < 3) return null;
    return r === 3 ? 'atencao' : 'avaliar_devolucao';
  }

  var evSeq = 0;
  function mkEvent(p, type, at, from, to, operator, note) {
    evSeq++;
    return { id: 'ev-' + p.id + '-n' + evSeq, code: p.code, xptId: p.xptId, type: type, at: at, from: from, to: to, operator: operator || 'Operador Demo', note: note || '' };
  }

  /** Transição demonstrativa. em_rota → em_estoque é RETORNO: novo ciclo, retorno+1, permanência reinicia. */
  function transition(pkg, to, opts) {
    opts = opts || {};
    if (!pkg || !TRANSITIONS[pkg.state]) return { ok: false, reason: 'Pacote ou estado inválido.' };
    if (!TRANSITIONS[to]) return { ok: false, reason: 'Estado desconhecido.' };
    if (!validTs(opts.nowMs)) return { ok: false, reason: 'Data/hora inválida: a transição exige data válida.' };
    if (!canTransition(pkg.state, to)) return { ok: false, reason: 'Transição não permitida: ' + pkg.state + ' → ' + to + '.' };
    var p = clone(pkg), at = opts.nowMs, ev;
    p.state = to;
    if (pkg.state === 'em_rota' && to === 'em_estoque') {
      p.cycle = pkg.cycle + 1; p.returns = pkg.returns + 1; p.entryAt = at;
      ev = mkEvent(p, 'retorno', at, pkg.state, to, opts.operator, opts.note || 'Retorno ao galpão (novo ciclo)');
    } else {
      ev = mkEvent(p, 'mudanca_estado', at, pkg.state, to, opts.operator, opts.note);
    }
    p.history.push(ev);
    return { ok: true, pkg: p, event: ev };
  }

  /** Acrescenta um evento ao histórico (cópia); nunca altera nem apaga eventos anteriores. */
  function addEvent(pkg, e) {
    var p = clone(pkg);
    var ev = mkEvent(p, e.type, e.at, e.from || null, e.to || null, e.operator, e.note);
    p.history.push(ev);
    return { pkg: p, event: ev };
  }

  /** Correção exige motivo e gera evento; XPT de origem e código nunca mudam. */
  function correct(pkg, field, value, reason, opts) {
    opts = opts || {};
    if (field === 'xptId') return { ok: false, reason: 'A XPT de origem é permanente: transferência silenciosa não é permitida.' };
    if (CORRECTABLE.indexOf(field) < 0) return { ok: false, reason: 'Campo não corrigível: ' + field + '.' };
    if (!reason || !String(reason).trim()) return { ok: false, reason: 'Correção exige motivo registrado.' };
    if (!validTs(opts.nowMs)) return { ok: false, reason: 'Data/hora inválida.' };
    var p = clone(pkg), before = p[field];
    p[field] = value;
    var ev = mkEvent(p, 'correcao', opts.nowMs, null, null, opts.operator, field + ': ' + before + ' → ' + value + ' · motivo: ' + String(reason).trim());
    p.history.push(ev);
    return { ok: true, pkg: p, event: ev };
  }

  /** Filtros da listagem (xptId, code, state, size, reasonId, from, to, geo: 'com'|'sem'). */
  function filter(list, f) {
    f = f || {};
    var code = (f.code || '').trim().toUpperCase();
    return list.filter(function (p) {
      var has = !!p.location && NS.geo.hasCoords(p.location);
      if (f.xptId && p.xptId !== f.xptId) return false;
      if (code && p.code.indexOf(code) < 0) return false;
      if (f.state && p.state !== f.state) return false;
      if (f.size && p.size !== f.size) return false;
      if (f.reasonId && p.reasonId !== f.reasonId) return false;
      if (f.from != null && !(p.entryAt >= f.from)) return false;
      if (f.to != null && !(p.entryAt <= f.to)) return false;
      if (f.geo === 'com' && !has) return false;
      if (f.geo === 'sem' && has) return false;
      return true;
    });
  }

  function paginate(list, page, size) {
    size = size > 0 ? size : 20;
    var pages = Math.max(1, Math.ceil(list.length / size));
    var pg = Math.min(Math.max(1, page || 1), pages);
    return { items: list.slice((pg - 1) * size, pg * size), page: pg, pages: pages, total: list.length, size: size };
  }

  NS.packages = {
    TRANSITIONS: TRANSITIONS, IN_WAREHOUSE: IN_WAREHOUSE, validTs: validTs, inWarehouse: inWarehouse, canTransition: canTransition,
    stayDays: stayDays, returnFlag: returnFlag, transition: transition, correct: correct, addEvent: addEvent, filter: filter, paginate: paginate,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.packages;
})(typeof window !== 'undefined' ? window : globalThis);
