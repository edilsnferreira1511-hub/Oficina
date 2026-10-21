/* COOPMETRO XPT — Relatórios, Motoristas, XPTs/Galpões e Ajuda/configurações (tudo demonstrativo). */
(function (root) {
  'use strict';
  var NS = root.CXPT, ui = NS.ui, el = ui.el, H = NS.vh, P = NS.packages, R = NS.reports;
  var V = NS.views;

  function download(name, text) {
    var url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    var a = el('a', { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function csvBtn(name, headers, rows) {
    return el('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'data-csv': name, onclick: function () {
      download('demonstracao-' + name + '.csv', R.toCsv(headers.concat(['origem']), rows.map(function (r) { return r.concat(['DADOS FICTICIOS DE DEMONSTRACAO']); })));
      ui.announce('CSV de demonstração gerado localmente com dados fictícios.');
    } }, 'Exportar CSV (demonstração)');
  }

  V.reports = function (c) {
    var g = H.guard(c, 'ver_base'); if (g) return g;
    var D = c.D, pk = H.pkgsOf(c), now = c.nowMs, global = H.can(c, 'ver_global');
    function rep(id, title, headers, rows, body) {
      return ui.card(title, el('div', { id: 'rep-' + id }, body, el('div', { class: 'row-actions' }, csvBtn(id, headers, rows))));
    }
    var days = R.entriesByDay(pk, now, 14);
    var byXpt = D.xpts.filter(function (x) { return global || x.id === c.xptId; }).map(function (x) { return [x.name, String(D.packages.filter(function (p) { return p.xptId === x.id; }).length)]; });
    var cs = R.countBy(pk, function (p) { return p.state; });
    var stRows = D.states.map(function (s) { return [s.label, String(cs[s.id] || 0)]; });
    var old = NS.alerts.compute(D, c.xptId, now).stay;
    var cr = R.countBy(pk, function (p) { return p.reasonId; });
    var rsRows = D.reasons.map(function (r) { return [r.label, String(cr[r.id] || 0)]; });
    var cret = R.countBy(pk, function (p) { return Math.min(p.returns, 4); });
    var retRows = [0, 1, 2, 3, 4].map(function (n) { return [n === 4 ? '4 ou mais retornos' : n + ' retorno(s)', String(cret[n] || 0)]; });
    var divRows = pk.filter(function (p) { return p.state === 'divergente'; }).map(function (p) { return [p.code, H.sizeLabel(D, p.size), H.reasonLabel(D, p.reasonId)]; });
    var opRows = NS.operations.opsOf(D, c.xptId).map(function (o) { var pr = c.store.conference(o).progress(); return [o.id, NS.operations.OP_STATE[o.state], pr.done + ' de ' + pr.total]; });
    var pair = function (a, b) { return function (r) { return [a, b]; }; };
    function t2(h1, h2, rows) { return ui.table([{ label: h1, render: function (r) { return r[0]; } }, { label: h2, render: function (r) { return r[1]; } }], rows, { label: h1 }); }
    return H.page([
      ui.callout('warn', 'Relatórios demonstrativos.', 'Calculados sobre dados fictícios desta sessão. A exportação gera um CSV local de demonstração — não são dados reais.'),
      rep('entradas-por-dia', 'Entradas por dia (14 dias, UTC)', ['dia', 'entradas'], days.map(function (d) { return [d.label, String(d.value)]; }), ui.columns(days, 'Entradas por dia')),
      rep('pacotes-por-xpt', global ? 'Pacotes por XPT' : 'Pacotes da sua XPT', ['xpt', 'pacotes'], byXpt, t2('XPT', 'Pacotes', byXpt)),
      rep('estoque-por-estado', 'Estoque por estado', ['estado', 'pacotes'], stRows, t2('Estado', 'Pacotes', stRows)),
      rep('pacotes-antigos', 'Pacotes antigos (> ' + NS.alerts.limitOf(D) + ' dias)', ['codigo', 'dias'], old.map(function (p) { return [p.code, String(P.stayDays(p, now))]; }),
        old.length ? t2('Código', 'Dias', old.slice(0, 15).map(function (p) { return [p.code, String(P.stayDays(p, now))]; })) : ui.empty('Nenhum pacote acima do limite.')),
      rep('motivos', 'Motivos de devolução', ['motivo', 'pacotes'], rsRows, t2('Motivo', 'Pacotes', rsRows)),
      rep('retornos', 'Retornos por pacote', ['retornos', 'pacotes'], retRows, t2('Retornos', 'Pacotes', retRows)),
      rep('divergencias', 'Divergências', ['codigo', 'tamanho', 'motivo'], divRows, divRows.length ? ui.table([{ label: 'Código', render: function (r) { return r[0]; } }, { label: 'Tamanho', render: function (r) { return r[1]; } }, { label: 'Motivo', render: function (r) { return r[2]; } }], divRows, { label: 'Divergências' }) : ui.empty('Nenhuma divergência.')),
      rep('operacoes', 'Operações e conferências', ['operacao', 'estado', 'conferidos'], opRows, t2('Operação', 'Conferidos', opRows.map(function (r) { return [r[0], r[2]]; }))),
      ui.card('Relatórios financeiros', ui.blocked('Relatórios financeiros', 'seção financeira sujeita a permissões e regras ainda não definidas; nenhum valor é inventado nesta fase.')),
      H.demoNote(),
    ]);
  };

  V.drivers = function (c) {
    var g = H.guard(c, 'ver_base'); if (g) return g;
    var D = c.D, rows = D.drivers.filter(function (d) { return d.xptId === c.xptId; });
    return H.page([
      ui.callout('info', 'Motoristas e agregados fictícios.', 'Não há contas, senhas nem autenticação nesta versão. O acesso do motorista às operações será feito no backend, com permissões.'),
      ui.card('Motoristas — ' + c.xpt.name, rows.length ? ui.table([
        { label: 'Nome (fictício)', key: 'name' }, { label: 'Identificação demonstrativa', render: function (d) { return el('span', { class: 'mono', text: d.ident }); } },
        { label: 'Operações atribuídas', render: function (d) { return String(NS.operations.opsOf(D, c.xptId).filter(function (o) { return o.driverId === d.id; }).length); } },
        { label: 'Estado (demo)', render: function (d) { return ui.badge(d.state, d.state === 'ativo' ? 'ok' : 'neutral'); } },
      ], rows, { label: 'Motoristas' }) : ui.empty('Nenhum motorista nesta XPT.')),
      el('div', { class: 'row-actions' }, ui.blocked('Cadastrar motorista', 'criação de contas exige autenticação e permissões no backend.')),
      H.demoNote(),
    ]);
  };

  V.xpts = function (c) {
    var g = H.guard(c, ['ver_base', 'usuarios']); if (g) return g;
    var D = c.D, global = H.can(c, 'ver_global') || H.can(c, 'usuarios');
    var xs = D.xpts.filter(function (x) { return global || x.id === c.xptId; });
    var m = NS.permissions.matrix();
    var audit = c.store.audit.list(c.xptId).slice(-10).reverse();
    return H.page([
      ui.callout('info', 'Bases fictícias.', 'A XPT de origem de um pacote é permanente: não há transferência silenciosa entre bases.'),
      ui.card('XPT / Galpões', ui.table([
        { label: 'Nome', key: 'name' }, { label: 'Identificador', render: function (x) { return el('span', { class: 'mono', text: x.id }); } },
        { label: 'Estado', render: function (x) { return ui.badge(x.active ? 'Ativa' : 'Desativada', x.active ? 'ok' : 'neutral'); } },
        { label: 'Em estoque', render: function (x) { return String(D.packages.filter(function (p) { return p.xptId === x.id && p.state === 'em_estoque'; }).length); } },
        { label: 'No galpão', render: function (x) { return String(D.packages.filter(function (p) { return p.xptId === x.id && P.inWarehouse(p); }).length); } },
      ], xs, { label: 'XPTs' })),
      el('div', { class: 'row-actions' }, ui.blocked('Criar base / usuário', 'administração real exige backend, autenticação e auditoria.'), ui.blocked('Transferir pacote entre XPTs', 'a primeira fase não prevê transferência; a origem é permanente.')),
      ui.card('Matriz de permissões PROPOSTA (não aprovada)', el('div', null,
        ui.callout('warn', NS.permissions.DISCLAIMER),
        ui.table([{ label: 'Perfil', render: function (r) { return r.profile.label; } }].concat(NS.permissions.ACTIONS.map(function (a, i) {
          return { label: a.label, render: function (r) { return r.perms[i] ? 'Sim' : '—'; } };
        })), m, { label: 'Matriz de permissões' }))),
      ui.card('Auditoria demonstrativa (últimas ações desta sessão)', audit.length ? ui.table([
        { label: 'Quando', render: function (e) { return ui.fmtDateTime(e.at); } }, { label: 'Ação', key: 'type' }, { label: 'Detalhe', key: 'detail' }], audit, { label: 'Auditoria' }) : ui.empty('Sem ações registradas nesta sessão.')),
      H.demoNote(),
    ]);
  };

  V.help = function (c) {
    var D = c.D;
    function sec(t, items) { return ui.card(t, el('ul', { class: 'help-list' }, items.map(function (i) { return el('li', { text: i }); }))); }
    var canCfg = H.can(c, 'config');
    var nr = el('input', { type: 'text', id: 'new-reason', maxlength: '40', placeholder: 'Novo motivo (demonstração)' });
    var rmsg = el('small', { class: 'hint', id: 'reason-msg', role: 'status' });
    var form = el('form', { class: 'inline-form', onsubmit: function (e) {
      e.preventDefault();
      var label = nr.value.trim();
      if (!label) { rmsg.textContent = 'Informe o nome do motivo.'; return; }
      if (D.reasons.some(function (r) { return r.label.toLowerCase() === label.toLowerCase(); })) { rmsg.textContent = 'Motivo já existe.'; return; }
      D.reasons.push({ id: 'r_custom_' + (D.reasons.length + 1), label: label });
      c.store.audit.log('config_motivo_demo', c.xptId, label); c.store.changed();
    } }, ui.field('Adicionar motivo', nr), el('button', { type: 'submit', class: 'btn btn--ghost', id: 'add-reason' }, 'Adicionar (somente em memória)'), rmsg);
    return H.page([
      ui.callout('warn', 'Tudo aqui é demonstração.', 'Os dados são fictícios e ficam só em memória: ao recarregar a página, rascunhos e alterações são perdidos.'),
      sec('Como receber pacotes', ['Abra "Entrada de Pacotes" e leia o código com um leitor USB/Bluetooth (ele digita e envia Enter) ou digite manualmente.', 'Escolha tamanho e motivo; depois informe a localização do destino de entrega.', 'Use "Adicionar ao rascunho". A entrada real está bloqueada até existir backend.']),
      sec('Como marcar a localização', ['A localização é o destino de entrega, não o lugar no galpão.', 'Com mapa disponível, toque no mapa para marcar; sem mapa, use Aproximada, Desconhecida ou Pendente.', 'Cada pacote tem a sua própria localização; ela nunca é copiada do pacote anterior.']),
      sec('Como conferir pacotes', ['Em "Saída e Conferência", escolha a operação e leia os códigos.', 'Leituras repetidas não contam de novo; códigos de outra operação ou inexistentes são sinalizados.', 'A confirmação da saída está bloqueada.']),
      sec('Alertas e isolamento', ['Alertas são calculados ao abrir a tela. O limite padrão é de 4 dias e pode ser alterado na demonstração.', 'Cada XPT só enxerga os próprios pacotes, rascunhos e seleções. Códigos duplicados em outra base são sinalizados sem mostrar nenhum dado dela.']),
      sec('O que ainda não pode ser feito', ['Login real, gravação, backend, leitura por câmera, mapa geográfico real, rotas, geocodificação e relatórios financeiros.', 'Criar ou confirmar operações, expedir ou devolver pacotes.']),
      ui.card('Configurações demonstrativas (sem persistência)', el('div', null,
        el('p', { class: 'hint', text: 'Limite de dias de alerta atual: ' + NS.alerts.limitOf(D) + '. Altere em Alertas e devoluções.' }),
        el('ul', { class: 'help-list', id: 'reasons-list' }, D.reasons.map(function (r) { return el('li', { text: r.label }); })),
        canCfg ? form : ui.callout('info', 'Seu perfil não pode editar motivos (simulação).', 'Troque para Administrador ou Administrador do sistema no seletor de perfil demonstrativo.'))),
      H.demoNote(),
    ]);
  };
})(typeof window !== 'undefined' ? window : globalThis);
