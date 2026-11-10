'use strict';
/* Teste de navegador da aba BACKUP (backend SIMULADO injetado; NÃO é o Firebase real). Celular (390px) e computador (1280px):
 * cadastro, validação, data automática, persistência após recarregar, filtros por período, supervisor só da própria base,
 * coordenador geral com filtro de base e sem cadastro, e tentativa de burlar a interface. Uso: node e2e-backup.js */
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { ({ chromium } = require('playwright')); }
const ROOT = __dirname;
let pass = 0, fail = 0;
function check(name, cond, extra) { if (cond) pass++; else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); } }
function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p === '/' ? 'index.html' : p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('nf'); return; }
      r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
    }).listen(0, '127.0.0.1', () => res(s));
  });
}
const U = 'env/teste/';
const SEED = `
(function () {
  var fake = window.CXPT_FAKE_FIREBASE.create({ storage: window.localStorage }), a = fake._admin;
  if (!a.getDoc('${U}xpts/x1')) {
    [['sup@t.com','supervisor',['x1']],['sup2@t.com','supervisor',['x2']],['geral@t.com','coord_geral',[]],['desp@t.com','despacho',['x1']]].forEach(function (u) {
      a.addAccount(u[0], 'senha-' + u[0], 'uid-' + u[0]);
      a.setDoc('${U}users/uid-' + u[0], { name: 'Nome ' + u[0].split('@')[0], email: u[0], role: u[1], xptIds: u[2], active: true, driverId: null });
    });
    a.setDoc('${U}xpts/x1', { name: 'XPT Teste Alfa', active: true }); a.setDoc('${U}xpts/x2', { name: 'XPT Teste Beta', active: true });
    a.setDoc('${U}settings/main', { stayLimitDays: 4 });
    function bk(id, x, date, route, num, at) { a.setDoc('${U}backups/' + id, { id: id, driverName: 'Motorista ' + route, routeName: 'Rota ' + route, routeId: 'ID-' + route, vehiclePlate: 'AAA1A11', vehicleType: 'passeio', backupNumber: num, xptId: x, backupDate: date, createdAt: at, createdBy: 'uid-sup@t.com' }); }
    bk('bk-s1', 'x1', '2026-09-15', 'ALFA-ANTIGA', '1', 1); bk('bk-s2', 'x2', '2026-09-10', 'BETA-ANTIGA', '2', 2);
  }
  window.CXPT_FB = fake; window.CXPT_FB_STATE = 'ready';
})();`;

async function newPage(browser, base, vp) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 600 });
  await ctx.addInitScript("(function(){var v;Object.defineProperty(window,'CXPT_FIREBASE',{configurable:true,get:function(){return v;},set:function(x){if(x)x.dataPath='env/teste';v=x;}});})();");
  await ctx.addInitScript({ content: fs.readFileSync(path.join(ROOT, 'fake-firebase.js'), 'utf8') }); await ctx.addInitScript({ content: SEED });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(base);
  return { ctx, page, errors };
}
const login = async (page, email) => { await page.fill('#login-email', email); await page.fill('#login-pass', 'senha-' + email); await page.click('#login-btn'); await page.waitForSelector('#main[data-render]', { timeout: 10000 }); };
const go = async (page, r) => { await page.evaluate((x) => { location.hash = '#/' + x; }, r); await page.waitForFunction((x) => document.getElementById('main').dataset.route === x, r); };
const rows = (page) => page.locator('#bk-list tbody tr').count();
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const server = (page) => page.evaluate(() => window.CXPT_FB._admin.listDocs('env/teste/backups').map((d) => d.data));

