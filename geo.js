/* COOPMETRO XPT — matemática geográfica pura (sem DOM).
 * Validação de coordenadas/localização, projeção Web Mercator, seleção por área. */
(function (root) {
  'use strict';
  var NS = (root.CXPT = root.CXPT || {});
  var TILE = 256;
  var LOC_KINDS = ['marcada', 'aproximada', 'desconhecida', 'pendente'];
  var LOC_LABEL = {
    marcada: 'Localização confirmada',
    aproximada: 'Localização aproximada',
    desconhecida: 'Localização desconhecida',
    pendente: 'Localização pendente',
  };
  var MAX_LAT = 85.0511287798;

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function validLat(v) { return isNum(v) && v >= -90 && v <= 90; }
  function validLng(v) { return isNum(v) && v >= -180 && v <= 180; }
  function validCoord(lat, lng) { return validLat(lat) && validLng(lng); }
  function round6(v) { return Math.round(v * 1e6) / 1e6; }

  /** Converte texto/número em número; devolve null se não for um número finito. */
  function parseCoord(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    var s = v.trim().replace(',', '.');
    if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  function hasPoint(loc) {
    return !!loc && (loc.kind === 'marcada' || loc.kind === 'aproximada') && validCoord(loc.lat, loc.lng);
  }

  /** Valida uma localização do modelo de dados (spec §7). */
  function validateLocation(loc) {
    var errors = [];
    if (!loc || typeof loc !== 'object') return { ok: false, errors: ['Localização ausente.'] };
    if (LOC_KINDS.indexOf(loc.kind) < 0) errors.push('Tipo de localização inválido.');
    var hasLat = loc.lat !== null && loc.lat !== undefined;
    var hasLng = loc.lng !== null && loc.lng !== undefined;
    if (loc.kind === 'marcada') {
      if (!validCoord(loc.lat, loc.lng)) errors.push('Ponto marcado exige latitude (-90 a 90) e longitude (-180 a 180) válidas.');
    } else if (loc.kind === 'aproximada') {
      if (hasLat || hasLng) { if (!validCoord(loc.lat, loc.lng)) errors.push('Coordenadas aproximadas inválidas.'); }
    } else if (loc.kind === 'desconhecida' || loc.kind === 'pendente') {
      if (hasLat || hasLng) errors.push('Localização ' + loc.kind + ' não pode ter coordenadas.');
      if (loc.kind === 'desconhecida' && loc.regionId) errors.push('Localização desconhecida não pode ter região.');
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function makeLocation(kind, lat, lng, regionId, markedAt) {
    var hasC = (kind === 'marcada' || kind === 'aproximada') && validCoord(lat, lng);
    return {
      kind: kind,
      lat: hasC ? round6(lat) : null,
      lng: hasC ? round6(lng) : null,
      regionId: kind === 'desconhecida' || kind === 'pendente' ? null : regionId || null,
      markedAt: hasC ? markedAt || null : null,
    };
  }

  // ---- Web Mercator (API usada por map.js: view = {lat,lng,zoom}, largura W e altura H explícitas) ----
  function worldSize(z) { return TILE * Math.pow(2, z); }
  function project(lat, lng, z) {
    var s = worldSize(z);
    var la = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
    var sin = Math.sin((la * Math.PI) / 180);
    return { x: ((lng + 180) / 360) * s, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s };
  }
  function unproject(x, y, z) {
    var s = worldSize(z);
    var n = Math.PI - (2 * Math.PI * y) / s;
    return { lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng: (x / s) * 360 - 180 };
  }
  function wrapLng(lng) {
    if (lng >= -180 && lng < 180) return lng;
    return ((((lng + 180) % 360) + 360) % 360) - 180;
  }
  function clampLat(lat) { return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)); }
  function clampZoom(z, min, max) { return Math.max(min, Math.min(max, Math.round(z))); }
  function tilesFor(view, W, H) {
    var c = project(view.lat, view.lng, view.zoom);
    var x0 = c.x - W / 2, y0 = c.y - H / 2, n = Math.pow(2, view.zoom), out = [];
    var tx0 = Math.floor(x0 / TILE), tx1 = Math.floor((x0 + W) / TILE);
    var ty0 = Math.max(0, Math.floor(y0 / TILE)), ty1 = Math.min(n - 1, Math.floor((y0 + H) / TILE));
    for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) {
      out.push({ z: view.zoom, x: ((tx % n) + n) % n, y: ty, left: tx * TILE - x0, top: ty * TILE - y0 });
    }
    return out;
  }
  function latLngToPoint(view, W, H, lat, lng) {
    var c = project(view.lat, view.lng, view.zoom), p = project(lat, lng, view.zoom);
    return { x: p.x - c.x + W / 2, y: p.y - c.y + H / 2 };
  }
  function pointToLatLng(view, W, H, px, py) {
    var c = project(view.lat, view.lng, view.zoom);
    var u = unproject(c.x + px - W / 2, c.y + py - H / 2, view.zoom);
    return { lat: u.lat, lng: wrapLng(u.lng) };
  }
  function panView(view, dx, dy) {
    var c = project(view.lat, view.lng, view.zoom);
    var u = unproject(c.x - dx, c.y - dy, view.zoom);
    return Object.assign({}, view, { lat: clampLat(u.lat), lng: wrapLng(u.lng) });
  }
  function boundsOf(points) {
    var b = { south: 90, north: -90, west: 180, east: -180 };
    points.forEach(function (p) {
      b.south = Math.min(b.south, p.lat); b.north = Math.max(b.north, p.lat);
      b.west = Math.min(b.west, p.lng); b.east = Math.max(b.east, p.lng);
    });
    return b;
  }
  /** Ajusta a visão aos pontos com coordenadas válidas; sem pontos, devolve a visão de reserva. */
  function fitView(points, W, H, fallback, minZ, maxZ) {
    var pts = (points || []).filter(function (p) { return validCoord(p.lat, p.lng); });
    if (!pts.length) return fallback;
    var b = boundsOf(pts), z = maxZ, pad = 40;
    for (; z > minZ; z--) {
      var a = project(b.north, b.west, z), c = project(b.south, b.east, z);
      if (Math.abs(c.x - a.x) <= W - 2 * pad && Math.abs(c.y - a.y) <= H - 2 * pad) break;
    }
    return { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2, zoom: z };
  }
  /** Seleção por área retangular {minLat,maxLat,minLng,maxLng}; ignora pontos sem coordenadas. */
  function pointsInBounds(points, b) {
    if (!b || ![b.minLat, b.maxLat, b.minLng, b.maxLng].every(isNum) || b.minLat > b.maxLat || b.minLng > b.maxLng) return [];
    return (points || []).filter(function (p) {
      return validCoord(p.lat, p.lng) && p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng;
    });
  }
  /** Polígono = lista de vértices {lat,lng}. Válido: >=3 vértices com coordenadas válidas, área não nula e sem arestas que se cruzam. */
  function segCross(a, b, c, d) {
    function o(p, q, r) { return (q.lng - p.lng) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lng - p.lng); }
    var o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0));
  }
  function polygonValid(poly) {
    if (!Array.isArray(poly) || poly.length < 3) return false;
    if (!poly.every(function (v) { return v && validCoord(v.lat, v.lng); })) return false;
    var area = 0, n = poly.length, i, j;
    for (i = 0; i < n; i++) { j = (i + 1) % n; area += poly[i].lng * poly[j].lat - poly[j].lng * poly[i].lat; }
    if (Math.abs(area) < 1e-12) return false;
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segCross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false;
    }
    return true;
  }
  /** Ponto dentro do polígono (ray casting). Pontos sem coordenadas válidas ou polígono inválido => false. */
  function pointInPolygon(lat, lng, poly) {
    if (!validCoord(lat, lng) || !polygonValid(poly)) return false;
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var yi = poly[i].lat, xi = poly[i].lng, yj = poly[j].lat, xj = poly[j].lng;
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  /** Separa {inside, outside} entre os pontos com coordenadas; sem coordenadas ficam fora das duas listas. */
  function pointsInPolygon(points, poly) {
    var res = { inside: [], outside: [] };
    (points || []).forEach(function (p) {
      if (!validCoord(p.lat, p.lng)) return;
      (pointInPolygon(p.lat, p.lng, poly) ? res.inside : res.outside).push(p);
    });
    return res;
  }
  function groupByRegion(points) {
    var out = {};
    (points || []).forEach(function (p) { var k = p.regionId || 'sem_regiao'; (out[k] = out[k] || []).push(p); });
    return out;
  }
  function hasCoords(loc) { return !!loc && validCoord(loc.lat, loc.lng); }
  /** Normaliza e valida uma localização; devolve {ok, loc} ou {ok:false, error}. */
  function normalizeLocation(loc) {
    var v = validateLocation(loc);
    if (!v.ok) return { ok: false, error: v.errors[0] };
    var n = makeLocation(loc.kind, loc.lat, loc.lng, loc.regionId, loc.markedAt);
    return { ok: true, loc: n };
  }
  function formatLatLng(lat, lng) { return round6(lat).toFixed(6) + ', ' + round6(lng).toFixed(6); }

  NS.geo = {
    TILE: TILE, LOC_KINDS: LOC_KINDS, LOC_LABEL: LOC_LABEL,
    validLat: validLat, validLng: validLng, validCoord: validCoord, parseCoord: parseCoord, round6: round6,
    hasPoint: hasPoint, hasCoords: hasCoords, validateLocation: validateLocation, normalizeLocation: normalizeLocation,
    makeLocation: makeLocation, project: project, unproject: unproject, wrapLng: wrapLng, clampLat: clampLat, clampZoom: clampZoom,
    tilesFor: tilesFor, latLngToPoint: latLngToPoint, pointToLatLng: pointToLatLng, panView: panView, fitView: fitView,
    boundsOf: boundsOf, pointsInBounds: pointsInBounds, polygonValid: polygonValid, pointInPolygon: pointInPolygon, pointsInPolygon: pointsInPolygon, groupByRegion: groupByRegion, formatLatLng: formatLatLng,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.geo;
})(typeof window !== 'undefined' ? window : globalThis);
