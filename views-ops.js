/* COOPMETRO XPT — Alertas e devoluções (Saída/Conferência e Operações ficam em views-amb.js). */
(function (root) {
  'use strict';
  var NS = root.CXPT, ui = NS.ui, el = ui.el, H = NS.vh, P = NS.packages;
  var V = NS.views;
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
      if (!H.can(c, 'config') && !H.can(c, 'correcao')) { lmsg.textContent = H.live() ? 'Seu perfil não pode alterar o limite.' : 'Seu perfil não pode alterar o limite (simulação).'; limit.value = String(NS.alerts.limitOf(D)); return; }
      if (H.live()) { lmsg.textContent = 'Gravando…'; NS.services.saveSettings(root.CXPT_FB, c.user, { stayLimitDays: n }).then(function (r) { if (!r.ok) { lmsg.textContent = r.message; limit.value = String(NS.alerts.limitOf(D)); return; } D.settings.stayLimitDays = n; c.rerender(); }); return; }
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
      ui.callout('info', H.live() ? 'Alertas calculados ao abrir esta tela, para ' + c.xpt.name + '.' : 'Alertas calculados ao abrir esta tela, com dados demonstrativos de ' + c.xpt.name + '.', 'Não há processamento em segundo plano nem notificações automáticas.'),
      ui.card('Filtros e limite', el('div', { class: 'form-grid' }, ui.field('Estado', stateSel), ui.field(H.live() ? 'Limite de permanência (dias)' : 'Limite de permanência (dias) — demonstração', limit, null, 'Alerta quando o pacote passa de ' + a.limitDays + ' dia(s) no ciclo atual.'), lmsg)),
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

})(typeof window !== 'undefined' ? window : globalThis);
