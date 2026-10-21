/* COOPMETRO XPT — dados demonstrativos e configuração.
 * TODOS os dados aqui são FICTÍCIOS, determinísticos (sem Math.random) e vivem só em memória.
 * Nenhum pacote demonstrativo possui coordenadas: pontos só nascem no rascunho de Entrada. */
(function (root) {
  'use strict';
  var NS = (root.CXPT = root.CXPT || {});
  var DAY = 86400000, HOUR = 3600000;

  // ---- Configuração centralizada (motivos/tamanhos editáveis no futuro por usuário autorizado)
  var SIZES = [
    { id: 'P', label: 'Pequeno' },
    { id: 'M', label: 'Médio' },
    { id: 'G', label: 'Grande' },
  ];
  var REASONS = [
    { id: 'r_ausente', label: 'Cliente ausente' },
    { id: 'r_end_incompleto', label: 'Endereço incompleto' },
    { id: 'r_end_nao_localizado', label: 'Endereço não localizado' },
    { id: 'r_recusou', label: 'Cliente recusou' },
    { id: 'r_outros', label: 'Outros' },
  ];
  // Estados canônicos (spec §8)
  var STATES = [
    { id: 'em_estoque', label: 'Em estoque', tone: 'ok' },
    { id: 'em_separacao', label: 'Em separação', tone: 'info' },
    { id: 'em_rota', label: 'Em rota', tone: 'info' },
    { id: 'entregue', label: 'Entregue', tone: 'neutral' },
    { id: 'aguardando_devolucao', label: 'Aguardando devolução', tone: 'warn' },
    { id: 'devolvido', label: 'Devolvido', tone: 'neutral' },
    { id: 'divergente', label: 'Divergente', tone: 'danger' },
  ];
  // Estados em que o pacote ainda ocupa o galpão (permanência conta).
  var IN_WAREHOUSE = ['em_estoque', 'em_separacao', 'aguardando_devolucao', 'divergente'];

  var XPTS = [
    { id: 'x1', name: 'XPT Demo Alfa', active: true, note: 'Base fictícia' },
    { id: 'x2', name: 'XPT Demo Beta', active: true, note: 'Base fictícia' },
    { id: 'x3', name: 'XPT Demo Gama', active: false, note: 'Base fictícia desativada' },
  ];
  var DRIVERS = [
    { id: 'm1', name: 'Motorista Demo 1', ident: 'MOT-DEMO-01', xptId: 'x1', state: 'ativo' },
    { id: 'm2', name: 'Motorista Demo 2', ident: 'MOT-DEMO-02', xptId: 'x1', state: 'ativo' },
    { id: 'm3', name: 'Agregado Demo 3', ident: 'AGR-DEMO-03', xptId: 'x1', state: 'inativo' },
    { id: 'm4', name: 'Motorista Demo 4', ident: 'MOT-DEMO-04', xptId: 'x2', state: 'ativo' },
    { id: 'm5', name: 'Agregado Demo 5', ident: 'AGR-DEMO-05', xptId: 'x2', state: 'ativo' },
  ];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }

  function regionsFor(xptId) {
    var out = [];
    for (var i = 1; i <= 5; i++) out.push({ id: xptId + '-r' + i, xptId: xptId, label: 'Região ' + i + ' (demo)' });
    return out;
  }

  /** Gera os dados demonstrativos. nowMs só serve de âncora para idades relativas. */
  function createDemoData(nowMs) {
    if (typeof nowMs !== 'number' || !isFinite(nowMs)) nowMs = Date.now();
    var rnd = mulberry32(20240607);
    function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }

    var regions = [];
    XPTS.forEach(function (x) { regions = regions.concat(regionsFor(x.id)); });

    // distribuição por XPT: [qtd, prefixo de série]
    var plan = { x1: 64, x2: 44, x3: 8 };
    var statePool = [
      'em_estoque', 'em_estoque', 'em_estoque', 'em_estoque', 'em_estoque', 'em_estoque',
      'em_separacao', 'em_separacao', 'em_rota', 'em_rota', 'entregue', 'aguardando_devolucao',
      'divergente', 'devolvido',
    ];
    var packages = [];
    var seq = 1;
    XPTS.forEach(function (x) {
      for (var i = 0; i < plan[x.id]; i++) {
        var state = x.active ? pick(statePool) : (i % 2 ? 'devolvido' : 'em_estoque');
        var returns = rnd() < 0.7 ? 0 : Math.floor(rnd() * 5); // 0..4
        var cycle = returns + 1;
        var ageDays = Math.floor(rnd() * 9) + (rnd() < 0.25 ? 2 : 0); // 0..10
        var entryAt = nowMs - ageDays * DAY - Math.floor(rnd() * 20) * HOUR;
        var firstEntryAt = entryAt - returns * 6 * DAY;
        var r = rnd();
        var kind = r < 0.45 ? 'desconhecida' : r < 0.75 ? 'pendente' : 'aproximada';
        var rg = kind === 'aproximada' ? pick(regionsFor(x.id)).id : null;
        var p = {
          id: 'pk-' + pad(seq, 4),
          code: 'DEMO-' + pad(seq, 6),
          xptId: x.id, // origem PERMANENTE
          size: pick(SIZES).id,
          reasonId: pick(REASONS).id,
          entryAt: entryAt,
          firstEntryAt: firstEntryAt,
          state: state,
          cycle: cycle,
          returns: returns,
          location: { kind: kind, lat: null, lng: null, regionId: rg, markedAt: null },
          note: '',
          history: [],
        };
        p.history = buildHistory(p, nowMs);
        packages.push(p);
        seq++;
      }
    });

    // Operações demonstrativas: usam pacotes em separação / em rota da própria XPT.
    var operations = [];
    var opStates = ['rascunho_demo', 'em_conferencia', 'aguardando_confirmacao'];
    var used = {};
    var opSeq = 1;
    [['x1', 4], ['x2', 3]].forEach(function (cfg) {
      var xid = cfg[0];
      var pool = packages.filter(function (p) {
        return p.xptId === xid && (p.state === 'em_separacao' || p.state === 'em_rota');
      });
      for (var k = 0; k < cfg[1]; k++) {
        var ids = [];
        while (pool.length && ids.length < 3 + (k % 3)) {
          var cand = pool.shift();
          if (!used[cand.id]) { used[cand.id] = 1; ids.push(cand.id); }
        }
        var drv = DRIVERS.filter(function (d) { return d.xptId === xid && d.state === 'ativo'; });
        operations.push({
          id: 'OP-DEMO-' + pad(opSeq++, 3),
          xptId: xid,
          responsible: 'Responsável Demo ' + (k + 1),
          driverId: k === 2 ? null : drv[k % drv.length].id,
          packageIds: ids,
          state: opStates[k % opStates.length],
          createdAt: nowMs - (k + 1) * DAY,
          groupLabel: 'Grupo preliminar demo ' + (k + 1),
          regionId: xid + '-r' + ((k % 5) + 1),
        });
      }
    });

    return {
      nowMs: nowMs,
      demo: true,
      sizes: SIZES.map(function (s) { return Object.assign({}, s); }),
      reasons: REASONS.map(function (s) { return Object.assign({}, s); }),
      states: STATES,
      xpts: XPTS.map(function (x) { return Object.assign({}, x); }),
      drivers: DRIVERS.map(function (x) { return Object.assign({}, x); }),
      regions: regions,
      packages: packages,
      operations: operations,
      settings: { stayLimitDays: 4 },
    };
  }

  function buildHistory(p, nowMs) {
    var ev = [];
    var n = 1;
    function add(type, at, from, to, note) {
      ev.push({
        id: 'ev-' + p.id + '-' + pad(n++, 2), code: p.code, xptId: p.xptId, type: type, at: at,
        from: from || null, to: to || null, operator: 'Operador Demo', note: note || '',
      });
    }
    var t = p.firstEntryAt;
    for (var c = 1; c < p.cycle; c++) {
      add('entrada', t, null, 'em_estoque', 'Ciclo ' + c);
      add('mudanca_estado', t + 1 * DAY, 'em_estoque', 'em_rota', 'Saída demonstrativa');
      add('retorno', t + 5 * DAY, 'em_rota', 'em_estoque', 'Retorno ao galpão (novo ciclo)');
      t += 6 * DAY;
    }
    add('entrada', p.entryAt, null, 'em_estoque', 'Ciclo ' + p.cycle);
    if (p.state !== 'em_estoque') add('mudanca_estado', Math.min(nowMs, p.entryAt + 6 * HOUR), 'em_estoque', p.state, 'Mudança demonstrativa');
    return ev;
  }

  NS.data = {
    DAY: DAY, HOUR: HOUR, SIZES: SIZES, REASONS: REASONS, STATES: STATES, IN_WAREHOUSE: IN_WAREHOUSE,
    createDemoData: createDemoData, regionsFor: regionsFor,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.data;
})(typeof window !== 'undefined' ? window : globalThis);
