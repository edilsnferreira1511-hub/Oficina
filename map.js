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
    falhou: 'Mapa indisponível: os ladrilhos não puderam ser carregados do provedor. Causas possíveis: sem internet, bloqueio de rede/CSP, ou o provedor recusou a requisição (política de uso).',
    arquivo_local: 'Mapa indisponível: o provedor (OpenStreetMap) exige o cabeçalho Referer, que o navegador não envia quando a página é aberta como arquivo (file://). Abra por http(s) — por exemplo, publicada no GitHub Pages ou com "python3 -m http.server" nesta pasta.',
  };

  function availability(cfg, env) {
    cfg = cfg || root.CXPT_MAP || {};
    env = env || {};
    if (!cfg.tiles) return { ok: false, reason: 'sem_provedor', message: MESSAGES.sem_provedor };
    var t = String(cfg.tiles);
    if (t.indexOf('{z}') < 0 || t.indexOf('{x}') < 0 || t.indexOf('{y}') < 0 || !cfg.attribution || !String(cfg.attribution).trim())
      return { ok: false, reason: 'config_invalida', message: MESSAGES.config_invalida };
    var proto = env.protocol !== undefined ? env.protocol : (typeof location !== 'undefined' ? location.protocol : '');
    if (cfg.requiresReferer && proto === 'file:') return { ok: false, reason: 'arquivo_local', message: MESSAGES.arquivo_local };
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
    var SVGNS = 'http://www.w3.org/2000/svg';
    var zoneSvg = document.createElementNS(SVGNS, 'svg'); zoneSvg.setAttribute('class', 'gmap-zone'); zoneSvg.setAttribute('aria-hidden', 'true');
    var zonePoly = document.createElementNS(SVGNS, 'polygon'); zonePoly.setAttribute('class', 'zone-shape');
    var zoneLine = document.createElementNS(SVGNS, 'polyline'); zoneLine.setAttribute('class', 'zone-line');
    zoneSvg.appendChild(zonePoly); zoneSvg.appendChild(zoneLine);
    var markL = el('div', { class: 'gmap-markers' });
    var zoneV = el('div', { class: 'gmap-zone-v' });
    var zin = el('button', { type: 'button', class: 'gmap-zoom', 'aria-label': 'Aproximar', onclick: function () { zoomBy(1); } }, '+');
    var zout = el('button', { type: 'button', class: 'gmap-zoom', 'aria-label': 'Afastar', onclick: function () { zoomBy(-1); } }, '−');
    var attr = el('div', { class: 'gmap-attr' }, cfg.attributionUrl
      ? el('a', { href: cfg.attributionUrl, target: '_blank', rel: 'noopener', text: cfg.attribution }) : cfg.attribution);
    var root_ = el('div', { class: 'gmap', tabindex: '0', role: 'application', 'aria-label': opts.label || 'Mapa interativo' },
      tilesL, zoneSvg, markL, zoneV, el('div', { class: 'gmap-ctl' }, zin, zout), attr);
    container.replaceChildren(root_);

    var autoFit = null; // pontos para reajustar quando o contêiner for medido/redimensionado (até o usuário mexer no mapa)
    function setStatus(s) { if (s !== status) { status = s; if (opts.onStatus) opts.onStatus(s); } }
    function measure() { var r = root_.getBoundingClientRect(); W = Math.max(100, Math.round(r.width)); H = Math.max(100, Math.round(r.height)); }
    function render() {
      if (destroyed) return;
      tilesL.replaceChildren();
      g.tilesFor(view, W, H).forEach(function (t) {
        var src = String(cfg.tiles).replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y);
        var im = el('img', { class: 'gmap-tile', alt: '', draggable: 'false', referrerpolicy: 'strict-origin-when-cross-origin', src: src });
        im.style.left = Math.round(t.left) + 'px'; im.style.top = Math.round(t.top) + 'px';
        im.addEventListener('load', function () { loaded++; if (status !== 'ok') setStatus('ok'); });
        im.addEventListener('error', function () { failed++; im.classList.add('gmap-tile--fail'); if (!loaded) setStatus('falhou'); });
        tilesL.appendChild(im);
      });
      renderMarkers(); renderZone();
    }
    function renderMarkers() {
      markL.replaceChildren();
      markers.forEach(function (m) {
        if (!g.validCoord(m.lat, m.lng)) return;
        var p = g.latLngToPoint(view, W, H, m.lat, m.lng);
        if (p.x < -20 || p.y < -20 || p.x > W + 20 || p.y > H + 20) return;
        var b = el('button', {
          type: 'button', class: 'pin pin--' + m.kind + (m.selected ? ' pin--sel' : '') + (m.zone ? ' pin--' + m.zone : '') + (m.focus ? ' pin--focus' : ''),
          'aria-label': m.label || m.id, 'aria-pressed': opts.onMarker ? String(!!m.selected) : null,
          dataset: { id: m.id, kind: m.kind }, disabled: !opts.onMarker,
          onclick: function (e) { e.stopPropagation(); if (opts.onMarker) opts.onMarker(m.id); },
          onpointerdown: function (e) { e.stopPropagation(); },
        }, el('span', { class: 'pin-dot' }));
        b.style.left = Math.round(p.x) + 'px'; b.style.top = Math.round(p.y) + 'px';
        markL.appendChild(b);
      });
    }
    // ---- zona (polígono) desenhada pelo usuário: vértices tocados no mapa; arrastáveis / ajustáveis por teclado
    var zone = [], zoneMode = false, zoneClosed = false, vDrag = null;
    function zoneChanged() { renderZone(); if (opts.onZone) opts.onZone(zone.map(function (v) { return { lat: v.lat, lng: v.lng }; }), zoneClosed); }
    function renderZone() {
      zoneV.replaceChildren();
      var pts = zone.map(function (v) { return g.latLngToPoint(view, W, H, v.lat, v.lng); });
      var str = pts.map(function (p) { return Math.round(p.x * 10) / 10 + ',' + Math.round(p.y * 10) / 10; }).join(' ');
      zonePoly.setAttribute('points', zoneClosed ? str : ''); zoneLine.setAttribute('points', zoneClosed ? '' : str);
      zoneSvg.setAttribute('class', 'gmap-zone' + (zoneClosed ? ' gmap-zone--closed' : ''));
      zone.forEach(function (v, i) {
        var p = pts[i];
        var b = el('button', { type: 'button', class: 'zone-v', 'aria-label': 'Ponto ' + (i + 1) + ' da zona. Setas movem, Delete remove.', dataset: { idx: String(i) } });
        b.style.left = Math.round(p.x) + 'px'; b.style.top = Math.round(p.y) + 'px';
        b.addEventListener('pointerdown', function (e) {
          e.stopPropagation(); if (e.button > 0) return;
          vDrag = { i: i, id: e.pointerId, moved: false, el: b };
          try { b.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        });
        b.addEventListener('pointermove', function (e) {
          if (!vDrag || vDrag.id !== e.pointerId) return;
          var r = root_.getBoundingClientRect(), x = Math.max(0, Math.min(r.width, e.clientX - r.left)), y = Math.max(0, Math.min(r.height, e.clientY - r.top));
          var ll = g.pointToLatLng(view, W, H, x, y); zone[vDrag.i] = { lat: ll.lat, lng: ll.lng }; vDrag.moved = true;
          b.style.left = Math.round(x) + 'px'; b.style.top = Math.round(y) + 'px';
          var np = zone.map(function (z) { var q = g.latLngToPoint(view, W, H, z.lat, z.lng); return Math.round(q.x * 10) / 10 + ',' + Math.round(q.y * 10) / 10; }).join(' ');
          (zoneClosed ? zonePoly : zoneLine).setAttribute('points', np);
        });
        b.addEventListener('pointerup', function (e) {
          if (!vDrag || vDrag.id !== e.pointerId) return;
          var moved = vDrag.moved; vDrag = null;
          if (moved) { zoneChanged(); }
        });
        b.addEventListener('keydown', function (e) {
          var k = e.key, d = 6, dx = 0, dy = 0;
          if (k === 'ArrowLeft') dx = -d; else if (k === 'ArrowRight') dx = d; else if (k === 'ArrowUp') dy = -d; else if (k === 'ArrowDown') dy = d;
          else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); e.stopPropagation(); zone.splice(i, 1); if (zone.length < 3) zoneClosed = false; zoneChanged(); return; }
          else return;
          e.preventDefault(); e.stopPropagation();
          var q = g.latLngToPoint(view, W, H, zone[i].lat, zone[i].lng), ll = g.pointToLatLng(view, W, H, q.x + dx, q.y + dy);
          zone[i] = { lat: ll.lat, lng: ll.lng }; zoneChanged();
          var nb = zoneV.querySelector('[data-idx="' + i + '"]'); if (nb) nb.focus();
        });
        zoneV.appendChild(b);
      });
    }
    function addZonePoint(lat, lng) { zone.push({ lat: lat, lng: lng }); zoneChanged(); }

    function setView(v) {
      view = { lat: g.clampLat(v.lat), lng: g.wrapLng(v.lng), zoom: g.clampZoom(v.zoom, cfg.minZoom, cfg.maxZoom) };
      zin.disabled = view.zoom >= cfg.maxZoom; zout.disabled = view.zoom <= cfg.minZoom;
      render();
    }
    function zoomBy(d) { autoFit = null; setView({ lat: view.lat, lng: view.lng, zoom: view.zoom + d }); }

    // ---- interação: arrastar, toque simples, roda, teclado
    var drag = null, touches = {}, pinch = null;
    function nTouches() { return Object.keys(touches).length; }
    function touchDist() { var k = Object.keys(touches); return Math.hypot(touches[k[0]].x - touches[k[1]].x, touches[k[0]].y - touches[k[1]].y) || 1; }
    function relPos(e) { var r = root_.getBoundingClientRect(); return { x: Math.max(0, Math.min(r.width, e.clientX - r.left)), y: Math.max(0, Math.min(r.height, e.clientY - r.top)) }; }
    root_.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      // botões (marcadores e zoom) tratam o próprio clique: sem captura do ponteiro, senão o clique seria redirecionado
      if (e.target.closest && e.target.closest('button')) return;
      if (e.pointerType === 'touch') {
        // pinça com dois dedos: cada dobra/metade da distância muda um nível de zoom (zoom inteiro)
        touches[e.pointerId] = { x: e.clientX, y: e.clientY };
        try { root_.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        if (nTouches() === 2) { pinch = { d0: touchDist() }; drag = null; return; }
      }
      drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
      try { root_.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    });
    root_.addEventListener('pointermove', function (e) {
      if (touches[e.pointerId]) touches[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (pinch && nTouches() === 2) {
        var ratio = touchDist() / pinch.d0;
        if (ratio >= 1.5) { zoomBy(1); pinch.d0 = touchDist(); } else if (ratio <= 0.67) { zoomBy(-1); pinch.d0 = touchDist(); }
        return;
      }
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      drag.moved = true; autoFit = null; drag.x = e.clientX; drag.y = e.clientY;
      view = g.panView(view, dx, dy); render();
    });
    root_.addEventListener('pointerup', function (e) {
      delete touches[e.pointerId]; if (nTouches() < 2) { if (pinch) { pinch = null; drag = null; return; } }
      if (!drag) return;
      var d = drag; drag = null;
      if (!d.moved) {
        var r = root_.getBoundingClientRect(), ll = g.pointToLatLng(view, W, H, e.clientX - r.left, e.clientY - r.top);
        if (zoneMode && !zoneClosed) addZonePoint(ll.lat, ll.lng); else if (opts.onMapClick) opts.onMapClick(ll.lat, ll.lng);
      }
    });
    root_.addEventListener('pointercancel', function (e) { delete touches[e.pointerId]; pinch = null; drag = null; });
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
      setZoneMode: function (on) { zoneMode = !!on; root_.classList.toggle('gmap--draw', zoneMode && !zoneClosed); },
      getZone: function () { return zone.map(function (v) { return { lat: v.lat, lng: v.lng }; }); },
      zoneClosed: function () { return zoneClosed; },
      closeZone: function () { if (zone.length < 3) return false; zoneClosed = true; root_.classList.remove('gmap--draw'); zoneChanged(); return true; },
      undoZonePoint: function () { if (!zone.length) return; zone.pop(); if (zone.length < 3) zoneClosed = false; zoneChanged(); },
      clearZone: function () { zone = []; zoneClosed = false; zoneChanged(); },
      setZone: function (poly, closed) { zone = (poly || []).map(function (v) { return { lat: v.lat, lng: v.lng }; }); zoneClosed = !!closed && zone.length >= 3; renderZone(); },
      destroy: function () { destroyed = true; if (ro) ro.disconnect(); container.replaceChildren(); },
    };
  }

  NS.map = { availability: availability, create: create, MESSAGES: MESSAGES };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.map;
})(typeof window !== 'undefined' ? window : globalThis);
