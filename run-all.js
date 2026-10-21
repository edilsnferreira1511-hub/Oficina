'use strict';
/* Executa todas as suítes (unitárias em Node + navegador com Playwright/Chromium) e devolve código ≠ 0 se algo falhar.
 * Uso: node run-all.js            (SKIP_E2E=1 para pular o navegador) */
const { spawnSync } = require('child_process');
const path = require('path');
const suites = [['unit', 'unit.test.js']];
if (!process.env.SKIP_E2E) suites.push(['e2e (Chromium)', 'e2e.js']);
let bad = 0;
for (const [label, file] of suites) {
  console.log('\n### ' + label);
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 900000 });
  const out = (r.stdout || '') + (r.stderr || '');
  console.log(out.split('\n').filter((l) => !/^\s*\x1b\[2m/.test(l)).slice(-25).join('\n'));
  if (r.status !== 0) bad++;
}
console.log(bad ? '\nFALHOU: ' + bad + ' suíte(s) com falha' : '\nTodas as suítes executadas passaram.');
process.exit(bad ? 1 : 0);
