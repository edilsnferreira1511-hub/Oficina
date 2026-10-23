/* COOPMETRO XPT — casca da aplicação: roteador por hash, cabeçalho, menu, tema (somente memória). */
(function (root) {
  'use strict';
  var NS = root.CXPT, ui = NS.ui, el = ui.el;

  var ROUTES = [
    { id: 'overview', label: 'Visão Geral', icon: 'home', title: 'Visão Geral' },
    { id: 'map', label: 'Mapa e Regiões', icon: 'map', title: 'Mapa e Regiões' },
    { id: 'ops', label: 'Operações', icon: 'truck', title: 'Operações de ambulância' },
    { id: 'packages', label: 'Pacotes', icon: 'box', title: 'Pacotes' },
    { id: 'entry', label: 'Entrada de Pacotes', icon: 'entry', title: 'Entrada de Pacotes' },
    { id: 'exit', label: 'Saída e Conferência', icon: 'exit', title: 'Saída de Pacotes e Conferência' },
    { id: 'alerts', label: 'Alertas e Devoluções', icon: 'alert', title: 'Alertas e devoluções' },
    { id: 'reports', label: 'Relatórios', icon: 'chart', title: 'Relatórios' },
    { id: 'drivers', label: 'Motoristas', icon: 'user', title: 'Motoristas e agregados' },
    { id: 'xpts', label: 'XPT / Galpões', icon: 'building', title: 'Administração de XPTs' },
    { id: 'setup', label: 'Configuração inicial', icon: 'help', title: 'Configuração inicial (teste)', nav: false },
    { id: 'help', label: 'Ajuda', icon: 'help', title: 'Ajuda e configurações' },
    { id: 'package', label: 'Pacote', icon: 'box', title: 'Detalhes do pacote', nav: false },
    { id: 'operation', label: 'Operação', icon: 'truck', title: 'Detalhes da operação', nav: false },
    { id: 'separation', label: 'Separação', icon: 'truck', title: 'Separação da ambulância', nav: false },
  ];

  function start(opts) {
    opts = opts || {};
    var remote = !!opts.remote; // {svc, user, D}
    var D = remote ? opts.remote.D : (opts.D || NS.data.createDemoData(Date.now()));
    NS.mode = remote ? 'remoto' : 'demo';
    // relógio vivo: eventos novos usam a hora atual (os dados demonstrativos continuam ancorados em D.nowMs)
    var store = NS.store.createStore(D, { nowFn: function () { return Math.max(D.nowMs, Date.now()); } });
    var state = { xptId: 'x1', profile: 'despacho', theme: 'light', route: 'overview', params: [] };
    var svc = remote ? opts.remote.svc : NS.services.createDemo(D, store), user = remote ? opts.remote.user : null;
    if (remote) { state.profile = user.role; var first = D.xpts.filter(function (x) { return x.active !== false; })[0]; state.xptId = first ? first.id : ''; }
    function who() {
      if (remote) return { profile: state.profile, operator: user.name + ' (' + user.email + ')', uid: user.uid };
      var p = NS.permissions.PROFILES.filter(function (x) { return x.id === state.profile; })[0];
      return { profile: state.profile, operator: 'Operador Demo (' + (p ? p.label : state.profile) + ')' };
    }
    var main = document.getElementById('main'), nav = document.getElementById('nav'), top = document.getElementById('topbar');
    var sidebar = document.getElementById('sidebar'), overlay = document.getElementById('overlay');
    var renders = 0;

    function xpt() { return D.xpts.filter(function (x) { return x.id === state.xptId; })[0] || { id: state.xptId, name: '(nenhuma XPT liberada)', active: false }; }
    function ctx() {
      return { D: D, store: store, svc: svc, who: who(), user: user, xptId: state.xptId, xpt: xpt(), profile: state.profile, params: state.params, nowMs: store.nowMs(), go: go, setXpt: setXpt, rerender: render };
    }
    function go(route, params) { location.hash = '#/' + route + (params && params.length ? '/' + params.join('/') : ''); }
    function setXpt(id) {
      var x = D.xpts.filter(function (v) { return v.id === id; })[0];
      if (!x || x.active === false) return;
      state.xptId = id; render();
    }
    function parse() {
      var h = (location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
      var id = h[0] || 'overview';
      if (!ROUTES.some(function (r) { return r.id === id; })) id = 'overview';
      state.route = id; state.params = h.slice(1).map(decodeURIComponent);
    }
    function closeMenu() { sidebar.classList.remove('open'); overlay.hidden = true; var b = document.getElementById('menu-btn'); if (b) b.setAttribute('aria-expanded', 'false'); }
    function renderNav() {
      nav.replaceChildren.apply(nav, ROUTES.filter(function (r) { return r.nav !== false || (r.id === 'setup' && remote && user.role === 'admin_sistema'); }).map(function (r) {
        var active = r.id === state.route || (state.route === 'package' && r.id === 'packages') || ((state.route === 'operation' || state.route === 'separation') && r.id === 'ops');
        return el('a', { href: '#/' + r.id, class: 'nav-item' + (active ? ' active' : ''), 'aria-current': active ? 'page' : null, onclick: closeMenu }, ui.icon(r.icon), el('span', { text: r.label }));
      }));
    }
    function renderTop() {
      var route = ROUTES.filter(function (r) { return r.id === state.route; })[0];
      var alerts = NS.alerts.total(NS.alerts.compute(D, state.xptId, store.nowMs()));
      var banner = document.querySelector('.demo-banner'); if (banner && remote) banner.replaceChildren(el('strong', { text: 'AMBIENTE DE TESTE' }), el('span', { text: 'dados gravados no Firestore em env/teste · projeto ' + ((root.CXPT_FIREBASE && root.CXPT_FIREBASE.config.projectId) || '') }));
      var xsel = el('select', { id: 'xpt-select', 'aria-label': 'XPT selecionada', onchange: function (e) { setXpt(e.target.value); } },
        D.xpts.map(function (x) { return el('option', { value: x.id, selected: x.id === state.xptId, disabled: x.active === false }, x.name + (x.active === false ? ' (desativada)' : '')); }));
      var psel = remote ? el('span', { id: 'user-badge', class: 'user-badge' }, user.name + ' · ' + (NS.permissions.PROFILES.filter(function (p) { return p.id === user.role; })[0] || {}).label) : el('select', { id: 'profile-select', 'aria-label': 'Perfil demonstrativo (sem proteção real)', title: NS.permissions.DISCLAIMER, onchange: function (e) { state.profile = e.target.value; render(); } },
        NS.permissions.PROFILES.map(function (p) { return el('option', { value: p.id, selected: p.id === state.profile, text: p.label }); }));
      top.replaceChildren(
        el('button', { type: 'button', id: 'menu-btn', class: 'icon-btn menu-btn', 'aria-label': 'Abrir menu', 'aria-controls': 'sidebar', 'aria-expanded': 'false',
          onclick: function () { sidebar.classList.add('open'); overlay.hidden = false; this.setAttribute('aria-expanded', 'true'); } }, ui.icon('menu')),
        el('div', { class: 'top-title' }, el('span', { class: 'top-kicker', text: 'XPT: ' + xpt().name }), el('h1', { id: 'page-title', text: route.title })),
        el('div', { class: 'top-controls' },
          el('label', { class: 'sel', for: 'xpt-select' }, el('span', { text: 'XPT' }), xsel),
          remote ? el('div', { class: 'sel' }, el('span', { text: 'Usuário' }), psel) : el('label', { class: 'sel', for: 'profile-select' }, el('span', { text: 'Perfil (demo)' }), psel),
          remote ? el('button', { type: 'button', class: 'btn btn--ghost btn--sm', id: 'refresh-btn', onclick: function () { svc.refresh().then(function (r) { ui.announce(r.ok ? 'Dados atualizados.' : r.message); render(); }); } }, 'Atualizar dados') : null,
          remote ? el('button', { type: 'button', class: 'btn btn--ghost btn--sm', id: 'logout-btn', onclick: function () { NS.auth.logout(); } }, 'Sair') : null,
          el('a', { class: 'bell', href: '#/alerts', 'aria-label': alerts + ' alertas nesta XPT' }, ui.icon('bell'), el('span', { class: 'bell-count', text: String(alerts) })),
          el('button', { type: 'button', class: 'icon-btn', id: 'theme-btn', 'aria-label': state.theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro',
            onclick: function () { state.theme = state.theme === 'light' ? 'dark' : 'light'; document.documentElement.setAttribute('data-theme', state.theme); renderTop(); } },
            ui.icon(state.theme === 'light' ? 'moon' : 'sun'))));
    }
    var cleanup = null;
    function render() {
      parse();
      if (cleanup) { try { cleanup(); } catch (_) { /* ignore */ } cleanup = null; }
      renderNav(); renderTop();
      var view = NS.views[state.route], node;
      try { var out = view(ctx()); node = out.node || out; cleanup = out.destroy || null; }
      catch (e) { node = ui.callout('danger', 'Erro ao montar a tela.', String(e && e.message || e)); if (root.console) console.error(e); }
      main.replaceChildren(node);
      renders++; main.dataset.render = String(renders); main.dataset.route = state.route; main.dataset.xpt = state.xptId;
      document.title = (ROUTES.filter(function (r) { return r.id === state.route; })[0].title) + ' · COOPMETRO XPT (' + (remote ? 'teste' : 'demonstração') + ')';
    }
    store.on(function (src) { if (src === 'entry') { renderTop(); return; } render(); });
    overlay.addEventListener('click', closeMenu);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    root.addEventListener('hashchange', function () { render(); main.focus({ preventScroll: true }); });
    if (remote && user.role === 'admin_sistema' && !location.hash) location.hash = '#/setup';
    render();
    return { D: D, store: store, state: state, go: go, setXpt: setXpt, render: render };
  }

  NS.app = { start: start, ROUTES: ROUTES };
  if (typeof document !== 'undefined' && !root.CXPT_NO_AUTOSTART) {
    var run = function () {
      var fbOn = !!(root.CXPT_FB || (root.CXPT_FIREBASE && root.CXPT_FIREBASE.config && root.CXPT_FIREBASE.config.apiKey));
      if (fbOn && NS.auth) NS.auth.boot(function (remote) { root.CXPT_APP = start({ remote: remote }); });
      else root.CXPT_APP = start();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  }
})(typeof window !== 'undefined' ? window : globalThis);
