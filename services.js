/* COOPMETRO XPT — camada de serviços: TODA gravação passa por aqui e devolve Promise.
 *  - modo "demo": executa as funções puras em memória (sem rede), como na versão anterior;
 *  - modo "remoto": executa as MESMAS funções puras dentro de uma transação do Firestore (leitura antes de escrita,
 *    dados lidos na hora, sem confiar no cache da tela). Só depois da transação confirmada o cache local é atualizado:
 *    a interface nunca mostra "salvo" antes de a gravação ser confirmada.
 * O backend é abstrato (CXPT_FB: auth + db), assim o mesmo código roda com o Firebase real (firebase-adapter.js)
 * ou com o backend simulado dos testes (fake-firebase.js).
 * Segurança: as verificações daqui servem à experiência; a autorização verdadeira está em firestore.rules. */
(function (root) {
  'use strict';
  var NS = (root.CXPT = root.CXPT || {});
  // caminho dos dados no Firestore (firebase-config.js → dataPath). Tudo vive sob esse caminho; nada fora dele é lido nem escrito.
  // Padrão 'env/teste' só para a bateria de testes automatizados; o firebase-config.js entregue usa 'env/producao'.
  var ENV = (root.CXPT_FIREBASE && root.CXPT_FIREBASE.dataPath) || 'env/teste';

  function clean(o) { return JSON.parse(JSON.stringify(o)); } // Firestore não aceita undefined
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function path(col, id) { return ENV + '/' + col + '/' + id; }
  function rnd() {
    var a = new Uint32Array(2);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(a); else { a[0] = Math.random() * 4294967295; a[1] = Math.random() * 4294967295; }
    return a[0].toString(36) + a[1].toString(36);
  }
  function pkgIdFor(code) { return 'pk-' + code; }

  /** Traduz erro do backend em mensagem para a pessoa (sem vazar detalhes técnicos demais). */
  function failure(e) {
    var code = (e && e.code) || '';
    if (/unauthenticated/.test(code)) return { ok: false, reason: 'sessao_expirada', message: 'Sua sessão terminou. Entre novamente.' };
    if (/permission-denied/.test(code)) return { ok: false, reason: 'sem_permissao', message: 'O servidor recusou a operação: seu perfil ou sua base não têm permissão. Nada foi gravado.' };
    if (/unavailable|network|deadline/.test(code)) return { ok: false, reason: 'rede', message: 'Sem conexão com o servidor. Nada foi gravado; tente novamente.' };
    if (e && e.cxpt) return { ok: false, reason: e.cxpt, message: e.message };
    return { ok: false, reason: 'erro', message: 'Não foi possível gravar (' + (e && (e.code || e.message) || 'erro') + '). Nada foi gravado.' };
  }
  function abort(reason, message) { var e = new Error(message); e.cxpt = reason; return e; }

  // =====================================================================================================
  // Modo demo (memória)
  // =====================================================================================================
  function createDemo(D, store) {
    var P = NS.permissions, A = NS.ambulance, R = NS.registry;
    function ok(who, action) { return P.can(who.profile, action); }
    return {
      mode: 'demo',
      refresh: function () { return Promise.resolve({ ok: true }); },
      registerEntries: function (xptId, items, who) {
        return Promise.resolve(R.registerEntries(D, xptId, items, { nowMs: store.nowMs(), operator: who.operator }));
      },
      registerReentry: function (xptId, code, extra, who) {
        return Promise.resolve(R.registerReentry(D, xptId, code, Object.assign({ nowMs: store.nowMs(), operator: who.operator }, extra)));
      },
      createAmbulance: function (xptId, form, who) {
        return Promise.resolve(A.createAmbulance(D, xptId, form, { authorized: ok(who, 'operacao'), nowMs: store.nowMs(), operator: who.operator }));
      },
      scan: function (op, raw, who) {
        var mine = ok(who, 'conferir_propria') && !!who.driverId && op.driverId === who.driverId; // motorista: só a própria ambulância
        return Promise.resolve(A.scan(D, op, raw, { authorized: ok(who, 'conferir') || mine, nowMs: store.nowMs(), operator: who.operator }));
      },
      unscan: function (op, code, who) { return Promise.resolve(A.unscan(D, op, code, { nowMs: store.nowMs(), operator: who.operator })); },
      confirmExit: function (op, who) {
        return Promise.resolve(A.confirmExit(D, op, { authorized: ok(who, 'confirmar_saida'), nowMs: store.nowMs(), operator: who.operator }));
      },
      closeOperation: function (op, who) {
        return Promise.resolve(A.closeOperation(D, op, { authorized: ok(who, 'encerrar'), nowMs: store.nowMs(), operator: who.operator }));
      },
      transition: function (pkg, to, extra, who) {
        var r = NS.packages.transition(pkg, to, Object.assign({ nowMs: store.nowMs(), operator: who.operator }, extra));
        if (r.ok) R.replacePackage(D, r.pkg);
        return Promise.resolve(r);
      },
    };
  }

  // =====================================================================================================
  // Modo remoto (Firestore em transações)
  // =====================================================================================================
  function createRemote(opts) {
    var fb = opts.backend, D = opts.D, store = opts.store, user = opts.user; // user: {uid, email, name, role, xptIds, driverId}
    var P = NS.permissions, A = NS.ambulance, R = NS.registry;
    function nowMs() { return Math.max(Date.now(), 1); }
    function can(action) { return P.can(user.role, action); }
    function mini() {
      return { nowMs: nowMs(), demo: false, sizes: D.sizes, reasons: D.reasons, drivers: D.drivers, regions: D.regions, xpts: D.xpts, settings: D.settings, packages: [], operations: [] };
    }
    function getMaybe(tx, p) { // leitura recusada por regra = "não encontrado" (não revela que existe em outra base)
      return tx.get(p).catch(function (e) { if (/permission-denied/.test((e && e.code) || '')) return { exists: false, data: null, denied: true }; throw e; });
    }
    function evDoc(e, extra) { return clean(Object.assign({}, e, { uid: user.uid }, extra, { xptId: e.xptId || (extra && extra.xptId) || null })); }
    function putEvent(tx, e, extra) { tx.set(path('events', Date.now() + '-' + rnd()), evDoc(e, extra)); }
    function newEvents(before, after) { return after.history.slice(before ? before.history.length : 0); }

    // ---- cache local: só depois da transação confirmada
    function mergePkg(p) {
      var i = D.packages.findIndex(function (x) { return x.id === p.id; });
      if (i >= 0) D.packages[i] = p; else D.packages.push(p);
      if (store && store.index && store.index.add) { try { store.index.add(p); } catch (_) { /* ignore */ } }
    }
    function mergeOp(o) {
      var cur = D.operations.filter(function (x) { return x.id === o.id; })[0];
      if (cur) { Object.keys(cur).forEach(function (k) { delete cur[k]; }); Object.assign(cur, o); return cur; }
      D.operations.push(o); return o;
    }

    function run(fn) { return fb.db.runTransaction(fn).catch(function (e) { return failure(e); }); }

    function loadFresh(tx, ids, col) { // leituras primeiro
      return Promise.all(ids.map(function (id) { return tx.get(path(col, id)); }));
    }

    var svc = {
      mode: 'remoto', user: user,
      refresh: function () { return loadAll(fb, user).then(function (data) { applyLoaded(D, data); return { ok: true }; }).catch(failure); },

      registerEntries: function (xptId, items) {
        if (!can('entrada')) return Promise.resolve({ created: [], skipped: items.map(function (i) { return { code: i.code, reason: 'sem_permissao' }; }), error: 'Seu perfil não pode registrar entradas.' });
        var chunks = [], i;
        for (i = 0; i < items.length; i += 15) chunks.push(items.slice(i, i + 15)); // regras do Firestore: no máximo 20 acessos a documentos por transação (1 'codes' por pacote)
        var total = { created: [], skipped: [] };
        return chunks.reduce(function (chain, chunk) {
          return chain.then(function () {
            return fb.db.runTransaction(function (tx) {
              var m = mini(), codes = chunk.map(function (it) { return NS.codes.validate(it.code); }).filter(function (v) { return v.ok; }).map(function (v) { return v.code; });
              return Promise.all(codes.map(function (c) { return tx.get(path('codes', c)); })).then(function (res) {
                res.forEach(function (r, k) { if (r.exists) m.packages.push({ id: '?' + codes[k], code: codes[k], xptId: '?' }); });
                var r = R.registerEntries(m, xptId, chunk, { nowMs: nowMs(), operator: user.name, idFor: pkgIdFor });
                r.created.forEach(function (p) {
                  tx.set(path('codes', p.code), { createdAt: p.entryAt });
                  tx.set(path('packages', p.id), clean(p));
                  p.history.forEach(function (e) { putEvent(tx, e, { pkgId: p.id }); });
                });
                return r;
              });
            }).then(function (r) { r.created.forEach(mergePkg); total.created = total.created.concat(r.created); total.skipped = total.skipped.concat(r.skipped); })
              .catch(function (e) { var f = failure(e); chunk.forEach(function (it) { total.skipped.push({ code: it.code, reason: f.reason, message: f.message }); }); total.error = f.message; });
          });
        }, Promise.resolve()).then(function () { return total; });
      },

      registerReentry: function (xptId, rawCode, extra) {
        var v = NS.codes.validate(rawCode);
        if (!v.ok) return Promise.resolve({ ok: false, reason: v.message });
        return run(function (tx) {
          return getMaybe(tx, path('packages', pkgIdFor(v.code))).then(function (s) {
            if (!s.exists || s.data.xptId !== xptId) throw abort('nao_encontrado', 'Código não encontrado nesta base.');
            var m = mini(); m.packages.push(clean(s.data));
            var r = R.registerReentry(m, xptId, v.code, Object.assign({ nowMs: nowMs(), operator: user.name }, extra));
            if (!r.ok) throw abort('invalido', r.reason);
            tx.set(path('packages', r.pkg.id), clean(r.pkg));
            newEvents(s.data, r.pkg).forEach(function (e) { putEvent(tx, e, { pkgId: r.pkg.id }); });
            return r;
          });
        }).then(function (r) { if (r.ok) { mergePkg(r.pkg); return r; } return { ok: false, reason: r.message || r.reason }; });
      },

      createAmbulance: function (xptId, form) {
        if (!can('operacao')) return Promise.resolve({ ok: false, reason: 'sem_permissao', message: 'Seu perfil não pode criar operações.' });
        var ids = (form.packageIds || []).filter(function (id, i, a) { return a.indexOf(id) === i; });
        // atualiza as operações conhecidas ANTES (cor livre e "um motorista, uma ambulância" usam este conhecimento; o bloqueio de pacote duplicado é da transação)
        return loadAll(fb, user).then(function (data) { applyLoaded(D, data); }, function () { /* sem rede: a transação abaixo falha com mensagem clara */ }).then(function () { return run(function (tx) {
          return Promise.all([tx.get(path('counters', 'operations')), loadFresh(tx, ids, 'packages')]).then(function (res) {
            var counter = res[0], n = counter.exists ? counter.data.n : 0, fresh = res[1];
            var m = mini();
            fresh.forEach(function (s, k) {
              if (!s.exists) return;
              var p = clean(s.data); m.packages.push(p);
              if (p.activeOpId) m.operations.push({ id: p.activeOpId, xptId: p.xptId, state: 'em_separacao', packageIds: [p.id], checked: {}, history: [] });
            });
            if (n > 0) m.operations.push({ id: 'OP-' + pad(n, 4), xptId: xptId, state: 'encerrada', packageIds: [], checked: {}, history: [] }); // só para a próxima numeração
            var before = {}; m.packages.forEach(function (p) { before[p.id] = p; });
            var r = A.createAmbulance(m, xptId, form, { authorized: true, nowMs: nowMs(), operator: user.name, knownOps: D.operations });
            if (!r.ok) throw Object.assign(abort(r.reason || 'invalido', r.message || Object.keys(r.errors || {}).map(function (k) { return r.errors[k]; }).join(' ')), { detail: r });
            var op = r.op;
            op.packageCodes = op.packageIds.map(function (id) { return m.packages.filter(function (p) { return p.id === id; })[0].code; });
            var touched = [];
            m.packages.forEach(function (p) {
              if (op.packageIds.indexOf(p.id) < 0) return;
              p.activeOpId = op.id; touched.push(p);
              tx.set(path('packages', p.id), clean(p));
              newEvents(before[p.id], p).forEach(function (e) { putEvent(tx, e, { pkgId: p.id, opId: op.id }); });
            });
            tx.set(path('operations', op.id), clean(op));
            tx.set(path('counters', 'operations'), { n: n + 1 });
            op.history.forEach(function (e) { putEvent(tx, e, { opId: op.id, xptId: xptId }); });
            return { ok: true, op: op, pkgs: touched };
          });
        }).then(function (r) { if (r.ok) { r.pkgs.forEach(mergePkg); r.op = mergeOp(r.op); delete r.pkgs; } return r.ok ? r : (r.detail || r); }); });
      },

      scan: function (op, raw) {
        var driverMode = user.role === 'motorista';
        if (!(can('conferir') || (can('conferir_propria') && driverMode && !!user.driverId && op.driverId === user.driverId))) return Promise.resolve({ status: 'sem_permissao', message: 'Seu perfil não pode conferir pacotes desta operação.' });
        var v = NS.codes.validate(raw);
        return fb.db.runTransaction(function (tx) {
          return tx.get(path('operations', op.id)).then(function (os) {
            if (!os.exists) throw abort('op', 'Operação não encontrada.');
            var o = clean(os.data), m = mini(); m.operations.push(o);
            m.packages = (o.packageCodes || []).map(function (c, i) { return { id: o.packageIds[i], code: c, xptId: o.xptId, state: 'em_separacao' }; });
            var inOp = v.ok && o.packageCodes.indexOf(v.code) >= 0;
            var more = !v.ok || inOp || !A.isActive(o) || driverMode ? Promise.resolve(null) : getMaybe(tx, path('packages', pkgIdFor(v.code))); // motorista nunca lê a coleção de pacotes
            return more.then(function (ps) {
              var other = Promise.resolve(null);
              if (ps && ps.exists && ps.data.xptId === o.xptId) {
                m.packages.push(clean(ps.data));
                if (ps.data.activeOpId && ps.data.activeOpId !== o.id) other = getMaybe(tx, path('operations', ps.data.activeOpId));
              }
              return other.then(function (xs) {
                if (xs && xs.exists) m.operations.push(clean(xs.data));
                var before = JSON.stringify(o.checked || {}) + (o.history || []).length;
                var r = A.scan(m, o, raw, { authorized: true, nowMs: nowMs(), operator: user.name });
                if (r.status === 'ok') { tx.set(path('operations', o.id), clean(o)); newEvents({ history: os.data.history || [] }, o).forEach(function (e) { putEvent(tx, e, { opId: o.id, xptId: o.xptId }); }); }
                return { r: r, op: o, changed: r.status === 'ok' };
              });
            });
          });
        }).then(function (x) { if (x.changed) mergeOp(x.op); return x.r; }, function (e) { var f = failure(e); return { status: f.reason === 'sem_permissao' ? 'sem_permissao' : 'erro', message: f.message }; });
      },

      unscan: function (op, code) {
        if (!can('conferir')) return Promise.resolve(false); // motorista não remove leituras
        return fb.db.runTransaction(function (tx) {
          return tx.get(path('operations', op.id)).then(function (os) {
            if (!os.exists) return { done: false };
            var o = clean(os.data), m = mini(); m.operations.push(o);
            var done = A.unscan(m, o, code, { nowMs: nowMs(), operator: user.name });
            if (done) { tx.set(path('operations', o.id), clean(o)); newEvents({ history: os.data.history || [] }, o).forEach(function (e) { putEvent(tx, e, { opId: o.id, xptId: o.xptId }); }); }
            return { done: done, op: o };
          });
        }).then(function (x) { if (x.done) mergeOp(x.op); return x.done; }, function () { return false; });
      },

      confirmExit: function (op) { return opFlow(op, 'confirmar_saida', A.confirmExit, false); },
      closeOperation: function (op) { return opFlow(op, 'encerrar', A.closeOperation, true); },

      transition: function (pkg, to, extra) {
        return run(function (tx) {
          return tx.get(path('packages', pkg.id)).then(function (s) {
            if (!s.exists) throw abort('nao_encontrado', 'Pacote não encontrado.');
            var r = NS.packages.transition(clean(s.data), to, Object.assign({ nowMs: nowMs(), operator: user.name }, extra));
            if (!r.ok) throw abort('regra', r.reason);
            tx.set(path('packages', r.pkg.id), clean(r.pkg)); putEvent(tx, r.event, { pkgId: r.pkg.id });
            return r;
          });
        }).then(function (r) { if (r.ok) { mergePkg(r.pkg); return r; } return { ok: false, reason: r.message || r.reason }; });
      },
    };

    function opFlow(op, action, fn, releaseLocks) {
      if (!can(action)) return Promise.resolve({ ok: false, reason: 'sem_permissao', message: 'Seu perfil não pode executar esta ação.' });
      return run(function (tx) {
        return tx.get(path('operations', op.id)).then(function (os) {
          if (!os.exists) throw abort('op', 'Operação não encontrada.');
          var o = clean(os.data);
          return loadFresh(tx, o.packageIds, 'packages').then(function (res) {
            var m = mini(); m.operations.push(o);
            res.forEach(function (s) { if (s.exists) m.packages.push(clean(s.data)); });
            var before = {}; m.packages.forEach(function (p) { before[p.id] = clean(p); });
            var r = fn(m, o, { authorized: true, nowMs: nowMs(), operator: user.name });
            if (!r.ok) throw Object.assign(abort(r.reason || 'regra', r.message || 'Ação não permitida.'), { detail: r });
            var pkgs = [];
            m.packages.forEach(function (p) {
              if (releaseLocks) p.activeOpId = null;
              var changed = p.history.length !== before[p.id].history.length || (releaseLocks && before[p.id].activeOpId);
              if (!changed) return;
              pkgs.push(p); tx.set(path('packages', p.id), clean(p));
              newEvents(before[p.id], p).forEach(function (e) { putEvent(tx, e, { pkgId: p.id, opId: o.id }); });
            });
            tx.set(path('operations', o.id), clean(o));
            newEvents({ history: os.data.history || [] }, o).forEach(function (e) { putEvent(tx, e, { opId: o.id, xptId: o.xptId }); });
            return Object.assign({}, r, { _op: o, _pkgs: pkgs });
          });
        });
      }).then(function (r) {
        if (r && r._op) { r._pkgs.forEach(mergePkg); mergeOp(r._op); delete r._op; delete r._pkgs; }
        return r && r.detail ? r.detail : r;
      });
    }

    return svc;
  }

  // =====================================================================================================
  // Carga inicial (somente leitura): perfil, base e dados das XPTs autorizadas
  // =====================================================================================================
  var GLOBAL_ROLES = ['administrador', 'coord_geral', 'admin_sistema'];
  function chunk(a, n) { var o = []; for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }

  function loadProfile(fb, authUser) {
    return fb.db.get(path('users', authUser.uid)).then(function (s) {
      if (!s.exists) return { ok: false, reason: 'sem_cadastro', message: 'Seu usuário ainda não foi liberado. Peça ao administrador para criar o seu cadastro (' + ENV + '/users/' + authUser.uid + ').' };
      var u = s.data || {};
      if (u.active !== true) return { ok: false, reason: 'inativo', message: 'Seu usuário está desativado. Procure o administrador.' };
      if (!NS.permissions.PROFILES.some(function (p) { return p.id === u.role; })) return { ok: false, reason: 'perfil_invalido', message: 'O perfil cadastrado para você não é reconhecido. Procure o administrador.' };
      return { ok: true, user: { uid: authUser.uid, email: authUser.email, name: u.name || authUser.displayName || authUser.email, role: u.role, xptIds: Array.isArray(u.xptIds) ? u.xptIds : [], driverId: u.driverId || null } };
    });
  }

  function tag(where, p) { return p.catch(function (e) { if (e && typeof e === 'object') e.cxptWhere = where; throw e; }); }
  function loadAll(fb, user) {
    var global = GLOBAL_ROLES.indexOf(user.role) >= 0; // inclui admin_sistema (acesso a todas as telas)
    var ids = user.xptIds.slice();
    function byXpt(col) {
      if (global) return fb.db.list(ENV + '/' + col, []);
      return Promise.all(ids.map(function (id) { return fb.db.list(ENV + '/' + col, [['xptId', '==', id]]); })).then(function (parts) { return [].concat.apply([], parts); });
    }
    var xpts = global ? fb.db.list(ENV + '/xpts', []) : Promise.all(ids.map(function (id) { return fb.db.get(path('xpts', id)).then(function (s) { return s.exists ? [{ id: id, data: s.data }] : []; }); })).then(function (p) { return [].concat.apply([], p); });
    var isDriver = user.role === 'motorista';
    var ops = isDriver ? (user.driverId ? fb.db.list(ENV + '/operations', [['driverId', '==', user.driverId]]) : Promise.resolve([])) : byXpt('operations');
    // motorista: nada de listas gerais (regiões, motoristas, pacotes): só o próprio cadastro de motorista e as próprias operações
    var regions = isDriver ? Promise.resolve([]) : byXpt('regions');
    var drivers = isDriver ? (user.driverId ? fb.db.get(path('drivers', user.driverId)).then(function (s) { return s.exists ? [{ id: user.driverId, data: s.data }] : []; }) : Promise.resolve([])) : byXpt('drivers');
    return Promise.all([tag('xpts', xpts), tag('regions', regions), tag('drivers', drivers), isDriver ? Promise.resolve([]) : tag('packages', byXpt('packages')), tag('operations', ops), tag('settings/main', fb.db.get(path('settings', 'main'))), tag('settings/permissions', fb.db.get(path('settings', 'permissions')))])
      .then(function (r) { return { xpts: r[0], regions: r[1], drivers: r[2], packages: r[3], operations: r[4], settings: r[5].exists ? r[5].data : {}, permissions: r[6].exists ? r[6].data : null }; });
  }
  function docs(list) { return list.map(function (x) { return Object.assign({ id: x.id }, x.data); }); }
  function applyLoaded(D, data) {
    var DT = NS.data;
    D.xpts = docs(data.xpts); D.regions = docs(data.regions); D.drivers = docs(data.drivers);
    D.packages.length = 0; docs(data.packages).forEach(function (p) { D.packages.push(p); });
    var keep = {}; D.operations.forEach(function (o) { keep[o.id] = o; });
    D.operations.length = 0;
    docs(data.operations).forEach(function (o) { var cur = keep[o.id]; if (cur) { Object.keys(cur).forEach(function (k) { delete cur[k]; }); Object.assign(cur, o); D.operations.push(cur); } else D.operations.push(o); });
    NS.permissions.setOverrides(data.permissions || null); // matriz editada pelo admin_sistema (as regras do servidor aplicam a mesma)
    var s = data.settings || {};
    D.sizes = Array.isArray(s.sizes) && s.sizes.length ? s.sizes : DT.SIZES.map(function (x) { return Object.assign({}, x); });
    D.reasons = Array.isArray(s.reasons) && s.reasons.length ? s.reasons : DT.REASONS.map(function (x) { return Object.assign({}, x); });
    D.settings = { stayLimitDays: typeof s.stayLimitDays === 'number' ? s.stayLimitDays : 4 };
    D.states = DT.STATES; D.demo = false; D.nowMs = Date.now();
    return D;
  }
  function emptyD() { return { nowMs: Date.now(), demo: false, sizes: [], reasons: [], states: [], xpts: [], drivers: [], regions: [], packages: [], operations: [], settings: { stayLimitDays: 4 } }; }

  /** Cria (SOMENTE se ainda não existirem) as XPTs, regiões, motoristas e configurações de teste. Nunca sobrescreve nem apaga. */
  function seedTest(fb, user, seed) {
    if (user.role !== 'admin_sistema') return Promise.resolve({ ok: false, message: 'Somente o administrador do sistema pode criar os dados iniciais.' });
    var entries = [];
    (seed.xpts || []).forEach(function (x) { entries.push(['xpts', x.id, x]); });
    (seed.regions || []).forEach(function (x) { entries.push(['regions', x.id, x]); });
    (seed.drivers || []).forEach(function (x) { entries.push(['drivers', x.id, x]); });
    entries.push(['settings', 'main', seed.settings || {}]);
    return fb.db.runTransaction(function (tx) {
      return Promise.all(entries.map(function (e) { return tx.get(path(e[0], e[1])); })).then(function (res) {
        var created = 0, existing = 0;
        res.forEach(function (s, i) { if (s.exists) existing++; else { var d = clean(entries[i][2]); delete d.id; tx.set(path(entries[i][0], entries[i][1]), d); created++; } });
        return { ok: true, created: created, existing: existing };
      });
    }).catch(failure);
  }

  /** Cadastra um motorista (SOMENTE se o id ainda não existir). Quem tem 'config'. Nada é sobrescrito. */
  function registerDriver(fb, user, d) {
    var P = NS.permissions;
    if (!P.can(user.role, 'config') && user.role !== 'admin_sistema') return Promise.resolve({ ok: false, message: 'Sem permissão para cadastrar motoristas.' });
    var name = String((d && d.name) || '').trim(), xptId = String((d && d.xptId) || '').trim(), ident = String((d && d.ident) || '').trim();
    var id = String((d && d.id) || '').trim().replace(/[^A-Za-z0-9_-]/g, '');
    if (!name || !xptId || !id) return Promise.resolve({ ok: false, message: 'Informe identificador (letras/números), nome e base do motorista.' });
    return fb.db.runTransaction(function (tx) {
      return tx.get(path('drivers', id)).then(function (s) {
        if (s.exists) return { ok: false, message: 'Já existe um motorista com o identificador "' + id + '". Nada foi alterado.' };
        tx.set(path('drivers', id), { name: name, ident: ident, xptId: xptId, state: 'ativo' }); return { ok: true, id: id };
      });
    }).catch(failure);
  }
  /** Vincula um login (UID do Authentication) a um perfil: cria env/teste/users/{uid} (nunca sobrescreve; nunca o próprio). Só admin_sistema. */
  function linkUser(fb, user, u) {
    if (user.role !== 'admin_sistema') return Promise.resolve({ ok: false, message: 'Somente o administrador do sistema vincula usuários.' });
    var uid = String((u && u.uid) || '').trim(), name = String((u && u.name) || '').trim(), email = String((u && u.email) || '').trim(), role = String((u && u.role) || '');
    if (!uid || uid === user.uid) return Promise.resolve({ ok: false, message: uid ? 'Você não pode alterar o seu próprio perfil.' : 'Informe o UID copiado do Authentication.' });
    if (!NS.permissions.PROFILES.some(function (p) { return p.id === role; })) return Promise.resolve({ ok: false, message: 'Perfil inválido.' });
    if (!name || !email) return Promise.resolve({ ok: false, message: 'Informe nome e e-mail.' });
    var xptIds = (u.xptIds || []).filter(Boolean), isGlobal = role === 'administrador' || role === 'coord_geral' || role === 'admin_sistema';
    if (!isGlobal && !xptIds.length) return Promise.resolve({ ok: false, message: 'Informe ao menos uma base para este perfil.' });
    if (role === 'motorista' && !String(u.driverId || '').trim()) return Promise.resolve({ ok: false, message: 'Motorista precisa de um motorista cadastrado (driverId).' });
    return fb.db.runTransaction(function (tx) {
      return tx.get(path('users', uid)).then(function (s) {
        if (s.exists) return { ok: false, message: 'Este UID já tem perfil cadastrado. Nada foi alterado.' };
        tx.set(path('users', uid), { name: name, email: email, role: role, xptIds: xptIds, active: true, driverId: role === 'motorista' ? String(u.driverId).trim() : null }); return { ok: true };
      });
    }).catch(failure);
  }

  // ---------- administração (somente admin_sistema): usuários, bases, matriz de permissões. Tudo validado também pelas regras.
  function adminOnly(user) { return user && user.role === 'admin_sistema' ? null : { ok: false, message: 'Somente o administrador do sistema pode fazer isto.' }; }
  function listUsers(fb, user) {
    return adminOnly(user) ? Promise.resolve([]) : fb.db.list(ENV + '/users', []).then(function (l) { return l.map(function (x) { return Object.assign({ uid: x.id }, x.data); }); });
  }
  /** Edita um perfil existente (nome, perfil, bases, ativo, driverId). Nunca o próprio. */
  function updateUser(fb, user, uid, f) {
    var no = adminOnly(user); if (no) return Promise.resolve(no);
    if (!uid || uid === user.uid) return Promise.resolve({ ok: false, message: 'Você não pode alterar o seu próprio perfil.' });
    var role = String(f.role || ''); if (!NS.permissions.PROFILES.some(function (p) { return p.id === role; })) return Promise.resolve({ ok: false, message: 'Perfil inválido.' });
    var name = String(f.name || '').trim(); if (!name) return Promise.resolve({ ok: false, message: 'Informe o nome.' });
    var xptIds = (f.xptIds || []).map(function (x) { return String(x).trim(); }).filter(Boolean);
    var isGlobal = GLOBAL_ROLES.indexOf(role) >= 0;
    if (!isGlobal && !xptIds.length) return Promise.resolve({ ok: false, message: 'Informe ao menos uma base para este perfil.' });
    if (role === 'motorista' && !String(f.driverId || '').trim()) return Promise.resolve({ ok: false, message: 'Motorista precisa de um driverId.' });
    return fb.db.runTransaction(function (tx) {
      return tx.get(path('users', uid)).then(function (s) {
        if (!s.exists) return { ok: false, message: 'Usuário não encontrado.' };
        tx.update(path('users', uid), { name: name, role: role, xptIds: xptIds, active: f.active !== false, driverId: role === 'motorista' ? String(f.driverId).trim() : null }); return { ok: true };
      });
    }).catch(failure);
  }
  /** Remove o PERFIL (acesso ao sistema). O login em Authentication continua existindo: apague no Console se quiser. Nunca o próprio. */
  function deleteUser(fb, user, uid) {
    var no = adminOnly(user); if (no) return Promise.resolve(no);
    if (!uid || uid === user.uid) return Promise.resolve({ ok: false, message: 'Você não pode excluir o seu próprio perfil.' });
    return fb.db.runTransaction(function (tx) {
      return tx.get(path('users', uid)).then(function (s) { if (!s.exists) return { ok: false, message: 'Usuário não encontrado.' }; tx.delete(path('users', uid)); return { ok: true }; });
    }).catch(failure);
  }
  /** Cria uma base (XPT) nova; se o id já existir, só edita nome/ativa (nunca recria). */
  function saveXpt(fb, user, x) {
    var no = adminOnly(user); if (no) return Promise.resolve(no);
    var id = String((x && x.id) || '').trim().replace(/[^A-Za-z0-9_-]/g, ''), name = String((x && x.name) || '').trim();
    if (!id || !name) return Promise.resolve({ ok: false, message: 'Informe identificador (letras/números) e nome da base.' });
    return fb.db.runTransaction(function (tx) {
      return tx.get(path('xpts', id)).then(function (s) {
        if (s.exists) { tx.update(path('xpts', id), { name: name, active: x.active !== false }); return { ok: true, created: false }; }
        tx.set(path('xpts', id), { name: name, active: x.active !== false, note: 'Criada pelo administrador do sistema' }); return { ok: true, created: true };
      });
    }).catch(failure);
  }
  /** Grava a matriz de permissões (somente ações/perfis editáveis). As regras do Firestore passam a usá-la. */
  function savePermissions(fb, user, doc) {
    var no = adminOnly(user); if (no) return Promise.resolve(no);
    var P = NS.permissions, out = {};
    P.EDITABLE.forEach(function (a) { out[a] = (doc && Array.isArray(doc[a]) ? doc[a] : []).filter(function (r) { return P.EDITABLE_PROFILES.indexOf(r) >= 0; }); });
    if (!out.ver_base.length) return Promise.resolve({ ok: false, message: 'Pelo menos um perfil precisa ver os dados da base.' });
    return fb.db.runTransaction(function (tx) {
      return tx.get(path('settings', 'permissions')).then(function () { tx.set(path('settings', 'permissions'), out); return { ok: true, doc: out }; });
    }).catch(failure);
  }

  /** Grava configurações gerais (limite de dias, motivos, tamanhos) em settings/main. Quem tem 'config'. Mescla com o que já existe. */
  function saveSettings(fb, user, patch) {
    if (!NS.permissions.can(user.role, 'config')) return Promise.resolve({ ok: false, message: 'Seu perfil não pode alterar configurações.' });
    return fb.db.runTransaction(function (tx) {
      return tx.get(path('settings', 'main')).then(function (s) {
        var next = Object.assign({}, s.exists ? s.data : {}, clean(patch));
        if (s.exists) tx.update(path('settings', 'main'), clean(patch)); else tx.set(path('settings', 'main'), next);
        return { ok: true, data: next };
      });
    }).catch(failure);
  }

  NS.services = { saveSettings: saveSettings, listUsers: listUsers, updateUser: updateUser, deleteUser: deleteUser, saveXpt: saveXpt, savePermissions: savePermissions, registerDriver: registerDriver, linkUser: linkUser, ENV: ENV, createDemo: createDemo, createRemote: createRemote, loadProfile: loadProfile, loadAll: loadAll, applyLoaded: applyLoaded, emptyD: emptyD, seedTest: seedTest, failure: failure, pkgIdFor: pkgIdFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.services;
})(typeof window !== 'undefined' ? window : globalThis);
