/* COOPMETRO XPT — "Configuração inicial" (somente administrador do sistema, somente ambiente de teste).
 * Cria XPTs, regiões, motoristas e configurações de TESTE em env/teste/ apenas quando ainda não existem.
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
      fb.db.get('env/teste/users/' + c.user.uid).then(function (s) { row(s.exists, 'leitura REAL do seu perfil no Firestore (env/teste/users/…)'); return fb.db.get('env/teste/settings/main'); })
        .then(function (s) { row(s.exists, s.exists ? 'configurações encontradas (env/teste/settings/main)' : 'configurações ainda não criadas: use "Criar dados iniciais de teste" abaixo'); },
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
  V.setup = function (c) {
    var g = H.guard(c, 'usuarios'); if (g) return g;
    if (c.svc.mode !== 'remoto') return H.page([ui.callout('info', 'Disponível só com o Firebase configurado.', 'Preencha a apiKey em firebase-config.js e entre com o administrador.')]);
    var msg = el('p', { class: 'form-msg', id: 'seed-msg', role: 'status' });
    var demo = NS.data.createDemoData(Date.now());
    var seed = { xpts: demo.xpts.map(function (x) { return { id: x.id, name: x.name.replace('Demo', 'Teste'), active: x.active, note: 'Base de teste' }; }),
      regions: demo.regions, drivers: demo.drivers, settings: { stayLimitDays: 4, sizes: demo.sizes, reasons: demo.reasons } };
    return H.page([
      ui.callout('info', 'Dados iniciais de TESTE (env/teste).', 'Cria somente o que ainda não existe: ' + seed.xpts.length + ' XPTs, ' + seed.regions.length + ' regiões, ' + seed.drivers.length + ' motoristas e as configurações. Nada é sobrescrito nem apagado.'),
      ui.card('Criar dados iniciais', el('div', null, el('button', { type: 'button', class: 'btn btn--primary', id: 'seed-btn', onclick: function () {
        msg.textContent = 'Gravando…';
        NS.services.seedTest(root.CXPT_FB, c.user, seed).then(function (r) { msg.textContent = r.ok ? r.created + ' documento(s) criado(s); ' + r.existing + ' já existiam e foram mantidos.' : r.message; });
      } }, 'Criar dados iniciais de teste'), msg)),
      diagCard(c), driverCard(c), userCard(c, seed),
      H.demoNote(),
    ]);
  };
})(typeof window !== 'undefined' ? window : globalThis);
