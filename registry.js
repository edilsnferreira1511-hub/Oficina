/* COOPMETRO XPT — registro de entradas e reentradas NA MEMÓRIA da demonstração (D.packages).
 * Nada é gravado fora da página. Código existente nunca vira pacote duplicado: gera evento e preserva a localização anterior. */
(function (root) {
  'use strict';
  var NS = (root.CXPT = root.CXPT || {});

  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function nextPackageId(D) {
    var max = 0;
    D.packages.forEach(function (p) { var m = /^pk-(\d+)$/.exec(p.id); if (m) max = Math.max(max, Number(m[1])); });
    return 'pk-' + pad(max + 1, 4);
  }
  function findIn(D, xptId, code) {
    return D.packages.filter(function (p) { return p.xptId === xptId && p.code === code; })[0] || null;
  }
  function replacePackage(D, pkg) {
    var i = D.packages.findIndex(function (p) { return p.id === pkg.id; });
    if (i >= 0) D.packages[i] = pkg;
    return pkg;
  }

  /** Cria pacotes a partir de itens do rascunho. Itens cujo código já exista (em qualquer base) NÃO são criados. */
  function registerEntries(D, xptId, items, ctx) {
    ctx = ctx || {};
    var at = ctx.nowMs, op = ctx.operator || 'Operador Demo';
    var created = [], skipped = [];
    if (!NS.packages.validTs(at)) return { created: created, skipped: items.map(function (i) { return { code: i.code, reason: 'data_invalida' }; }) };
    items.forEach(function (it) {
      var v = NS.codes.validate(it.code);
      if (!v.ok) { skipped.push({ code: it.code, reason: 'codigo_invalido' }); return; }
      if (D.packages.some(function (p) { return p.code === v.code; })) { skipped.push({ code: v.code, reason: 'ja_existe' }); return; }
      var nl = NS.geo.normalizeLocation(it.location || NS.codes.blankLocation());
      if (!nl.ok || !D.sizes.some(function (s) { return s.id === it.size; }) || !D.reasons.some(function (r) { return r.id === it.reasonId; })) {
        skipped.push({ code: v.code, reason: 'dados_invalidos' }); return;
      }
      var p = {
        id: nextPackageId(D), code: v.code, xptId: xptId, size: it.size, reasonId: it.reasonId,
        entryAt: at, firstEntryAt: at, state: 'em_estoque', cycle: 1, returns: 0, location: nl.loc, note: it.note || '', history: [],
      };
      p.history.push({
        id: 'ev-' + p.id + '-01', code: p.code, xptId: p.xptId, type: 'entrada', at: at, from: null, to: 'em_estoque', operator: op,
        note: 'Entrada confirmada (demonstração em memória) · localização: ' + NS.geo.LOC_LABEL[nl.loc.kind],
      });
      D.packages.push(p); created.push(p);
    });
    return { created: created, skipped: skipped };
  }

  /**
   * Nova leitura de um código JÁ cadastrado na própria base: registra evento, sem duplicar e sem apagar histórico.
   * ctx: {operator, nowMs, note, location}. Localização anterior com coordenadas NUNCA é substituída em silêncio.
   */
  function registerReentry(D, xptId, rawCode, ctx) {
    ctx = ctx || {};
    var P = NS.packages, v = NS.codes.validate(rawCode);
    if (!v.ok) return { ok: false, reason: v.message };
    var pkg = findIn(D, xptId, v.code);
    if (!pkg) return { ok: false, reason: 'Código não encontrado nesta base.' };
    if (!P.validTs(ctx.nowMs)) return { ok: false, reason: 'Data/hora inválida.' };
    var cur = pkg, events = [], note = (ctx.note || '').trim();
    if (cur.state === 'em_rota') {
      var t = P.transition(cur, 'em_estoque', { nowMs: ctx.nowMs, operator: ctx.operator, note: 'Retorno registrado por nova leitura de entrada (novo ciclo)' + (note ? ' · ' + note : '') });
      cur = t.pkg; events.push(t.event);
    } else {
      var r = P.addEvent(cur, { type: 'reentrada', at: ctx.nowMs, operator: ctx.operator,
        note: 'Nova leitura de entrada: pacote já cadastrado (estado: ' + cur.state + '); nenhuma duplicata criada; estado inalterado' + (note ? ' · ' + note : '') });
      cur = r.pkg; events.push(r.event);
    }
    var locNote = 'sem localização enviada';
    var nl = ctx.location ? NS.geo.normalizeLocation(ctx.location) : null;
    if (nl && nl.ok && NS.geo.hasCoords(nl.loc)) {
      if (NS.geo.hasCoords(cur.location)) {
        var pr = P.addEvent(cur, { type: 'localizacao_proposta', at: ctx.nowMs, operator: ctx.operator,
          note: 'Nova localização proposta (' + NS.geo.formatLatLng(nl.loc.lat, nl.loc.lng) + ') NÃO substituiu a anterior; correção exige motivo e decisão autorizada' });
        cur = pr.pkg; events.push(pr.event); locNote = 'anterior preservada; nova proposta registrada';
      } else {
        var prev = cur.location.kind;
        cur = JSON.parse(JSON.stringify(cur)); cur.location = nl.loc;
        var lr = P.addEvent(cur, { type: 'localizacao', at: ctx.nowMs, operator: ctx.operator, note: 'Localização definida (antes: ' + NS.geo.LOC_LABEL[prev] + ')' });
        cur = lr.pkg; events.push(lr.event); locNote = 'localização definida (antes não havia coordenadas)';
      }
    }
    replacePackage(D, cur);
    return { ok: true, pkg: cur, events: events, locationNote: locNote };
  }

  NS.registry = { nextPackageId: nextPackageId, findIn: findIn, replacePackage: replacePackage, registerEntries: registerEntries, registerReentry: registerReentry };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.registry;
})(typeof window !== 'undefined' ? window : globalThis);
