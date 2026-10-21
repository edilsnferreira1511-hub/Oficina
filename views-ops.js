/* COOPMETRO XPT — Saída e Conferência, Alertas e devoluções, Operações de ambulância. Nada confirma saída real. */
(function (root) {
  'use strict';
  var NS = root.CXPT, ui = NS.ui, el = ui.el, H = NS.vh, P = NS.packages;
  var V = NS.views;
  var selOp = {}; // operação escolhida por XPT (memória)

  function driverName(D, id) { var d = D.drivers.filter(function (x) { return x.id === id; })[0]; return d ? d.name : 'Não designado'; }
  function visibleOps(c) {
    var ops = NS.operations.opsOf(c.D, c.xptId);
    return c.profile === 'motorista' ? ops.filter(function (o) { return o.driverId === 'm1'; }) : ops;
  }
  function progressBar(done, total) {
    var b = el('span', { class: 'bar bar--ok' }); b.style.setProperty('--w', (total ? Math.round(done / total * 100) : 0) + '%');
    return el('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done), 'aria-label': 'Progresso da conferência' }, el('span', { class: 'bar-track' }, b));
  }

  // ---------- Saída e conferência
  V.exit = function (c) {
    var g = H.guard(c, 'conferir'); if (g) return g;
    var D = c.D, ops = NS.operations.opsOf(D, c.xptId);
    if (!ops.length) return H.page([ui.empty('Nenhuma operação demonstrativa nesta XPT.'), H.demoNote()]);
    var cur = ops.filter(function (o) { return o.id === selOp[c.xptId]; })[0] || ops[0];
    selOp[c.xptId] = cur.id;
    var conf = c.store.conference(cur);
    var opSel = ui.select('op', ops.map(function (o) { return { id: o.id, label: o.id + ' — ' + o.groupLabel }; }), cur.id);
    opSel.id = 'op-select';
    opSel.addEventListener('change', function () { selOp[c.xptId] = opSel.value; c.rerender(); });
    var scanIn = el('input', { type: 'text', id: 'scan-in', name: 'scan', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '80', placeholder: 'Leia ou digite o código' });
    var result = el('div', { class: 'scan-result', id: 'scan-result', role: 'status', 'aria-live': 'polite' });
    var box = el('div');
    function draw() {
      var pr = conf.progress(), done = conf.checked();
      box.replaceChildren(
        el('div', { class: 'progress-row' }, el('strong', { id: 'conf-progress', text: pr.done + ' de ' + pr.total + ' conferidos' }), progressBar(pr.done, pr.total)),
        ui.table([
          { label: 'Código', render: function (p) { return el('span', { class: 'mono', text: p.code }); } },
          { label: 'Tamanho', render: function (p) { return H.sizeLabel(D, p.size); } },
          { label: 'Situação', render: function (p) { return done.indexOf(p.code) >= 0 ? ui.badge('Conferido', 'ok') : ui.badge('Pendente', 'warn'); } },
          { label: 'Ações', cls: 'actions', render: function (p) {
            return done.indexOf(p.code) >= 0 ? el('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'data-act': 'unscan', 'aria-label': 'Remover leitura de ' + p.code, onclick: function () { conf.remove(p.code); result.textContent = 'Leitura de ' + p.code + ' removida do rascunho.'; result.className = 'scan-result'; draw(); } }, 'Remover leitura') : null; } },
        ], conf.expected(), { label: 'Pacotes esperados na operação' }),
        conf.complete() ? ui.callout('success', 'Todos os pacotes esperados foram conferidos (rascunho).', 'A saída real continua bloqueada.') : null);
    }
    function scan() {
      var r = conf.scan(scanIn.value);
      var tone = { ok: 'ok', repetido: 'warn', invalido: 'danger', outra_operacao: 'danger', inexistente: 'danger' }[r.status];
      result.className = 'scan-result scan-result--' + tone; result.dataset.status = r.status;
      result.textContent = (r.code ? r.code + ': ' : '') + r.message;
      scanIn.value = ''; scanIn.focus(); draw();
    }
    scanIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); scan(); } });
    draw();
    return H.page([
      ui.callout('warn', 'Conferência demonstrativa.', 'Nenhum estado de pacote é alterado e a saída real está bloqueada.'),
      ui.card('Operação (' + c.xpt.name + ')', el('div', { class: 'form-grid' }, ui.field('Operação demonstrativa', opSel),
        el('dl', { class: 'dl dl--compact' }, el('dt', { text: 'Responsável' }), el('dd', { text: cur.responsible }), el('dt', { text: 'Motorista' }), el('dd', { text: driverName(D, cur.driverId) })))),
      ui.card('Leitura de códigos', el('form', { class: 'scan-form', onsubmit: function (e) { e.preventDefault(); scan(); } },
        ui.field('Código do pacote', scanIn, null, 'Leitores USB/Bluetooth enviam Enter ao final. Leituras repetidas não são contadas.'),
        el('button', { type: 'submit', class: 'btn btn--primary', id: 'scan-btn' }, 'Conferir código'), result)),
      ui.card('Conferência', box),
      el('div', { class: 'row-actions' }, ui.blocked('Confirmar saída', 'confirmação real exige backend e regras de negócio ainda não aprovadas (D-07).')),
      H.demoNote(),
    ]);
  };

  // ---------- Alertas e devoluções
  var alertState = {};
  V.alerts = function (c) {
    var g = H.guard(c, 'ver_base'); if (g) return g;
    var D = c.D, st = alertState[c.xptId] || (alertState[c.xptId] = { state: '' });
    var a = NS.alerts.compute(D, c.xptId, c.nowMs, { state: st.state });
    var stateSel = ui.select('state', D.states, st.state, 'Todos os estados'); stateSel.id = 'alert-state';
    stateSel.addEventListener('change', function () { st.state = stateSel.value; c.rerender(); });
    var limit = el('input', { type: 'number', id: 'limit-days', name: 'limit', min: '1', max: '60', step: '1', value: String(a.limitDays) });
    var lmsg = el('small', { class: 'hint', id: 'limit-msg', role: 'status' });
    limit.addEventListener('change', function () {
      var n = Number(limit.value);
      if (!Number.isInteger(n) || n < 1 || n > 60) { lmsg.textContent = 'Informe um número inteiro de 1 a 60.'; limit.value = String(NS.alerts.limitOf(D)); return; }
      if (!H.can(c, 'config') && !H.can(c, 'correcao')) { lmsg.textContent = 'Seu perfil não pode alterar o limite (simulação).'; limit.value = String(NS.alerts.limitOf(D)); return; }
      D.settings.stayLimitDays = n; c.store.audit.log('config_limite_dias_demo', c.xptId, String(n)); c.store.changed();
    });
    function section(id, title, list, extra, hint) {
      var shown = list.slice(0, 20);
      return ui.card(title + ' (' + list.length + ')', el('div', { id: 'alert-' + id, 'data-count': String(list.length) },
        hint ? el('p', { class: 'hint', text: hint }) : null,
        list.length ? [ui.table([{ label: 'Código', render: H.link }, { label: 'Estado', render: function (p) { return H.stateBadge(D, p.state); } },
          { label: 'Entrada', render: function (p) { return ui.fmtDate(p.entryAt); } }, { label: extra.label, render: extra.render }], shown, { label: title }),
          list.length > shown.length ? el('p', { class: 'hint', text: 'Mostrando ' + shown.length + ' de ' + list.length + '.' }) : null] : ui.empty('Nenhum pacote neste alerta.')));
    }
    return H.page([
      ui.callout('info', 'Alertas calculados ao abrir esta tela, com dados demonstrativos de ' + c.xpt.name + '.', 'Não há processamento em segundo plano nem notificações automáticas.'),
      ui.card('Filtros e limite', el('div', { class: 'form-grid' }, ui.field('Estado', stateSel), ui.field('Limite de permanência (dias) — demonstração', limit, null, 'Alerta quando o pacote passa de ' + a.limitDays + ' dia(s) no ciclo atual.'), lmsg)),
      section('stay', 'Permanência acima de ' + a.limitDays + ' dias', a.stay, { label: 'Dias', render: function (p) { return String(P.stayDays(p, c.nowMs)); } }, 'A idade conta a partir da entrada no ciclo atual; sair do galpão encerra o alerta.'),
      a.invalidDate.length ? section('invalid', 'Data de entrada indisponível ou inválida', a.invalidDate, { label: 'Situação', render: function () { return 'Sem alerta (data inválida)'; } }, 'Estes pacotes não geram alerta de permanência para evitar alertas falsos.') : null,
      section('noloc', 'Localização desconhecida', a.noLocation, { label: 'Localização', render: function (p) { return H.locBadge(p.location); } }),
      section('div', 'Pacotes divergentes', a.divergent, { label: 'Retornos', render: function (p) { return String(p.returns); } }),
      section('await', 'Aguardando devolução', a.awaitingReturn, { label: 'Retornos', render: function (p) { return String(p.returns); } }, 'A devolução ao remetente depende de decisão humana e de regras futuras (D-05).'),
      section('ret', 'Retornos repetidos', a.repeatedReturns, { label: 'Sinalização', render: function (p) {
        return P.returnFlag(p) === 'avaliar_devolucao' ? ui.badge(p.returns + 'º retorno: avaliar devolução ao remetente', 'danger') : ui.badge(p.returns + 'º retorno: atenção', 'warn'); } }, 'Nada é devolvido automaticamente.'),
      H.demoNote(),
    ]);
  };

  // ---------- Operações
  V.ops = function (c) {
    var g = H.guard(c, ['ver_base', 'minhas_ops']); if (g) return g;
    var D = c.D, ops = visibleOps(c);
    return H.page([
      c.profile === 'motorista' ? ui.callout('info', 'Visão do motorista (simulação): somente operações atribuídas a "Motorista Demo 1".', 'Na versão real isso será imposto pelo backend.') : null,
      ui.card('Operações demonstrativas — ' + c.xpt.name, ops.length ? ui.table([
        { label: 'Operação', render: function (o) { return el('a', { href: '#/operation/' + encodeURIComponent(o.id), class: 'code-link', text: o.id }); } },
        { label: 'Responsável', key: 'responsible' }, { label: 'Motorista', render: function (o) { return driverName(D, o.driverId); } },
        { label: 'Previstos', render: function (o) { return String(o.packageIds.length); } },
        { label: 'Conferidos', render: function (o) { return String(c.store.conference(o).progress().done); } },
        { label: 'Estado (demo)', render: function (o) { return ui.badge(NS.operations.OP_STATE[o.state], 'info'); } },
        { label: 'Criada em', render: function (o) { return ui.fmtDate(o.createdAt); } },
        { label: 'Grupo/região preliminar', render: function (o) { return o.groupLabel + ' · ' + H.regionLabel(D, o.regionId); } },
      ], ops, { label: 'Operações' }) : ui.empty('Nenhuma operação para este perfil/XPT.')),
      el('div', { class: 'row-actions' }, ui.blocked('Criar operação', 'criação e confirmação de operações exigem backend e regras de negócio pendentes.')),
      el('p', { class: 'hint', text: 'Para formar um grupo preliminar por região, use a tela Mapa e Regiões (apenas rascunho visual).' }),
      H.demoNote(),
    ]);
  };
  V.operation = function (c) {
    var g = H.guard(c, ['ver_base', 'minhas_ops']); if (g) return g;
    var D = c.D, op = visibleOps(c).filter(function (o) { return o.id === c.params[0]; })[0];
    if (!op) return H.page([ui.empty('Operação não encontrada nesta base/perfil.'), el('a', { class: 'btn btn--ghost', href: '#/ops' }, 'Voltar')]);
    var conf = c.store.conference(op), pr = conf.progress(), done = conf.checked();
    return H.page([
      el('a', { class: 'btn btn--ghost', href: '#/ops' }, '← Voltar às operações'),
      ui.card('Operação ' + op.id, el('dl', { class: 'dl' }, [
        ['XPT de origem', H.xptName(D, op.xptId)], ['Responsável (demo)', op.responsible], ['Motorista', driverName(D, op.driverId)],
        ['Estado (demo)', NS.operations.OP_STATE[op.state]], ['Criada em', ui.fmtDate(op.createdAt)], ['Grupo/região preliminar', op.groupLabel + ' · ' + H.regionLabel(D, op.regionId)],
        ['Identificador para QR futuro', op.id],
      ].map(function (r) { return [el('dt', { text: r[0] }), el('dd', { text: r[1] })]; }).reduce(function (a, b) { return a.concat(b); }, []))),
      ui.callout('info', 'O QR Code futuro identificará apenas a operação.', 'Ele não substitui a autenticação do usuário.'),
      ui.card('Pacotes e conferência', el('div', null, el('div', { class: 'progress-row' }, el('strong', { id: 'op-progress', text: pr.done + ' de ' + pr.total + ' conferidos' }), progressBar(pr.done, pr.total)),
        ui.table([{ label: 'Código', render: H.link }, { label: 'Tamanho', render: function (p) { return H.sizeLabel(D, p.size); } }, { label: 'Estado', render: function (p) { return H.stateBadge(D, p.state); } },
          { label: 'Conferência', render: function (p) { return done.indexOf(p.code) >= 0 ? ui.badge('Conferido', 'ok') : ui.badge('Pendente', 'warn'); } }], conf.expected(), { label: 'Pacotes da operação' }))),
      el('div', { class: 'row-actions' }, ui.blocked('Confirmar operação', 'depende de backend e regras de negócio pendentes.')),
      H.demoNote(),
    ]);
  };
})(typeof window !== 'undefined' ? window : globalThis);
