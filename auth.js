/* COOPMETRO XPT — autenticação real (e-mail e senha do Firebase Auth), carregamento do perfil e bloqueio das telas internas.
 * O perfil e as bases vêm do documento protegido env/producao/users/{uid} (criado/alterado só pelo administrador no Console
 * ou por quem as regras autorizarem). A pessoa NUNCA escolhe o próprio perfil. */
(function (root) {
  'use strict';
  var NS = (root.CXPT = root.CXPT || {});
  var ui = NS.ui, el = ui.el;
  var MSG_KEY = 'cxpt-auth-msg';

  var AUTH_ERRORS = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.', 'auth/wrong-password': 'E-mail ou senha incorretos.', 'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/invalid-email': 'E-mail inválido.', 'auth/user-disabled': 'Este usuário foi desativado. Procure o administrador.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.', 'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/missing-password': 'Informe a senha.',
    'auth/operation-not-allowed': 'O login por e-mail e senha não está ativado no Firebase. O administrador deve ativar em Console → Authentication → Sign-in method → E-mail/senha.',
    'auth/unauthorized-domain': 'Este endereço do site não está autorizado no Firebase. O administrador deve incluí-lo em Console → Authentication → Settings → Authorized domains.',
    'auth/invalid-api-key': 'A apiKey em firebase-config.js é inválida. Copie de novo em Console → Configurações do projeto → Seus apps → Coopmetro.',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'A apiKey em firebase-config.js é inválida. Copie de novo em Console → Configurações do projeto → Seus apps → Coopmetro.',
    'auth/app-not-authorized': 'Este app não está autorizado a usar o Firebase com a apiKey informada (confira restrições da chave no Google Cloud).',
    'auth/configuration-not-found': 'O Authentication ainda não foi configurado neste projeto Firebase (Console → Authentication → Primeiros passos).',
    'auth/admin-restricted-operation': 'O acesso por QR Code (login anônimo) não está ativado no Firebase. O administrador deve ativar em Console → Authentication → Sign-in method → Anônimo.',
    'auth/internal-error': 'Erro interno do Firebase Auth. Verifique a apiKey e o domínio autorizado.',
  };
  /** Endereço do QR da ambulância: #/separation/{opId}/{token}. Sem o código no endereço NÃO há acesso de motorista (quem abre o site direto vê o login). */
  function parseLink() {
    var h = (root.location && root.location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    if (h[0] === 'separation' && h[1] && h[2]) { return { opId: decodeURIComponent(h[1]), token: decodeURIComponent(h[2]) }; }
    return null;
  }
  function authMessage(e) { return AUTH_ERRORS[(e && e.code) || ''] || 'Não foi possível entrar. Tente novamente.'; }
  function anonMessage(e) { var c = (e && e.code) || ''; return c === 'auth/operation-not-allowed' || c === 'auth/admin-restricted-operation' ? AUTH_ERRORS['auth/admin-restricted-operation'] : authMessage(e); }

  function roots() { return { auth: document.getElementById('auth-root'), shell: document.querySelector('.shell') }; }
  function showAuth(node) { var r = roots(); r.shell.hidden = true; r.auth.hidden = false; r.auth.replaceChildren(node); }
  function showShell() { var r = roots(); r.auth.hidden = true; r.auth.replaceChildren(); r.shell.hidden = false; }
  function card(title, kids) {
    return el('div', { class: 'auth-card' }, el('img', { src: 'logo-coopmetro.jpg', alt: 'COOPMETRO', width: '72', height: '72', class: 'auth-logo' }), el('h1', { text: title }), kids);
  }

  function loginScreen(fb, note) {
    var email = el('input', { type: 'email', id: 'login-email', name: 'email', autocomplete: 'username', required: true, inputmode: 'email' });
    var pw = el('input', { type: 'password', id: 'login-pass', name: 'password', autocomplete: 'current-password', required: true });
    var msg = el('p', { class: 'form-msg', id: 'login-msg', role: 'status' });
    if (note) msg.textContent = note;
    var go = el('button', { type: 'submit', class: 'btn btn--primary', id: 'login-btn' }, 'Entrar');
    var form = el('form', { id: 'login-form', class: 'auth-form', novalidate: true, onsubmit: function (e) {
      e.preventDefault();
      if (!email.value.trim() || !pw.value) { msg.textContent = 'Informe e-mail e senha.'; return; }
      go.disabled = true; msg.textContent = 'Entrando…';
      fb.auth.signIn(email.value.trim(), pw.value).then(function () { msg.textContent = 'Carregando seus dados…'; }, function (err) { go.disabled = false; pw.value = ''; msg.textContent = authMessage(err); });
    } },
      ui.field('E-mail', email), ui.field('Senha', pw), go,
      el('button', { type: 'button', class: 'btn btn--ghost', id: 'reset-btn', onclick: function () {
        if (!email.value.trim()) { msg.textContent = 'Digite seu e-mail acima e toque de novo em "Esqueci a senha".'; return; }
        fb.auth.sendReset(email.value.trim()).then(function () { msg.textContent = 'Se este e-mail tiver cadastro, enviamos um link para redefinir a senha.'; },
          function (err) { msg.textContent = /network/.test((err && err.code) || '') ? 'Sem conexão com a internet.' : 'Se este e-mail tiver cadastro, enviamos um link para redefinir a senha.'; });
      } }, 'Esqueci a senha'), msg);
    showAuth(card('COOPMETRO XPT — Entrar', [el('p', { class: 'hint', text: 'Use o e-mail e a senha criados pelo administrador.' }), form]));
    email.focus();
  }
  function blockedScreen(fb, title, message) {
    showAuth(card(title, [el('p', { id: 'blocked-msg', role: 'alert', text: message }), el('button', { type: 'button', class: 'btn btn--primary', id: 'blocked-out', onclick: function () { logout(); } }, 'Sair')]));
  }
  function loadingScreen(text) { showAuth(card('COOPMETRO XPT', [el('p', { id: 'auth-loading', role: 'status', text: text })])); }

  function logout() {
    var fb = root.CXPT_FB;
    (fb ? fb.auth.signOut() : Promise.resolve()).catch(function () { /* ignore */ }).then(function () { location.reload(); });
  }

  function boot(startApp) {
    loadingScreen('Verificando acesso…');
    function whenReady(cb) {
      if (root.CXPT_FB) return cb();
      if (root.CXPT_FB_STATE === 'error') return cb();
      var done = false;
      function fin() { if (!done) { done = true; cb(); } }
      root.addEventListener('cxpt-fb-ready', fin); setTimeout(fin, 20000);
    }
    whenReady(function () {
      var fb = root.CXPT_FB;
      if (!fb) { blockedScreen(null, 'Firebase indisponível', 'Não foi possível carregar o Firebase' + (root.CXPT_FB_ERROR ? ' (' + root.CXPT_FB_ERROR + ')' : '') + '. Verifique a internet e a política de segurança do navegador.'); return; }
      var started = false, seen = false, pendingMsg = null, anonTried = false, link = parseLink();
      try { pendingMsg = sessionStorage.getItem(MSG_KEY); sessionStorage.removeItem(MSG_KEY); } catch (_) { /* ignore */ }
      function enter(p) {
        return NS.services.loadAll(fb, p.user).then(function (data) {
          var D = NS.services.applyLoaded(NS.services.emptyD(), data);
          var svc = NS.services.createRemote({ backend: fb, D: D, store: null, user: p.user });
          showShell();
          startApp({ svc: svc, user: p.user, D: D });
        });
      }
      function fail(e) {
        started = false;
        var f = NS.services.failure(e);
        blockedScreen(fb, 'Não foi possível carregar', f.message + (e && e.cxptWhere ? ' [leitura recusada em: ' + NS.services.ENV + '/' + e.cxptWhere + ']' : '') + (f.reason === 'sem_permissao' ? ' (as regras do Firestore recusaram a leitura; confira se as regras foram publicadas e se o seu usuário tem as bases corretas).' : ''));
      }
      fb.auth.onChange(function (u) {
        if (!u) {
          if (started) { try { sessionStorage.setItem(MSG_KEY, 'Sua sessão terminou. Entre novamente.'); } catch (_) { /* ignore */ } location.reload(); return; }
          if (link && fb.auth.signInAnonymously && !anonTried) { // QR da ambulância: entra direto, sem e-mail e senha
            anonTried = true; loadingScreen('Abrindo a sua ambulância…');
            fb.auth.signInAnonymously().catch(function (err) { blockedScreen(fb, 'Não foi possível abrir a ambulância', anonMessage(err)); });
            return;
          }
          seen = true; loginScreen(fb, pendingMsg); return;
        }
        if (started) return;
        started = true;
        if (u.isAnonymous) { // sessão do QR: nunca é perfil de equipe
          var lk = link;
          if (!lk) { started = false; fb.auth.signOut().catch(function () { /* ignore */ }); return; } // site aberto sem QR: encerra a sessão anônima e mostra o login normal (equipe)
          loadingScreen('Abrindo a sua ambulância…');
          NS.services.claimAccess(fb, u, lk).then(function (p) {
            if (!p.ok) { started = false; blockedScreen(fb, 'Ambulância indisponível', p.message); return null; }
            if (!/^#\/separation\//.test(root.location.hash)) { try { history.replaceState(null, '', '#/separation/' + encodeURIComponent(lk.opId) + '/' + encodeURIComponent(lk.token)); } catch (_) { /* ignore */ } }
            return enter(p);
          }).catch(fail);
          return;
        }
        loadingScreen('Carregando seu perfil e os dados da sua base…');
        NS.services.loadProfile(fb, u).then(function (p) {
          if (!p.ok) { started = false; blockedScreen(fb, 'Acesso não liberado', p.message); return null; }
          return enter(p);
        }).catch(fail);
      });
    });
  }

  NS.auth = { boot: boot, logout: logout, authMessage: authMessage };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.auth;
})(typeof window !== 'undefined' ? window : globalThis);
