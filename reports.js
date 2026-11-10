/* COOPMETRO XPT — cálculos de relatórios e CSV local (puros). Dados: sempre os fictícios da sessão. */
(function (root) {
  'use strict';
  var NS = (root.CXPT = root.CXPT || {});
  var DAY = 86400000;
  function pad(n) { return String(n).padStart(2, '0'); }
  function dayKey(ms) { var d = new Date(ms); return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1); }
  /** Entradas por dia (UTC) dos últimos N dias terminando em nowMs. Datas inválidas são ignoradas e contadas à parte. */
  function entriesByDay(pkgs, nowMs, days) {
    var out = [], idx = {}, invalid = 0;
    for (var i = days - 1; i >= 0; i--) { var k = dayKey(nowMs - i * DAY); idx[k] = out.length; out.push({ label: k, value: 0 }); }
    pkgs.forEach(function (p) {
      if (!NS.packages.validTs(p.entryAt)) { invalid++; return; }
      var k = dayKey(p.entryAt);
      if (idx[k] !== undefined && p.entryAt <= nowMs && nowMs - p.entryAt < days * DAY) out[idx[k]].value++;
    });
    out.invalid = invalid;
    return out;
  }
  function countBy(list, keyFn) {
    var m = {}; list.forEach(function (x) { var k = keyFn(x); m[k] = (m[k] || 0) + 1; }); return m;
  }
  /** Neutraliza injeção de fórmula em planilhas e escapa aspas/vírgulas/quebras de linha. */
  function csvCell(v) {
    var s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(headers, rows) {
    return [headers].concat(rows).map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }
  NS.reports = { entriesByDay: entriesByDay, countBy: countBy, toCsv: toCsv, csvCell: csvCell };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.reports;
})(typeof window !== 'undefined' ? window : globalThis);
