/* COOPMETRO XPT — perfis e matriz de permissões PROPOSTA (DECISOES-PENDENTES.md).
 * ATENÇÃO: no protótipo isto só controla o que a interface MOSTRA. NÃO é segurança.
 * Na versão real, toda autorização será verificada no backend e nas regras do banco. */
(function (root) {
  'use strict';
  var NS = (root.CXPT = root.CXPT || {});
  var PROFILES = [
    { id: 'admin_sistema', label: 'Administrador do sistema' },
    { id: 'administrador', label: 'Administrador' },
    { id: 'coord_geral', label: 'Coordenador geral' },
    { id: 'supervisor', label: 'Supervisor' },
    { id: 'coord_base', label: 'Coordenador de base' },
    { id: 'despacho', label: 'Despacho' },
    { id: 'motorista', label: 'Motorista/agregado' },
  ];
  var ACTIONS = [
    { id: 'ver_global', label: 'Ver indicadores de todas as bases autorizadas' },
    { id: 'ver_base', label: 'Ver dados da própria base' },
    { id: 'entrada', label: 'Registrar entradas' },
    { id: 'conferir', label: 'Conferir pacotes de uma operação' },
    { id: 'operacao', label: 'Criar/atribuir operações' },
    { id: 'correcao', label: 'Corrigir registros (com motivo)' },
    { id: 'confirmar_saida', label: 'Confirmar saída dos pacotes conferidos' },
    { id: 'encerrar', label: 'Encerrar operação (bloqueia conferências)' },
    { id: 'devolucao', label: 'Decidir devolução ao remetente' },
    { id: 'usuarios', label: 'Administrar usuários e bases' },
    { id: 'config', label: 'Alterar configurações (motivos, limites)' },
    { id: 'minhas_ops', label: 'Ver operações atribuídas a si' },
    { id: 'conferir_propria', label: 'Bipar (conferir) os pacotes da PRÓPRIA ambulância' },
  ];
  // true = permitido na PROPOSTA. Nada aprovado (D-06).
  var M = {
    admin_sistema: { ver_global: 1, ver_base: 1, entrada: 1, conferir: 1, operacao: 1, correcao: 1, confirmar_saida: 1, encerrar: 1, devolucao: 1, usuarios: 1, config: 1 }, // acesso a TODAS as telas; linha fixa (não editável)
    administrador: { ver_global: 1, ver_base: 1, correcao: 1, config: 1, operacao: 1, encerrar: 1 },
    coord_geral: { ver_global: 1, ver_base: 1 },
    supervisor: { ver_base: 1, operacao: 1, conferir: 1, confirmar_saida: 1, encerrar: 1, correcao: 1, devolucao: 1 },
    coord_base: { ver_base: 1, operacao: 1, conferir: 1, confirmar_saida: 1, correcao: 1, devolucao: 1 },
    despacho: { ver_base: 1, entrada: 1, conferir: 1 },
    motorista: { minhas_ops: 1, conferir_propria: 1 },
  };
  // Ações que o administrador do sistema pode conceder/retirar por perfil (salvas em env/teste/settings/permissions e APLICADAS pelas regras).
  // Fixas (não editáveis): linha do admin_sistema e do motorista; ver_global, usuarios, minhas_ops, conferir_propria.
  var EDITABLE = ['ver_base', 'entrada', 'conferir', 'operacao', 'correcao', 'confirmar_saida', 'encerrar', 'devolucao', 'config'];
  var EDITABLE_PROFILES = ['administrador', 'coord_geral', 'supervisor', 'coord_base', 'despacho'];
  var DEFAULTS = {}; Object.keys(M).forEach(function (p) { DEFAULTS[p] = Object.assign({}, M[p]); });
  function defaultsFor(action) { return EDITABLE_PROFILES.filter(function (p) { return DEFAULTS[p][action]; }); }
  /** Aplica a matriz salva ({acao: [perfis]}). Ignora o que não é editável; nunca mexe em admin_sistema nem motorista. */
  function setOverrides(o) {
    EDITABLE_PROFILES.forEach(function (p) { EDITABLE.forEach(function (a) { if (DEFAULTS[p][a]) M[p][a] = 1; else delete M[p][a]; }); });
    if (!o || typeof o !== 'object') return;
    EDITABLE.forEach(function (a) {
      if (!Array.isArray(o[a])) return;
      EDITABLE_PROFILES.forEach(function (p) { if (o[a].indexOf(p) >= 0) M[p][a] = 1; else delete M[p][a]; });
    });
  }
  /** Matriz atual no formato gravado no Firestore: {acao: [perfis editáveis com a permissão]}. */
  function toDoc() { var d = {}; EDITABLE.forEach(function (a) { d[a] = EDITABLE_PROFILES.filter(function (p) { return !!M[p][a]; }); }); return d; }
  function can(profileId, actionId) { return !!(M[profileId] && M[profileId][actionId]); }
  function matrix() {
    return PROFILES.map(function (p) {
      return { profile: p, perms: ACTIONS.map(function (a) { return can(p.id, a.id); }) };
    });
  }
  NS.permissions = { PROFILES: PROFILES, ACTIONS: ACTIONS, can: can, matrix: matrix, EDITABLE: EDITABLE, EDITABLE_PROFILES: EDITABLE_PROFILES, defaultsFor: defaultsFor, setOverrides: setOverrides, toDoc: toDoc,
    DISCLAIMER: 'Seletor de perfil demonstrativo: não oferece proteção real. A autorização verdadeira será feita no backend.' };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.permissions;
})(typeof window !== 'undefined' ? window : globalThis);
