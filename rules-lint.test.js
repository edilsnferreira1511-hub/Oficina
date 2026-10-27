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
function roles(fn) { // perfis PADRÃO da função (sem o documento de permissões); admin_sistema (sempre tem tudo) é omitido, exceto em USUARIOS
  let m = new RegExp('function ' + fn + '\\(\\)\\s*\\{\\s*return perm\\(\'[a-z_]+\', \\[([^\\]]*)\\]\\)').exec(code);
  if (m) return m[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
  m = new RegExp('function ' + fn + '\\(\\)\\s*\\{[^}]*role\\(\\) in \\[([^\\]]*)\\]').exec(code);
  if (m) return m[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
  m = new RegExp('function ' + fn + '\\(\\)\\s*\\{[^}]*role\\(\\) == .admin_sistema.').exec(code);
  ok(m, 'função ' + fn + ' não encontrada'); return ['admin_sistema'];
}
const noSys = (l) => l.filter((x) => x !== 'admin_sistema');
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
t('todos os caminhos liberados ficam sob env/producao', () => {
  const ms = code.match(/match\s+\/[^\s{]*[^\s]*/g).filter((m) => !/databases/.test(m));
  const paths = (code.match(/match\s+(\/env\/[^\s{]+)/g) || []);
  ok(paths.length >= 9); paths.forEach((p) => ok(/\/env\/producao\//.test(p), p));
  ok(ms.every((m) => /env\/producao/.test(m) || /\{database\}/.test(m) || /databases/.test(m)), ms.join(' | '));
});
t('nada pode ser apagado: todo delete é "if false"', () => {
  const dels = code.match(/allow (?:[a-z, ]*)delete[^;]*;/g) || []; ok(dels.length >= 8, 'poucos delete: ' + dels.length);
  const live = dels.filter((d) => !/if false;/.test(d)); ok(live.length === 1 && /canUsuarios\(\) && request\.auth\.uid != uid/.test(live[0]), 'só o admin_sistema exclui perfis (nunca o próprio): ' + live.join(' | '));
  dels.filter((d) => /if false;/.test(d)).forEach((d) => ok(/if false;/.test(d), d)); ok(dels.length >= 8);
});
t('eventos só podem ser criados (update/delete = false) e com o uid do autor', () => {
  const blk = /match \/env\/producao\/events\/\{eventId\} \{([\s\S]*?)\n    \}/.exec(code); ok(blk);
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
  Object.keys(map).forEach((fn) => { const a = noSys(roles(fn)), b = noSys(rolesWith(map[fn])); ok(setEq(a, b), fn + ': regras=' + a + ' permissions.js=' + b); });
  ok(rolesWith('usuarios').join() === 'admin_sistema' && roles('canUsuarios').join() === 'admin_sistema');
  P.EDITABLE.forEach((a) => ok(setEq(noSys(rolesWith(a)), P.defaultsFor(a).filter((x) => x !== 'admin_sistema')), 'defaultsFor ' + a));
  const g = /function isGlobal\(\)[^}]*\[([^\]]*)\]/.exec(code)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  ok(setEq(g, rolesWith('ver_global')), 'global');
});
t('modelo de regras usado nos testes == regras', () => {
  const R = FAKE.ROLES, map = { canVerBase: 'VER_BASE', canEntrada: 'ENTRADA', canConferir: 'CONFERIR', canOperacao: 'OPERACAO', canCorrecao: 'CORRECAO', canSaida: 'SAIDA', canEncerrar: 'ENCERRAR', canDevolucao: 'DEVOLUCAO', canUsuarios: 'USUARIOS', canConfig: 'CONFIG' };
  Object.keys(map).forEach((fn) => ok(setEq(noSys(roles(fn)), noSys(R[map[fn]])), fn));
});
t('motorista: regras de acesso exclusivo à PRÓPRIA operação', () => {
  ok(/function isDriver\(\)[^}]*role\(\) == 'motorista'/.test(code), 'isDriver'); ok(/function ownOp\(op\)[^}]*op\.driverId == userDoc\(\)\.data\.driverId/.test(code), 'ownOp compara driverId do servidor');
  const ops = /match \/env\/producao\/operations\/\{opId\} \{([\s\S]*?)\n    \}/.exec(code); ok(ops, 'bloco operations');
  const create = /allow create:[^;]*;/.exec(ops[1])[0]; ok(!/ownOp|isDriver/.test(create), 'motorista não cria operação');
  ok(/allow get:[^;]*ownOp\(resource\.data\)/.test(ops[1]) && /allow list:[^;]*ownOp\(resource\.data\)/.test(ops[1]), 'motorista lê só a própria operação');
  ok(!/allow list:[^;]*tokenOp/.test(ops[1]) && /allow get:[^;]*tokenOp\(opId, resource\.data\)/.test(ops[1]), 'QR: só leitura pontual (get), nunca lista');
  const up = /allow update:[\s\S]*?;\n/.exec(ops[1])[0]; ok(/ownOp\(resource\.data\)[^|]*hasOnly\(\['checked', 'history'\]\)/.test(up), 'motorista só altera checked/history'); ok(/hasOnly\(resource\.data\.packageCodes\)/.test(up), 'só códigos da própria operação');
  ok(!/ownOp[^|]*(saida_confirmada|encerrada)/.test(up), 'motorista não confirma saída nem encerra');
  const pk = /match \/env\/producao\/packages\/\{pkId\} \{([\s\S]*?)\n    \}/.exec(code); if (pk) ok(!/isDriver|ownOp/.test(pk[1]), 'motorista não lê pacotes');
  ['users', 'xpts', 'regions', 'drivers'].forEach((c) => { const b = new RegExp('match /env/producao/' + c + '/\\{[a-zA-Z]+\\} \\{([\\s\\S]*?)\\n    \\}').exec(code); ok(b, c); if (c !== 'drivers') ok(!/isDriver|ownOp/.test(b[1]), c + ' sem acesso do motorista'); });
  ok(/allow get, list:[^;]*isDriver\(\) && id == userDoc\(\)\.data\.driverId/.test(code), 'motorista só lê o próprio cadastro de motorista');
});
t('motorista por QR (sem login): o token da operação é a prova, em uma única operação', () => {
  ok(/function tokenOp\(opId, op\)[^}]*op\.token\.size\(\) >= 16[^}]*claimDoc\(\)\.data\.opId == opId[^}]*claimDoc\(\)\.data\.token == op\.token/.test(code), 'tokenOp compara opId e token do claim com a operação');
  const cl = /match \/env\/producao\/claims\/\{uid\} \{([\s\S]*?)\n    \}/.exec(code); ok(cl, 'bloco claims');
  ok(/request\.auth\.uid == uid/.test(cl[1]) && /hasOnly\(\['opId', 'token', 'at'\]\)/.test(cl[1]) && /allow list, delete: if false/.test(cl[1]), 'claim só do próprio uid, campos fixos, sem list/delete');
  const ops = /match \/env\/producao\/operations\/\{opId\} \{([\s\S]*?)\n    \}/.exec(code)[1];
  const up = /allow update:[\s\S]*?\n      allow delete/.exec(ops)[0];
  ok(/tokenOp\(opId, resource\.data\)[\s\S]*?hasOnly\(\['checked', 'history'\]\)[\s\S]*?hasOnly\(resource\.data\.packageCodes\)/.test(up), 'QR: só checked/history e códigos da própria operação');
  ok(/resource\.data\.state != 'encerrada'/.test(up), 'operação encerrada bloqueia também o QR');
  ok(!/tokenOp/.test((/match \/env\/producao\/packages[\s\S]*?\n    \}/.exec(code) || [''])[0]), 'QR não lê pacotes');
  ['users', 'xpts', 'regions', 'drivers', 'settings', 'codes', 'counters'].forEach((c) => { const b = new RegExp('match /env/producao/' + c + '/\\{[a-zA-Z]+\\} \\{([\\s\\S]*?)\\n    \\}').exec(code); ok(b && !/tokenOp/.test(b[1]), c + ' sem acesso por QR'); });
});
t('backup: perfis iguais a permissions.js e ao modelo de teste; coleção própria, base validada no servidor, imutável', () => {
  ok(setEq(roles('canBackupVer'), rolesWith('backup_ver')) && setEq(roles('canBackupVer'), FAKE.ROLES.BACKUP_VER), 'ver');
  ok(setEq(roles('canBackupCriar'), rolesWith('backup_criar')) && setEq(roles('canBackupCriar'), FAKE.ROLES.BACKUP_CRIAR), 'criar');
  const b = /match \/env\/producao\/backups\/\{bkId\} \{([\s\S]*?)\n    \}/.exec(code); ok(b, 'bloco backups (coleção própria em env/producao)');
  const rd = /allow get, list:[^;]*;/.exec(b[1])[0]; ok(/canBackupVer\(\)/.test(rd) && /isGlobal\(\) \|\| hasBase\(resource\.data\.xptId\)/.test(rd), 'leitura: própria base ou perfil global');
  const cr = /allow create:[\s\S]*?;\n/.exec(b[1])[0];
  ok(/canBackupCriar\(\)/.test(cr) && /hasBase\(request\.resource\.data\.xptId\)/.test(cr), 'criação valida a base no servidor');
  ok(/createdBy == request\.auth\.uid/.test(cr), 'autor = usuário logado'); ok(/vehicleType in \['passeio', 'utilitario', 'vuc'\]/.test(cr), 'tipos de veículo'); ok(/backupNumber in \['1', '2'\]/.test(cr), 'número do backup');
  ok(/keys\(\)\.hasOnly\(/.test(cr) && /keys\(\)\.hasAll\(/.test(cr), 'campos fixos'); ok(/id == bkId/.test(cr), 'id = documento');
  ok(/allow update, delete: if false/.test(b[1]), 'nunca edita nem apaga');
  ok(!/backups/.test(code.replace(b[0], '')), 'nenhuma outra regra mexe em backups');
});
t('permissions.js: só motorista tem conferir_propria; motorista não tem nenhuma ação administrativa', () => {
  ok(setEq(rolesWith('conferir_propria'), ['motorista']));
  ['ver_base', 'entrada', 'conferir', 'operacao', 'correcao', 'confirmar_saida', 'encerrar', 'devolucao', 'usuarios', 'config', 'ver_global'].forEach((a) => ok(!P.can('motorista', a), a));
  ok(P.can('despacho', 'entrada') && P.can('despacho', 'conferir') && !P.can('despacho', 'operacao'));
});
t('matriz editável: documento de permissões só pelo admin_sistema; motorista nunca vem da matriz', () => {
  ok(/function perm\(a, def\)[^}]*role\(\) == 'admin_sistema'[^}]*role\(\) != 'motorista'[^}]*exists\(permDoc\(\)\)[^}]*get\(permDoc\(\)\)\.data\[a\]/.test(code), 'perm()');
  ok(/id == 'permissions' \? canUsuarios\(\) : canConfig\(\)/.test(code), 'só admin_sistema grava a matriz');
  ok(/match \/env\/producao\/users\/\{uid\} \{[\s\S]*?allow create, update, delete: if canUsuarios\(\) && request\.auth\.uid != uid/.test(code), 'usuários: admin_sistema sem tocar no próprio');
  ['ver_base', 'entrada', 'conferir', 'operacao', 'correcao', 'confirmar_saida', 'encerrar', 'devolucao', 'config'].forEach((a) => ok(new RegExp("perm\\('" + a + "'").test(code), a));
  ok(/EDITABLE/.test(fs.readFileSync(path.join(__dirname, 'permissions.js'), 'utf8')));
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
