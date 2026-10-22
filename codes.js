/* COOPMETRO XPT — códigos de pacote, índice global de duplicidade e rascunho de entrada (em memória).
 * Regra de caracteres PROVISÓRIA (não é o formato oficial das etiquetas): A–Z, 0–9, ponto, sublinhado, hífen; máx. 64. */
(function (root) {
  'use strict';
  var NS = (root.CXPT = root.CXPT || {});
  var MAX_LEN = 64, NOTE_MAX = 200;
  var PATTERN = /^[A-Z0-9._-]+$/;

  /** Remove espaços externos e põe em maiúsculas. Espaços internos NÃO são removidos (serão rejeitados). */
  function normalize(raw) {
    return typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  }
  /** {ok, code, error} — error: 'vazio' | 'longo' | 'caracteres' */
  function validate(raw) {
    var code = normalize(raw);
    if (!code) return { ok: false, code: code, error: 'vazio', message: 'Informe ou leia um código.' };
    if (code.length > MAX_LEN) return { ok: false, code: code, error: 'longo', message: 'Código com mais de ' + MAX_LEN + ' caracteres.' };
    if (!PATTERN.test(code)) return { ok: false, code: code, error: 'caracteres', message: 'Use apenas letras, números, ponto, sublinhado e hífen (regra provisória).' };
    return { ok: true, code: code };
  }

  /**
   * Índice global de códigos (demonstração do que será do backend).
   * check() devolve apenas um status — nunca XPT, localização ou dados do pacote de outra base.
   */
  function createIndex(packages) {
    var map = Object.create(null);
    (packages || []).forEach(function (p) { map[p.code] = p.xptId; });
    return {
      check: function (code, xptId) {
        var owner = map[code];
        if (owner === undefined) return 'livre';
        return owner === xptId ? 'nesta_xpt' : 'outra_xpt';
      },
      register: function (code, xptId) { if (map[code] === undefined) map[code] = xptId; },
      release: function (code, xptId) { if (map[code] === xptId) delete map[code]; },
      size: function () { return Object.keys(map).length; },
    };
  }

  var DUP_MSG = {
    nesta_xpt: 'Pacote já cadastrado nesta base: nenhuma duplicata será criada. Consulte o pacote abaixo e registre a reentrada como evento.',
    outra_xpt: 'Código já consta no índice global. Os dados não são exibidos — procure a coordenação.',
  };

  function blankLocation() { return { kind: 'pendente', lat: null, lng: null, regionId: null, markedAt: null }; }

  /**
   * Rascunho de entrada de UMA XPT. Cada item tem a sua própria localização (nunca herdada).
   * opts: {xptId, sizes[], reasons[], regionIds[], index, nowFn, max}
   */
  function createEntryDraft(opts) {
    var xptId = opts.xptId, max = opts.max || 500, items = [], seq = 1;
    var nowFn = opts.nowFn || function () { return Date.now(); };

    function ids(list) { return (list || []).map(function (x) { return x.id; }); }

    function checkFields(f, ignoreId) {
      var errors = {};
      var v = validate(f.code);
      if (!v.ok) errors.code = v.message;
      else {
        if (items.some(function (i) { return i.code === v.code && i.id !== ignoreId; })) {
          errors.code = 'Código já está no rascunho.'; errors.duplicate = 'rascunho';
        } else if (opts.index && !ignoreId) {
          var st = opts.index.check(v.code, xptId);
          if (st !== 'livre') { errors.code = DUP_MSG[st]; errors.duplicate = st; }
        }
      }
      if (ids(opts.sizes).indexOf(f.size) < 0) errors.size = 'Selecione o tamanho.';
      if (ids(opts.reasons).indexOf(f.reasonId) < 0) errors.reasonId = 'Selecione o motivo da devolução.';
      var note = f.note == null ? '' : String(f.note);
      if (note.length > NOTE_MAX) errors.note = 'Observação com mais de ' + NOTE_MAX + ' caracteres.';
      var loc = NS.geo.normalizeLocation(f.location || blankLocation());
      if (!loc.ok) errors.location = loc.error;
      else if (loc.loc.regionId && (opts.regionIds || []).indexOf(loc.loc.regionId) < 0) {
        errors.location = 'Região não pertence a esta base.';
      }
      var ok = Object.keys(errors).length === 0;
      return { ok: ok, errors: errors, code: v.code, note: note.trim(), loc: loc.ok ? loc.loc : null };
    }

    function add(f) {
      if (items.length >= max) return { ok: false, errors: { code: 'Limite do rascunho atingido.' } };
      var r = checkFields(f);
      if (!r.ok) return { ok: false, errors: r.errors, duplicate: r.errors.duplicate || null };
      var loc = r.loc;
      if (loc.kind === 'marcada' && !loc.markedAt) loc.markedAt = nowFn();
      var item = { id: 'dr-' + xptId + '-' + seq++, code: r.code, xptId: xptId, size: f.size, reasonId: f.reasonId, note: r.note, location: loc };
      items.push(item);
      if (opts.index) opts.index.register(item.code, xptId);
      return { ok: true, item: copy(item) };
    }
    function copy(i) { return Object.assign({}, i, { location: Object.assign({}, i.location) }); }
    function find(id) { for (var k = 0; k < items.length; k++) if (items[k].id === id) return items[k]; return null; }

    function update(id, f) {
      var it = find(id); if (!it) return { ok: false, errors: { code: 'Item não encontrado.' } };
      var merged = { code: it.code, size: it.size, reasonId: it.reasonId, note: it.note, location: it.location };
      Object.keys(f).forEach(function (k) { merged[k] = f[k]; });
      var r = checkFields(merged, id);
      if (!r.ok) return { ok: false, errors: r.errors };
      if (r.code !== it.code) return { ok: false, errors: { code: 'O código de um item do rascunho não pode ser alterado; remova e leia de novo.' } };
      it.size = merged.size; it.reasonId = merged.reasonId; it.note = r.note;
      it.location = r.loc;
      if (it.location.kind === 'marcada' && !it.location.markedAt) it.location.markedAt = nowFn();
      return { ok: true, item: copy(it) };
    }
    function setLocation(id, loc) { return update(id, { location: loc }); }
    function clearLocation(id) { return update(id, { location: blankLocation() }); }
    function remove(id) {
      var k = items.findIndex(function (i) { return i.id === id; });
      if (k < 0) return false;
      var it = items.splice(k, 1)[0];
      if (opts.index) opts.index.release(it.code, xptId);
      return true;
    }
    function clear() { items.slice().forEach(function (i) { remove(i.id); }); }

    /** Pontos com coordenadas VÁLIDAS (mesma estrutura usada pela tela Mapa/Regiões). */
    function geoPoints() {
      return items.filter(function (i) { return NS.geo.hasCoords(i.location); }).map(function (i) {
        return { id: i.id, code: i.code, xptId: i.xptId, kind: i.location.kind, lat: i.location.lat, lng: i.location.lng, regionId: i.location.regionId, size: i.size, reasonId: i.reasonId };
      });
    }
    function withoutCoords() {
      return items.filter(function (i) { return !NS.geo.hasCoords(i.location); }).map(copy);
    }
    return {
      xptId: xptId, check: checkFields, add: add, update: update, setLocation: setLocation, clearLocation: clearLocation,
      remove: remove, clear: clear, get: function (id) { var i = find(id); return i ? copy(i) : null; },
      list: function () { return items.map(copy); }, count: function () { return items.length; },
      geoPoints: geoPoints, withoutCoords: withoutCoords,
      has: function (code) { return items.some(function (i) { return i.code === normalize(code); }); },
    };
  }

  NS.codes = {
    MAX_LEN: MAX_LEN, NOTE_MAX: NOTE_MAX, normalize: normalize, validate: validate, createIndex: createIndex,
    createEntryDraft: createEntryDraft, blankLocation: blankLocation, DUP_MSG: DUP_MSG,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.codes;
})(typeof window !== 'undefined' ? window : globalThis);
