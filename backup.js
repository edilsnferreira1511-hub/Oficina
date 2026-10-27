/* COOPMETRO XPT — aba Backup: regras puras (validação, data de Brasília, filtros). Sem acesso a banco nem a tela.
 * Um registro = uma rota que precisou de backup. Gravado em env/producao/backups/{id} (ver services.js e firestore.rules). */
(function (root) {
  'use strict';
  var NS = (root.CXPT = root.CXPT || {});
  var VEHICLE_TYPES = [{ id: 'passeio', label: 'Passeio' }, { id: 'utilitario', label: 'Utilitário' }, { id: 'vuc', label: 'VUC' }];
  var BACKUP_NUMBERS = [{ id: '1', label: '1º backup' }, { id: '2', label: '2º backup' }];
  var FIELDS = ['id', 'driverName', 'routeName', 'routeId', 'vehiclePlate', 'vehicleType', 'backupNumber', 'xptId', 'backupDate', 'createdAt', 'createdBy'];
  var MAX = 80;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  /** Data de hoje no horário de Brasília (America/Sao_Paulo, UTC-3 sem horário de verão): "AAAA-MM-DD". */
  function brasiliaDate(ms) {
    var d = new Date((typeof ms === 'number' ? ms : Date.now()) - 3 * 3600 * 1000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function formatDate(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : '—'; }
  function label(list, id) { var x = list.filter(function (v) { return v.id === id; })[0]; return x ? x.label : '—'; }
  function typeLabel(id) { return label(VEHICLE_TYPES, id); }
  function numberLabel(id) { return label(BACKUP_NUMBERS, id); }
  function clean(s) { return String(s === undefined || s === null ? '' : s).replace(/\s+/g, ' ').trim(); }

  /** Valida o formulário. Devolve {ok, errors, value} (value normalizado; placa em maiúsculas). */
  function validate(f) {
    f = f || {}; var e = {}, v = {
      driverName: clean(f.driverName), routeName: clean(f.routeName), routeId: clean(f.routeId), vehiclePlate: clean(f.vehiclePlate).toUpperCase().replace(/\s/g, ''),
      vehicleType: String(f.vehicleType || ''), backupNumber: String(f.backupNumber || ''),
    };
    if (!v.driverName) e.driverName = 'Informe o nome do motorista.'; else if (v.driverName.length > MAX) e.driverName = 'Nome com mais de ' + MAX + ' caracteres.';
    if (!v.routeName) e.routeName = 'Informe o nome da rota.'; else if (v.routeName.length > MAX) e.routeName = 'Nome com mais de ' + MAX + ' caracteres.';
    if (!v.routeId) e.routeId = 'Informe o ID da rota.'; else if (v.routeId.length > MAX) e.routeId = 'ID com mais de ' + MAX + ' caracteres.';
    if (!v.vehiclePlate) e.vehiclePlate = 'Informe a placa do veículo.'; else if (v.vehiclePlate.length > 10) e.vehiclePlate = 'Placa com mais de 10 caracteres.';
    if (!VEHICLE_TYPES.some(function (t) { return t.id === v.vehicleType; })) e.vehicleType = 'Escolha o tipo do veículo (Passeio, Utilitário ou VUC).';
    if (!BACKUP_NUMBERS.some(function (n) { return n.id === v.backupNumber; })) e.backupNumber = 'Escolha 1º ou 2º backup.';
    return { ok: !Object.keys(e).length, errors: e, value: v };
  }
  /** Monta o documento (a base e o autor vêm do usuário autenticado, nunca de campo digitado). */
  function build(valid, ctx) {
    var v = valid.value, now = ctx.nowMs;
    return { id: ctx.id, driverName: v.driverName, routeName: v.routeName, routeId: v.routeId, vehiclePlate: v.vehiclePlate, vehicleType: v.vehicleType, backupNumber: v.backupNumber,
      xptId: ctx.xptId, backupDate: brasiliaDate(now), createdAt: now, createdBy: ctx.uid };
  }
  /** Filtra por período (datas INCLUSIVAS, "AAAA-MM-DD") e base; ordena do mais recente para o mais antigo. */
  function filterSort(items, o) {
    o = o || {};
    return items.filter(function (b) {
      if (o.xptId && b.xptId !== o.xptId) return false;
      if (o.from && String(b.backupDate) < o.from) return false;
      if (o.to && String(b.backupDate) > o.to) return false;
      return true;
    }).sort(function (a, b) { return String(b.backupDate).localeCompare(String(a.backupDate)) || (b.createdAt || 0) - (a.createdAt || 0); });
  }
  NS.backup = { VEHICLE_TYPES: VEHICLE_TYPES, BACKUP_NUMBERS: BACKUP_NUMBERS, FIELDS: FIELDS, brasiliaDate: brasiliaDate, formatDate: formatDate, typeLabel: typeLabel, numberLabel: numberLabel, validate: validate, build: build, filterSort: filterSort };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.backup;
})(typeof window !== 'undefined' ? window : globalThis);
