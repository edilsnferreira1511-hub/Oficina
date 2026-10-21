/* COOPMETRO XPT — operações demonstrativas, conferência e rascunho de grupo geográfico (tudo em memória).
 * Nada aqui confirma saída, muda estado de pacote ou cria operação real. */
(function (root) {
  'use strict';
  var NS = (root.CXPT = root.CXPT || {});

  var OP_STATE = {
    rascunho_demo: 'Rascunho demonstrativo',
    em_conferencia: 'Em conferência (demo)',
    aguardando_confirmacao: 'Aguardando confirmação (bloqueada)',
  };
  function opsOf(D, xptId) { return D.operations.filter(function (o) { return o.xptId === xptId; }); }
  function opPackages(D, op) {
    return op.packageIds.map(function (id) { return D.packages.filter(function (p) { return p.id === id; })[0]; }).filter(Boolean);
  }

  /**
   * Conferência local de UMA operação (isolada por operação e XPT).
   * scan() devolve {status: 'ok'|'repetido'|'invalido'|'outra_operacao'|'inexistente', ...}. Nunca expede nada.
   */
  function createConference(D, op) {
    var expected = opPackages(D, op);
    var byCode = {};
    expected.forEach(function (p) { byCode[p.code] = p; });
    var done = [];
    function scan(raw) {
      var v = NS.codes.validate(raw);
      if (!v.ok) return { status: 'invalido', message: v.message };
      if (done.indexOf(v.code) >= 0) return { status: 'repetido', code: v.code, message: 'Código já conferido — não contado de novo.' };
      if (byCode[v.code]) { done.push(v.code); return { status: 'ok', code: v.code, message: 'Conferido (demonstração).' }; }
      // só procura na MESMA XPT da operação; nunca revela pacotes de outras bases
      var other = D.packages.filter(function (p) { return p.code === v.code && p.xptId === op.xptId; })[0];
      if (other) return { status: 'outra_operacao', code: v.code, message: 'Este pacote não pertence à operação selecionada.' };
      return { status: 'inexistente', code: v.code, message: 'Código não encontrado nesta base.' };
    }
    return {
      opId: op.id, xptId: op.xptId, scan: scan,
      remove: function (code) { var k = done.indexOf(code); if (k < 0) return false; done.splice(k, 1); return true; },
      clear: function () { done.length = 0; },
      checked: function () { return done.slice(); },
      pending: function () { return expected.filter(function (p) { return done.indexOf(p.code) < 0; }); },
      expected: function () { return expected.slice(); },
      progress: function () { return { done: done.length, total: expected.length }; },
      complete: function () { return expected.length > 0 && done.length === expected.length; },
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

  NS.operations = { OP_STATE: OP_STATE, opsOf: opsOf, opPackages: opPackages, createConference: createConference, createGroupDraft: createGroupDraft };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.operations;
})(typeof window !== 'undefined' ? window : globalThis);
