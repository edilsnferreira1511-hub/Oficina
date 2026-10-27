/* COOPMETRO XPT — ciclo de vida da operação de ambulância (em memória): criar, conferir por bipagem, confirmar saída, encerrar.
 * Autorização aqui é um parâmetro (ctx.authorized) só para demonstrar a regra; na versão real o servidor valida perfil, base e situação.
 * O QR Code identifica apenas a operação e nunca autoriza nada por si só. */
(function (root) {
  'use strict';
  var NS = (root.CXPT = root.CXPT || {});
  var STATE = { EM_SEPARACAO: 'em_separacao', SAIDA: 'saida_confirmada', ENCERRADA: 'encerrada' };

  // Cores de ambulância (identificam visualmente a ambulância no mapa, na separação e na tela do motorista; o nome da cor acompanha
  // sempre o texto, nunca só a cor, por acessibilidade).
  var COLORS = [
    { hex: '#1e5ac8', name: 'Azul' }, { hex: '#e8590c', name: 'Laranja' }, { hex: '#7048e8', name: 'Roxo' }, { hex: '#0b7285', name: 'Turquesa' },
    { hex: '#2b8a3e', name: 'Verde' }, { hex: '#5c940d', name: 'Oliva' }, { hex: '#8a5a00', name: 'Marrom' }, { hex: '#495057', name: 'Grafite' },
  ];
  var NEUTRAL = { hex: '#6c757d', name: 'Sem cor' };
  /** Cor válida de uma operação (dados vindos do servidor nunca são confiados): devolve {hex, name}. */
  function colorOf(op) {
    var c = op && COLORS.filter(function (x) { return x.hex === String(op.color || '').toLowerCase(); })[0];
    return c || NEUTRAL;
  }
  function pickColor(ops, xptId) {
    var used = {}; ops.forEach(function (o) { if (o.xptId === xptId && isActive(o) && o.color) used[String(o.color).toLowerCase()] = true; });
    var free = COLORS.filter(function (c) { return !used[c.hex]; })[0];
    if (free) return free;
    return COLORS[ops.filter(function (o) { return o.xptId === xptId; }).length % COLORS.length];
  }
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function isActive(op) { return !!op && op.state !== STATE.ENCERRADA; }
  var MAX_PACKAGES = 200; // uma ambulância é gravada numa transação atômica (limite de 500 gravações do Firestore: 2 por pacote + operação + contador)
  /** Pacotes da operação. Quem não pode ler a coleção de pacotes (motorista) recebe só id+código a partir de op.packageCodes. */
  function opPkgs(D, op) {
    return op.packageIds.map(function (id, i) {
      var f = D.packages.filter(function (p) { return p.id === id; })[0];
      if (f) return f;
      var code = op.packageCodes && op.packageCodes[i];
      return code ? { id: id, code: code, xptId: op.xptId, state: 'em_separacao', size: null, location: null } : null;
    }).filter(Boolean);
  }
  function activeOpOf(D, pkgId, exceptOpId) {
    return D.operations.filter(function (o) { return isActive(o) && o.id !== exceptOpId && o.packageIds.indexOf(pkgId) >= 0; })[0] || null;
  }
  function logOp(op, ctx, type, note, code) {
    op.history = op.history || [];
    op.history.push({ id: op.id + '-h' + pad(op.history.length + 1, 3), at: ctx.nowMs, type: type, operator: ctx.operator || 'Operador Demo', note: note || '', code: code || null });
  }
  function nextId(D) {
    var max = 0;
    D.operations.forEach(function (o) { var m = /^OP-(\d+)$/.exec(o.id); if (m) max = Math.max(max, Number(m[1])); });
    return 'OP-' + pad(max + 1, 4);
  }
  function setPkg(D, p) { NS.registry.replacePackage(D, p); }

  /** Por que um pacote não pode entrar numa nova operação (ou null se pode). */
  function ineligible(D, xptId, p) {
    if (!p) return 'Pacote inexistente.';
    if (p.xptId !== xptId) return 'Pacote de outra base.';
    if (p.state !== 'em_estoque') return 'Só pacotes em estoque podem entrar numa operação (estado atual: ' + p.state + ').';
    var other = activeOpOf(D, p.id);
    if (other) return 'Já está na operação ativa ' + other.id + '.';
    return null;
  }

  /** Cria a ambulância e move os pacotes de em_estoque para em_separacao (eventos no histórico de cada pacote). */
  function createAmbulance(D, xptId, f, ctx) {
    ctx = ctx || {};
    if (ctx.authorized !== true) return { ok: false, reason: 'sem_permissao', message: 'Seu perfil não pode criar operações (simulação; o servidor validará no futuro).' };
    if (!NS.packages.validTs(ctx.nowMs)) return { ok: false, reason: 'data_invalida', message: 'Data/hora inválida.' };
    var errors = {};
    var name = (f.name || '').trim(), resp = (f.responsible || '').trim();
    if (!name) errors.name = 'Informe o nome ou número da ambulância.';
    if (name.length > 60) errors.name = 'Nome com mais de 60 caracteres.';
    if (!resp) errors.responsible = 'Informe o responsável pela operação.';
    if (resp.length > 80) errors.responsible = 'Responsável com mais de 80 caracteres.';
    // uma ambulância por motorista: motorista obrigatório, ativo, desta base e sem outra ambulância ativa
    var known = ctx.knownOps || D.operations;
    if (!f.driverId) errors.driverId = 'Escolha o motorista desta ambulância.';
    else {
      var drv = D.drivers.filter(function (d) { return d.id === f.driverId && d.xptId === xptId; })[0];
      if (!drv) errors.driverId = 'Motorista inválido para esta base.';
      else if (drv.state && drv.state !== 'ativo') errors.driverId = 'Motorista inativo.';
      else {
        var busy = known.filter(function (o) { return isActive(o) && o.driverId === f.driverId; })[0];
        if (busy) errors.driverId = 'Este motorista já tem a ambulância ativa ' + busy.id + (busy.name ? ' (' + busy.name + ')' : '') + '. Encerre-a antes de criar outra.';
      }
    }
    var ids = (f.packageIds || []).filter(function (id, i, a) { return a.indexOf(id) === i; });
    if (!ids.length) errors.packageIds = 'Selecione ao menos um pacote.';
    if (ids.length > MAX_PACKAGES) errors.packageIds = 'No máximo ' + MAX_PACKAGES + ' pacotes por ambulância (a gravação é atômica e tem limite). Retire pacotes ou crie outra ambulância para o restante.';
    var blocked = [];
    ids.forEach(function (id) {
      var p = D.packages.filter(function (x) { return x.id === id; })[0], why = ineligible(D, xptId, p);
      if (why) blocked.push({ id: id, code: p ? p.code : id, reason: why });
    });
    if (blocked.length) errors.packageIds = 'Pacotes não elegíveis: ' + blocked.map(function (b) { return b.code + ' (' + b.reason + ')'; }).join('; ');
    if (Object.keys(errors).length) return { ok: false, reason: 'invalido', errors: errors, blocked: blocked };
    var col = pickColor(known, xptId);
    var op = {
      id: nextId(D), xptId: xptId, color: col.hex, name: name, responsible: resp, driverId: f.driverId || null, driverName: (drv && drv.name) || null, token: newToken(), packageIds: ids, state: STATE.EM_SEPARACAO,
      createdAt: ctx.nowMs, createdBy: ctx.operator || 'Operador Demo', groupLabel: name, regionId: null, checked: {}, history: [],
    };
    logOp(op, ctx, 'operacao_criada', ids.length + ' pacote(s) vinculado(s); responsável: ' + resp);
    ids.forEach(function (id) {
      var p = D.packages.filter(function (x) { return x.id === id; })[0];
      var t = NS.packages.transition(p, 'em_separacao', { nowMs: ctx.nowMs, operator: ctx.operator, note: 'Vinculado à operação ' + op.id + ' (' + name + ')' });
      setPkg(D, t.pkg);
    });
    D.operations.push(op);
    return { ok: true, op: op };
  }

  /**
   * Bipagem. Estados: ok | repetido | invalido | outra_operacao | nao_vinculado | inexistente | bloqueado | sem_permissao.
   * Só 'ok' altera algo, e apenas o registro de conferência da operação (nunca o estado do pacote).
   */
  function scan(D, op, raw, ctx) {
    ctx = ctx || {};
    if (!isActive(op)) return { status: 'bloqueado', message: 'Operação encerrada: novas conferências estão bloqueadas.' };
    if (ctx.authorized === false) return { status: 'sem_permissao', message: 'Seu perfil não pode conferir pacotes (simulação).' };
    var v = NS.codes.validate(raw);
    if (!v.ok) return { status: 'invalido', message: v.message };
    op.checked = op.checked || {};
    if (op.checked[v.code]) return { status: 'repetido', code: v.code, message: 'Código já conferido — não contado de novo.' };
    var mine = opPkgs(D, op).filter(function (p) { return p.code === v.code; })[0];
    if (mine) {
      op.checked[v.code] = { at: ctx.nowMs || null, operator: ctx.operator || 'Operador Demo' };
      logOp(op, ctx, 'conferencia', 'Pacote conferido', v.code);
      return { status: 'ok', code: v.code, message: 'Conferido.' };
    }
    // procura só na MESMA base da operação; nada de outras bases é revelado
    var same = D.packages.filter(function (p) { return p.code === v.code && p.xptId === op.xptId; })[0];
    if (same) {
      var other = activeOpOf(D, same.id, op.id);
      if (other) return { status: 'outra_operacao', code: v.code, otherOp: other.id, message: 'Este pacote pertence a outra ambulância (' + (other.name || other.id) + '). Nada foi alterado.' };
      return { status: 'nao_vinculado', code: v.code, message: 'Código não vinculado a esta operação. Nada foi alterado.' };
    }
    return { status: 'inexistente', code: v.code, message: 'Código não encontrado nesta base.' };
  }

  /** Remove uma leitura incorreta (somente enquanto o pacote não saiu e a operação está aberta). */
  function unscan(D, op, code, ctx) {
    ctx = ctx || {};
    if (!isActive(op) || !op.checked || !op.checked[code]) return false;
    if (op.departed && op.departed[code]) return false; // já saiu nesta operação: correção só por novo evento
    delete op.checked[code];
    logOp(op, ctx, 'leitura_removida', 'Leitura removida do rascunho de conferência', code);
    return true;
  }

  function summary(D, op) {
    var pk = opPkgs(D, op), checked = op.checked || {};
    var done = pk.filter(function (p) { return checked[p.code]; });
    return {
      total: pk.length, done: done.length, pending: pk.filter(function (p) { return !checked[p.code]; }),
      departed: Object.keys(op.departed || {}).length,
    };
  }

  /** Confirma a saída SOMENTE dos pacotes conferidos: em_separacao → em_rota. Os demais continuam pendentes. */
  function confirmExit(D, op, ctx) {
    ctx = ctx || {};
    if (ctx.authorized !== true) return { ok: false, reason: 'sem_permissao', message: 'Seu perfil não pode confirmar saída (simulação).' };
    if (!isActive(op)) return { ok: false, reason: 'encerrada', message: 'Operação encerrada.' };
    if (!NS.packages.validTs(ctx.nowMs)) return { ok: false, reason: 'data_invalida', message: 'Data/hora inválida.' };
    var departed = [], skipped = [];
    opPkgs(D, op).forEach(function (p) {
      if (!(op.checked || {})[p.code]) return;
      if (p.state !== 'em_separacao') { skipped.push(p.code); return; }
      var t = NS.packages.transition(p, 'em_rota', { nowMs: ctx.nowMs, operator: ctx.operator,
        note: 'Saída confirmada · operação ' + op.id + ' (' + (op.name || '') + ') · responsável: ' + op.responsible + ' · base ' + op.xptId });
      setPkg(D, t.pkg); departed.push(p.code);
      op.departed = op.departed || {}; op.departed[p.code] = ctx.nowMs;
    });
    if (!departed.length) return { ok: false, reason: 'nada_a_confirmar', message: 'Nenhum pacote conferido aguardando saída.' };
    op.state = STATE.SAIDA;
    var pend = summary(D, op).pending.map(function (p) { return p.code; });
    logOp(op, ctx, 'saida_confirmada', departed.length + ' pacote(s) saíram; ' + pend.length + ' pendente(s) permanecem em separação');
    return { ok: true, departed: departed, pending: pend, skipped: skipped };
  }

  /** Encerra a operação: bloqueia novas conferências; pendentes voltam ao estoque COM evento (nunca somem) e ficam registrados. */
  function closeOperation(D, op, ctx) {
    ctx = ctx || {};
    if (ctx.authorized !== true) return { ok: false, reason: 'sem_permissao', message: 'Seu perfil não pode encerrar operações (simulação).' };
    if (!isActive(op)) return { ok: false, reason: 'encerrada', message: 'Operação já encerrada.' };
    if (!NS.packages.validTs(ctx.nowMs)) return { ok: false, reason: 'data_invalida', message: 'Data/hora inválida.' };
    var pending = [];
    opPkgs(D, op).forEach(function (p) {
      if (p.state === 'em_separacao') {
        var t = NS.packages.transition(p, 'em_estoque', { nowMs: ctx.nowMs, operator: ctx.operator,
          note: 'Não saiu na operação ' + op.id + ' (encerrada): pendência preservada; pacote segue no estoque' });
        setPkg(D, t.pkg); pending.push(p.code);
      }
    });
    op.state = STATE.ENCERRADA; op.closedAt = ctx.nowMs; op.closedBy = ctx.operator || 'Operador Demo'; op.pendingAtClose = pending;
    logOp(op, ctx, 'operacao_encerrada', 'Encerrada; pendências preservadas: ' + (pending.length ? pending.join(', ') : 'nenhuma'));
    return { ok: true, pending: pending };
  }

  /** Endereço aberto pelo QR: só o identificador da operação (sem dados sensíveis). */
  function qrUrl(baseHref, opId, token) { return String(baseHref).split('#')[0] + '#/separation/' + encodeURIComponent(opId) + (token ? '/' + encodeURIComponent(token) : ''); }
  /** Código secreto da ambulância (128 bits). Quem tem o QR/link entra direto na tela do motorista, sem login. */
  function newToken() {
    var a = new Uint32Array(4);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(a); else for (var i = 0; i < 4; i++) a[i] = Math.floor(Math.random() * 4294967296);
    return Array.prototype.map.call(a, function (n) { return ('00000000' + n.toString(16)).slice(-8); }).join('');
  }

  NS.ambulance = {
    STATE: STATE, MAX_PACKAGES: MAX_PACKAGES, COLORS: COLORS, colorOf: colorOf, isActive: isActive, activeOpOf: activeOpOf, ineligible: ineligible, createAmbulance: createAmbulance,
    scan: scan, unscan: unscan, summary: summary, confirmExit: confirmExit, closeOperation: closeOperation, qrUrl: qrUrl, newToken: newToken, opPackages: opPkgs,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.ambulance;
})(typeof window !== 'undefined' ? window : globalThis);
