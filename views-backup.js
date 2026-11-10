/* COOPMETRO XPT — aba Backup: lista de rotas que precisaram de backup + cadastro. Só interface; a segurança (base, autor, campos)
 * é conferida de novo pelas regras do Firestore (coleção env/producao/backups). */
(function (root) {
  'use strict';
  var NS = root.CXPT, ui = NS.ui, el = ui.el, V = (NS.views = NS.views || {}), H = NS.vh, B = NS.backup;

  V.backup = function (c) {
    var D = c.D, P = NS.permissions, live = H.live(), user = c.user;
    var g = H.guard(c, ['backup_ver']); if (g) return g;
    var canNew = P.can(c.profile, 'backup_criar'), seesAll = P.can(c.profile, 'ver_global');
    var st = { items: [], loading: true, error: null, from: '', to: '', xptId: '', showForm: false, token: 0, filtered: false };
    var vals = { driverName: '', routeName: '', routeId: '', vehiclePlate: '', vehicleType: '', backupNumber: '' };
    var msg = el('p', { class: 'form-msg', id: 'bk-msg', role: 'status', 'aria-live': 'polite' });
    var formBox = el('div', { id: 'bk-form-box' }), listBox = el('div', { id: 'bk-list', 'aria-live': 'polite' });
    var from = el('input', { type: 'date', id: 'bk-from', name: 'from' }), to = el('input', { type: 'date', id: 'bk-to', name: 'to' });
    var base = seesAll ? ui.select('xptId', D.xpts.map(function (x) { return { id: x.id, label: x.name }; }), '', 'Todas as bases') : null;
    if (base) base.id = 'bk-base';

    // ---------- dados
    function demoStore() { D.backups = D.backups || []; return D.backups; }
    function load() {
      var my = ++st.token; st.loading = true; st.error = null; drawList();
      var o = { from: st.from, to: st.to, xptId: st.xptId };
      var p = live ? NS.services.listBackups(root.CXPT_FB, user, o) : Promise.resolve((function () {
        var allowed = seesAll ? demoStore() : demoStore().filter(function (b) { return b.xptId === c.xptId; });
        return { ok: true, items: B.filterSort(allowed, o) };
      })());
      p.then(function (r) { if (my !== st.token) return; st.loading = false; if (r.ok) st.items = r.items; else { st.items = []; st.error = r.message; } drawList(); });
    }
    function drawList() {
      if (st.loading) { listBox.replaceChildren(el('p', { class: 'hint', id: 'bk-loading', text: 'Carregando backups…' })); return; }
      if (st.error) { listBox.replaceChildren(ui.callout('danger', 'Não foi possível carregar os backups.', st.error), el('button', { type: 'button', class: 'btn btn--ghost', id: 'bk-retry', onclick: load }, 'Tentar de novo')); return; }
      if (!st.items.length) { listBox.replaceChildren(ui.empty(st.filtered ? 'Nenhum backup encontrado para este período.' : 'Nenhum backup registrado ainda.', st.filtered ? 'Ajuste as datas ou limpe os filtros.' : (canNew ? 'Toque em "(+) Novo backup" para registrar o primeiro.' : null))); return; }
      listBox.replaceChildren(
        el('p', { class: 'hint', id: 'bk-count', text: st.items.length + ' registro(s), do mais recente para o mais antigo.' }),
        ui.table([
          { key: 'backupDate', label: 'Data', render: function (b) { return B.formatDate(b.backupDate); } },
          { key: 'driverName', label: 'Motorista' }, { key: 'routeName', label: 'Rota' }, { key: 'routeId', label: 'ID da rota', cls: 'mono' },
          { key: 'vehiclePlate', label: 'Placa', cls: 'mono' }, { key: 'vehicleType', label: 'Tipo do veículo', render: function (b) { return B.typeLabel(b.vehicleType); } },
          { key: 'backupNumber', label: 'Backup', render: function (b) { return ui.badge(B.numberLabel(b.backupNumber), b.backupNumber === '2' ? 'warn' : 'info'); } },
          { key: 'xptId', label: 'Base', render: function (b) { return H.xptName(D, b.xptId); } },
        ], st.items, { label: 'Backups de rotas', rowAttrs: function (b) { return { 'data-id': b.id }; } }));
    }

    // ---------- formulário
    function drawForm(errors) {
      errors = errors || {};
      if (!st.showForm) { formBox.replaceChildren(); return; }
      function inp(id, key, label, extra) { var i = el('input', Object.assign({ type: 'text', id: id, name: key, value: vals[key], maxlength: key === 'vehiclePlate' ? 10 : 80, autocomplete: 'off', required: true }, extra || {})); i.addEventListener('input', function () { vals[key] = i.value; }); return ui.field(label, i, errors[key]); }
      function sel(id, key, label, list, ph) { var s = ui.select(key, list, vals[key], ph); s.id = id; s.required = true; s.addEventListener('change', function () { vals[key] = s.value; }); return ui.field(label, s, errors[key]); }
      var save = el('button', { type: 'submit', class: 'btn btn--primary', id: 'bk-save' }, 'Salvar backup');
      var form = el('form', { id: 'bk-form', class: 'auth-form', novalidate: true, onsubmit: function (e) {
        e.preventDefault(); msg.textContent = '';
        var v = B.validate(vals);
        if (!v.ok) { drawForm(v.errors); msg.textContent = 'Preencha todos os campos obrigatórios.'; var first = formBox.querySelector('[aria-invalid=true]'); if (first) first.focus(); return; }
        save.disabled = true; msg.textContent = 'Salvando…';
        var p = live ? NS.services.createBackup(root.CXPT_FB, user, vals, c.xptId) : Promise.resolve((function () { var d = B.build(v, { id: 'bk-demo-' + Date.now(), xptId: c.xptId, uid: 'demo', nowMs: Date.now() }); demoStore().push(d); return { ok: true, backup: d }; })());
        p.then(function (r) {
          if (!r.ok) { save.disabled = false; if (r.errors) drawForm(r.errors); msg.textContent = r.message; return; }
          vals = { driverName: '', routeName: '', routeId: '', vehiclePlate: '', vehicleType: '', backupNumber: '' }; st.showForm = false; drawForm();
          msg.textContent = 'Backup salvo: ' + r.backup.routeName + ' (' + B.numberLabel(r.backup.backupNumber) + ') em ' + B.formatDate(r.backup.backupDate) + '.'; ui.announce(msg.textContent);
          load();
        });
      } },
        el('p', { class: 'hint', id: 'bk-auto', text: 'Data do backup: ' + B.formatDate(B.brasiliaDate()) + ' (automática, horário de Brasília) · Base: ' + H.xptName(D, c.xptId) + ' (da sua conta).' }),
        el('div', { class: 'form-grid' },
          inp('bk-driver', 'driverName', 'Nome do motorista'), inp('bk-route', 'routeName', 'Nome da rota'), inp('bk-routeid', 'routeId', 'ID da rota'), inp('bk-plate', 'vehiclePlate', 'Placa do veículo'),
          sel('bk-type', 'vehicleType', 'Tipo do veículo', B.VEHICLE_TYPES, 'Selecione…'), sel('bk-num', 'backupNumber', 'Número do backup', B.BACKUP_NUMBERS, 'Selecione…')),
        el('div', { class: 'row-actions' }, save, el('button', { type: 'button', class: 'btn btn--ghost', id: 'bk-cancel', onclick: function () { st.showForm = false; msg.textContent = ''; drawForm(); } }, 'Cancelar')));
      formBox.replaceChildren(ui.card('Novo backup', form));
      var f0 = formBox.querySelector('#bk-driver'); if (f0 && !Object.keys(errors).length) f0.focus();
    }

    // ---------- filtros
    function filterNow() {
      if (from.value && to.value && from.value > to.value) { msg.textContent = 'A data inicial não pode ser depois da data final.'; return; }
      msg.textContent = ''; st.from = from.value; st.to = to.value; st.xptId = base ? base.value : ''; st.filtered = !!(st.from || st.to || st.xptId); load();
    }
    function clearNow() { from.value = ''; to.value = ''; if (base) base.value = ''; msg.textContent = ''; st.from = st.to = st.xptId = ''; st.filtered = false; load(); }
    var filters = el('form', { class: 'filters', id: 'bk-filters', onsubmit: function (e) { e.preventDefault(); filterNow(); } },
      ui.field('Data inicial', from), ui.field('Data final', to), base ? ui.field('Base', base) : null,
      el('div', { class: 'row-actions' }, el('button', { type: 'submit', class: 'btn btn--primary', id: 'bk-filter' }, 'Filtrar'), el('button', { type: 'button', class: 'btn btn--ghost', id: 'bk-clear', onclick: clearNow }, 'Limpar filtros')));

    var head = el('div', { class: 'card-head' }, el('h2', { class: 'card-title', text: 'Backup' }),
      canNew ? el('button', { type: 'button', class: 'btn btn--primary', id: 'bk-new', onclick: function () { st.showForm = true; msg.textContent = ''; drawForm(); } }, '(+) Novo backup') : null);
    drawForm(); load();
    return { node: H.page([
      el('section', { class: 'card' }, head, filters, msg),
      formBox,
      ui.card(null, listBox),
      canNew ? null : ui.callout('info', 'Seu perfil só consulta os backups.', 'O registro é feito pelo supervisor da base.'),
      H.demoNote(),
    ]), destroy: function () { st.token++; } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
