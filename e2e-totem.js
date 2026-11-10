'use strict';
/* Teste de navegador do TOTEM de autoatendimento (backend SIMULADO injetado; NÃO é o Firebase real): cadastro do login do totem com a lista de
 * motoristas (Administração), passo a passo completo (2 pacotes: adicionar mais + finalizar), gravação com o motorista que devolveu,
 * duplicado, voltar, rotas bloqueadas e o motorista aparecendo em Pacotes, detalhe e Relatórios. Uso: node e2e-totem.js */
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
const TILE_HOST = 'https://tile.openstreetmap.org/', TILE_PNG = fs.readFileSync(path.join(ROOT, 'tile-simulado.png'));
const SEED = `
(function () {
  var fake = window.CXPT_FAKE_FIREBASE.create({ storage: window.localStorage }), a = fake._admin;
  if (!a.getDoc('${U}xpts/x1')) {
    [['sys@t.com','admin_sistema',[]],['sup@t.com','supervisor',['x1']],['novo-totem@t.com',null,[]]].forEach(function (u) {
      a.addAccount(u[0], 'senha-' + u[0], 'uid-' + u[0]);
      if (u[1]) a.setDoc('${U}users/uid-' + u[0], { name: 'Nome ' + u[0].split('@')[0], email: u[0], role: u[1], xptIds: u[2], active: true, driverId: null });
    });
    a.addAccount('totem@t.com', 'senha-totem@t.com', 'uid-totem@t.com');
    a.setDoc('${U}users/uid-totem@t.com', { name: 'Totem Alfa', email: 'totem@t.com', role: 'totem', xptIds: ['x1'], active: true, driverId: null, totemDrivers: ['João Pereira', 'Maria Souza', 'Carlos Lima'] });
    a.setDoc('${U}xpts/x1', { name: 'XPT Teste Alfa', active: true }); a.setDoc('${U}xpts/x2', { name: 'XPT Teste Beta', active: true });
    a.setDoc('${U}settings/main', { stayLimitDays: 4 });
  }
  window.CXPT_FB = fake; window.CXPT_FB_STATE = 'ready';
})();`;
async function newPage(browser, base, vp) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 600 });
  await ctx.route(TILE_HOST + '**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: TILE_PNG }));
  await ctx.addInitScript("(function(){var v;Object.defineProperty(window,'CXPT_FIREBASE',{configurable:true,get:function(){return v;},set:function(x){if(x)x.dataPath='env/teste';v=x;}});})();");
  await ctx.addInitScript({ content: fs.readFileSync(path.join(ROOT, 'fake-firebase.js'), 'utf8') }); await ctx.addInitScript({ content: SEED });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(base);
  return { ctx, page, errors };
}
const login = async (page, email) => { await page.fill('#login-email', email); await page.fill('#login-pass', 'senha-' + email); await page.click('#login-btn'); await page.waitForSelector('#main[data-render]', { timeout: 10000 }); };
const logout = async (page) => { await page.click('#logout-btn'); const ok = page.locator('.modal-back button:has-text("Sair")'); if (await ok.count()) await ok.click(); await page.waitForSelector('#login-form'); };
const go = async (page, r) => { await page.evaluate((x) => { location.hash = '#/' + x; }, r); await page.waitForFunction((x) => document.getElementById('main').dataset.route === x.split('/')[0], r); };
const doc = (page, p) => page.evaluate((x) => window.CXPT_FB._admin.getDoc(x), p);
const step = (page) => page.locator('#tt').getAttribute('data-step');

