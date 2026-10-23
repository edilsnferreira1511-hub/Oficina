/* COOPMETRO XPT — operações demonstrativas, conferência e rascunho de grupo geográfico (tudo em memória).
 * Nada aqui confirma saída, muda estado de pacote ou cria operação real. */
(function (root) {
  'use strict';
  var NS = (root.CXPT = root.CXPT || {});

  var OP_STATE = {
    rascunho_demo: 'Rascunho demonstrativo',
    em_conferencia: 'Em conferência (demo)',
    aguardando_confirmacao: 'Aguardando confirmação (demo)',
    em_separacao: 'Em separação',
    saida_confirmada: 'Saída confirmada',
    encerrada: 'Encerrada',
  };
  function opsOf(D, xptId) { return D.operations.filter(function (o) { return o.xptId === xptId; }); }
  function opPackages(D, op) {
    return op.packageIds.map(function (id) { return D.packages.filter(function (p) { return p.id === id; })[0]; }).filter(Boolean);
  }

  /**
   * Conferência de UMA operação (isolada por operação e XPT). O registro fica em op.checked (memória da demonstração),
   * então a tela de Saída e a página do QR sempre mostram o mesmo progresso. Conferir NUNCA muda o estado do pacote.
   * scan() devolve {status: 'ok'|'repetido'|'invalido'|'outra_operacao'|'nao_vinculado'|'inexistente'|'bloqueado', message}.
   */
  function createConference(D, op, ctx) {
    ctx = ctx || {};
    function c() { return { nowMs: ctx.nowFn ? ctx.nowFn() : D.nowMs, operator: ctx.operator, authorized: ctx.authorized }; }
    function codesDone() { var k = op.checked || {}; return opPackages(D, op).map(function (p) { return p.code; }).filter(function (x) { return k[x]; }); }
    return {
      opId: op.id, xptId: op.xptId,
      scan: function (raw) { return NS.ambulance.scan(D, op, raw, c()); },
      remove: function (code) { return NS.ambulance.unscan(D, op, code, c()); },
      clear: function () { codesDone().forEach(function (x) { NS.ambulance.unscan(D, op, x, c()); }); },
      checked: codesDone,
      pending: function () { var k = op.checked || {}; return opPackages(D, op).filter(function (p) { return !k[p.code]; }); },
      expected: function () { return opPackages(D, op); },
      progress: function () { return { done: codesDone().length, total: op.packageIds.length }; },
      complete: function () { return op.packageIds.length > 0 && codesDone().length === op.packageIds.length; },
    };
  }

  /**
   * Rascunho VISUAL de grupo preliminar de ambulância para UMA XPT.
   * Só aceita pontos com coordenadas válidas daquela XPT. Não é persistido nem cria operação.
   */
  function createGroupDraft(xptId) {
    var sel = [], undoStack = [];
    function snap() { undoStack.push(sel.slice()); if (undoStack.length > 50) undoStack.shift(); }
    function allowed(points, id) {
      return points.some(function (p) { return p.id === id && p.xptId === xptId && NS.geo.validCoord(p.lat, p.lng); });
    }
    return {
      xptId: xptId,
      toggle: function (id, points) {
        var k = sel.indexOf(id);
        if (k >= 0) { snap(); sel.splice(k, 1); return { ok: true, selected: false }; }
        if (!allowed(points, id)) return { ok: false, reason: 'Pacote sem coordenadas válidas (ou de outra base) não entra em grupo geográfico.' };
        snap(); sel.push(id); return { ok: true, selected: true };
      },
      selectMany: function (ids, points) {
        var added = [], skipped = [];
        ids.forEach(function (id) {
          if (sel.indexOf(id) >= 0) return;
          if (allowed(points, id)) added.push(id); else skipped.push(id);
        });
        if (added.length) { snap(); sel = sel.concat(added); }
        return { added: added, skipped: skipped };
      },
      undo: function () { if (!undoStack.length) return false; sel = undoStack.pop(); return true; },
      clear: function () { if (!sel.length) return; snap(); sel = []; },
      /** Remove da seleção o que não está mais disponível (ex.: item removido do rascunho). */
      reconcile: function (points) {
        var gone = sel.filter(function (id) { return !allowed(points, id); });
        if (gone.length) { sel = sel.filter(function (id) { return gone.indexOf(id) < 0; }); undoStack = undoStack.map(function (s) { return s.filter(function (id) { return gone.indexOf(id) < 0; }); }); }
        return gone;
      },
      has: function (id) { return sel.indexOf(id) >= 0; },
      ids: function () { return sel.slice(); },
      count: function () { return sel.length; },
      canUndo: function () { return undoStack.length > 0; },
    };
  }

  /** Resumo da zona desenhada: usa só coordenadas reais guardadas. inside/outside = pontos com coordenadas; eligible = pacotes salvos livres de operação ativa. */
  function zoneSummary(points, poly) {
    var G = NS.geo;
    if (!G.polygonValid(poly)) return { valid: false, inside: [], outside: [], eligible: [], blocked: [], drafts: [] };
    var r = G.pointsInPolygon(points, poly);
    return {
      valid: true, inside: r.inside, outside: r.outside,
      eligible: r.inside.filter(function (p) { return p.eligible && p.source === 'pacote'; }),
      blocked: r.inside.filter(function (p) { return !p.eligible; }),
      drafts: r.inside.filter(function (p) { return p.eligible && p.source !== 'pacote'; }),
    };
  }

  NS.operations = { zoneSummary: zoneSummary, OP_STATE: OP_STATE, opsOf: opsOf, opPackages: opPackages, createConference: createConference, createGroupDraft: createGroupDraft };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.operations;
})(typeof window !== 'undefined' ? window : globalThis);
