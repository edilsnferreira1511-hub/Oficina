/* COOPMETRO XPT — adaptador do Firebase (módulo ES). Só carrega o SDK quando firebase-config.js tem apiKey.
 * Expõe window.CXPT_FB = { auth, db } com a interface que services.js/auth.js usam (a mesma do backend simulado dos testes):
 *   auth: onChange(cb), signIn(email, senha), signOut(), sendReset(email)
 *   db:   get(path), list(colecao, [[campo, op, valor]]), runTransaction(async tx => ...)  com tx.get / tx.set / tx.update
 * Não usa Analytics, nem popup/redirect de login, nem Cloud Functions. */
(function () {
  var cfg = window.CXPT_FIREBASE;
  if (window.CXPT_FB || !cfg || !cfg.config || !cfg.config.apiKey) return;
  window.CXPT_FB_STATE = 'loading';
  var base = 'https://www.gstatic.com/firebasejs/' + cfg.sdkVersion + '/';
  Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]).then(function (m) {
    var A = m[0], Au = m[1], F = m[2];
    var app = A.initializeApp(cfg.config);
    var auth = Au.initializeAuth(app, { persistence: Au.browserLocalPersistence }); // sem iframe/popup
    var db = F.initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
    function ref(p) { return F.doc.apply(null, [db].concat(p.split('/'))); }
    function snap(s) { return { exists: s.exists(), data: s.exists() ? s.data() : null }; }
    function toUser(u) { return u ? { uid: u.uid, email: u.email, displayName: u.displayName } : null; }
    window.CXPT_FB = {
      kind: 'real', // FIREBASE REAL (SDK oficial contra o projeto); o backend dos testes automatizados usa kind 'simulado'
      auth: {
        onChange: function (cb) { return Au.onAuthStateChanged(auth, function (u) { cb(toUser(u)); }); },
        signIn: function (email, pw) { return Au.signInWithEmailAndPassword(auth, email, pw).then(function (c) { return toUser(c.user); }); },
        signOut: function () { return Au.signOut(auth); },
        sendReset: function (email) { return Au.sendPasswordResetEmail(auth, email); },
      },
      db: {
        get: function (p) { return F.getDoc(ref(p)).then(snap); },
        list: function (col, wheres) {
          var parts = [F.collection.apply(null, [db].concat(col.split('/')))].concat(wheres.map(function (w) { return F.where(w[0], w[1], w[2]); }));
          return F.getDocs(F.query.apply(null, parts)).then(function (s) { return s.docs.map(function (d) { return { id: d.id, data: d.data() }; }); });
        },
        runTransaction: function (fn) {
          return F.runTransaction(db, function (t) {
            var tx = {
              get: function (p) { return t.get(ref(p)).then(snap); },
              set: function (p, d) { t.set(ref(p), d); },
              update: function (p, d) { t.update(ref(p), d); },
              delete: function (p) { t.delete(ref(p)); },
            };
            return fn(tx);
          });
        },
      },
    };
    window.CXPT_FB_STATE = 'ready'; window.dispatchEvent(new Event('cxpt-fb-ready'));
  }).catch(function (e) {
    window.CXPT_FB_STATE = 'error'; window.CXPT_FB_ERROR = String((e && e.message) || e); window.dispatchEvent(new Event('cxpt-fb-ready'));
  });
})();