async function main(browser, base) {
  const m = await newPage(browser, base, { width: 768, height: 1024 }), p = m.page;
  // ===== Administração: criar o login do totem com a lista de motoristas
  await login(p, 'sys@t.com'); await go(p, 'setup'); await p.waitForSelector('#usr-new-role');
  check('Administração: a lista de motoristas fica escondida para os outros perfis', await p.locator('#totem-box').first().isHidden());
  await p.selectOption('#usr-new-role', 'totem');
  check('perfil Totem: aparece o campo da lista de motoristas', await p.locator('#usr-new-role ~ * , #totem-box').first().isVisible() || await p.locator('#totem-names').first().isVisible());
  await p.fill('#usr-new-uid', 'uid-novo-totem@t.com'); await p.fill('#usr-new-name', 'Totem Beta'); await p.fill('#usr-new-email', 'novo-totem@t.com'); await p.fill('#usr-new-xpts', 'x2');
  await p.locator('#totem-names').first().fill('Ana Ribeiro\nPaulo Santos\n\nana ribeiro'); await p.click('#usr-new-btn'); await p.waitForFunction(() => /Perfil criado|bases|base|erro|Informe/i.test(document.getElementById('usr-new-msg').textContent));
  const nt = await doc(p, U + 'users/uid-novo-totem@t.com');
  check('Firestore: totem criado com a base escolhida e a lista (sem repetidos)', nt && nt.role === 'totem' && JSON.stringify(nt.xptIds) === '["x2"]' && JSON.stringify(nt.totemDrivers) === '["Ana Ribeiro","Paulo Santos"]', JSON.stringify(nt));
  await p.click('#main'); await p.reload(); await p.waitForSelector('#main[data-render]'); await go(p, 'setup'); await p.waitForSelector('[id="usr-edit-uid-novo-totem@t.com"]');
  check('lista de usuários mostra quantos motoristas o totem tem', /2 motorista\(s\) na lista/.test(await p.locator('[id="usr-row-uid-novo-totem@t.com"]').innerText()));
  await p.click('[id="usr-edit-uid-novo-totem@t.com"]'); await p.waitForSelector('#user-edit-modal, .modal');
  check('editar: a lista atual aparece preenchida (um nome por linha)', (await p.locator('.modal #totem-names').inputValue()) === 'Ana Ribeiro\nPaulo Santos');
  await p.locator('.modal #totem-names').fill('Ana Ribeiro\nPaulo Santos\nNovo Motorista'); await p.click('#ue-save'); await p.waitForFunction(() => !document.querySelector('.modal-back'));
  check('editar: motorista novo incluído na lista do totem', JSON.stringify((await doc(p, U + 'users/uid-novo-totem@t.com')).totemDrivers) === '["Ana Ribeiro","Paulo Santos","Novo Motorista"]');
  await logout(p);

  // ===== TOTEM: passo a passo
  await login(p, 'totem@t.com'); await p.waitForSelector('#tt');
  check('totem: abre direto no passo a passo, sem menu lateral', (await p.evaluate(() => document.getElementById('sidebar') && getComputedStyle(document.getElementById('sidebar')).display)) === 'none' && (await step(p)) === '0' && /Quem está devolvendo/.test(await p.locator('#tt-title').innerText()));
  const names = await p.locator('#tt-drivers button').allInnerTexts();
  check('passo 1: a lista traz só os motoristas deste totem', names.length === 3 && names.some((n) => /João Pereira/.test(n)) && !names.some((n) => /Ana Ribeiro/.test(n)));
  check('passo 1: Continuar bloqueado até escolher o nome', await p.locator('#tt-next').isDisabled());
  if (process.env.TT_SHOT) await p.screenshot({ path: process.env.TT_SHOT + '-motorista.png' });
  await p.click('#tt-drivers button:has-text("João Pereira")'); check('passo 1: nome escolhido libera o botão', await p.locator('#tt-next').isEnabled());
  await p.click('#tt-next'); await p.waitForSelector('#tt-code');
  check('passo 2: campo do código com foco para o leitor', (await step(p)) === '1' && await p.evaluate(() => document.activeElement && document.activeElement.id === 'tt-code'));
  await p.click('#tt-back'); check('voltar: retorna ao passo anterior mantendo o nome', (await step(p)) === '0' && (await p.locator('#tt-drivers button.sel').count()) === 1);
  await p.click('#tt-next'); await p.fill('#tt-code', '!!'); check('código inválido: avisa e bloqueia', await p.locator('#tt-next').isDisabled() && (await p.locator('#tt-codehint').innerText()).length > 0);
  await p.fill('#tt-code', 'tot-001'); await p.press('#tt-code', 'Enter'); await p.waitForSelector('#tt-sizes');
  const sizes = await p.locator('#tt-sizes button').allInnerTexts();
  check('passo 3: tamanhos do sistema (Pequeno, Médio, Grande/volumoso)', sizes.length === 3 && (await step(p)) === '2' && await p.locator('#tt-next').isDisabled());
  if (process.env.TT_SHOT) await p.screenshot({ path: process.env.TT_SHOT + '-tamanho.png' });
  await p.click('#tt-sizes button:nth-child(2)'); await p.click('#tt-next'); await p.waitForSelector('#tt-reasons');
  check('passo 4: motivos do sistema', (await p.locator('#tt-reasons button').count()) >= 3 && await p.locator('#tt-next').isDisabled());
  await p.click('#tt-reasons button:nth-child(2)'); await p.fill('#tt-note', 'Portão fechado'); await p.click('#tt-next'); await p.waitForSelector('#tt-map');
  check('passo 5: mapa para marcar o local; confirmar bloqueado sem ponto', (await step(p)) === '4' && await p.locator('#tt-map').isVisible() && await p.locator('#tt-confirm-loc').isDisabled());
  await p.waitForTimeout(500); if (process.env.TT_SHOT) await p.screenshot({ path: process.env.TT_SHOT + '-mapa.png' });
  await p.locator('#tt-map').click({ position: { x: 200, y: 150 } }); await p.waitForFunction(() => !document.getElementById('tt-confirm-loc').disabled);
  await p.click('#tt-confirm-loc'); await p.waitForSelector('#tt-sum');
  if (process.env.TT_SHOT) await p.screenshot({ path: process.env.TT_SHOT + '-resumo.png' });
  const sum = await p.locator('#tt-sum').innerText();
  check('passo 6: resumo com motorista, código, tamanho, motivo, observação e localização', (await step(p)) === '5' && /João Pereira/.test(sum) && /TOT-001/.test(sum) && /Portão fechado/.test(sum) && /confirmada no mapa/.test(sum), sum);
  check('passo 6: dois botões — Adicionar mais pacote e Finalizar', await p.locator('#tt-more').isVisible() && await p.locator('#tt-finish').isVisible());
  await p.click('#tt-more'); await p.waitForSelector('#tt-code');
  check('adicionar mais: volta ao código, mantém o motorista e mostra o contador', (await step(p)) === '1' && /1 pacote\(s\) já registrado/.test(await p.locator('#tt-added').innerText()));
  const p1 = await doc(p, U + 'packages/pk-TOT-001');
  check('Firestore: pacote 1 salvo com motorista, base, tamanho, motivo, observação e localização', p1 && p1.returnedBy === 'João Pereira' && p1.xptId === 'x1' && p1.state === 'em_estoque' && p1.note === 'Portão fechado' && p1.location.kind === 'marcada' && typeof p1.location.lat === 'number' && /devolvido por: João Pereira/.test(p1.history[0].note), JSON.stringify(p1));
  await p.fill('#tt-code', 'TOT-001'); check('código repetido na mesma sessão: bloqueia com aviso', await p.locator('#tt-next').isDisabled() && /já registrou/.test(await p.locator('#tt-codehint').innerText()));
  await p.fill('#tt-code', 'TOT-002'); await p.press('#tt-code', 'Enter'); await p.click('#tt-sizes button:nth-child(1)'); await p.click('#tt-next'); await p.click('#tt-reasons button:nth-child(1)'); await p.click('#tt-next'); await p.waitForSelector('#tt-skip-loc');
  await p.click('#tt-skip-loc'); await p.waitForSelector('#tt-sum');
  check('sem localização: resumo informa "não informada"', /não informada/.test(await p.locator('#tt-sum').innerText()) && /Pacote 2/.test(await p.locator('#tt-title').innerText()));
  await p.click('#tt-finish'); await p.waitForSelector('#tt-donemsg');
  check('finalizar: tela de agradecimento com os 2 pacotes', /João/.test(await p.locator('#tt-title').innerText()) && /2 pacote/.test(await p.locator('#tt-donemsg').innerText()) && (await p.locator('.tt-recap div').count()) === 2);
  const p2 = await doc(p, U + 'packages/pk-TOT-002');
  check('Firestore: pacote 2 salvo sem localização confirmada, mesmo motorista', p2 && p2.returnedBy === 'João Pereira' && p2.location.kind === 'pendente' && p2.location.lat === null);
  check('autor do evento é o login do totem; índice de código criado', (await p.evaluate(() => window.CXPT_FB._admin.listDocs('env/teste/events').filter((e) => e.data.code === 'TOT-001' && e.data.uid === 'uid-totem@t.com').length)) === 1 && !!(await doc(p, U + 'codes/TOT-001')));
  await p.click('#tt-new'); check('novo atendimento: volta ao início sem nome escolhido', (await step(p)) === '0' && (await p.locator('#tt-drivers button.sel').count()) === 0 && (await p.locator('#tt-added').innerText()) === '');
  // pacote que já existe no sistema
  await p.click('#tt-drivers button:has-text("Maria Souza")'); await p.click('#tt-next'); await p.fill('#tt-code', 'TOT-001'); await p.press('#tt-code', 'Enter'); await p.click('#tt-sizes button:nth-child(1)'); await p.click('#tt-next'); await p.click('#tt-reasons button:nth-child(1)'); await p.click('#tt-next'); await p.click('#tt-skip-loc'); await p.waitForSelector('#tt-sum'); await p.click('#tt-finish');
  await p.waitForSelector('#tt-err');
  check('pacote já registrado no sistema: aviso claro e nada duplicado', /já está registrado/.test(await p.locator('#tt-err').innerText()) && (await p.evaluate(() => window.CXPT_FB._admin.listDocs('env/teste/packages').length)) === 2);
  // rotas bloqueadas
  await p.evaluate(() => { location.hash = '#/packages'; }); await p.waitForTimeout(300);
  check('totem não abre outras telas (Pacotes, Administração, Backup, Relatórios)', await (async () => { for (const r of ['packages', 'setup', 'backup', 'reports', 'overview', 'entry']) { await p.evaluate((x) => { location.hash = '#/' + x; }, r); await p.waitForTimeout(150); if ((await p.locator('#main').getAttribute('data-route')) !== 'totem' || (await p.locator('#tt').count()) !== 1) return false; } return true; })());
  const tamper = await p.evaluate(async () => { const FB = window.CXPT_FB, out = {}; for (const [k, f] of [['pacotes', () => FB.db.list('env/teste/packages', [['xptId', '==', 'x1']])], ['usuarios', () => FB.db.list('env/teste/users', [])], ['promover', () => FB.db.runTransaction((tx) => { tx.set('env/teste/users/uid-totem@t.com', { name: 'x', role: 'admin_sistema', xptIds: [], active: true }); return Promise.resolve(); })]]) { try { await f(); out[k] = 'PASSOU'; } catch (e) { out[k] = e.code; } } return out; });
  check('burlar pelo console: recusado pelas regras', Object.values(tamper).every((v) => v === 'permission-denied'), JSON.stringify(tamper));
  check('sem erros de JavaScript no totem', m.errors.length === 0, m.errors.join(' | '));
  // ===== celular estreito: sem rolagem horizontal
  await p.setViewportSize({ width: 390, height: 800 }); await go(p, 'totem'); await p.waitForSelector('#tt-drivers');
  check('totem em tela estreita: sem rolagem horizontal e botões visíveis', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1) && await p.locator('#tt-next').isVisible());
  await p.setViewportSize({ width: 768, height: 1024 }); await logout(p);

  // ===== Equipe: o motorista aparece no pacote, na listagem e no relatório
  await login(p, 'sup@t.com'); await go(p, 'packages'); await p.waitForSelector('#pkg-count');
  const th = await p.locator('table thead th').allInnerTexts();
  check('Pacotes: coluna "Devolvido por" com o motorista', th.some((x) => /devolvido por/i.test(x)) && /João Pereira/.test(await p.locator('table tbody').innerText()));
  await go(p, 'package/pk-TOT-001'); await p.waitForSelector('.dl');
  const dl = await p.locator('.dl').innerText();
  check('detalhe do pacote: "Motorista que devolveu" e o histórico registram quem devolveu', /Motorista que devolveu\s*João Pereira/.test(dl) && /devolvido por: João Pereira/.test(await p.locator('main').innerText()));
  await go(p, 'reports'); await p.waitForSelector('#rep-devolucoes-por-motorista');
  const rep = await p.locator('#rep-devolucoes-por-motorista').innerText();
  check('Relatórios: devoluções por motorista (João Pereira = 2) com exportação CSV', /João Pereira/.test(rep) && /\b2\b/.test(rep) && (await p.locator('#rep-devolucoes-por-motorista [data-csv]').count()) === 1, rep);
  check('sem erros de JavaScript (equipe)', m.errors.length === 0, m.errors.join(' | '));
  await m.ctx.close();
}
(async () => {
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch();
  try { await main(browser, base); } catch (e) { fail++; console.log('  ✗ exceção: ' + (e && e.stack || e)); }
  await browser.close(); srv.close();
  console.log('e2e-totem: ' + pass + ' aprovados, ' + fail + ' reprovados');
  process.exit(fail ? 1 : 0);
})();
