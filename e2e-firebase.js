'use strict';
/* Teste de navegador do MODO FIREBASE contra o backend SIMULADO (fake-firebase.js injetado antes da página): login real de interface,
 * bloqueio das telas, gravação/recuperação após recarregar, ambulância + zona + QR + separação + saída + encerramento com gravação,
 * expiração de sessão. NÃO prova nada sobre o Firebase real nem sobre as regras publicadas. Ladrilhos do mapa interceptados (sintéticos).
 * Uso: node e2e-firebase.js */
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { ({ chromium } = require('playwright')); }
const ROOT = __dirname, TILE_HOST = 'https://tile.openstreetmap.org/';
const TILE_PNG = fs.readFileSync(path.join(ROOT, 'tile-simulado.png'));
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
  var fake = window.CXPT_FAKE_FIREBASE.create({ storage: window.localStorage });
  var a = fake._admin;
  if (!a.getDoc('${U}xpts/x1')) {
    [['desp@t.com','despacho',['x1']],['coord@t.com','coord_base',['x1']],['sup@t.com','supervisor',['x1']],['semcad@t.com',null,[]],['sys@t.com','admin_sistema',[]],['mot@t.com','motorista',['x1']]].forEach(function (u) {
      a.addAccount(u[0], 'senha-' + u[0], 'uid-' + u[0]);
      if (u[1]) a.setDoc('${U}users/uid-' + u[0], { name: 'Nome ' + u[0].split('@')[0], email: u[0], role: u[1], xptIds: u[2], active: true, driverId: u[1] === 'motorista' ? 'm1' : null });
    });
    a.setDoc('${U}xpts/x1', { name: 'XPT Teste Alfa', active: true });
    a.setDoc('${U}xpts/x2', { name: 'XPT Teste Beta', active: true });
    a.setDoc('${U}drivers/m1', { name: 'Motorista Teste 1', ident: 'MOT-1', xptId: 'x1', state: 'ativo' });
    a.setDoc('${U}drivers/m2', { name: 'Motorista Teste 2', ident: 'MOT-2', xptId: 'x1', state: 'ativo' });
    a.setDoc('${U}settings/main', { stayLimitDays: 4 });
  }
  window.CXPT_FB = fake; window.CXPT_FB_STATE = 'ready';
})();`;

async function main(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const external = [], errors = [];
  await ctx.route(TILE_HOST + '**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: TILE_PNG }));
  // o backend simulado modela o caminho env/teste; o firebase-config.js entregue usa env/producao (regras publicadas para esse caminho)
  await ctx.addInitScript("(function(){var v;Object.defineProperty(window,'CXPT_FIREBASE',{configurable:true,get:function(){return v;},set:function(x){if(x)x.dataPath='env/teste';v=x;}});})();");
  await ctx.addInitScript({ content: fs.readFileSync(path.join(ROOT, 'fake-firebase.js'), 'utf8') });
  await ctx.addInitScript({ content: SEED });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { const u = r.url(); if (!/^(data:|blob:)/.test(u) && !u.startsWith(new URL(base).origin + '/') && !u.startsWith(TILE_HOST)) external.push(u); });
  const txt = (sel) => page.locator(sel).first().innerText();
  const doc = (p) => page.evaluate((x) => window.CXPT_FB._admin.getDoc(x), p);
  const docs = (c) => page.evaluate((x) => window.CXPT_FB._admin.listDocs(x), c);
  const login = async (email) => {
    await page.fill('#login-email', email); await page.fill('#login-pass', 'senha-' + email); await page.click('#login-btn');
    await page.waitForSelector('#main[data-render], #blocked-msg', { timeout: 10000 });
  };
  const logout = async () => { await page.click('#logout-btn'); await page.waitForSelector('#login-form'); };
  const go = async (route) => { await page.evaluate((r) => { location.hash = '#/' + r; }, route); await page.waitForFunction((r) => document.getElementById('main').dataset.route === r.split('/')[0], route); };
  const fillEntry = async (code, size, reason) => { await page.fill('#code-in', code); await page.press('#code-in', 'Enter'); await page.selectOption('select[name=size]', size); await page.selectOption('select[name=reasonId]', reason); };
  const mapBox = async (sel) => { await page.locator(sel).evaluate((e) => e.scrollIntoView({ block: 'center' })); return page.locator(sel).boundingBox(); };

  // ===== login e bloqueio de telas
  await page.goto(base + '#/packages');
  await page.waitForSelector('#login-form');
  check('17. sem login: só a tela de entrada aparece; telas internas escondidas', (await page.locator('.shell').isHidden()) && (await page.locator('#nav a').count()) === 0 && (await page.locator('#login-email').isVisible()));
  check('17. sem login: nenhum dado de pacote no DOM', !/DEMO-|Pacotes/.test(await page.locator('body').innerText()) || (await page.locator('#main').innerText()) === '');
  await page.fill('#login-email', 'desp@t.com'); await page.fill('#login-pass', 'errada'); await page.click('#login-btn');
  await page.waitForFunction(() => /incorretos/.test(document.getElementById('login-msg').textContent));
  check('17. senha errada: mensagem clara, continua na tela de login', await page.locator('#login-form').isVisible());
  await page.fill('#login-email', ''); await page.click('#reset-btn');
  check('17. recuperar senha exige e-mail', /Digite seu e-mail/.test(await txt('#login-msg')));
  await page.fill('#login-email', 'desp@t.com'); await page.click('#reset-btn');
  await page.waitForFunction(() => /enviamos um link/.test(document.getElementById('login-msg').textContent));
  check('17. recuperar senha: pedido registrado no backend (resposta genérica)', (await page.evaluate(() => window.CXPT_FB._admin.resets())).includes('desp@t.com'));
  await page.fill('#login-email', 'semcad@t.com'); await page.fill('#login-pass', 'senha-semcad@t.com'); await page.click('#login-btn');
  await page.waitForSelector('#blocked-msg');
  check('17. usuário sem cadastro de perfil: acesso bloqueado com instrução', /ainda não foi liberado/.test(await txt('#blocked-msg')) && (await page.locator('.shell').isHidden()));
  await page.click('#blocked-out'); await page.waitForSelector('#login-form');

  await login('desp@t.com');
  check('17. login: perfil carregado do Firestore (nome e perfil), sem seletor de perfil demonstrativo', /Nome desp/.test(await txt('#user-badge')) && /Despacho/.test(await txt('#user-badge')) && (await page.locator('#profile-select').count()) === 0);
  check('17. uso real: sem faixa de teste/demonstração e sem textos de protótipo na tela', (await page.locator('.demo-banner').isHidden()) && !/protótipo|fictício|demonstra/i.test(await page.locator('body').innerText()));
  check('17. só a base liberada aparece', (await page.locator('#xpt-select option').allInnerTexts()).join('|') === 'XPT Teste Alfa');
  check('17. pessoa não escolhe o próprio perfil (nenhum controle de perfil na tela)', (await page.locator('select[aria-label*="Perfil"]').count()) === 0);

  // ===== entrada com gravação real
  await go('entry');
  await fillEntry('fb-001', 'M', 'r_ausente');
  const box = await mapBox('#entry-map .gmap');
  await page.mouse.click(box.x + box.width / 2 + 30, box.y + box.height / 2 - 20);
  await page.click('#confirm-loc'); await page.click('#add-btn');
  await fillEntry('fb-002', 'P', 'r_outros'); await page.click('#add-btn'); // sem localização confirmada
  await page.click('#confirm-entry');
  check('18. confirmação informa gravação no servidor (não memória)', /Firestore|servidor/.test(await txt('.modal-back')) && !/MEMÓRIA/.test(await txt('.modal-back')));
  await page.click('#confirm-entry-ok');
  await page.waitForFunction(() => /e gravado\(s\) no servidor/.test(document.getElementById('entry-msg').textContent));
  const p1 = await doc(U + 'pk-x'.replace('pk-x', 'packages/pk-FB-001')), p2 = await doc(U + 'packages/pk-FB-002');
  check('18. pacote gravado no Firestore com coordenadas reais, XPT, estado, histórico', p1 && p1.xptId === 'x1' && p1.state === 'em_estoque' && Math.abs(p1.location.lat + 16.33) < 0.5 && p1.location.kind === 'marcada' && p1.history.length === 1);
  check('18. pacote sem localização confirmada gravado sem coordenadas inventadas', p2 && p2.location.kind === 'pendente' && p2.location.lat === null);
  check('18. evento de auditoria imutável com o usuário autenticado', (await docs(U + 'events')).filter((e) => e.data.uid === 'uid-desp@t.com').length === 2);
  check('18. tudo gravado sob env/teste', (await page.evaluate(() => Object.keys(window.CXPT_FB._admin.state().docs).every((p) => p.indexOf('env/teste/') === 0))));

  // ===== recarregar: sessão e dados continuam
  await page.reload(); await page.waitForSelector('#main[data-render]');
  check('20. recarregar: sessão mantida (sem novo login) e dados recuperados', (await page.locator('#login-form').count()) === 0 && /Nome desp/.test(await txt('#user-badge')));
  await go('packages');
  check('20. pacotes gravados aparecem na listagem após recarregar', /FB-001/.test(await txt('main')) && /FB-002/.test(await txt('main')));
  await go('entry'); await page.fill('#code-in', 'fb-001'); await page.press('#code-in', 'Enter');
  check('20. consulta posterior: localização salva é mostrada (sem marcar de novo)', /Pacote já cadastrado/.test(await txt('#existing-box')) && /-16\.\d+/.test(await txt('#existing-box')));
  await page.click('#reentry-btn');
  await page.waitForFunction(() => /gravada no servidor/.test(document.getElementById('entry-msg').textContent));
  check('18. reentrada gravada como evento sem duplicar', (await doc(U + 'packages/pk-FB-001')).history.length === 2 && (await docs(U + 'packages')).length === 2);
  // despacho não vê telas que não são dele
  await go('map');
  check('19. perfil Despacho não cria ambulância (sem acesso à tela do mapa de planejamento)', /sem acesso|Perfil sem acesso/.test(await txt('main')) || (await page.locator('#amb-create').count()) === 0);

  // ===== coordenador de base: pacotes, zona, ambulância
  await logout();
  await login('desp@t.com'); await go('entry');
  await fillEntry('fb-003', 'G', 'r_recusou');
  let b2 = await mapBox('#entry-map .gmap'); await page.mouse.click(b2.x + b2.width / 2 - 40, b2.y + b2.height / 2 + 30); await page.click('#confirm-loc'); await page.click('#add-btn');
  await page.click('#confirm-entry'); await page.click('#confirm-entry-ok');
  await page.waitForFunction(() => /e gravado\(s\) no servidor/.test(document.getElementById('entry-msg').textContent));
  await logout();
  await login('coord@t.com');
  await go('map');
  check('19. pontos vêm do Firestore (2 com coordenadas)', /2 ponto/.test(await txt('#points-count')));
  await page.locator('#regions-map .gmap-zoom[aria-label=Afastar]').click();
  await page.click('#zone-draw'); let mb = await mapBox('#regions-map .gmap');
  for (const [x, y] of [[24, 24], [mb.width - 70, 24], [mb.width - 70, mb.height - 50], [24, mb.height - 50]]) await page.mouse.click(mb.x + x, mb.y + y);
  await page.click('#zone-finish');
  check('6. zona: dois pacotes com coordenadas reais dentro e selecionados', (await page.getAttribute('#zone-count', 'data-eligible')) === '2' && (await page.getAttribute('#sel-count', 'data-count')) === '2');
  await page.fill('#amb-name', 'Ambulância FB'); await page.fill('#amb-resp', 'Resp FB');
  await page.click('#amb-create');
  check('3. sem motorista não cria: mensagem pede o motorista e nada é gravado', /Escolha o motorista/.test(await txt('#amb-msg')) && !(await doc(U + 'operations/OP-0001')));
  await page.selectOption('#amb-driver', 'm1');
  // falha de gravação: o erro REAL aparece ao lado do botão, nada é criado, nada é mostrado como sucesso
  await page.evaluate(() => window.CXPT_FB._admin.setFail(true));
  await page.click('#amb-create'); await page.click('#amb-create-ok');
  await page.waitForFunction(() => /Nada foi criado/.test((document.getElementById('amb-msg') || {}).textContent || ''));
  check('1. erro de gravação: mensagem real junto ao botão, sem QR e sem operação gravada (sem falso sucesso)', (await page.locator('#qr-modal').count()) === 0 && !(await doc(U + 'operations/OP-0001')) && (await docs(U + 'operations')).length === 0 && /Nada foi criado/.test(await txt('#amb-msg')));
  check('1. erro de gravação: pacotes continuam livres (sem trava de operação)', (await doc(U + 'packages/pk-FB-001')).activeOpId == null);
  await page.evaluate(() => window.CXPT_FB._admin.setFail(false));
  await page.click('#amb-create');
  check('3. resumo antes de confirmar: pacotes, data/hora, estado e operador', /2 pacote\(s\) serão vinculados/.test(await txt('#amb-confirm-text')) && /Data\/hora/.test(await txt('#amb-confirm-meta')) && /Em separação/.test(await txt('#amb-confirm-meta')) && /Nome coord/.test(await txt('#amb-confirm-meta')));
  await page.click('#amb-create-ok'); await page.waitForSelector('#qr-modal');
  const op = await doc(U + 'operations/OP-0001');
  check('9. ambulância gravada com motorista e cor da paleta', op && op.driverId === 'm1' && /^#[0-9a-f]{6}$/.test(op.color));
  check('9. operação gravada: id único, base, responsável, pacotes, estado, criador autenticado', op && op.xptId === 'x1' && op.packageIds.length === 2 && op.state === 'em_separacao' && op.responsible === 'Resp FB' && /Nome coord/.test(op.createdBy));
  check('9. pacotes vinculados à operação (trava de operação ativa) e em separação', (await doc(U + 'packages/pk-FB-001')).activeOpId === 'OP-0001' && (await doc(U + 'packages/pk-FB-003')).state === 'em_separacao');
  const qrUrl = await txt('#qr-url'); check('9. QR contém só o endereço da operação', new RegExp('#/separation/OP-0001/[0-9a-f]{32}$').test(qrUrl));
  await page.locator('.modal-back button:has-text("Fechar")').click();

  // ===== QR aberto em "outro aparelho": nova aba, mesma conta → carrega a operação gravada
  const p2tab = await ctx.newPage();
  await p2tab.goto(qrUrl); await p2tab.waitForSelector('#main[data-render]');
  check('10. QR em carga nova: operação carregada do Firestore (nome, responsável, totais)', /Ambulância FB/.test(await p2tab.locator('main').innerText()) && (await p2tab.locator('#cnt-total').innerText()) === '2' && (await p2tab.locator('#cnt-pending').innerText()) === '2');
  check('10. campo de bipagem com foco para leitor USB/Bluetooth', await p2tab.evaluate(() => document.activeElement && document.activeElement.id === 'scan-in'));
  const scan = async (pg, c) => { await pg.fill('#scan-in', c); await pg.press('#scan-in', 'Enter'); await pg.waitForFunction((x) => document.getElementById('scan-result').textContent.length > 0, c); };
  await scan(p2tab, 'fb-001'); await p2tab.waitForSelector('.conf-item[data-code=FB-001][data-state=conferido]');
  check('11. bipagem: cinza → verde, gravada no servidor', (await p2tab.locator('#cnt-done').innerText()) === '1' && !!(await doc(U + 'operations/OP-0001')).checked['FB-001']);
  await scan(p2tab, 'FB-001');
  check('13. código repetido: avisa e não incrementa', /já conferido/.test(await p2tab.locator('#scan-result').innerText()) && (await p2tab.locator('#cnt-done').innerText()) === '1');
  await scan(p2tab, 'NAO-EXISTE');
  check('14. código desconhecido: aviso sem alterar a lista', (await p2tab.locator('#scan-result').getAttribute('data-status')) === 'inexistente' && (await p2tab.locator('#cnt-done').innerText()) === '1');
  await p2tab.close();
  // ===== motorista SEM login: celular novo (outro contexto, nenhuma sessão), lê o QR e entra direto na própria ambulância
  const serverState = await page.evaluate(() => localStorage.getItem('cxpt-fake-fb'));
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await ctx2.route(TILE_HOST + '**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: TILE_PNG }));
  await ctx2.addInitScript("(function(){var v;Object.defineProperty(window,'CXPT_FIREBASE',{configurable:true,get:function(){return v;},set:function(x){if(x)x.dataPath='env/teste';v=x;}});})();");
  await ctx2.addInitScript({ content: fs.readFileSync(path.join(ROOT, 'fake-firebase.js'), 'utf8') });
  await ctx2.addInitScript('(function(){try{if(!localStorage.getItem("cxpt-fake-fb"))localStorage.setItem("cxpt-fake-fb",' + JSON.stringify(serverState) + ');}catch(e){}})();');
  await ctx2.addInitScript({ content: SEED });
  const dp = await ctx2.newPage(); dp.on('pageerror', (e) => errors.push('pageerror(motorista): ' + e.message));
  await dp.goto(qrUrl); await dp.waitForSelector('#drv-in, #blocked-msg', { timeout: 10000 });
  check('QR sem login: não pede e-mail nem senha e abre direto a ambulância', (await dp.locator('#login-form').count()) === 0 && (await dp.locator('#drv-in').count()) === 1 && /Ambulância FB/.test(await dp.locator('main').innerText()));
  check('QR sem login: mostra o nome do motorista e os totais', /Motorista Teste 1/.test(await dp.locator('#drv-info').innerText()) && (await dp.locator('#cnt-total').innerText()) === '2');
  check('QR sem login: menu reduzido (só "Minha ambulância")', (await dp.locator('#nav a').count()) === 1);
  const qscan = async (c) => { await dp.fill('#drv-in', c); await dp.press('#drv-in', 'Enter'); await dp.waitForFunction(() => { const r = document.getElementById('drv-in-result'); return r && r.textContent.length > 0; }); };
  await qscan('fb-003'); await dp.waitForSelector('.conf-item[data-code=FB-003][data-state=conferido]');
  const srv2 = () => dp.evaluate(() => window.CXPT_FB._admin.getDoc('env/teste/operations/OP-0001'));
  check('QR sem login: bipagem gravada no servidor com o autor anônimo', !!(await srv2()).checked['FB-003'] && (await dp.evaluate(() => window.CXPT_FB._admin.listDocs('env/teste/events').some((e) => /^anon-/.test(e.data.uid)))));
  await qscan('NAO-EXISTE'); check('QR sem login: código desconhecido não altera nada', Object.keys((await srv2()).checked).length === 2 || Object.keys((await srv2()).checked).length === 1);
  await dp.evaluate(() => { location.hash = '#/packages'; }); await dp.waitForSelector('#drv-in');
  check('QR sem login: outras telas voltam para a própria ambulância', /#\/separation/.test(await dp.evaluate(() => location.hash)));
  await dp.reload(); await dp.waitForSelector('#drv-in', { timeout: 10000 });
  check('QR sem login: recarregar mantém a ambulância e o que já foi bipado', (await dp.locator('.conf-item[data-state=conferido]').count()) >= 1);
  // sem QR (abrir o site direto no mesmo aparelho): nunca vira acesso de equipe
  await dp.goto(new URL('/index.html', base).href + '#/overview'); await dp.waitForSelector('#drv-in, #blocked-msg, #login-form', { timeout: 10000 });
  check('motorista por QR: o site aberto direto continua só com a própria ambulância', (await dp.locator('#drv-in').count()) === 1 || (await dp.locator('#blocked-msg').count()) === 1);
  // QR com código errado
  const ctx3 = await browser.newContext(); await ctx3.addInitScript("(function(){var v;Object.defineProperty(window,'CXPT_FIREBASE',{configurable:true,get:function(){return v;},set:function(x){if(x)x.dataPath='env/teste';v=x;}});})();");
  await ctx3.addInitScript({ content: fs.readFileSync(path.join(ROOT, 'fake-firebase.js'), 'utf8') });
  await ctx3.addInitScript('(function(){try{if(!localStorage.getItem("cxpt-fake-fb"))localStorage.setItem("cxpt-fake-fb",' + JSON.stringify(serverState) + ');}catch(e){}})();');
  await ctx3.addInitScript({ content: SEED });
  const bp = await ctx3.newPage(); await bp.goto(qrUrl.replace(/\/[0-9a-f]{32}$/, '/' + 'a'.repeat(32))); await bp.waitForSelector('#blocked-msg, #drv-in', { timeout: 10000 });
  check('QR com código errado: acesso recusado, sem dados', (await bp.locator('#drv-in').count()) === 0 && /QR/.test(await bp.locator('#blocked-msg').innerText()) && !/Ambulância FB/.test(await bp.locator('body').innerText()));
  await ctx3.close(); await ctx2.close();
  // a página principal vê a conferência feita em outro aparelho depois de atualizar
  await page.click('#refresh-btn'); await go('exit');
  check('20. outro aparelho: após "Atualizar dados" aparece a leitura gravada', (await page.locator('#cnt-done').innerText()) === '1');
  // ===== Separar (consulta) e tela do motorista, com dados do servidor
  await go('sort');
  await page.fill('#sort-in', 'fb-001'); await page.press('#sort-in', 'Enter'); await page.waitForSelector('#sort-in-result.big-result--ok');
  check('Separar (servidor): pacote mostra a ambulância (nome, cor, motorista)', /Ambulância FB/.test(await txt('#sort-in-result')) && /Motorista Teste 1/.test(await txt('#sort-in-result')) && (await page.locator('#sort-in-result').evaluate((e) => e.style.getPropertyValue('--gcolor'))) === (await doc(U + 'operations/OP-0001')).color);
  await page.fill('#sort-in', 'FB-404'); await page.press('#sort-in', 'Enter'); await page.waitForSelector('#sort-in-result.big-result--fail');
  check('Separar (servidor): código inexistente = vermelho', /não encontrado/i.test(await txt('#sort-in-result')));
  check('Separar não grava nada: a ambulância continua com 1 conferido', Object.keys((await doc(U + 'operations/OP-0001')).checked).length === 1);
  // ===== MOTORISTA: acesso exclusivo à bipagem da PRÓPRIA operação (interface reduzida + regras)
  await page.evaluate((u) => { const a = window.CXPT_FB._admin; // outra ambulância (de outro motorista) e um pacote de outra base, criados pelo "Console" para provar o isolamento
    a.setDoc(u + 'operations/OP-9002', { id: 'OP-9002', xptId: 'x1', name: 'Ambulância Alheia', state: 'em_separacao', driverId: 'm2', packageCodes: ['ZZ-9'], packageIds: ['pk-ZZ-9'], checked: {}, history: [], responsible: 'X', createdBy: 'X', createdAt: 1 });
    a.setDoc(u + 'packages/pk-ZZ-9', { id: 'pk-ZZ-9', code: 'ZZ-9', xptId: 'x1', state: 'em_separacao', activeOpId: 'OP-9002', location: { kind: 'pendente', lat: null, lng: null }, history: [] }); }, U);
  await logout(); await login('mot@t.com');
  check('motorista: após o login cai direto na tela da própria ambulância (sem painel de despacho)', (await page.evaluate(() => document.getElementById('main').dataset.route)) === 'separation' && /OP-0001/.test(await txt('#drv-op')));
  const navTxt = (await page.locator('#nav a').allInnerTexts()).join('|');
  check('motorista: menu reduzido (sem Mapa, Entrada, Saída, Pacotes, Usuários)', !/Mapa|Entrada|Saída|Pacotes|Usuários|Configura/i.test(navTxt), navTxt);
  check('motorista: vê apenas ambulância, operação, contadores e os próprios códigos', (await page.locator('#cnt-total').innerText()) === '2' && (await page.locator('#cnt-done').innerText()) === '1' && (await page.locator('.conf-item').count()) === 2 && !/ZZ-9|Ambulância Alheia/.test(await page.locator('body').innerText()));
  for (const r of ['map', 'entry', 'exit', 'packages', 'setup', 'sort']) {
    await page.evaluate((x) => { location.hash = '#/' + x; }, r); await page.waitForTimeout(150);
    check('motorista: rota #/' + r + ' é redirecionada para a bipagem', (await page.evaluate(() => document.getElementById('main').dataset.route)) === 'separation' && (await page.locator('#amb-create, #zone-draw, #confirm-exit, #close-op').count()) === 0);
  }
  await page.evaluate(() => { location.hash = '#/separation/OP-9002'; }); await page.waitForSelector('#driver-denied');
  check('motorista: QR/URL de OUTRA ambulância = acesso negado, sem revelar dados', /não foi atribuída a você/.test(await txt('main')) && !/Ambulância Alheia|ZZ-9/.test(await page.locator('body').innerText()));
  await page.evaluate(() => { location.hash = '#/separation/OP-0001'; }); await page.waitForSelector('#drv-in');
  const dscan = async (c) => { await page.fill('#drv-in', c); await page.press('#drv-in', 'Enter'); await page.waitForFunction(() => document.getElementById('drv-in-result').textContent.length > 0); };
  await dscan('FB-003'); await page.waitForSelector('.conf-item[data-code=FB-003][data-state=conferido]');
  check('motorista: bip do próprio pacote → conferido, gravado no servidor', (await page.locator('#cnt-done').innerText()) === '2' && !!(await doc(U + 'operations/OP-0001')).checked['FB-003']);
  await page.waitForFunction(() => document.getElementById('drv-in-result').textContent === '', null, { timeout: 8000 }).catch(() => {});
  await dscan('FB-003');
  check('motorista: bip repetido avisa e não duplica', /Já conferido/.test(await txt('#drv-in-result')) && (await page.locator('#cnt-done').innerText()) === '2' && Object.keys((await doc(U + 'operations/OP-0001')).checked).length === 2);
  await page.waitForTimeout(100); await dscan('ZZ-9');
  check('motorista: pacote de outra ambulância → conflito sem revelar nada e sem gravar', /outra operação|desconhecido/i.test(await txt('#drv-in-result')) && !/Alheia|OP-9002/.test(await txt('#drv-in-result')) && !(await doc(U + 'operations/OP-9002')).checked['ZZ-9']);
  await dscan('FB-777');
  check('motorista: código desconhecido → aviso sem alterar nada', /desconhecido|não pertence/i.test(await txt('#drv-in-result')) && (await page.locator('#cnt-done').innerText()) === '2');
  // regras do servidor (o que o app não mostra também é bloqueado — não basta esconder menus)
  const deny = (fn, arg) => page.evaluate(async ([src, a]) => { try { await (new Function('FB', 'a', 'return (' + src + ')(FB, a)'))(window.CXPT_FB, a); return 'PERMITIDO'; } catch (e) { return e.code || e.message || 'erro'; } }, [fn, arg]);
  check('regras: motorista NÃO lê pacotes', /permission-denied/.test(await deny('(FB,a)=>FB.db.get(a)', U + 'packages/pk-FB-001')));
  check('regras: motorista NÃO lista pacotes', /permission-denied/.test(await deny('(FB,a)=>FB.db.list(a,[])', U + 'packages')));
  check('regras: motorista NÃO lê operação de outro motorista', /permission-denied/.test(await deny('(FB,a)=>FB.db.get(a)', U + 'operations/OP-9002')));
  check('regras: motorista NÃO lê outro motorista, usuários nem configurações de gestão', /permission-denied/.test(await deny('(FB,a)=>FB.db.get(a)', U + 'drivers/m2')) && /permission-denied/.test(await deny('(FB,a)=>FB.db.list(a,[])', U + 'users')));
  check('regras: motorista NÃO cria ambulância', /permission-denied/.test(await deny('(FB,a)=>FB.db.runTransaction(tx=>{tx.set(a,{id:"OP-X",xptId:"x1",state:"em_separacao",driverId:"m1",packageCodes:[],packageIds:[],checked:{},history:[]});})', U + 'operations/OP-X')));
  check('regras: motorista NÃO confirma saída nem encerra a própria operação', /permission-denied/.test(await deny('(FB,a)=>FB.db.runTransaction(tx=>tx.get(a).then(r=>{tx.update(a,{state:"saida_confirmada"});}))', U + 'operations/OP-0001')) && /permission-denied/.test(await deny('(FB,a)=>FB.db.runTransaction(tx=>tx.get(a).then(r=>{tx.update(a,{state:"encerrada"});}))', U + 'operations/OP-0001')));
  check('regras: motorista NÃO bipa na operação de outro motorista', /permission-denied/.test(await deny('(FB,a)=>FB.db.runTransaction(tx=>tx.get(a).then(r=>{tx.update(a,{checked:{"ZZ-9":{at:1}}});}))', U + 'operations/OP-9002')));
  check('regras: motorista NÃO altera o próprio perfil nem o vínculo', /permission-denied/.test(await deny('(FB,a)=>FB.db.runTransaction(tx=>tx.get(a).then(r=>{tx.update(a,{role:"administrador"});}))', U + 'users/uid-mot@t.com')));
  check('nada do motorista alterou pacotes (somente a conferência na operação)', (await doc(U + 'packages/pk-FB-001')).state === 'em_separacao' && (await doc(U + 'operations/OP-9002')).state === 'em_separacao');
  await logout(); await login('coord@t.com'); await go('exit');
  await scan(page, 'fb-003'); await page.waitForSelector('.conf-item[data-code=FB-003][data-state=conferido]');
  await page.click('#confirm-exit');
  check('15. confirmação de saída mostra previstos, conferidos e pendentes', /Esperados: 2 · Conferidos: 2 · Pendentes: 0/.test(await txt('#exit-summary')));
  await page.click('#exit-ok');
  await page.waitForFunction(async () => window.CXPT_FB._admin.getDoc('env/teste/operations/OP-0001').state === 'saida_confirmada');
  const h = (await doc(U + 'packages/pk-FB-001')).history.at(-1);
  check('15. saída registrada no servidor: em rota + movimentação com operação, usuário, base e data', (await doc(U + 'packages/pk-FB-001')).state === 'em_rota' && /OP-0001/.test(h.note) && /Nome coord/.test(h.operator) && h.xptId === 'x1' && h.at > 0);
  check('15. perfil coordenador de base não vê "Encerrar operação" habilitado', (await page.locator('#close-op').count()) === 0);
  await logout(); await login('sup@t.com'); await go('exit');
  await page.click('#close-op'); await page.click('#close-ok');
  await page.waitForFunction(() => window.CXPT_FB._admin.getDoc('env/teste/operations/OP-0001').state === 'encerrada');
  const closed = await doc(U + 'operations/OP-0001');
  check('16. encerramento (supervisor): operação fechada, histórico preservado, vínculo liberado', closed.history.length >= 4 && closed.closedBy && (await doc(U + 'packages/pk-FB-001')).activeOpId === null);
  await page.reload(); await page.waitForSelector('#main[data-render]'); await go('exit');
  check('16. após encerrar: bipagem bloqueada na interface', await page.locator('#scan-in').isDisabled());

  // ===== administrador do sistema: diagnóstico, cadastro de motorista e vínculo de usuário (create-only)
  await logout(); await login('sys@t.com'); await go('setup');
  await page.waitForFunction(() => document.querySelectorAll('#diag-list li').length >= 6);
  const dg = await page.locator('#diag-list').innerText();
  check('diagnóstico: marca claramente BACKEND SIMULADO (não é o Firebase real) e lê o perfil no servidor', /BACKEND SIMULADO/.test(dg) && /✓ leitura REAL do seu perfil/.test(dg) && /✗ .*BACKEND SIMULADO/.test(dg));
  
  await page.fill('#drv-new-id', 'm10'); await page.fill('#drv-new-name', 'Motorista Novo'); await page.fill('#drv-new-xpt', 'x1'); await page.click('#drv-new-btn');
  await page.waitForFunction(() => /cadastrado/.test(document.getElementById('drv-new-msg').textContent));
  check('cadastro de motorista gravado em env/teste/drivers', (await doc(U + 'drivers/m10')).name === 'Motorista Novo' && (await doc(U + 'drivers/m10')).state === 'ativo');
  await page.click('#drv-new-btn'); await page.waitForFunction(() => /Já existe/.test(document.getElementById('drv-new-msg').textContent));
  check('cadastro repetido NÃO sobrescreve', (await doc(U + 'drivers/m10')).name === 'Motorista Novo');
  await page.fill('#usr-new-uid', 'uid-novo'); await page.fill('#usr-new-name', 'Novo Mot'); await page.fill('#usr-new-email', 'novo@t.com'); await page.selectOption('#usr-new-role', 'motorista'); await page.fill('#usr-new-xpts', 'x1'); await page.fill('#usr-new-driver', 'm10'); await page.click('#usr-new-btn');
  await page.waitForFunction(() => /Perfil criado/.test(document.getElementById('usr-new-msg').textContent));
  const nu = await doc(U + 'users/uid-novo'); check('vínculo de usuário: perfil motorista com driverId e base, ativo', nu && nu.role === 'motorista' && nu.driverId === 'm10' && nu.xptIds[0] === 'x1' && nu.active === true);
  await page.click('#usr-new-btn'); await page.waitForFunction(() => /já tem perfil/.test(document.getElementById('usr-new-msg').textContent));
  await page.fill('#usr-new-uid', 'uid-sys@t.com'); await page.click('#usr-new-btn'); await page.waitForFunction(() => /próprio perfil/.test(document.getElementById('usr-new-msg').textContent));
  check('vínculo: não altera perfil existente nem o próprio', (await doc(U + 'users/uid-sys@t.com')).role === 'admin_sistema');

  // ===== admin_sistema: todas as telas, editar/excluir usuário, criar base, matriz de permissões
  const sysNav = (await page.locator('#nav a').allInnerTexts()).join('|');
  check('admin_sistema: menu com todas as telas (Mapa, Operações, Pacotes, Entrada, Separar, Saída, Motoristas, XPT, Configuração)', ['Mapa', 'Operações', 'Pacotes', 'Entrada', 'Separar', 'Saída', 'Motoristas', 'XPT', 'Administração'].every((t) => sysNav.indexOf(t) >= 0), sysNav);
  for (const r of ['entry', 'map', 'exit', 'sort', 'packages', 'ops', 'alerts', 'reports', 'drivers', 'xpts', 'help']) { await go(r); check('admin_sistema abre #/' + r + ' sem "perfil sem acesso"', !/sem acesso|não possui esta permissão/i.test(await txt('main'))); }
  await go('setup');
  await page.fill('#xpt-new-id', 'x9'); await page.fill('#xpt-new-name', 'XPT Nova Base'); await page.click('#xpt-save-btn');
  await page.waitForSelector('#xpt-edit-x9');
  check('admin_sistema cria base (gravada em env/teste/xpts) e ela aparece na lista', (await doc(U + 'xpts/x9')).name === 'XPT Nova Base' && /XPT Nova Base/.test(await txt('#xpt-list')));
  await page.waitForSelector('#usr-edit-uid-novo');
  check('lista de usuários mostra perfis cadastrados (sem editar/excluir o próprio)', (await page.locator('#usr-edit-uid-sys\\@t\\.com').count()) === 0 && /Novo Mot/.test(await txt('#usr-list')));
  await page.click('#usr-edit-uid-novo'); await page.fill('#ue-name', 'Motorista Renomeado'); await page.selectOption('#ue-role', 'despacho'); await page.fill('#ue-xpts', 'x1,x9'); await page.click('#ue-save');
  await page.waitForFunction(() => /Motorista Renomeado/.test(document.getElementById('usr-list').textContent));
  const ed = await doc(U + 'users/uid-novo'); check('admin_sistema edita usuário: nome, perfil e bases gravados', ed.name === 'Motorista Renomeado' && ed.role === 'despacho' && ed.xptIds.join() === 'x1,x9' && ed.driverId === null);
  await page.click('#usr-del-uid-novo'); await page.click('.modal-back .btn--primary');
  await page.waitForFunction(() => /Acesso excluído/.test(document.getElementById('usr-list-msg').textContent));
  check('admin_sistema exclui o acesso: perfil removido do Firestore', !(await doc(U + 'users/uid-novo')) && !!(await doc(U + 'users/uid-desp@t.com')));
  // matriz: tira "criar ambulância" do coord_base e dá ao despacho
  await page.check('#perm-operacao-despacho'); await page.uncheck('#perm-operacao-coord_base'); await page.click('#perm-save');
  await page.waitForFunction(() => /salvas e aplicadas/.test(document.getElementById('perm-msg').textContent));
  const pd = await doc(U + 'settings/permissions');
  check('matriz de permissões gravada no Firestore (e o admin continua com tudo)', pd.operacao.includes('despacho') && !pd.operacao.includes('coord_base') && pd.operacao.includes('supervisor'));
  await logout(); await login('coord@t.com'); await go('map');
  check('coord_base sem "criar ambulância": a tela bloqueia (matriz aplicada)', (await page.locator('#amb-create').count()) === 0 && /não pode criar/i.test(await txt('main')));
  await page.evaluate(() => window.CXPT_FB._admin.setDoc('env/teste/settings/permissions', Object.assign({}, window.CXPT_FB._admin.getDoc('env/teste/settings/permissions'), { operacao: ['administrador', 'supervisor', 'coord_base'] })));
  await logout(); await login('sys@t.com');

  // ===== sessão expira
  await page.evaluate(() => window.CXPT_FB._admin.expireSession());
  await page.waitForSelector('#login-form', { timeout: 10000 });
  check('17. sessão expirada: volta ao login com aviso e telas escondidas', /sessão terminou/.test(await txt('#login-msg')) && (await page.locator('.shell').isHidden()));


  // ===== apiKey preenchida mas SDK do Firebase inacessível (sem rede/bloqueio): tela de erro clara, nada interno aparece
  {
    const c2 = await browser.newContext({ viewport: { width: 800, height: 800 } });
    await c2.route('**/firebase-config.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: "window.CXPT_FIREBASE = { config: { apiKey: 'CHAVE-DE-TESTE-NAO-REAL', projectId: 'coopmetro-xpt' }, sdkVersion: '10.14.1' };" }));
    await c2.route('https://www.gstatic.com/**', (r) => r.abort());
    const p = await c2.newPage();
    await p.goto(base); await p.waitForSelector('#blocked-msg', { timeout: 15000 });
    check('Firebase configurado mas SDK inacessível: mensagem clara e telas internas escondidas', /Não foi possível carregar o Firebase/.test(await p.locator('#blocked-msg').innerText()) && (await p.locator('.shell').isHidden()));
    await c2.close();
  }
  // ===== PRIMEIRO USO REAL: banco vazio, só o admin_sistema; uma única base, nada fictício
  {
    const c4 = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    await c4.addInitScript("(function(){var v;Object.defineProperty(window,'CXPT_FIREBASE',{configurable:true,get:function(){return v;},set:function(x){if(x)x.dataPath='env/teste';v=x;}});})();");
    await c4.addInitScript({ content: fs.readFileSync(path.join(ROOT, 'fake-firebase.js'), 'utf8') });
    await c4.addInitScript({ content: "(function(){var f=window.CXPT_FAKE_FIREBASE.create({storage:window.localStorage});var a=f._admin;if(!a.getDoc('env/teste/users/uid-adm')){a.addAccount('adm@t.com','senha-adm@t.com','uid-adm');a.setDoc('env/teste/users/uid-adm',{name:'Dono',email:'adm@t.com',role:'admin_sistema',xptIds:[],active:true,driverId:null});}window.CXPT_FB=f;window.CXPT_FB_STATE='ready';})();" });
    const q = await c4.newPage(); const qerr = [];
    q.on('pageerror', (e) => qerr.push(e.message));
    await q.goto(base); await q.waitForSelector('#login-form');
    await q.fill('#login-email', 'adm@t.com'); await q.fill('#login-pass', 'senha-adm@t.com'); await q.click('#login-btn');
    await q.waitForSelector('#seed-btn', { timeout: 10000 });
    const body0 = await q.locator('body').innerText();
    check('uso real: sem faixa de teste, sem "fictício/demonstração/protótipo/ambiente de teste" na tela', (await q.locator('.demo-banner').isHidden()) && !/fictíci|demonstra|protótipo|ambiente de teste/i.test(body0), body0.slice(0, 200));
    await q.click('#seed-btn'); await q.waitForSelector('#xpt-edit-x1');
    const fdoc = (p) => q.evaluate((x) => window.CXPT_FB._admin.getDoc(x), p), flist = (c) => q.evaluate((x) => window.CXPT_FB._admin.listDocs(x), c);
    check('primeiro uso: UMA base criada ("XPT Principal") e nenhum motorista, região ou pacote', (await fdoc('env/teste/xpts/x1')).name === 'XPT Principal' && (await flist('env/teste/xpts')).length === 1 && (await flist('env/teste/drivers')).length === 0 && (await flist('env/teste/regions')).length === 0 && (await flist('env/teste/packages')).length === 0 && (await flist('env/teste/operations')).length === 0);
    check('primeiro uso: o botão de criar base inicial some depois de criada', (await q.locator('#seed-btn').count()) === 0);
    await q.fill('#xpt-new-id', 'x1'); await q.fill('#xpt-new-name', 'XPT Anápolis'); await q.click('#xpt-save-btn');
    await q.waitForFunction(() => /XPT Anápolis/.test(document.getElementById('xpt-list').textContent));
    check('a base pode ser renomeada depois (mesmo id, sem duplicar)', (await fdoc('env/teste/xpts/x1')).name === 'XPT Anápolis' && (await flist('env/teste/xpts')).length === 1);
    for (const r of ['overview', 'map', 'entry', 'ops', 'packages', 'sort', 'exit', 'alerts', 'reports', 'drivers', 'xpts', 'help']) {
      await q.evaluate((x) => { location.hash = '#/' + x; }, r); await q.waitForFunction((x) => document.getElementById('main').dataset.route === x, r);
      const t = await q.locator('main').innerText();
      check('uso real: tela #/' + r + ' sem textos de demonstração/fictício/protótipo', !/fictíci|demonstra|protótipo|ambiente de teste|em memória|simulaç/i.test(t), (t.match(/.{0,40}(fictíci|demonstra|protótipo|ambiente de teste|em memória|simulaç).{0,40}/i) || [''])[0]);
    }
    check('uso real: sem erros de JavaScript', qerr.length === 0, qerr.join('|'));
    await c4.close();
  }
  // ===== sem apiKey (padrão entregue): modo demonstração intacto, sem login e sem rede
  {
    const c3 = await browser.newContext({ viewport: { width: 800, height: 800 } });
    await c3.addInitScript("(function(){var v;Object.defineProperty(window,'CXPT_FIREBASE',{configurable:true,get:function(){return v;},set:function(x){if(x&&x.config)x.config.apiKey='';v=x;}});})();"); // testes de DEMONSTRAÇÃO: ignora a apiKey real do firebase-config.js
    const p = await c3.newPage(); const ext = [];
    p.on('request', (r) => { const u = r.url(); if (!/^(data:|blob:)/.test(u) && !u.startsWith(new URL(base).origin + '/')) ext.push(u); });
    await p.goto(base); await p.waitForSelector('#main[data-render]');
    check('sem apiKey: abre em modo demonstração (sem login, banner de demonstração, seletor de perfil demo)', /DEMONSTRAÇÃO/.test(await p.locator('.demo-banner').innerText()) && (await p.locator('#profile-select').count()) === 1 && (await p.locator('#login-form').count()) === 0);
    check('sem apiKey: nenhuma requisição a Firebase/Google', ext.every((u) => !/google|firebase|gstatic/.test(u)), ext.join(','));
    await c3.close();
  }
  check('nenhuma requisição externa (backend simulado; ladrilhos interceptados)', external.length === 0, external.join(','));
  check('nenhum erro JS/console', errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
(async () => {
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch();
  try { await main(browser, base); } catch (e) { fail++; console.log('  ✗ exceção: ' + (e && e.stack || e)); }
  await browser.close(); srv.close();
  console.log('e2e-firebase: ' + pass + ' aprovados, ' + fail + ' reprovados');
  process.exit(fail ? 1 : 0);
})();
