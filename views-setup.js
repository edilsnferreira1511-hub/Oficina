/* COOPMETRO XPT — "Administração" (somente administrador do sistema): bases, usuários, motoristas, permissões e diagnóstico.
 * Cria a base inicial e as configurações apenas quando ainda não existem.
 * Nunca sobrescreve, nunca apaga. Usuários e perfis NÃO são criados aqui: são criados no Console do Firebase (ver docs). */
(function (root) {
  'use strict';
  var NS = root.CXPT, ui = NS.ui, el = ui.el, H = NS.vh, V = NS.views;
  function input(id, label, ph) { var i = el('input', { type: 'text', id: id, name: id, placeholder: ph || '', autocomplete: 'off' }); return { i: i, f: ui.field(label, i) }; }
  /** Diagnóstico HONESTO: o que está conectado de verdade e o que foi testado agora (leitura real do servidor). */
  function diagCard(c) {
    var fb = root.CXPT_FB, cfg = (root.CXPT_FIREBASE && root.CXPT_FIREBASE.config) || {}, out = el('ul', { id: 'diag-list', class: 'why-list' });
    function row(ok, t) { out.appendChild(el('li', { 'data-ok': ok ? '1' : '0', text: (ok ? '✓ ' : '✗ ') + t })); }
    function run() {
      out.replaceChildren();
      row(!!cfg.apiKey, 'apiKey preenchida em firebase-config.js');
      row(cfg.projectId === 'coopmetro-xpt', 'projeto configurado: ' + (cfg.projectId || '(vazio)'));
      row(fb && fb.kind === 'real', fb && fb.kind === 'real' ? 'FIREBASE REAL (SDK oficial)' : 'BACKEND SIMULADO — não é o Firebase real');
      row(!!c.user, 'login ativo: ' + (c.user ? c.user.email + ' · perfil ' + c.user.role : 'nenhum'));
      if (!fb) return;
      fb.db.get(NS.services.ENV + '/users/' + c.user.uid).then(function (s) { row(s.exists, 'leitura REAL do seu perfil no Firestore (' + NS.services.ENV + '/users/…)'); return fb.db.get(NS.services.ENV + '/settings/main'); })
        .then(function (s) { row(s.exists, s.exists ? 'configurações encontradas (' + NS.services.ENV + '/settings/main)' : 'configurações ainda não criadas (crie a base inicial acima)'); },
          function (e) { row(false, 'leitura recusada/falhou: ' + ((e && (e.code || e.message)) || 'erro') + (/permission/.test((e && e.code) || '') ? ' — publique as regras de firestore.rules' : '')); });
    }
    run();
    return ui.card('Diagnóstico da conexão', el('div', null, out, el('button', { type: 'button', class: 'btn', id: 'diag-btn', onclick: run }, 'Testar de novo')));
  }
  function driverCard(c) {
    var id = input('drv-new-id', 'Identificador (letras/números)', 'm10'), nm = input('drv-new-name', 'Nome'), idn = input('drv-new-ident', 'Matrícula/placa (opcional)');
    var xi = input('drv-new-xpt', 'Base (id, ex.: x1)', 'x1'), x = xi.i, msg = el('p', { class: 'form-msg', id: 'drv-new-msg', role: 'status' });
    return ui.card('Cadastrar motorista', el('div', null, id.f, nm.f, idn.f, xi.f, el('button', { type: 'button', class: 'btn btn--primary', id: 'drv-new-btn', onclick: function () {
      msg.textContent = 'Gravando…';
      NS.services.registerDriver(root.CXPT_FB, c.user, { id: id.i.value, name: nm.i.value, ident: idn.i.value, xptId: x.value }).then(function (r) { msg.textContent = r.ok ? 'Motorista cadastrado. Use "Atualizar dados" para vê-lo na criação de ambulâncias.' : r.message; });
    } }, 'Cadastrar motorista'), msg));
  }
  function userCard(c) {
    var uid = input('usr-new-uid', 'UID (copiado do Authentication)'), nm = input('usr-new-name', 'Nome'), em = input('usr-new-email', 'E-mail'), dr = input('usr-new-driver', 'driverId (só para motorista)', 'm1'), xs = input('usr-new-xpts', 'Bases (ids separados por vírgula)', 'x1');
    var role = el('select', { id: 'usr-new-role' }, NS.permissions.PROFILES.map(function (p) { return el('option', { value: p.id, text: p.label }); })), msg = el('p', { class: 'form-msg', id: 'usr-new-msg', role: 'status' });
    return ui.card('Vincular usuário (perfil e bases)', el('div', null, el('p', { class: 'hint', text: 'Primeiro crie o login em Console → Authentication → Users e copie o UID. Aqui só se cria o perfil; nunca se altera um existente nem o seu próprio.' }), uid.f, nm.f, em.f, ui.field('Perfil', role), xs.f, dr.f, el('button', { type: 'button', class: 'btn btn--primary', id: 'usr-new-btn', onclick: function () {
      msg.textContent = 'Gravando…';
      NS.services.linkUser(root.CXPT_FB, c.user, { uid: uid.i.value, name: nm.i.value, email: em.i.value, role: role.value, xptIds: xs.i.value.split(',').map(function (s) { return s.trim(); }), driverId: dr.i.value }).then(function (r) { msg.textContent = r.ok ? 'Perfil criado. A pessoa já pode entrar.' : r.message; });
    } }, 'Vincular usuário'), msg));
  }
  function done(c) { return c.svc.refresh().then(function () { c.rerender(); }, function () { c.rerender(); }); }
  var PLABEL = {}; NS.permissions.PROFILES.forEach(function (p) { PLABEL[p.id] = p.label; });
  /** Bases (XPT): criar nova ou editar nome/ativa. A base de origem de um pacote nunca muda; aqui só se cadastra/renomeia. */
  function basesCard(c) {
    var id = input('xpt-new-id', 'Identificador (letras/números)', 'x3'), nm = input('xpt-new-name', 'Nome da base', 'XPT Gama');
    var act = el('input', { type: 'checkbox', id: 'xpt-new-active', checked: true }), msg = el('p', { class: 'form-msg', id: 'xpt-new-msg', role: 'status' });
    var list = el('ul', { class: 'why-list', id: 'xpt-list' }, c.D.xpts.map(function (x) {
      return el('li', null, x.name + ' (' + x.id + ')' + (x.active ? '' : ' — desativada') + ' ', el('button', { type: 'button', class: 'btn btn--ghost btn--sm', id: 'xpt-edit-' + x.id, onclick: function () { id.i.value = x.id; nm.i.value = x.name; act.checked = !!x.active; nm.i.focus(); } }, 'Editar'));
    }));
    return ui.card('Bases (XPT / galpões)', el('div', null, list, id.f, nm.f, el('label', { class: 'check' }, act, ' Ativa'), el('button', { type: 'button', class: 'btn btn--primary', id: 'xpt-save-btn', onclick: function () {
      msg.textContent = 'Gravando…';
      NS.services.saveXpt(root.CXPT_FB, c.user, { id: id.i.value, name: nm.i.value, active: act.checked }).then(function (r) { if (!r.ok) { msg.textContent = r.message; return; } return done(c); });
    } }, 'Salvar base (cria ou edita)'), msg));
  }
  /** Usuários: listar, editar (perfil, bases, ativo, nome, driverId) e excluir o PERFIL. Nunca o próprio. */
  function usersCard(c) {
    var box = el('div', { id: 'usr-list', 'aria-live': 'polite' }, el('p', { class: 'hint', text: 'Carregando usuários…' })), msg = el('p', { class: 'form-msg', id: 'usr-list-msg', role: 'status' });
    function edit(u) {
      var nm = input('ue-name', 'Nome'), xs = input('ue-xpts', 'Bases (ids separados por vírgula)'), dr = input('ue-driver', 'driverId (só para motorista)');
      nm.i.value = u.name || ''; xs.i.value = (u.xptIds || []).join(','); dr.i.value = u.driverId || '';
      var role = el('select', { id: 'ue-role' }, NS.permissions.PROFILES.map(function (p) { return el('option', { value: p.id, text: p.label, selected: p.id === u.role }); }));
      var act = el('input', { type: 'checkbox', id: 'ue-active', checked: u.active === true }), em = el('p', { class: 'form-msg', id: 'ue-msg', role: 'alert' });
      ui.modal('Editar usuário', el('div', null, el('p', { class: 'hint', text: (u.email || '') + ' · UID ' + u.uid }), nm.f, ui.field('Perfil', role), xs.f, dr.f, el('label', { class: 'check' }, act, ' Ativo (pode entrar)'), em), [
        { label: 'Cancelar', onClick: function (close) { close(); } },
        { label: 'Salvar', cls: 'btn--primary', id: 'ue-save', onClick: function (close) {
          em.textContent = 'Gravando…';
          NS.services.updateUser(root.CXPT_FB, c.user, u.uid, { name: nm.i.value, role: role.value, xptIds: xs.i.value.split(','), driverId: dr.i.value, active: act.checked }).then(function (r) { if (!r.ok) { em.textContent = r.message; return; } close(); load(); });
        } },
      ], { id: 'user-edit-modal' });
    }
    function load() {
      NS.services.listUsers(root.CXPT_FB, c.user).then(function (us) {
        us.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
        box.replaceChildren(us.length ? el('ul', { class: 'why-list' }, us.map(function (u) {
          var me = u.uid === c.user.uid;
          return el('li', { id: 'usr-row-' + u.uid }, (u.name || '(sem nome)') + ' · ' + (u.email || '') + ' · ' + (PLABEL[u.role] || u.role) + ' · bases: ' + ((u.xptIds || []).join(', ') || '—') + (u.driverId ? ' · motorista ' + u.driverId : '') + (u.active === true ? '' : ' · DESATIVADO') + (me ? ' (você)' : '') + ' ',
            me ? null : el('button', { type: 'button', class: 'btn btn--ghost btn--sm', id: 'usr-edit-' + u.uid, onclick: function () { edit(u); } }, 'Editar'), ' ',
            me ? null : el('button', { type: 'button', class: 'btn btn--ghost btn--sm', id: 'usr-del-' + u.uid, onclick: function () {
              ui.confirmModal('Excluir o acesso de ' + (u.name || u.email) + '?', 'O perfil é removido e a pessoa não consegue mais usar o sistema. O login em Authentication continua no Console do Firebase (apague lá se quiser). Os registros já feitos por ela são mantidos.', 'Excluir acesso', function () {
                NS.services.deleteUser(root.CXPT_FB, c.user, u.uid).then(function (r) { msg.textContent = r.ok ? 'Acesso excluído.' : r.message; if (r.ok) load(); });
              });
            } }, 'Excluir'));
        })) : ui.empty('Nenhum usuário cadastrado.'));
      }, function (e) { box.replaceChildren(el('p', { class: 'form-msg', text: 'Não foi possível listar: ' + ((e && (e.code || e.message)) || 'erro') })); });
    }
    load();
    return ui.card('Usuários cadastrados (editar / excluir acesso)', el('div', null, box, msg));
  }
  /** Matriz de permissões editável: salva em settings/permissions e é aplicada pelas REGRAS do Firestore. */
  var permNotice = '';
  function permsCard(c) {
    var P = NS.permissions, msg = el('p', { class: 'form-msg', id: 'perm-msg', role: 'status', text: permNotice }), boxes = {}; permNotice = '';
    var head = el('tr', null, el('th', { text: 'Ação' }), P.EDITABLE_PROFILES.map(function (p) { return el('th', { text: PLABEL[p] }); }), el('th', { text: 'Admin. do sistema' }), el('th', { text: 'Motorista' }));
    var rows = P.EDITABLE.map(function (a) {
      var lab = P.ACTIONS.filter(function (x) { return x.id === a; })[0].label;
      return el('tr', null, el('td', { text: lab }), P.EDITABLE_PROFILES.map(function (p) {
        var cb = el('input', { type: 'checkbox', id: 'perm-' + a + '-' + p, checked: P.can(p, a), 'aria-label': lab + ' — ' + PLABEL[p] }); boxes[a + '|' + p] = cb; return el('td', null, cb);
      }), el('td', { text: 'Sim (fixo)' }), el('td', { text: '—' }));
    });
    return ui.card('Permissões por perfil (editar)', el('div', null,
      ui.callout('info', 'Vale para o servidor também.', 'A matriz fica salva no Firestore e as regras de segurança passam a usá-la. Fixos: o administrador do sistema tem tudo; o motorista só bipa a própria ambulância; só o administrador do sistema administra usuários e bases.'),
      el('div', { class: 'table-wrap' }, el('table', { id: 'perm-table', class: 'table' }, el('thead', null, head), el('tbody', null, rows))),
      el('button', { type: 'button', class: 'btn btn--primary', id: 'perm-save', onclick: function () {
        var doc = {}; P.EDITABLE.forEach(function (a) { doc[a] = P.EDITABLE_PROFILES.filter(function (p) { return boxes[a + '|' + p].checked; }); });
        msg.textContent = 'Gravando…';
        NS.services.savePermissions(root.CXPT_FB, c.user, doc).then(function (r) { if (!r.ok) { msg.textContent = r.message; return; } P.setOverrides(r.doc); permNotice = 'Permissões salvas e aplicadas.'; c.rerender(); });
      } }, 'Salvar permissões'), msg));
  }
  V.setup = function (c) {
    var g = H.guard(c, 'usuarios'); if (g) return g;
    if (c.svc.mode !== 'remoto') return H.page([ui.callout('info', 'Disponível só com o Firebase configurado.', 'Preencha a apiKey em firebase-config.js e entre com o administrador.')]);
    var msg = el('p', { class: 'form-msg', id: 'seed-msg', role: 'status' });
    // Uso real: uma única base inicial (renomeie depois em "Bases"), sem motoristas, regiões ou pacotes fictícios.
    var seed = { xpts: [{ id: 'x1', name: 'XPT Principal', active: true, note: 'Base inicial' }], regions: [], drivers: [], settings: { stayLimitDays: 4, sizes: NS.data.SIZES, reasons: NS.data.REASONS } };
    var hasBase = c.D.xpts.length > 0;
    return H.page([
      hasBase ? null : ui.callout('info', 'Comece criando a base inicial.', 'Cria a base "XPT Principal" e as configurações padrão (tamanhos e motivos). Depois renomeie a base no card "Bases". Nada além disso é criado: sem motoristas, regiões ou pacotes.'),
      hasBase ? null : ui.card('Criar base inicial', el('div', null, el('button', { type: 'button', class: 'btn btn--primary', id: 'seed-btn', onclick: function () {
        msg.textContent = 'Gravando…';
        NS.services.seedTest(root.CXPT_FB, c.user, seed).then(function (r) { if (!r.ok) { msg.textContent = r.message; return; } return done(c); });
      } }, 'Criar base inicial'), msg)),
      diagCard(c), basesCard(c), usersCard(c), userCard(c, seed), driverCard(c), permsCard(c),
    ]);
  };
})(typeof window !== 'undefined' ? window : globalThis);