async function main(browser, base) {
  // ===== CELULAR: supervisor da base x1
  const m = await newPage(browser, base, { width: 390, height: 800 }), p = m.page;
  await login(p, 'sup@t.com');
  check('supervisor: item "Backup" no menu', (await p.locator('#nav a:has-text("Backup")').count()) === 1);
  await go(p, 'backup'); await p.waitForSelector('#bk-list tbody tr');
  check('celular: título, botão (+) Novo backup visível no topo e filtros', (await p.locator('h2:has-text("Backup")').count()) === 1 && await p.locator('#bk-new').isVisible() && await p.locator('#bk-from').isVisible() && await p.locator('#bk-to').isVisible());
  check('supervisor: não há filtro de Base', (await p.locator('#bk-base').count()) === 0);
  check('supervisor: vê só a própria base (1 registro da Alfa; o da Beta não aparece)', (await rows(p)) === 1 && /ALFA-ANTIGA/.test(await p.locator('#bk-list').innerText()) && !/BETA-ANTIGA/.test(await p.locator('body').innerText()));
  check('celular: sem rolagem horizontal na lista', await noHScroll(p));
  if (process.env.BK_SHOT) await p.screenshot({ path: process.env.BK_SHOT + '-lista.png', fullPage: true });
  const card = await p.locator('#bk-list tbody tr').first().innerText();
  check('registro mostra data, motorista, rota, ID, placa, tipo, nº do backup e base', /15\/09\/2026/.test(card) && /Motorista ALFA-ANTIGA/.test(card) && /Rota ALFA-ANTIGA/.test(card) && /ID-ALFA-ANTIGA/.test(card) && /AAA1A11/.test(card) && /Passeio/.test(card) && /1º backup/.test(card) && /XPT Teste Alfa/.test(card), card);
  // formulário
  await p.click('#bk-new'); await p.waitForSelector('#bk-form');
  check('celular: formulário sem rolagem horizontal; data e base automáticas (não digitáveis)', await noHScroll(p) && /automática/.test(await p.locator('#bk-auto').innerText()) && /XPT Teste Alfa/.test(await p.locator('#bk-auto').innerText()) && (await p.locator('#bk-form input[name=backupDate], #bk-form input[name=xptId], #bk-form select[name=xptId]').count()) === 0);
  const before = (await server(p)).length;
  await p.click('#bk-save');
  if (process.env.BK_SHOT) await p.screenshot({ path: process.env.BK_SHOT + '-form.png', fullPage: true });
  check('campos vazios: bloqueia, mostra um erro por campo e não grava', (await p.locator('#bk-form .field-error').count()) === 6 && /obrigat/.test(await p.locator('#bk-msg').innerText()) && (await server(p)).length === before);
  const opts = await p.locator('#bk-type option').allInnerTexts(), opts2 = await p.locator('#bk-num option').allInnerTexts();
  check('tipos de veículo (Passeio, Utilitário, VUC) e backups (1º, 2º) disponíveis', ['Passeio', 'Utilitário', 'VUC'].every((t) => opts.includes(t)) && ['1º backup', '2º backup'].every((t) => opts2.includes(t)));
  const fill = async (o) => { await p.fill('#bk-driver', o.d); await p.fill('#bk-route', o.r); await p.fill('#bk-routeid', o.i); await p.fill('#bk-plate', o.p); await p.selectOption('#bk-type', o.t); await p.selectOption('#bk-num', o.n); };
  await p.fill('#bk-driver', 'Só o nome'); await p.click('#bk-save');
  check('um campo preenchido não basta (ainda bloqueia os demais)', (await p.locator('#bk-form .field-error').count()) === 5 && (await server(p)).length === before);
  for (const [t, n, rid] of [['passeio', '1', 'T1'], ['utilitario', '2', 'T2'], ['vuc', '1', 'T3']]) {
    if (!(await p.locator('#bk-form').count())) { await p.click('#bk-new'); await p.waitForSelector('#bk-form'); }
    await fill({ d: 'Maria ' + t, r: 'Rota ' + t, i: rid, p: 'abc 1d2' + n, t, n }); await p.click('#bk-save');
    await p.waitForFunction((x) => /Backup salvo/.test(document.getElementById('bk-msg').textContent) && document.querySelector('#bk-list').innerText.indexOf(x) >= 0, rid);
  }
  const saved = await server(p), mine = saved.filter((x) => /^Maria /.test(x.driverName));
  check('três backups salvos (Passeio, Utilitário, VUC) com 1º e 2º', mine.length === 3 && ['passeio', 'utilitario', 'vuc'].every((t) => mine.some((x) => x.vehicleType === t)) && mine.some((x) => x.backupNumber === '1') && mine.some((x) => x.backupNumber === '2'));
  const today = await p.evaluate(() => window.CXPT.backup.brasiliaDate());
  check('Firestore: base da conta, autor autenticado, data automática de hoje (Brasília), placa em maiúsculas', mine.every((x) => x.xptId === 'x1' && x.createdBy === 'uid-sup@t.com' && x.backupDate === today && /^ABC1D2[12]$/.test(x.vehiclePlate) && typeof x.createdAt === 'number'), JSON.stringify(mine[0]));
  check('lista atualiza sem recarregar: 4 registros, o mais recente primeiro e o mais antigo por último', (await rows(p)) === 4 && /Rota vuc|ID-?T3|T3/.test(await p.locator('#bk-list tbody tr').first().innerText()) && /ALFA-ANTIGA/.test(await p.locator('#bk-list tbody tr').last().innerText()));
  await p.reload(); await p.waitForSelector('#main[data-render]'); await go(p, 'backup'); await p.waitForSelector('#bk-list tbody tr');
  check('persistência: depois de recarregar (e sair/entrar) os registros continuam', (await rows(p)) === 4);
  await p.click('#logout-btn'); await p.waitForSelector('#login-form'); await login(p, 'sup@t.com'); await go(p, 'backup'); await p.waitForSelector('#bk-list tbody tr');
  check('persistência: depois de sair e entrar de novo', (await rows(p)) === 4);
  // filtros
  await p.fill('#bk-from', '2026-09-01'); await p.fill('#bk-to', '2026-09-30'); await p.click('#bk-filter'); await p.waitForFunction(() => document.querySelectorAll('#bk-list tbody tr').length === 1);
  check('filtro de período (setembro): só o registro antigo', /ALFA-ANTIGA/.test(await p.locator('#bk-list').innerText()));
  await p.fill('#bk-from', '2026-09-15'); await p.fill('#bk-to', '2026-09-15'); await p.click('#bk-filter'); await p.waitForFunction(() => /ALFA-ANTIGA/.test(document.getElementById('bk-list').innerText));
  check('filtro inclui a data inicial e a final (15/09 a 15/09)', (await rows(p)) === 1);
  await p.fill('#bk-from', '2025-01-01'); await p.fill('#bk-to', '2025-01-31'); await p.click('#bk-filter'); await p.waitForSelector('#bk-list .empty');
  check('período sem registros: mensagem informativa', /Nenhum backup encontrado para este período/.test(await p.locator('#bk-list').innerText()));
  await p.fill('#bk-from', '2026-10-01'); await p.fill('#bk-to', '2026-09-01'); await p.click('#bk-filter');
  check('data inicial depois da final: aviso, sem consulta', /inicial não pode ser depois/.test(await p.locator('#bk-msg').innerText()));
  await p.click('#bk-clear'); await p.waitForFunction(() => document.querySelectorAll('#bk-list tbody tr').length === 4);
  check('limpar filtros: volta a todos os registros permitidos', (await rows(p)) === 4 && (await p.inputValue('#bk-from')) === '');
  // tentativa de burlar a interface (console / requisições)
  const bypass = await p.evaluate(async () => {
    const FB = window.CXPT_FB, out = {}, tryIt = async (k, f) => { try { await f(); out[k] = 'PASSOU'; } catch (e) { out[k] = e.code || 'erro'; } };
    await tryIt('listar tudo', () => FB.db.list('env/teste/backups', [])); await tryIt('listar base Beta', () => FB.db.list('env/teste/backups', [['xptId', '==', 'x2']])); await tryIt('ler da Beta', () => FB.db.get('env/teste/backups/bk-s2'));
    await tryIt('gravar na Beta', () => FB.db.runTransaction((tx) => { tx.set('env/teste/backups/bk-hack', { id: 'bk-hack', driverName: 'h', routeName: 'h', routeId: 'h', vehiclePlate: 'H', vehicleType: 'vuc', backupNumber: '1', xptId: 'x2', backupDate: '2026-10-27', createdAt: 1, createdBy: 'uid-sup@t.com' }); return Promise.resolve(); }));
    await tryIt('autor falso', () => FB.db.runTransaction((tx) => { tx.set('env/teste/backups/bk-hack2', { id: 'bk-hack2', driverName: 'h', routeName: 'h', routeId: 'h', vehiclePlate: 'H', vehicleType: 'vuc', backupNumber: '1', xptId: 'x1', backupDate: '2026-10-27', createdAt: 1, createdBy: 'uid-sup2@t.com' }); return Promise.resolve(); }));
    await tryIt('alterar existente', () => FB.db.runTransaction((tx) => tx.get('env/teste/backups/bk-s1').then(() => { tx.update('env/teste/backups/bk-s1', { xptId: 'x2' }); })));
    return out;
  });
  check('burlar pela interface/console: tudo recusado pelas regras (não só pelo visual)', Object.values(bypass).every((v) => v === 'permission-denied'), JSON.stringify(bypass));
  check('nenhum registro alheio ou falso foi gravado', (await server(p)).length === 5 && !(await server(p)).some((x) => /bk-hack/.test(x.id)));
  await p.evaluate(() => { location.hash = '#/backup/x2'; }); await p.waitForTimeout(300);
  check('mexer na URL não mostra a base alheia', !/BETA-ANTIGA/.test(await p.locator('body').innerText()));
  check('sem erros de JavaScript (supervisor, celular)', m.errors.length === 0, m.errors.join(' | '));
  // ===== COMPUTADOR: mesmo supervisor (tabela) e coordenador geral
  await p.setViewportSize({ width: 1280, height: 900 }); await go(p, 'backup'); await p.waitForSelector('#bk-list tbody tr');
  check('computador: tabela com cabeçalho organizado e sem rolagem horizontal', (await p.locator('#bk-list thead th').count()) === 8 && await noHScroll(p));
  await p.click('#logout-btn'); await p.waitForSelector('#login-form'); await login(p, 'geral@t.com'); await go(p, 'backup'); await p.waitForSelector('#bk-list tbody tr');
  check('coordenador geral: filtro Base visível, sem botão de novo backup', await p.locator('#bk-base').isVisible() && (await p.locator('#bk-new').count()) === 0);
  check('coordenador geral: vê as bases todas, com a base identificada em cada registro', (await rows(p)) === 5 && /XPT Teste Alfa/.test(await p.locator('#bk-list').innerText()) && /XPT Teste Beta/.test(await p.locator('#bk-list').innerText()));
  const optsBase = await p.locator('#bk-base option').allInnerTexts();
  check('opções do filtro: Todas as bases + cada base', optsBase[0] === 'Todas as bases' && optsBase.includes('XPT Teste Alfa') && optsBase.includes('XPT Teste Beta'));
  await p.selectOption('#bk-base', 'x2'); await p.click('#bk-filter'); await p.waitForFunction(() => document.querySelectorAll('#bk-list tbody tr').length === 1);
  check('coordenador geral: filtra por base (Beta → só o registro da Beta)', /BETA-ANTIGA/.test(await p.locator('#bk-list').innerText()));
  await p.selectOption('#bk-base', 'x1'); await p.fill('#bk-from', '2026-09-01'); await p.fill('#bk-to', '2026-09-30'); await p.click('#bk-filter'); await p.waitForFunction(() => document.querySelectorAll('#bk-list tbody tr').length === 1);
  check('coordenador geral: base + período combinados', /ALFA-ANTIGA/.test(await p.locator('#bk-list').innerText()));
  await p.click('#bk-clear'); await p.waitForFunction(() => document.querySelectorAll('#bk-list tbody tr').length === 5);
  const gen = await p.evaluate(async () => { try { await window.CXPT_FB.db.runTransaction((tx) => { tx.set('env/teste/backups/bk-g', { id: 'bk-g', driverName: 'g', routeName: 'g', routeId: 'g', vehiclePlate: 'G', vehicleType: 'vuc', backupNumber: '1', xptId: 'x1', backupDate: '2026-10-27', createdAt: 1, createdBy: 'uid-geral@t.com' }); return Promise.resolve(); }); return 'PASSOU'; } catch (e) { return e.code; } });
  check('coordenador geral não consegue registrar nem pelo console', gen === 'permission-denied');
  // ===== despacho: sem a aba
  await p.click('#logout-btn'); await p.waitForSelector('#login-form'); await login(p, 'desp@t.com');
  check('despacho: sem item Backup no menu', (await p.locator('#nav a:has-text("Backup")').count()) === 0);
  await go(p, 'backup'); check('despacho: abrir a rota diretamente mostra "sem acesso" e nenhum dado', /não tem acesso/.test(await p.locator('main').innerText()) && !/ALFA-ANTIGA|BETA-ANTIGA/.test(await p.locator('body').innerText()));
  // ===== supervisor da base Beta enxerga só a dele (outro aparelho com o mesmo banco)
  await p.click('#logout-btn'); await p.waitForSelector('#login-form'); await login(p, 'sup2@t.com'); await go(p, 'backup'); await p.waitForSelector('#bk-list tbody tr');
  check('supervisor da Beta: só o registro da Beta; nada da Alfa', (await rows(p)) === 1 && /BETA-ANTIGA/.test(await p.locator('#bk-list').innerText()) && !/ALFA-ANTIGA|Maria/.test(await p.locator('body').innerText()));
  check('sem erros de JavaScript (computador)', m.errors.length === 0, m.errors.join(' | '));
  await m.ctx.close();
  // ===== modo demonstração (sem apiKey): aba funciona em memória, com aviso de demonstração
  const c3 = await browser.newContext({ viewport: { width: 800, height: 800 } });
  await c3.addInitScript("(function(){var v;Object.defineProperty(window,'CXPT_FIREBASE',{configurable:true,get:function(){return v;},set:function(x){if(x&&x.config)x.config.apiKey='';v=x;}});})();");
  const d = await c3.newPage(); await d.goto(base); await d.waitForSelector('#main[data-render]');
  await d.selectOption('#profile-select', 'supervisor'); await go(d, 'backup'); await d.waitForSelector('#bk-new');
  await d.click('#bk-new'); await d.fill('#bk-driver', 'Demo'); await d.fill('#bk-route', 'R'); await d.fill('#bk-routeid', '1'); await d.fill('#bk-plate', 'DDD0D00'); await d.selectOption('#bk-type', 'vuc'); await d.selectOption('#bk-num', '2'); await d.click('#bk-save');
  await d.waitForFunction(() => document.querySelectorAll('#bk-list tbody tr').length === 1);
  check('demonstração: cadastro em memória com aviso de demonstração visível', /DEMONSTRAÇÃO/.test(await d.locator('.demo-banner').innerText()) && /2º backup/.test(await d.locator('#bk-list').innerText()));
  await c3.close();
}
(async () => {
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch();
  try { await main(browser, base); } catch (e) { fail++; console.log('  ✗ exceção: ' + (e && e.stack || e)); }
  await browser.close(); srv.close();
  console.log('e2e-backup: ' + pass + ' aprovados, ' + fail + ' reprovados');
  process.exit(fail ? 1 : 0);
})();
