/* COOPMETRO XPT — telas: núcleo compartilhado, Visão Geral, Pacotes e Detalhe do pacote. */
(function (root) {
  'use strict';
  var NS = root.CXPT, ui = NS.ui, el = ui.el, P = NS.packages;
  var V = (NS.views = NS.views || {});
  var H = (NS.vh = {});

  var TONE_LOC = { marcada: 'ok', aproximada: 'info', desconhecida: 'danger', pendente: 'warn' };
  H.state = function (D, id) { return D.states.filter(function (s) { return s.id === id; })[0] || { id: id, label: id, tone: 'neutral' }; };
  H.stateBadge = function (D, id) { var s = H.state(D, id); return ui.badge(s.label, s.tone); };
  H.sizeLabel = function (D, id) { var s = D.sizes.filter(function (x) { return x.id === id; })[0]; return s ? s.label : id; };
  H.reasonLabel = function (D, id) { var s = D.reasons.filter(function (x) { return x.id === id; })[0]; return s ? s.label : id; };
  H.xptName = function (D, id) { var x = D.xpts.filter(function (v) { return v.id === id; })[0]; return x ? x.name : id; };
  H.regionLabel = function (D, id) { var r = D.regions.filter(function (v) { return v.id === id; })[0]; return r ? r.label : '—'; };
  H.locBadge = function (loc) { return ui.badge(NS.geo.LOC_LABEL[loc.kind] || loc.kind, TONE_LOC[loc.kind] || 'neutral'); };
  H.pkgsOf = function (c) { return c.D.packages.filter(function (p) { return p.xptId === c.xptId; }); };
  H.link = function (p) { return el('a', { href: '#/package/' + encodeURIComponent(p.id), class: 'code-link', text: p.code }); };
  H.demoNote = function (t) { return NS.mode === 'remoto' ? el('p', { class: 'demo-note', text: 'Ambiente de TESTE: dados reais do Firestore em env/teste.' }) : el('p', { class: 'demo-note', text: t || 'Dados fictícios de demonstração, mantidos só em memória.' }); };
  H.page = function (kids) { return el('div', { class: 'page' }, kids); };
  H.can = function (c, a) { return NS.permissions.can(c.profile, a); };
  /** Perfil sem permissão → aviso (apenas interface; a segurança real será no backend). */
  H.guard = function (c, actions) {
    var list = Array.isArray(actions) ? actions : [actions];
    if (list.some(function (a) { return NS.permissions.can(c.profile, a); })) return null;
    var pr = NS.permissions.PROFILES.filter(function (p) { return p.id === c.profile; })[0];
    return H.page([ui.callout('warn', 'Perfil sem acesso a esta tela (simulação).', 'O perfil "' + pr.label + '" não possui esta permissão na matriz proposta. ' + NS.permissions.DISCLAIMER)]);
  };
  H.limit = function (c) { return NS.alerts.limitOf(c.D); };

  // ---------- Visão Geral
  V.overview = function (c) {
    var g = H.guard(c, ['ver_base', 'ver_global']); if (g) return g;
    var D = c.D, pk = H.pkgsOf(c), now = c.nowMs;
    var cnt = NS.reports.countBy(pk, function (p) { return p.state; });
    var al = NS.alerts.compute(D, c.xptId, now);
    var recebidos = pk.filter(function (p) { return P.validTs(p.entryAt) && p.entryAt <= now && now - p.entryAt < 7 * 86400000; }).length;
    var opsAnd = NS.operations.opsOf(D, c.xptId).length;
    var days = NS.reports.entriesByDay(pk, now, 7);
    var global = H.can(c, 'ver_global');
    var xptRows = D.xpts.filter(function (x) { return x.active && (global || x.id === c.xptId); }).map(function (x) {
      return { label: x.name, value: D.packages.filter(function (p) { return p.xptId === x.id && P.inWarehouse(p); }).length };
    });
    var statesRows = D.states.map(function (s) { return { label: s.label, value: cnt[s.id] || 0, tone: s.tone === 'danger' ? 'danger' : s.tone === 'warn' ? 'warn' : 'ok' }; });
    return H.page([
      ui.callout('info', 'Indicadores calculados a partir dos dados demonstrativos da ' + c.xpt.name + '.', 'Não são números reais.'),
      el('div', { class: 'kpis' }, [
        ui.kpi('Pacotes em estoque', cnt.em_estoque || 0, 'ok'),
        ui.kpi('Recebidos (últimos 7 dias)', recebidos, 'info'),
        ui.kpi('Em separação', cnt.em_separacao || 0, 'info'),
        ui.kpi('Em rota', cnt.em_rota || 0, 'info'),
        ui.kpi('Com divergência', cnt.divergente || 0, 'danger'),
        ui.kpi('Aguardando devolução', cnt.aguardando_devolucao || 0, 'warn'),
        ui.kpi('Antigos no galpão (> ' + al.limitDays + ' dias)', al.stay.length, 'warn'),
        ui.kpi('Operações demonstrativas', opsAnd, 'neutral'),
      ]),
      el('div', { class: 'grid2' }, [
        ui.card('Entradas por dia (últimos 7 dias, UTC)', ui.columns(days, 'Entradas por dia')),
        ui.card('Distribuição por estado', ui.bars(statesRows, 'Pacotes por estado')),
        ui.card(global ? 'Pacotes no galpão por XPT' : 'Pacotes no galpão (sua XPT)', ui.bars(xptRows, 'Pacotes por XPT')),
        ui.card('Alertas de permanência', al.stay.length ?
          ui.table([
            { label: 'Código', render: H.link }, { label: 'Dias', render: function (p) { return String(P.stayDays(p, now)); } },
            { label: 'Estado', render: function (p) { return H.stateBadge(D, p.state); } }],
            al.stay.slice(0, 5), { label: 'Principais alertas de permanência' }) : ui.empty('Nenhum pacote acima do limite.'),
          el('a', { class: 'btn btn--ghost', href: '#/alerts' }, 'Ver todos os alertas')),
      ]),
      H.demoNote(),
    ]);
  };

  // ---------- Pacotes (listagem filtrável e paginada)
  var pkgFilters = {}; // memória da sessão por XPT (descartada ao recarregar)
  function parseDate(v, end) {
    if (!v) return null; var t = Date.parse(v + 'T00:00:00Z'); return isFinite(t) ? (end ? t + 86400000 - 1 : t) : null;
  }
  V.packages = function (c) {
    var g = H.guard(c, 'ver_base'); if (g) return g;
    var D = c.D, global = H.can(c, 'ver_global');
    var st = pkgFilters[c.xptId] || (pkgFilters[c.xptId] = { xptId: c.xptId, code: '', state: '', size: '', reasonId: '', from: '', to: '', geo: '', page: 1 });
    if (!global) st.xptId = c.xptId;
    var box = el('div');
    var form = el('form', { class: 'filters', 'aria-label': 'Filtros de pacotes', onsubmit: function (e) { e.preventDefault(); } });
    function input(name, node) { node.addEventListener('input', function () { st[name] = node.value; st.page = 1; draw(); }); return node; }
    var allowed = D.xpts.filter(function (x) { return global || x.id === c.xptId; }).map(function (x) { return { id: x.id, label: x.name }; });
    form.appendChild(ui.field('XPT', input('xptId', ui.select('xptId', allowed, st.xptId))));
    form.appendChild(ui.field('Código', input('code', el('input', { type: 'search', name: 'code', value: st.code, placeholder: 'ex.: DEMO-0000', autocomplete: 'off', maxlength: '64' }))));
    form.appendChild(ui.field('Estado', input('state', ui.select('state', D.states, st.state, 'Todos'))));
    form.appendChild(ui.field('Tamanho', input('size', ui.select('size', D.sizes, st.size, 'Todos'))));
    form.appendChild(ui.field('Motivo', input('reasonId', ui.select('reasonId', D.reasons, st.reasonId, 'Todos'))));
    form.appendChild(ui.field('Entrada de', input('from', el('input', { type: 'date', name: 'from', value: st.from }))));
    form.appendChild(ui.field('Entrada até', input('to', el('input', { type: 'date', name: 'to', value: st.to }))));
    form.appendChild(ui.field('Localização', input('geo', ui.select('geo', [{ id: 'com', label: 'Com coordenadas' }, { id: 'sem', label: 'Sem coordenadas / desconhecida' }], st.geo, 'Todas'))));
    function draw() {
      var f = { xptId: st.xptId, code: st.code, state: st.state, size: st.size, reasonId: st.reasonId, from: parseDate(st.from), to: parseDate(st.to, true), geo: st.geo };
      var rows = P.filter(D.packages, f, c.nowMs).sort(function (a, b) { return a.code < b.code ? -1 : 1; });
      var pg = P.paginate(rows, st.page, 15); st.page = pg.page;
      var cols = [
        { label: 'Código', render: H.link }, { label: 'XPT', render: function (p) { return H.xptName(D, p.xptId); } },
        { label: 'Tamanho', render: function (p) { return H.sizeLabel(D, p.size); } },
        { label: 'Motivo', render: function (p) { return H.reasonLabel(D, p.reasonId); } },
        { label: 'Entrada', render: function (p) { return ui.fmtDate(p.entryAt); } },
        { label: 'Estado', render: function (p) { return H.stateBadge(D, p.state); } },
        { label: 'Localização', render: function (p) { return H.locBadge(p.location); } },
        { label: 'Ciclos', render: function (p) { return p.cycle + ' (' + p.returns + ' retorno' + (p.returns === 1 ? '' : 's') + ')'; } },
        { label: 'Idade', render: function (p) { var d = P.stayDays(p, c.nowMs); return d === null ? (P.inWarehouse(p) ? 'data indisponível' : 'fora do galpão') : d + ' dia(s)'; } },
      ];
      box.replaceChildren(
        el('p', { class: 'result-count', id: 'pkg-count', role: 'status', text: pg.total + ' pacote(s) encontrado(s) · exibindo ' + pg.items.length + ' por página' }),
        rows.length ? ui.table(cols, pg.items, { label: 'Pacotes' }) : ui.empty('Nenhum pacote encontrado com estes filtros.', 'Ajuste ou limpe os filtros.'),
        rows.length ? ui.pager(pg, function (n) { st.page = n; draw(); }) : null);
    }
    draw();
    return H.page([ui.card('Filtros', form), ui.card('Listagem', box), H.demoNote()]);
  };

  // ---------- Detalhe do pacote
  V.package = function (c) {
    var g = H.guard(c, 'ver_base'); if (g) return g;
    var D = c.D, id = c.params[0];
    var p = D.packages.filter(function (x) { return (x.id === id || x.code === String(id).toUpperCase()) && (x.xptId === c.xptId || H.can(c, 'ver_global')); })[0];
    if (!p) return H.page([ui.empty('Pacote não encontrado nesta base.', 'O pacote não existe ou não está disponível para a XPT/perfil atuais.'), el('a', { class: 'btn btn--ghost', href: '#/packages' }, 'Voltar à listagem')]);
    var loc = p.location, d = P.stayDays(p, c.nowMs), flag = P.returnFlag(p);
    var info = el('dl', { class: 'dl' }, [
      ['Código', p.code], ['XPT de origem (permanente)', H.xptName(D, p.xptId)], ['Tamanho', H.sizeLabel(D, p.size)], ['Motivo da devolução', H.reasonLabel(D, p.reasonId)],
      ['Entrada no ciclo atual', ui.fmtDateTime(p.entryAt)], ['Ciclo atual', String(p.cycle)], ['Retornos', String(p.returns)],
      ['Idade no estoque', d === null ? 'não aplicável / data indisponível' : d + ' dia(s)'], ['Observação', p.note || '—'],
    ].map(function (r) { return [el('dt', { text: r[0] }), el('dd', { text: r[1] })]; }).reduce(function (a, b) { return a.concat(b); }, []));
    info.appendChild(el('dt', { text: 'Estado' })); info.appendChild(el('dd', null, H.stateBadge(D, p.state)));
    info.appendChild(el('dt', { text: 'Localização (destino da entrega)' }));
    info.appendChild(el('dd', null, H.locBadge(loc), loc.lat !== null ? el('span', { class: 'mono', text: ' ' + NS.geo.formatLatLng(loc.lat, loc.lng) }) : null, loc.regionId ? el('span', { text: ' · ' + H.regionLabel(D, loc.regionId) }) : null));
    var hist = ui.table([
      { label: 'Data/hora', render: function (e) { return ui.fmtDateTime(e.at); } }, { label: 'Evento', render: function (e) { return e.type; } },
      { label: 'De → Para', render: function (e) { return (e.from || '—') + ' → ' + (e.to || '—'); } }, { label: 'Operador (demo)', key: 'operator' }, { label: 'Observação', key: 'note' },
    ], p.history.slice().sort(function (a, b) { return a.at - b.at; }), { label: 'Histórico demonstrativo' });
    // Painel de transição DEMONSTRATIVA
    var next = P.TRANSITIONS[p.state] || [];
    var panel;
    if (!(H.can(c, 'conferir') || H.can(c, 'correcao'))) panel = ui.callout('info', 'Seu perfil não pode simular transições.', 'Apenas demonstração.');
    else if (!next.length) panel = ui.callout('info', 'Estado final: sem transições permitidas.');
    else {
      var sel = ui.select('to', next.map(function (s) { return { id: s, label: H.state(D, s).label }; }), next[0]);
      var note = el('input', { type: 'text', name: 'note', maxlength: '200', placeholder: 'Observação (opcional)' });
      var msg = el('p', { class: 'form-msg', id: 'tr-msg', role: 'status' });
      panel = el('form', { class: 'inline-form', onsubmit: function (e) {
        e.preventDefault();
        c.svc.transition(p, sel.value, { note: note.value.trim() }, c.who).then(function (r) {
          if (!r.ok) { msg.textContent = r.reason || r.message; return; }
          c.store.audit.log('transicao_demo', p.xptId, p.code + ': ' + r.event.from + ' → ' + r.event.to);
          c.store.changed();
        });
      } }, ui.field('Novo estado (proposta, D-04)', sel), ui.field('Observação', note),
        el('button', { type: 'submit', class: 'btn btn--primary', id: 'tr-btn' }, 'Simular transição (demonstração)'), msg);
    }
    return H.page([
      el('a', { class: 'btn btn--ghost', href: '#/packages' }, '← Voltar à listagem'),
      flag === 'atencao' ? ui.callout('warn', 'Atenção: 3º retorno.', 'Acompanhe este pacote.') : null,
      flag === 'avaliar_devolucao' ? ui.callout('danger', '4º retorno ou mais: sugerida avaliação para devolução ao remetente.', 'A decisão é humana; nada é feito automaticamente (D-05).') : null,
      ui.card('Dados do pacote', info), ui.card('Transição demonstrativa', el('div', null, ui.callout('info', 'Apenas demonstração em memória.', 'Não representa movimentação real; saída definitiva exige confirmação no backend.'), panel)),
      ui.card('Histórico de eventos (demonstrativo)', hist), H.demoNote(),
    ]);
  };
})(typeof window !== 'undefined' ? window : globalThis);
