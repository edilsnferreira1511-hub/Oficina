/* COOPMETRO XPT — registro de auditoria DEMONSTRATIVO em memória (só acrescenta; sem editar/apagar). */
(function (root) {
  'use strict';
  var NS = (root.CXPT = root.CXPT || {});
  function createAudit(nowFn) {
    var entries = [], seq = 1;
    nowFn = nowFn || function () { return Date.now(); };
    return {
      log: function (type, xptId, detail, actor) {
        var e = Object.freeze({ id: 'au-' + seq++, at: nowFn(), type: type, xptId: xptId || null, actor: actor || 'Usuário Demo', detail: detail || '' });
        entries.push(e);
        return e;
      },
      list: function (xptId) { return entries.filter(function (e) { return !xptId || e.xptId === xptId; }); },
      count: function () { return entries.length; },
    };
  }
  NS.audit = { createAudit: createAudit };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.audit;
})(typeof window !== 'undefined' ? window : globalThis);
