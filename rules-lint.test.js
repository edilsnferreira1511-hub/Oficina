'use strict';
/* ANÁLISE ESTÁTICA de firestore.rules (texto). NÃO executa as regras: o Firebase Emulator não está disponível neste ambiente.
 * Verifica estrutura, ausência de regras abertas e coerência da matriz de perfis com permissions.js e com o modelo usado nos testes. */
const fs = require('fs'), path = require('path');
const { NS } = require('./helpers');
const FAKE = require('./fake-firebase.js');
const text = fs.readFileSync(path.join(__dirname, 'firestore.rules'), 'utf8');
const code = text.replace(/\/\/.*$/gm, '');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + e.message); } }
function ok(c, m) { if (!c) throw new Error(m || 'falhou'); }
const setEq = (a, b) => JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());
function roles(fn) {
  const m = new RegExp('function ' + fn + '\\(\\)\\s*\\{[^}]*role\\(\\) in \\[([^\\]]*)\\]').exec(code);
  ok(m, 'função ' + fn + ' não encontrada'); return m[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
}
const P = NS.permissions;
const rolesWith = (action) => P.PROFILES.map((p) => p.id).filter((id) => P.can(id, action));

t('versão das regras e chaves balanceadas', () => {
  ok(/rules_version = '2'/.test(code)); ok((code.match(/\{/g) || []).length === (code.match(/\}/g) || []).length, 'chaves desbalanceadas');
  ok((code.match(/\(/g) || []).length === (code.match(/\)/g) || []).length, 'parênteses desbalanceados');
});
t('nenhuma regra aberta (if true, curinga global, allow sem condição)', () => {
  ok(!/if\s+true/.test(code), 'if true'); ok(!/\{document=\*\*\}/.test(code), 'curinga {document=**}');
  const allows = code.match(/allow [^;]*;/g) || []; ok(allows.length > 10);
  allows.forEach((a) => ok(/if\s/.test(a), 'allow sem condição: ' + a));
});
t('todos os caminhos liberados ficam sob env/teste', () => {
  const ms = code.match(/match\s+\/[^\s{]*[^\s]*/g).filter((m) => !/databases/.test(m));
  const paths = (code.match(/match\s+(\/env\/[^\s{]+)/g) || []);
  ok(paths.length >= 9); paths.forEach((p) => ok(/\/env\/teste\//.test(p), p));
  ok(ms.every((m) => /env\/teste/.test(m) || /\{database\}/.test(m) || /databases/.test(m)), ms.join(' | '));
});
t('nada pode ser apagado: todo delete é "if false"', () => {
  const dels = code.match(/allow (?:[a-z, ]*)delete[^;]*;/g) || []; ok(dels.length >= 8, 'poucos delete: ' + dels.length);
  dels.forEach((d) => ok(/if false;/.test(d), d));
});
t('eventos só podem ser criados (update/delete = false) e com o uid do autor', () => {
  const blk = /match \/env\/teste\/events\/\{eventId\} \{([\s\S]*?)\n    \}/.exec(code); ok(blk);
  ok(/allow update, delete: if false;/.test(blk[1])); ok(/request\.resource\.data\.uid == request\.auth\.uid/.test(blk[1]));
});
t('usuários: sem auto-edição e sem delete; código e XPT de origem imutáveis; histórico só cresce; operação encerrada trava', () => {
  ok(/request\.auth\.uid != uid/.test(code), 'auto-edição'); ok(/hasOnly\(\['state', 'activeOpId', 'history'/.test(code), 'campos mutáveis do pacote');
  ok(!/'xptId'[^\]]*\]\)/.test(/affectedKeys\(\)\.hasOnly\(\[[^\]]*\]\)/.exec(code)[0]), 'xptId não pode estar entre os campos mutáveis do pacote');
  ok(/history\[0:resource\.data\.history\.size\(\)\] == resource\.data\.history/.test(code), 'histórico append-only');
  ok(/resource\.data\.state != 'encerrada'/.test(code), 'operação encerrada');
});
t('matriz de perfis das regras == permissions.js (proposta D-06)', () => {
  const map = { canVerBase: 'ver_base', canEntrada: 'entrada', canConferir: 'conferir', canOperacao: 'operacao', canCorrecao: 'correcao', canSaida: 'confirmar_saida', canEncerrar: 'encerrar', canDevolucao: 'devolucao', canUsuarios: 'usuarios', canConfig: 'config' };
  Object.keys(map).forEach((fn) => ok(setEq(roles(fn), rolesWith(map[fn])), fn + ': regras=' + roles(fn) + ' permissions.js=' + rolesWith(map[fn])));
  const g = /function isGlobal\(\)[^}]*\[([^\]]*)\]/.exec(code)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  ok(setEq(g, rolesWith('ver_global')), 'global');
});
t('modelo de regras usado nos testes == regras', () => {
  const R = FAKE.ROLES, map = { canVerBase: 'VER_BASE', canEntrada: 'ENTRADA', canConferir: 'CONFERIR', canOperacao: 'OPERACAO', canCorrecao: 'CORRECAO', canSaida: 'SAIDA', canEncerrar: 'ENCERRAR', canDevolucao: 'DEVOLUCAO', canUsuarios: 'USUARIOS', canConfig: 'CONFIG' };
  Object.keys(map).forEach((fn) => ok(setEq(roles(fn), R[map[fn]]), fn));
});
t('motorista: regras de acesso exclusivo à PRÓPRIA operação', () => {
  ok(/function isDriver\(\)[^}]*role\(\) == 'motorista'/.test(code), 'isDriver'); ok(/function ownOp\(op\)[^}]*op\.driverId == userDoc\(\)\.data\.driverId/.test(code), 'ownOp compara driverId do servidor');
  const ops = /match \/env\/teste\/operations\/\{opId\} \{([\s\S]*?)\n    \}/.exec(code); ok(ops, 'bloco operations');
  const create = /allow create:[^;]*;/.exec(ops[1])[0]; ok(!/ownOp|isDriver/.test(create), 'motorista não cria operação');
  ok(/allow get, list:[^;]*ownOp\(resource\.data\)/.test(ops[1]), 'motorista lê só a própria operação');
  const up = /allow update:[\s\S]*?;\n/.exec(ops[1])[0]; ok(/ownOp\(resource\.data\)[^|]*hasOnly\(\['checked', 'history'\]\)/.test(up), 'motorista só altera checked/history'); ok(/hasOnly\(resource\.data\.packageCodes\)/.test(up), 'só códigos da própria operação');
  ok(!/ownOp[^|]*(saida_confirmada|encerrada)/.test(up), 'motorista não confirma saída nem encerra');
  const pk = /match \/env\/teste\/packages\/\{pkId\} \{([\s\S]*?)\n    \}/.exec(code); if (pk) ok(!/isDriver|ownOp/.test(pk[1]), 'motorista não lê pacotes');
  ['users', 'xpts', 'regions', 'drivers'].forEach((c) => { const b = new RegExp('match /env/teste/' + c + '/\\{[a-zA-Z]+\\} \\{([\\s\\S]*?)\\n    \\}').exec(code); ok(b, c); if (c !== 'drivers') ok(!/isDriver|ownOp/.test(b[1]), c + ' sem acesso do motorista'); });
  ok(/allow get, list:[^;]*isDriver\(\) && id == userDoc\(\)\.data\.driverId/.test(code), 'motorista só lê o próprio cadastro de motorista');
});
t('permissions.js: só motorista tem conferir_propria; motorista não tem nenhuma ação administrativa', () => {
  ok(setEq(rolesWith('conferir_propria'), ['motorista']));
  ['ver_base', 'entrada', 'conferir', 'operacao', 'correcao', 'confirmar_saida', 'encerrar', 'devolucao', 'usuarios', 'config', 'ver_global'].forEach((a) => ok(!P.can('motorista', a), a));
  ok(P.can('despacho', 'entrada') && P.can('despacho', 'conferir') && !P.can('despacho', 'operacao'));
});
t('firebase-config: apiKey do app web informada pelo dono (não é segredo), sem chaves privadas', () => {
  const cfg = fs.readFileSync(path.join(__dirname, 'firebase-config.js'), 'utf8');
  ok(/apiKey: 'AIza[0-9A-Za-z_-]{35}'/.test(cfg), 'apiKey do Console');  ok(!/private_key|service_account|BEGIN PRIVATE/i.test(cfg));
  ok(/projectId: 'coopmetro-xpt'/.test(cfg) && /830962789514/.test(cfg) && /1:830962789514:web:6d52394cc08f9a72115173/.test(cfg));
});
t('nenhum arquivo do projeto contém chave privada, token ou senha embutida', () => {
  fs.readdirSync(__dirname).filter((f) => /\.(js|html|md|rules|css)$/.test(f) && !/\.test\.js$|^e2e|^fake-|^unit|^firebase-config/.test(f)).forEach((f) => {
    const s = fs.readFileSync(path.join(__dirname, f), 'utf8');
    ok(!/BEGIN (RSA )?PRIVATE KEY/.test(s), f); ok(!/AIza[0-9A-Za-z_-]{30,}/.test(s), f + ' (apiKey)');
  });
});
console.log('rules-lint.test.js: ' + pass + ' aprovados, ' + fail + ' reprovados'); process.exit(fail ? 1 : 0);
