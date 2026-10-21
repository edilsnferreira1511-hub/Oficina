/* COOPMETRO XPT — componente de mapa (ladrilhos Web Mercator).
 * Só existe se um provedor estiver configurado em map-config.js. Sem provedor → availability().ok === false e
 * create() devolve null: a interface mostra "mapa indisponível" e NUNCA desenha grade/imagem parecida com mapa. */
(function (root) {
  'use strict';
  var NS = (root.CXPT = root.CXPT || {});

  var MESSAGES = {
    sem_provedor: 'Mapa indisponível: nenhum provedor de mapas foi aprovado/configurado (decisão D-10). Os pontos continuam listados abaixo.',
    config_invalida: 'Mapa indisponível: configuração do provedor inválida (endereço dos ladrilhos com {z}, {x}, {y} e atribuição são obrigatórios).',
    offline: 'Mapa indisponível: sem conexão com a internet.',
    falhou: 'Mapa indisponível: os ladrilhos não puderam ser carregados do provedor configurado.',
  };

  function availability(cfg, env) {
    cfg = cfg || root.CXPT_MAP || {};
    env = env || {};
    if (!cfg.tiles) return { ok: false, reason: 'sem_provedor', message: MESSAGES.sem_provedor };
    var t = String(cfg.tiles);
    if (t.indexOf('{z}') < 0 || t.indexOf('{x}') < 0 || t.indexOf('{y}') < 0 || !cfg.attribution || !String(cfg.attribution).trim())
      return { ok: false, reason: 'config_invalida', message: MESSAGES.config_invalida };
    var online = env.online !== undefined ? env.online : (typeof navigator === 'undefined' || navigator.onLine !== false);
    if (!online) return { ok: false, reason: 'offline', message: MESSAGES.offline };
    return { ok: true };
  }

  function create(container, opts) {
    opts = opts || {};
    var cfg = opts.config || root.CXPT_MAP;
    var av = availability(cfg, opts.env);
    if (!av.ok) return null;
    var ui = NS.ui, g = NS.geo, el = ui.el;
    var view = Object.assign({ lat: cfg.center.lat, lng: cfg.center.lng, zoom: cfg.zoom }, opts.view || {});
    var markers = [], W = 300, H = 300, loaded = 0, failed = 0, status = 'carregando', destroyed = false;

    var tilesL = el('div', { class: 'gmap-tiles', 'aria-hidden': 'true' });
    var markL = el('div', { class: 'gmap-markers' });
    var zin = el('button', { type: 'button', class: 'gmap-zoom', 'aria-label': 'Aproximar', onclick: function () { zoomBy(1); } }, '+');
    var zout = el('button', { type: 'button', class: 'gmap-zoom', 'aria-label': 'Afastar', onclick: function () { zoomBy(-1); } }, '−');
    var attr = el('div', { class: 'gmap-attr', text: cfg.attribution });
    var root_ = el('div', { class: 'gmap', tabindex: '0', role: 'application', 'aria-label': opts.label || 'Mapa interativo' },
      tilesL, markL, el('div', { class: 'gmap-ctl' }, zin, zout), attr);
    container.replaceChildren(root_);

    var autoFit = null; // pontos para reajustar quando o contêiner for medido/redimensionado (até o usuário mexer no mapa)
    function setStatus(s) { if (s !== status) { status = s; if (opts.onStatus) opts.onStatus(s); } }
    function measure() { var r = root_.getBoundingClientRect(); W = Math.max(100, Math.round(r.width)); H = Math.max(100, Math.round(r.height)); }
    function render() {
      if (destroyed) return;
      tilesL.replaceChildren();
      g.tilesFor(view, W, H).forEach(function (t) {
        var src = String(cfg.tiles).replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y);
        var im = el('img', { class: 'gmap-tile', alt: '', draggable: 'false', src: src });
        im.style.left = Math.round(t.left) + 'px'; im.style.top = Math.round(t.top) + 'px';
        im.addEventListener('load', function () { loaded++; if (status !== 'ok') setStatus('ok'); });
        im.addEventListener('error', function () { failed++; im.classList.add('gmap-tile--fail'); if (!loaded) setStatus('falhou'); });
        tilesL.appendChild(im);
      });
      renderMarkers();
    }
    function renderMarkers() {
      markL.replaceChildren();
      markers.forEach(function (m) {
        if (!g.validCoord(m.lat, m.lng)) return;
        var p = g.latLngToPoint(view, W, H, m.lat, m.lng);
        if (p.x < -20 || p.y < -20 || p.x > W + 20 || p.y > H + 20) return;
        var b = el('button', {
          type: 'button', class: 'pin pin--' + m.kind + (m.selected ? ' pin--sel' : '') + (m.focus ? ' pin--focus' : ''),
          'aria-label': m.label || m.id, 'aria-pressed': opts.onMarker ? String(!!m.selected) : null,
          dataset: { id: m.id, kind: m.kind }, disabled: !opts.onMarker,
          onclick: function (e) { e.stopPropagation(); if (opts.onMarker) opts.onMarker(m.id); },
          onpointerdown: function (e) { e.stopPropagation(); },
        }, el('span', { class: 'pin-dot' }));
        b.style.left = Math.round(p.x) + 'px'; b.style.top = Math.round(p.y) + 'px';
        markL.appendChild(b);
      });
    }
    function setView(v) {
      view = { lat: g.clampLat(v.lat), lng: g.wrapLng(v.lng), zoom: g.clampZoom(v.zoom, cfg.minZoom, cfg.maxZoom) };
      zin.disabled = view.zoom >= cfg.maxZoom; zout.disabled = view.zoom <= cfg.minZoom;
      render();
    }
    function zoomBy(d) { autoFit = null; setView({ lat: view.lat, lng: view.lng, zoom: view.zoom + d }); }

    // ---- interação: arrastar, toque simples, roda, teclado
    var drag = null;
    root_.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      // botões (marcadores e zoom) tratam o próprio clique: sem captura do ponteiro, senão o clique seria redirecionado
      if (e.target.closest && e.target.closest('button')) return;
      drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
      try { root_.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    });
    root_.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      drag.moved = true; autoFit = null; drag.x = e.clientX; drag.y = e.clientY;
      view = g.panView(view, dx, dy); render();
    });
    root_.addEventListener('pointerup', function (e) {
      if (!drag) return;
      var d = drag; drag = null;
      if (!d.moved && opts.onMapClick) {
        var r = root_.getBoundingClientRect(), ll = g.pointToLatLng(view, W, H, e.clientX - r.left, e.clientY - r.top);
        opts.onMapClick(ll.lat, ll.lng);
      }
    });
    root_.addEventListener('pointercancel', function () { drag = null; });
    root_.addEventListener('wheel', function (e) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1 : -1); }, { passive: false });
    root_.addEventListener('keydown', function (e) {
      var s = 60, k = e.key;
      if (k === 'ArrowLeft') view = g.panView(view, s, 0); else if (k === 'ArrowRight') view = g.panView(view, -s, 0);
      else if (k === 'ArrowUp') view = g.panView(view, 0, s); else if (k === 'ArrowDown') view = g.panView(view, 0, -s);
      else if (k === '+' || k === '=') { zoomBy(1); e.preventDefault(); return; } else if (k === '-') { zoomBy(-1); e.preventDefault(); return; }
      else return;
      e.preventDefault(); render();
    });
    var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function () { measure(); if (autoFit) setView(g.fitView(autoFit, W, H, view, cfg.minZoom, cfg.maxZoom)); else render(); }) : null;
    if (ro) ro.observe(root_);
    measure(); setView(view);

    return {
      setMarkers: function (list) { markers = list.slice(); renderMarkers(); },
      setView: setView, getView: function () { return Object.assign({}, view); }, zoomBy: zoomBy,
      fit: function (points) { autoFit = points && points.length ? points.slice() : null; setView(g.fitView(points, W, H, view, cfg.minZoom, cfg.maxZoom)); },
      resize: function () { measure(); render(); },
      status: function () { return status; },
      destroy: function () { destroyed = true; if (ro) ro.disconnect(); container.replaceChildren(); },
    };
  }

  NS.map = { availability: availability, create: create, MESSAGES: MESSAGES };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.map;
})(typeof window !== 'undefined' ? window : globalThis);
