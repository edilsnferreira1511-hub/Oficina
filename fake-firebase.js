/* COOPMETRO XPT — backend SIMULADO (só para testes). NÃO é o Firebase e NÃO prova nada sobre o Firebase real.
 * Simula: login por e-mail/senha com sessão persistente, Firestore em memória (persistido no armazenamento do navegador de teste),
 * transações com a regra "todas as leituras antes das escritas" e detecção de conflito, e um MODELO das regras de segurança
 * (espelha firestore.rules; rules-lint.test.js compara as listas de perfis para evitar divergência).
 * O arquivo nunca é carregado pela aplicação: os testes o injetam. */
(function (root) {
  'use strict';
  var ROLES = {
    VER_BASE: ['administrador', 'coord_geral', 'supervisor', 'coord_base', 'despacho'],
    ENTRADA: ['despacho'], CONFERIR: ['supervisor', 'coord_base', 'despacho'], OPERACAO: ['administrador', 'supervisor', 'coord_base'],
    CORRECAO: ['administrador', 'supervisor', 'coord_base'], SAIDA: ['supervisor', 'coord_base'], ENCERRAR: ['administrador', 'supervisor'],
    DEVOLUCAO: ['supervisor', 'coord_base'], USUARIOS: ['admin_sistema'], CONFIG: ['admin_sistema', 'administrador'], GLOBAL: ['administrador', 'coord_geral', 'admin_sistema'],
  };
  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }

  function create(opts) {
    opts = opts || {};
    var storage = opts.storage || null, KEY = 'cxpt-fake-fb';
    var S = opts.state || { docs: {}, accounts: [], resets: [], seq: 0 }, session = null; // opts.state: banco compartilhado entre vários "aparelhos"
    if (storage && !opts.state) { try { var raw = storage.getItem(KEY); if (raw) S = JSON.parse(raw); } catch (_) { /* ignore */ } }
    if (storage) { try { var rs = storage.getItem(KEY + '-session'); if (rs) session = JSON.parse(rs); } catch (_) { /* ignore */ } }
    var listeners = [], stats = { txRuns: 0, conflicts: 0 }, forceFail = false, DEL = { __deleted: true };
    function save() { if (storage) { try { storage.setItem(KEY, JSON.stringify(S)); if (session) storage.setItem(KEY + '-session', JSON.stringify(session)); else storage.removeItem(KEY + '-session'); } catch (_) { /* ignore */ } } }
    function sync() { // várias abas/aparelhos de teste compartilham o mesmo "servidor" (armazenamento do navegador de teste)
      if (!storage || opts.state) return;
      try { var raw2 = storage.getItem(KEY); if (raw2) { var p = JSON.parse(raw2); S.docs = p.docs; S.accounts = p.accounts; S.resets = p.resets; } } catch (_) { /* ignore */ }
    }
    function me() { return session ? S.docs['env/teste/users/' + session.uid] : null; }
    function mydata() { var u = me(); return u ? u.data : null; }

    // ----- modelo das regras (espelha firestore.rules)
    function active() { var d = mydata(); return !!(session && d && d.active === true); }
    function role() { return mydata().role; }
    var ACT = { VER_BASE: 'ver_base', ENTRADA: 'entrada', CONFERIR: 'conferir', OPERACAO: 'operacao', CORRECAO: 'correcao', SAIDA: 'confirmar_saida', ENCERRAR: 'encerrar', DEVOLUCAO: 'devolucao', CONFIG: 'config' };
    function permsDoc() { var d = S.docs['env/teste/settings/permissions']; return d ? d.data : null; }
    // lista de perfis de uma ação: documento de permissões (se existir) ou padrão; admin_sistema sempre tem tudo; motorista nunca vem da matriz
    function inR(list) {
      if (!active()) return false;
      if (list === ROLES.USUARIOS || list === ROLES.GLOBAL) return list.indexOf(role()) >= 0;
      if (role() === 'admin_sistema') return true; if (role() === 'motorista') return false;
      var name = Object.keys(ROLES).filter(function (k) { return ROLES[k] === list; })[0], pd = permsDoc();
      if (pd && ACT[name]) { var l = pd[ACT[name]]; return Array.isArray(l) && l.indexOf(role()) >= 0; }
      return list.indexOf(role()) >= 0;
    }
    function hasBase(x) { return active() && (ROLES.GLOBAL.indexOf(role()) >= 0 || (mydata().xptIds || []).indexOf(x) >= 0); }
    function seg(p) { return p.split('/'); }
    function isDriver() { var d = mydata(); return active() && role() === 'motorista' && typeof d.driverId === 'string'; }
    function ownOp(op) { return !!op && isDriver() && op.driverId === mydata().driverId; }
    function canAnyWrite() { return inR(ROLES.ENTRADA) || inR(ROLES.OPERACAO) || inR(ROLES.SAIDA) || inR(ROLES.ENCERRAR) || inR(ROLES.CORRECAO) || inR(ROLES.DEVOLUCAO); }
    function affected(a, b) { var k = {}; Object.keys(a || {}).concat(Object.keys(b || {})).forEach(function (x) { if (JSON.stringify((a || {})[x]) !== JSON.stringify((b || {})[x])) k[x] = 1; }); return Object.keys(k); }
    function onlyKeys(a, b, allowed) { return affected(a, b).every(function (k) { return allowed.indexOf(k) >= 0; }); }
    function prefixSame(oldH, newH) { return newH.length >= oldH.length && JSON.stringify(newH.slice(0, oldH.length)) === JSON.stringify(oldH); }

    function allowed(kind, path, before, after, afterDocs) {
      var s = seg(path);
      if (s[0] !== 'env' || s[1] !== 'teste' || s.length !== 4) return false;
      var col = s[2], id = s[3];
      if (!session) return false;
      if (col === 'users') {
        if (kind === 'get') return session.uid === id || inR(ROLES.USUARIOS);
        if (kind === 'list') return inR(ROLES.USUARIOS);
        if (kind === 'create' || kind === 'update' || kind === 'delete') return inR(ROLES.USUARIOS) && session.uid !== id;
        return false;
      }
      if (col === 'xpts') { if (kind === 'get') return hasBase(id) || inR(ROLES.USUARIOS); if (kind === 'list') return inR(ROLES.GLOBAL) || inR(ROLES.USUARIOS); if (kind === 'create' || kind === 'update') return inR(ROLES.CONFIG) || inR(ROLES.USUARIOS); return false; }
      if (col === 'regions' || col === 'drivers') {
        if (kind === 'get' || kind === 'list') return inR(ROLES.USUARIOS) || (!!before && inR(ROLES.VER_BASE) && hasBase(before.xptId)) || (col === 'drivers' && isDriver() && id === mydata().driverId);
        if (kind === 'create' || kind === 'update') return inR(ROLES.CONFIG);
        return false;
      }
      if (col === 'settings') { if (kind === 'get') return active(); if (kind === 'create' || kind === 'update') return id === 'permissions' ? inR(ROLES.USUARIOS) : inR(ROLES.CONFIG); return false; }
      if (col === 'codes') {
        if (kind === 'get') return inR(ROLES.ENTRADA);
        if (kind === 'create') return inR(ROLES.ENTRADA) && Object.keys(after).every(function (k) { return k === 'createdAt'; });
        return false;
      }
      if (col === 'counters') {
        if (kind === 'get') return inR(ROLES.OPERACAO);
        if (kind === 'create') return inR(ROLES.OPERACAO) && id === 'operations' && after.n === 1;
        if (kind === 'update') return inR(ROLES.OPERACAO) && id === 'operations' && after.n === before.n + 1;
        return false;
      }
      if (col === 'packages') {
        if (kind === 'get' || kind === 'list') return !!before && inR(ROLES.VER_BASE) && hasBase(before.xptId);
        if (kind === 'create') {
          return inR(ROLES.ENTRADA) && hasBase(after.xptId) && id === 'pk-' + after.code && !!afterDocs['env/teste/codes/' + after.code]
            && after.state === 'em_estoque' && after.activeOpId === null && after.history.length === 1;
        }
        if (kind === 'update') {
          if (!(canAnyWrite() && hasBase(before.xptId))) return false;
          if (!onlyKeys(before, after, ['state', 'activeOpId', 'history', 'location', 'cycle', 'returns', 'entryAt', 'size', 'reasonId', 'note'])) return false;
          if (!prefixSame(before.history, after.history)) return false;
          var a = before.state, b = after.state;
          var trans = a === b || (a === 'em_estoque' && b === 'em_separacao' && inR(ROLES.OPERACAO)) || (a === 'em_separacao' && b === 'em_rota' && inR(ROLES.SAIDA))
            || (a === 'em_separacao' && b === 'em_estoque' && (inR(ROLES.ENCERRAR) || inR(ROLES.CORRECAO))) || (a === 'em_rota' && b === 'em_estoque' && (inR(ROLES.ENTRADA) || inR(ROLES.CORRECAO)))
            || (a === 'em_rota' && b === 'entregue' && (inR(ROLES.CORRECAO) || inR(ROLES.SAIDA))) || (['aguardando_devolucao', 'devolvido'].indexOf(b) >= 0 && inR(ROLES.DEVOLUCAO))
            || (['divergente', 'em_estoque'].indexOf(b) >= 0 && inR(ROLES.CORRECAO));
          var la = before.activeOpId, lb = after.activeOpId;
          var lock = la === lb || (la === null && typeof lb === 'string' && inR(ROLES.OPERACAO) && before.state === 'em_estoque') || (typeof la === 'string' && lb === null && inR(ROLES.ENCERRAR));
          return trans && lock;
        }
        return false;
      }
      if (col === 'operations') {
        var drv = ownOp(before);
        if (kind === 'get' || kind === 'list') return !!before && ((inR(ROLES.VER_BASE) && hasBase(before.xptId)) || drv);
        if (kind === 'create') return inR(ROLES.OPERACAO) && hasBase(after.xptId) && after.state === 'em_separacao' && !!afterDocs['env/teste/counters/operations'];
        if (kind === 'update') {
          if (before.state === 'encerrada' || !hasBase(before.xptId) || after.xptId !== before.xptId || !prefixSame(before.history, after.history)) return false;
          if (!onlyKeys(before, after, ['checked', 'history', 'state', 'departed', 'closedAt', 'closedBy', 'pendingAtClose'])) return false;
          return (after.state === before.state && inR(ROLES.CONFERIR) && onlyKeys(before, after, ['checked', 'history']))
            || (after.state === before.state && drv && onlyKeys(before, after, ['checked', 'history']) && Object.keys(before.checked || {}).every(function (k) { return !!(after.checked || {})[k]; })
              && Object.keys(after.checked || {}).every(function (k) { return (before.packageCodes || []).indexOf(k) >= 0; }))
            || (before.state === 'em_separacao' && after.state === 'saida_confirmada' && inR(ROLES.SAIDA)) || (after.state === 'encerrada' && inR(ROLES.ENCERRAR));
        }
        return false;
      }
      if (col === 'events') {
        if (kind !== 'create') return false;
        var opDoc = typeof after.opId === 'string' && S.docs['env/teste/operations/' + after.opId] ? S.docs['env/teste/operations/' + after.opId].data : null;
        return (canAnyWrite() || inR(ROLES.CONFERIR) || isDriver()) && after.uid === session.uid && hasBase(after.xptId) && (!isDriver() || (typeof after.opId === 'string' && !!opDoc && opDoc.driverId === mydata().driverId));
      }
      return false;
    }

    // ----- Firestore simulado
    function readDoc(path) { sync(); var d = S.docs[path]; return d ? { exists: true, data: clone(d.data), v: d.v } : { exists: false, data: null, v: 0 }; }
    var db = {
      get: function (path) {
        return Promise.resolve().then(function () {
          var r = readDoc(path);
          if (!allowed('get', path, r.data, null, {})) throw err('permission-denied', 'Missing or insufficient permissions.');
          return { exists: r.exists, data: r.data };
        });
      },
      list: function (col, wheres) {
        return Promise.resolve().then(function () {
          sync(); var out = [];
          Object.keys(S.docs).forEach(function (p) {
            var s = seg(p); if (s.slice(0, 3).join('/') !== col || s.length !== 4) return;
            var d = S.docs[p].data;
            if (wheres.every(function (w) { return w[1] === '==' ? d[w[0]] === w[2] : w[1] === 'in' ? w[2].indexOf(d[w[0]]) >= 0 : false; })) out.push({ id: s[3], data: clone(d), path: p });
          });
          // como no Firestore: a consulta inteira é recusada se algum documento possível não for permitido
          if (out.some(function (o) { return !allowed('list', o.path, o.data, null, {}); })) throw err('permission-denied', 'Missing or insufficient permissions.');
          if (!out.length && !session) throw err('permission-denied');
          return out.map(function (o) { return { id: o.id, data: o.data }; });
        });
      },
      runTransaction: function (fn) {
        var attempt = 0;
        function once() {
          attempt++; stats.txRuns++;
          var reads = {}, writes = {}, wrote = false;
          var tx = {
            get: function (path) {
              return Promise.resolve().then(function () {
                if (wrote) throw new Error('Firestore: todas as leituras de uma transação devem vir antes das escritas.');
                var r = readDoc(path);
                if (!allowed('get', path, r.data, null, {})) throw err('permission-denied', 'Missing or insufficient permissions.');
                reads[path] = r.v; return { exists: r.exists, data: r.data };
              });
            },
            set: function (path, data) { wrote = true; writes[path] = clone(data); },
            delete: function (path) { wrote = true; writes[path] = DEL; },
            update: function (path, data) { wrote = true; var cur = writes[path] || (S.docs[path] && S.docs[path].data); if (!cur || cur === DEL) throw err('not-found'); writes[path] = Object.assign({}, clone(cur), clone(data)); },
          };
          return Promise.resolve(fn(tx)).then(function (result) {
            return Promise.resolve().then(function () {
              sync(); if (opts.beforeCommit) opts.beforeCommit(attempt, S);
              // conflito: algum documento lido mudou desde a leitura
              if (Object.keys(reads).some(function (p) { return (S.docs[p] ? S.docs[p].v : 0) !== reads[p]; })) {
                stats.conflicts++; if (attempt >= 5) throw err('aborted', 'Too much contention'); return once();
              }
              var paths = Object.keys(writes);
              if ((opts.failCommit && opts.failCommit()) || forceFail) throw err('unavailable', 'Network down');
              // limites do Firestore real: 500 gravações por transação; 20 acessos a documentos distintos pelas regras (get/exists/existsAfter)
              if (paths.length > 500) throw err('invalid-argument', 'maximum 500 writes allowed per request');
              var access = {}; paths.forEach(function (p) { var q = seg(p); if (writes[p] !== DEL && q[2] === 'packages' && !S.docs[p]) access['codes/' + writes[p].code] = 1; if (writes[p] !== DEL && q[2] === 'operations' && !S.docs[p]) access['counters/operations'] = 1; if (writes[p] !== DEL && q[2] === 'events' && writes[p].opId && isDriver()) access['operations/' + writes[p].opId] = 1; });
              if (2 + Object.keys(access).length > 20) /* 1 perfil do usuário + 1 documento de permissões + distintos */ throw err('permission-denied', 'Too many document access calls in rules (limit 20)');
              var after = {}; paths.forEach(function (p) { after[p] = writes[p]; });
              paths.forEach(function (p) {
                var ex = S.docs[p], kind = writes[p] === DEL ? 'delete' : ex ? 'update' : 'create';
                var allDocs = Object.assign({}, after); Object.keys(S.docs).forEach(function (k) { if (!allDocs[k]) allDocs[k] = S.docs[k].data; });
                if (!allowed(kind, p, ex ? clone(ex.data) : null, writes[p] === DEL ? null : writes[p], allDocs)) throw err('permission-denied', 'Missing or insufficient permissions (' + kind + ' ' + p + ').');
              });
              paths.forEach(function (p) { if (writes[p] === DEL) delete S.docs[p]; else S.docs[p] = { data: writes[p], v: (S.docs[p] ? S.docs[p].v : 0) + 1 }; });
              save();
              return result;
            });
          });
        }
        return once();
      },
    };

    // ----- Auth simulado
    function toUser(a) { return a ? { uid: a.uid, email: a.email, displayName: null } : null; }
    function notify() { var u = session ? toUser(S.accounts.filter(function (a) { return a.uid === session.uid; })[0]) : null; listeners.slice().forEach(function (cb) { cb(u); }); }
    var auth = {
      onChange: function (cb) { listeners.push(cb); Promise.resolve().then(function () { cb(session ? toUser(S.accounts.filter(function (a) { return a.uid === session.uid; })[0]) : null); }); return function () { listeners = listeners.filter(function (x) { return x !== cb; }); }; },
      signIn: function (email, pw) {
        return Promise.resolve().then(function () {
          if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw err('auth/invalid-email');
          var a = S.accounts.filter(function (x) { return x.email === String(email).toLowerCase(); })[0];
          if (!a || a.password !== pw) throw err('auth/invalid-credential');
          if (a.disabled) throw err('auth/user-disabled');
          session = { uid: a.uid }; save(); notify(); return toUser(a);
        });
      },
      signOut: function () { session = null; save(); notify(); return Promise.resolve(); },
      sendReset: function (email) { S.resets.push(email); save(); return Promise.resolve(); },
    };
    var admin = { // atalhos de teste que IGNORAM as regras (como o Console faria)
      addAccount: function (email, password, uid) { S.accounts.push({ email: email.toLowerCase(), password: password, uid: uid }); save(); },
      setDoc: function (path, data) { S.docs[path] = { data: clone(data), v: (S.docs[path] ? S.docs[path].v : 0) + 1 }; save(); },
      getDoc: function (path) { sync(); return S.docs[path] ? clone(S.docs[path].data) : null; },
      listDocs: function (col) { sync(); return Object.keys(S.docs).filter(function (p) { return p.indexOf(col + '/') === 0 && seg(p).length === seg(col).length + 1; }).map(function (p) { return { path: p, data: clone(S.docs[p].data) }; }); },
      setFail: function (on) { forceFail = !!on; },
      expireSession: function () { session = null; save(); notify(); },
      resets: function () { return S.resets.slice(); },
      stats: stats, reset: function () { S.docs = {}; S.accounts = []; S.resets = []; session = null; save(); },
      state: function () { return S; },
    };
    return { kind: 'simulado', auth: auth, db: db, _admin: admin, ROLES: ROLES };
  }
  var api = { create: create, ROLES: ROLES };
  root.CXPT_FAKE_FIREBASE = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
