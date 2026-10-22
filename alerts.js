/* COOPMETRO XPT — alertas calculados AO ABRIR a tela (nada roda em segundo plano).
 * Permanência = tempo desde a entrada do ciclo atual, só enquanto o pacote está no galpão.
 * Datas inválidas nunca geram alerta. 3º retorno = atenção; 4º+ = avaliar devolução (só exibição). */
(function (root) {
  'use strict';
  var NS = (root.CXPT = root.CXPT || {});
  var DAY = 86400000;

  function limitOf(D) {
    var n = D && D.settings && D.settings.stayLimitDays;
    return typeof n === 'number' && isFinite(n) && n > 0 ? n : 4;
  }

  /** Separa os pacotes do galpão acima do limite (over) dos de data inválida (invalid). Estritamente "mais de" N dias. */
  function stay(list, nowMs, limitDays) {
    var P = NS.packages, over = [], invalid = [];
    list.forEach(function (p) {
      if (!P.inWarehouse(p)) return; // saída do estoque encerra o alerta
      if (!P.validTs(p.entryAt) || p.entryAt > nowMs) { invalid.push(p); return; }
      if (nowMs - p.entryAt > limitDays * DAY) over.push(p);
    });
    return { over: over, invalid: invalid };
  }

  /** Alertas de UMA XPT. opts.state restringe todas as listas a um estado. */
  function compute(D, xptId, nowMs, opts) {
    opts = opts || {};
    var P = NS.packages, limitDays = limitOf(D);
    var mine = D.packages.filter(function (p) { return p.xptId === xptId && (!opts.state || p.state === opts.state); });
    var s = stay(mine, nowMs, limitDays);
    function wh(p) { return P.inWarehouse(p); }
    return {
      limitDays: limitDays,
      stay: s.over,
      invalidDate: s.invalid,
      noLocation: mine.filter(function (p) { return wh(p) && (p.location.kind === 'desconhecida' || p.location.kind === 'pendente'); }),
      divergent: mine.filter(function (p) { return p.state === 'divergente'; }),
      awaitingReturn: mine.filter(function (p) { return p.state === 'aguardando_devolucao'; }),
      repeatedReturns: mine.filter(function (p) { return wh(p) && P.returnFlag(p) !== null; }),
    };
  }
  function total(a) {
    return a.stay.length + a.noLocation.length + a.divergent.length + a.awaitingReturn.length + a.repeatedReturns.length;
  }

  NS.alerts = { DAY: DAY, limitOf: limitOf, stay: stay, compute: compute, total: total };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.alerts;
})(typeof window !== 'undefined' ? window : globalThis);
