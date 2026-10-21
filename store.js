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
        return confs[k] || (confs[k] = NS.operations.createConference(D, op));
      },
      /** Pontos (somente desta XPT) e seleção sempre reconciliados com o rascunho atual. */
      mapPoints: function (xptId) {
        var pts = s.draft(xptId).geoPoints();
        s.group(xptId).reconcile(pts);
        return pts;
      },
      on: function (fn) { listeners.push(fn); },
      changed: function (src) { listeners.slice().forEach(function (fn) { fn(src); }); },
    };
    return s;
  }
  NS.store = { createStore: createStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.store;
})(typeof window !== 'undefined' ? window : globalThis);
