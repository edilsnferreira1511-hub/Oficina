'use strict';
// Harness mínimo (sem dependências) + carregador dos módulos puros.
const path = require('path');
const MODS = ['data', 'geo', 'packages', 'codes', 'alerts', 'reports', 'permissions', 'audit', 'registry', 'ambulance', 'qr', 'operations', 'store'];
MODS.forEach((m) => require(path.join(__dirname, m + '.js')));
const NS = globalThis.CXPT;
let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; failures.push(name + ' → ' + e.message); console.log('  ✗ ' + name + '\n    ' + e.message); }
}
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'eq') + ': esperado ' + JSON.stringify(b) + ', obtido ' + JSON.stringify(a)); }
function ok(c, msg) { if (!c) throw new Error(msg || 'esperado verdadeiro'); }
function done(suite) {
  console.log(suite + ': ' + pass + ' aprovados, ' + fail + ' reprovados');
  if (fail) process.exit(1);
}
const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);
function fresh() { return NS.data.createDemoData(NOW); }
module.exports = { NS, test, eq, ok, done, NOW, fresh };
