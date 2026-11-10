/* COOPMETRO XPT — estado em memória da sessão (rascunhos e seleções por XPT). Nada é persistido. */
(function (root) {
  'use strict';
  var NS = (root.CXPT = root.CXPT || {});
  function createStore(D, opts) {
    opts = opts || {};
    var nowFn = opts.nowFn || function () { return D.nowMs; };
    var index = NS.codes.createIndex(D.packages);
    var drafts = {}, groups = {}, confs = {}, listeners = [];
    var audit = NS.audit.createAudit(nowFn);
    function regionIds(xptId) { return D.regions.filter(function (r) { return r.xptId === xptId; }).map(function (r) { return r.id; }); }
    var s = {
      D: D, index: index, audit: audit,
      nowMs: function () { return nowFn(); },
      draft: function (xptId) {
        return drafts[xptId] || (drafts[xptId] = NS.codes.createEntryDraft({
          xptId: xptId, sizes: D.sizes, reasons: D.reasons, regionIds: regionIds(xptId), index: index, nowFn: nowFn,
        }));
      },
      group: function (xptId) { return groups[xptId] || (groups[xptId] = NS.operations.createGroupDraft(xptId)); },
      conference: function (op) {
        var k = op.xptId + '|' + op.id;
        return confs[k] || (confs[k] = NS.operations.createConference(D, op, { nowFn: nowFn, operator: 'Operador Demo' }));
      },
      /** Pontos salvos: pacotes CONFIRMADOS desta XPT com coordenadas válidas (a localização é reutilizada; não é marcada de novo). */
      savedPoints: function (xptId) {
        return D.packages.filter(function (p) { return p.xptId === xptId && NS.geo.hasCoords(p.location); }).map(function (p) {
          var why = NS.ambulance.ineligible(D, xptId, p), op = NS.ambulance.activeOpOf(D, p.id), col = op ? NS.ambulance.colorOf(op) : null;
          return { id: p.id, code: p.code, xptId: p.xptId, kind: p.location.kind, lat: p.location.lat, lng: p.location.lng, regionId: p.location.regionId,
            size: p.size, reasonId: p.reasonId, entryAt: p.entryAt, source: 'pacote', state: p.state, eligible: !why, why: why,
            opId: op ? op.id : null, opName: op ? (op.name || op.id) : null, color: col ? col.hex : null, colorName: col ? col.name : null };
        });
      },
      /** Pontos (somente desta XPT): rascunho de Entrada + pacotes confirmados com coordenadas. A seleção é reconciliada com o que é selecionável. */
      mapPoints: function (xptId) {
        var drafts = s.draft(xptId).geoPoints().map(function (pt) { return Object.assign({ source: 'rascunho', eligible: true, why: null }, pt); });
        var pts = drafts.concat(s.savedPoints(xptId));
        s.group(xptId).reconcile(pts.filter(function (p) { return p.eligible; }));
        return pts;
      },
      /** Somente os pontos que podem entrar numa seleção (pacotes já em operação ativa ficam de fora). */
      selectable: function (pts) { return pts.filter(function (p) { return p.eligible; }); },
      on: function (fn) { listeners.push(fn); },
      changed: function (src) { listeners.slice().forEach(function (fn) { fn(src); }); },
    };
    return s;
  }
  NS.store = { createStore: createStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.store;
})(typeof window !== 'undefined' ? window : globalThis);
