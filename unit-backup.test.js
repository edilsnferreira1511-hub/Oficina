'use strict';
/* Aba Backup: regras puras (validação, data de Brasília, tipos, filtros) + permissões do perfil. */
const { NS, test, eq, ok, done } = require('./helpers');
const B = NS.backup, P = NS.permissions;
const good = { driverName: ' João  da Silva ', routeName: 'Rota Centro', routeId: 'R-123', vehiclePlate: 'abc 1d23', vehicleType: 'vuc', backupNumber: '1' };

test('cadastro válido: normaliza espaços e placa em maiúsculas', () => {
  const v = B.validate(good); ok(v.ok, JSON.stringify(v.errors));
  eq(v.value.driverName, 'João da Silva'); eq(v.value.vehiclePlate, 'ABC1D23');
});
test('campos obrigatórios vazios bloqueiam (um erro por campo)', () => {
  const v = B.validate({}); ok(!v.ok); eq(Object.keys(v.errors).sort(), ['backupNumber', 'driverName', 'routeId', 'routeName', 'vehiclePlate', 'vehicleType']);
  ['driverName', 'routeName', 'routeId', 'vehiclePlate'].forEach((k) => { const f = Object.assign({}, good, { [k]: '   ' }); const r = B.validate(f); ok(!r.ok && r.errors[k], k + ' só com espaços deve falhar'); });
});
test('os três tipos de veículo e os dois números de backup são aceitos; qualquer outro valor é recusado', () => {
  eq(B.VEHICLE_TYPES.map((t) => t.label), ['Passeio', 'Utilitário', 'VUC']); eq(B.BACKUP_NUMBERS.map((t) => t.label), ['1º backup', '2º backup']);
  ['passeio', 'utilitario', 'vuc'].forEach((t) => ok(B.validate(Object.assign({}, good, { vehicleType: t })).ok, t));
  ['1', '2'].forEach((n) => ok(B.validate(Object.assign({}, good, { backupNumber: n })).ok, n));
  ok(!B.validate(Object.assign({}, good, { vehicleType: 'caminhao' })).ok); ok(!B.validate(Object.assign({}, good, { backupNumber: '3' })).ok); ok(!B.validate(Object.assign({}, good, { backupNumber: 1 })).ok === false, 'número 1 vira "1"');
});
test('tamanhos máximos', () => {
  ok(!B.validate(Object.assign({}, good, { driverName: 'x'.repeat(81) })).ok); ok(!B.validate(Object.assign({}, good, { vehiclePlate: 'ABCDEFGHIJK' })).ok);
});
test('data automática no horário de Brasília (UTC-3), inclusive na virada do dia', () => {
  eq(B.brasiliaDate(Date.UTC(2026, 9, 27, 2, 30)), '2026-10-26', '23h30 do dia 26 em Brasília');
  eq(B.brasiliaDate(Date.UTC(2026, 9, 27, 3, 0)), '2026-10-27', 'meia-noite em Brasília');
  eq(B.brasiliaDate(Date.UTC(2026, 11, 31, 23, 59)), '2026-12-31'); eq(B.brasiliaDate(Date.UTC(2027, 0, 1, 2, 59)), '2026-12-31');
  eq(B.formatDate('2026-10-26'), '26/10/2026');
});
test('o documento gravado tem exatamente os campos pedidos; base e autor vêm do contexto, não do formulário', () => {
  const v = B.validate(Object.assign({}, good, { xptId: 'x-hack', createdBy: 'hack', backupDate: '1999-01-01' }));
  const d = B.build(v, { id: 'bk-1', xptId: 'x1', uid: 'u1', nowMs: Date.UTC(2026, 9, 27, 15, 0) });
  eq(Object.keys(d).sort(), B.FIELDS.slice().sort()); eq(d.xptId, 'x1'); eq(d.createdBy, 'u1'); eq(d.backupDate, '2026-10-27'); eq(d.createdAt, Date.UTC(2026, 9, 27, 15, 0));
});
test('filtro por período inclui as datas inicial e final; ordena do mais recente ao mais antigo; filtra por base', () => {
  const it = (id, date, x, at) => ({ id, backupDate: date, xptId: x, createdAt: at });
  const L = [it('a', '2026-10-01', 'x1', 1), it('b', '2026-10-05', 'x1', 2), it('c', '2026-10-05', 'x2', 3), it('d', '2026-10-09', 'x1', 4), it('e', '2026-10-12', 'x2', 5)];
  eq(B.filterSort(L, {}).map((x) => x.id), ['e', 'd', 'c', 'b', 'a'], 'ordem');
  eq(B.filterSort(L, { from: '2026-10-05', to: '2026-10-09' }).map((x) => x.id), ['d', 'c', 'b'], 'datas inclusivas');
  eq(B.filterSort(L, { from: '2026-10-10' }).map((x) => x.id), ['e']); eq(B.filterSort(L, { to: '2026-10-01' }).map((x) => x.id), ['a']);
  eq(B.filterSort(L, { xptId: 'x2' }).map((x) => x.id), ['e', 'c']); eq(B.filterSort(L, { from: '2027-01-01' }), []);
});
test('permissões: supervisor vê e registra; coordenador geral só vê; admin_sistema tudo; demais perfis nada', () => {
  eq(P.PROFILES.filter((p) => P.can(p.id, 'backup_ver')).map((p) => p.id), ['admin_sistema', 'coord_geral', 'supervisor']);
  eq(P.PROFILES.filter((p) => P.can(p.id, 'backup_criar')).map((p) => p.id), ['admin_sistema', 'supervisor']);
  ['administrador', 'coord_base', 'despacho', 'motorista'].forEach((p) => ok(!P.can(p, 'backup_ver') && !P.can(p, 'backup_criar'), p));
  ok(!P.EDITABLE.includes('backup_ver') && !P.EDITABLE.includes('backup_criar'), 'não entra na matriz editável (não altera outras permissões)');
});
done('unit-backup.test.js');
