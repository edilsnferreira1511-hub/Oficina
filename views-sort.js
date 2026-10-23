/* COOPMETRO XPT — "Separar" (bipar qualquer pacote e ver para qual ambulância ele vai) e "Bipar pacote" do motorista.
 * Estrutura inspirada no modelo Rota Certa: leitor sempre pronto, resultado grande e colorido (cor + nome da ambulância),
 * verde/vermelho/âmbar para o motorista. Estas telas SÓ CONSULTAM: não conferem, não gravam e não mudam estado de pacote
 * (a conferência registrada continua na página da ambulância / Saída e Conferência). */
(function (root) {
  'use strict';
  var NS = root.CXPT, ui = NS.ui, el = ui.el, H = NS.vh, A = NS.ambulance, V = NS.views;
  var CLEAR_MS = 2200;

  function driverName(D, id) { var d = D.drivers.filter(function (x) { return x.id === id; })[0]; return d ? d.name : 'sem motorista'; }
  function opLabel(op) { return op.name || op.id; }
  /** Etiqueta de ambulância: bolinha na cor + nome + nome da cor (a cor nunca é a única informação). */
  H.ambChip = function (op) {
    var col = A.colorOf(op), dot = el('span', { class: 'amb-dot', 'aria-hidden': 'true' });
    dot.style.background = col.hex;
    return el('span', { class: 'amb-chip', 'data-color': col.hex }, dot, el('span', { text: opLabel(op) }), el('small', { class: 'muted', text: ' · ' + col.name }));
  };
  function codesOf(D, op) { return op.packageCodes || A.opPackages(D, op).map(function (p) { return p.code; }); }

  /** Painel de leitura (leitor USB/Bluetooth ou digitação) + resultado grande que some sozinho. */
  function reader(id, onCode, enabled) {
    var inp = el('input', { type: 'text', id: id, name: id, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '80', inputmode: 'text', placeholder: 'Leia ou digite o código e tecle Enter', disabled: !enabled });
    var out = el('div', { class: 'big-result', id: id + '-result', role: 'status', 'aria-live': 'polite' });
    var timer = null, dead = false;
    function show(kind, color, icon, line1, line2, line3) {
      out.className = 'big-result big-result--' + kind; out.style.removeProperty('--gcolor'); if (color) out.style.setProperty('--gcolor', color);
      out.replaceChildren(el('span', { class: 'big-icon', 'aria-hidden': 'true', text: icon }), el('div', { class: 'big-line1', text: line1 }), el('div', { class: 'big-line2 mono', text: line2 || '' }), el('div', { class: 'big-line3', text: line3 || '' }));
      clearTimeout(timer); timer = setTimeout(function () { if (!dead) { out.className = 'big-result'; out.replaceChildren(); } }, CLEAR_MS);
    }
    function submit() { var v = inp.value; inp.value = ''; if (v.trim()) onCode(v, show); if (inp.isConnected) inp.focus({ preventScroll: true }); }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    // leitura contínua: se o foco se perder para o nada, volta ao campo
    inp.addEventListener('blur', function () { setTimeout(function () { if (!dead && enabled && inp.isConnected && (document.activeElement === document.body || document.activeElement === null) && !document.querySelector('.modal-back')) inp.focus({ preventScroll: true }); }, 80); });
    setTimeout(function () { if (enabled && inp.isConnected) inp.focus({ preventScroll: true }); }, 0);
    var form = el('form', { class: 'scan-form', onsubmit: function (e) { e.preventDefault(); submit(); } },
      ui.field('Campo de bipagem (leitor USB/Bluetooth ou digitação)', inp, null, 'Leitores enviam Enter ao final. Leitura pela câmera: não disponível nesta versão.'),
      el('button', { type: 'submit', class: 'btn btn--primary', id: id + '-btn', disabled: !enabled }, 'Consultar código'), out);
    return { node: form, destroy: function () { dead = true; clearTimeout(timer); } };
  }

  // ---------- Separar: para qual ambulância vai este pacote?
  V.sort = function (c) {
    var g = H.guard(c, 'conferir'); if (g) return g;
    var D = c.D, ops = NS.operations.opsOf(D, c.xptId).filter(A.isActive);
    var rd = reader('sort-in', function (raw, show) {
      var v = NS.codes.validate(raw);
      if (!v.ok) return show('fail', null, '✕', 'Código inválido', String(raw).trim().slice(0, 40), v.message);
      var p = D.packages.filter(function (x) { return x.code === v.code && x.xptId === c.xptId; })[0];
      if (!p) return show('fail', null, '✕', 'Pacote não encontrado', v.code, 'Não existe nesta base.');
      var op = A.activeOpOf(D, p.id);
      if (!op) return show('fail', null, '✕', 'Pacote sem ambulância', v.code, 'Não está em nenhuma ambulância ativa (estado: ' + p.state + ').');
      var col = A.colorOf(op);
      show('ok', col.hex, '✓', opLabel(op) + ' · ' + col.name, v.code, 'Motorista: ' + driverName(D, op.driverId) + ' · aproxime o próximo pacote');
    }, true);
    var legend = ops.length ? el('ul', { class: 'amb-legend', id: 'sort-legend', 'aria-label': 'Ambulâncias ativas' }, ops.map(function (o) {
      return el('li', { 'data-op': o.id }, H.ambChip(o), el('span', { class: 'muted', text: ' — ' + driverName(D, o.driverId) + ' · ' + o.packageIds.length + ' pacote(s) · ' + (NS.operations.OP_STATE[o.state] || o.state) }));
    })) : ui.empty('Nenhuma ambulância ativa nesta base.', 'Circule pacotes no mapa e crie uma ambulância para cada motorista.');
    return {
      node: H.page([
        ui.callout('info', 'Bipe qualquer pacote para ver a ambulância dele.', 'Esta tela só consulta: nada é gravado. Para registrar a conferência, use a página da ambulância (QR) ou Saída e Conferência.'),
        ui.card('Separar pacotes (' + c.xpt.name + ')', rd.node), ui.card('Ambulâncias ativas', legend), H.demoNote(),
      ]), destroy: rd.destroy,
    };
  };

  // ---------- Motorista: este pacote é da minha ambulância?
  V.check = function (c) {
    var g = H.guard(c, 'minhas_ops'); if (g) return g;
    var D = c.D, myId = c.user ? c.user.driverId : 'm1';
    var mine = NS.operations.opsOf(D, c.xptId).filter(function (o) { return o.driverId === myId && A.isActive(o); });
    var rd = reader('check-in', function (raw, show) {
      var v = NS.codes.validate(raw);
      if (!mine.length) return show('warn', null, '!', 'Você não tem ambulância ativa', '', 'Procure o despacho.');
      if (!v.ok) return show('warn', null, '!', 'Código inválido', String(raw).trim().slice(0, 40), v.message);
      var hit = mine.filter(function (o) { return codesOf(D, o).indexOf(v.code) >= 0; })[0];
      if (hit) { var col = A.colorOf(hit); return show('ok', col.hex, '✓', 'Pacote da sua ambulância', v.code, opLabel(hit) + ' · ' + col.name); }
      // a base só revela de qual ambulância é quando o dado já está visível para este usuário (nunca consulta nada novo)
      var p = D.packages.filter(function (x) { return x.code === v.code && x.xptId === c.xptId; })[0], other = p && A.activeOpOf(D, p.id);
      show('wrong', other ? A.colorOf(other).hex : null, '✕', 'Pacote de outra ambulância', v.code, other ? opLabel(other) + ' · ' + A.colorOf(other).name : 'Não pertence à sua ambulância.');
    }, true);
    var cards = mine.length ? mine.map(function (o) {
      var codes = codesOf(D, o);
      return ui.card('Sua ambulância', el('div', { class: 'my-amb', 'data-op': o.id }, el('p', null, H.ambChip(o)), el('p', { class: 'group-count', id: 'my-count', text: codes.length + ' pacote(s) · ' + (NS.operations.OP_STATE[o.state] || o.state) }),
        el('div', { class: 'chips', id: 'my-codes' }, codes.map(function (x) { return el('span', { class: 'chip mono', text: x }); }))));
    }) : [ui.empty('Você não tem ambulância ativa.', 'Quando o despacho criar uma ambulância para você, ela aparece aqui.')];
    return { node: H.page(cards.concat([ui.card('Bipar pacote', rd.node), H.demoNote()])), destroy: rd.destroy };
  };
})(typeof window !== 'undefined' ? window : globalThis);
