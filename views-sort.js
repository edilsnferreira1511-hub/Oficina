/* COOPMETRO XPT — "Separar" (bipar qualquer pacote e ver para qual ambulância ele vai) e a tela exclusiva do motorista (bipagem da própria ambulância).
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

  H.reader = reader;

  // ---------- Motorista: tela ÚNICA e reduzida — bipagem da PRÓPRIA ambulância (aberta pelo QR ou pelo menu "Minha ambulância")
  // O QR só identifica a operação. Aqui só aparece o que o motorista pode ver: nome da ambulância, o próprio nome, a operação, os códigos dela,
  // os contadores e a bipagem. Nada de despacho, entrada, mapa de planejamento, QR, saída administrativa, encerramento ou histórico.
  var GREEN = '#1b7f3b';
  function denied(c, why) {
    return H.page([ui.callout('danger', 'Acesso negado.', why), el('p', { class: 'hint', id: 'driver-denied' }, 'Esta tela só abre a ambulância atribuída a você. Nenhum dado de outras ambulâncias é exibido.'),
      el('a', { class: 'btn btn--primary', id: 'driver-home', href: '#/separation' }, 'Ir para a minha ambulância')]);
  }
  V.driverOp = function (c) {
    var D = c.D, me = c.driverId, mine = D.operations.filter(function (o) { return o.driverId === me && A.isActive(o); });
    var id = c.params[0], op;
    if (!me) return H.page([ui.callout('warn', 'Seu usuário não está vinculado a um motorista.', 'Peça ao administrador para preencher o campo driverId do seu cadastro.')]);
    if (id) { op = D.operations.filter(function (o) { return o.id === id; })[0]; if (!op || op.driverId !== me) return denied(c, 'Esta operação não foi atribuída a você (ou não existe). O QR Code identifica a operação, mas não concede acesso.'); }
    else op = mine[0];
    if (!op) return H.page([ui.callout('info', 'Você não tem ambulância ativa agora.', 'Quando o despacho criar uma ambulância para você, ela aparece aqui. Use "Atualizar dados" para recarregar.')]);
    var active = A.isActive(op), drvDoc = D.drivers.filter(function (d) { return d.id === me; })[0];
    var head = el('div', { id: 'drv-head' }), list = el('div', { id: 'drv-list' });
    function draw() {
      var s = A.summary(D, op), done = op.checked || {}, pk = A.opPackages(D, op);
      head.replaceChildren(
        el('div', { class: 'progress-row' }, el('strong', { id: 'conf-progress', text: s.done + ' de ' + s.total + ' conferidos' })),
        el('ul', { class: 'counts', 'aria-label': 'Contagens' }, el('li', null, 'Previstos: ', el('strong', { id: 'cnt-total', text: String(s.total) })), el('li', null, 'Conferidos: ', el('strong', { id: 'cnt-done', text: String(s.done) })), el('li', null, 'Pendentes: ', el('strong', { id: 'cnt-pending', text: String(s.total - s.done) }))));
      list.replaceChildren(el('ul', { class: 'conf-items', 'aria-label': 'Pacotes da sua ambulância' }, pk.map(function (p) {
        var ok = !!done[p.code];
        return el('li', { class: 'conf-item conf-item--' + (ok ? 'ok' : 'pend'), 'data-code': p.code, 'data-state': ok ? 'conferido' : 'pendente' }, el('span', { class: 'mono', text: p.code }), el('span', { class: 'conf-tag', text: ok ? 'Conferido' : 'Pendente' }));
      })));
    }
    var rd = reader('drv-in', function (raw, show) {
      return c.svc.scan(op, raw, c.who).then(function (r) {
        draw();
        var code = r.code || String(raw).trim().slice(0, 40), st = r.status;
        if (st === 'ok') return show('ok', GREEN, '✓', 'Conferido', code, 'Pacote da sua ambulância · ' + A.summary(D, op).done + ' de ' + A.summary(D, op).total);
        if (st === 'repetido') return show('warn', null, '!', 'Já conferido', code, 'Não foi contado de novo.');
        if (st === 'invalido') return show('warn', null, '!', 'Código inválido', code, r.message);
        if (st === 'outra_operacao') return show('wrong', '#b3261e', '✕', 'Pacote de outra operação', code, 'Não é da sua ambulância. Nada foi alterado.');
        if (st === 'nao_vinculado' || st === 'inexistente') return show('wrong', '#b3261e', '✕', 'Código desconhecido', code, 'Não pertence à sua ambulância. Nada foi alterado.');
        if (st === 'bloqueado') return show('fail', null, '✕', 'Operação encerrada', code, 'Novas bipagens estão bloqueadas.');
        return show('fail', null, '✕', st === 'sem_permissao' ? 'Sem permissão' : 'Não foi possível gravar', code, r.message || '');
      });
    }, active);
    draw();
    return { node: H.page([
      ui.card('Minha ambulância', el('dl', { class: 'dl', id: 'drv-info' }, [['Ambulância', H.ambChip(op)], ['Operação', el('span', { class: 'mono', id: 'drv-op', text: op.id })], ['Motorista', (drvDoc && drvDoc.name) || (c.user && c.user.name) || '—'], ['Situação', ui.badge(NS.operations.OP_STATE[op.state] || op.state, active ? 'info' : 'neutral')]].map(function (r) { return [el('dt', { text: r[0] }), el('dd', null, r[1])]; }).reduce(function (a, b) { return a.concat(b); }, []))),
      !active ? ui.callout('danger', 'Operação encerrada.', 'Novas bipagens estão bloqueadas.') : null,
      ui.card('Conferência', el('div', null, head, rd.node)), ui.card('Pacotes desta ambulância', list),
      el('p', { class: 'hint', text: 'O QR Code só identificou esta operação. O acesso depende do seu login e do vínculo com a ambulância, verificados no servidor. Mapa-resumo indisponível para o seu perfil.' }),
    ]), destroy: rd.destroy };
  };
})(typeof window !== 'undefined' ? window : globalThis);
