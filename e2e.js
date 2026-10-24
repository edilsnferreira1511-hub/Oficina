'use strict';
/* Testes de navegador (Playwright + Chromium local). Roda em file:// e http://127.0.0.1.
 * Uso: node e2e.js   (SHOTS_DIR=pasta para salvar capturas). Sem dependências do projeto. */
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { ({ chromium } = require('playwright')); }

const ROOT = __dirname; // tudo fica na mesma pasta
const TILE_HOST = 'https://tile.openstreetmap.org/';
// Os ladrilhos do provedor (OpenStreetMap) são INTERCEPTADOS e respondidos com uma imagem SINTÉTICA (tile-simulado.png):
// o componente é testado, mas NENHUMA cartografia real é validada aqui.
const TILE_PNG = fs.readFileSync(path.join(__dirname, 'tile-simulado.png'));
const WIDTHS = [320, 360, 390, 768, 1024, 1280];
const ROUTES = ['overview', 'map', 'ops', 'packages', 'entry', 'exit', 'alerts', 'reports', 'drivers', 'xpts', 'help'];
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) pass++; else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
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

async function suite(browser, label, base) {
  console.log('== ' + label + ' ==');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [], external = [], failed = [], tileReqs = [];
  await ctx.route(TILE_HOST + '**', (r) => { tileReqs.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'image/png', body: TILE_PNG }); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { const u = r.url(); if (!/^(file:|data:|blob:)/.test(u) && !u.startsWith(base.replace(/index\.html$/, '')) ) external.push(u); });
  page.on('requestfailed', (r) => failed.push(r.url()));

  // modo do mapa: 'none' = sem provedor (tiles:null); 'sim' = provedor padrão com ladrilhos simulados (Referer dispensado só no teste em file://)
  let MODE = 'none';
  const applyMap = () => page.evaluate((m) => { if (!window.__MAP0) window.__MAP0 = Object.assign({}, window.CXPT_MAP); const c = window.CXPT_MAP; Object.assign(c, window.__MAP0); if (m === 'none') { c.tiles = null; c.attribution = ''; } else c.requiresReferer = false; }, MODE);
  const setMap = async (m) => { MODE = m; await applyMap(); };
  const reloadPage = async () => { await page.reload(); await page.waitForSelector('#main[data-render]'); await applyMap(); };
  const open = async (hash) => { await page.goto(base + (hash ? '#/' + hash : '')); await page.waitForSelector('#main[data-render]'); await applyMap(); };
  const go = async (route) => { await page.evaluate((r) => { location.hash = '#/' + r; }, route); await page.waitForFunction((r) => document.getElementById('main').dataset.route === r.split('/')[0], route); };
  const txt = (sel) => page.locator(sel).first().innerText();
  const setXpt = async (id) => { await page.selectOption('#xpt-select', id); await page.waitForFunction((x) => document.getElementById('main').dataset.xpt === x, id); };
  const D = () => page.evaluate(() => JSON.stringify(window.CXPT_APP.D));
  const fillEntry = async (code, size, reason) => {
    await page.fill('#code-in', code); await page.press('#code-in', 'Enter');
    await page.selectOption('select[name=size]', size); await page.selectOption('select[name=reasonId]', reason);
  };

  await open('overview');
  // referência = o MESMO gerador determinístico, ancorado no relógio desta página (cada page.goto recria os dados com um novo relógio)
  const expectedDemo = () => page.evaluate(() => JSON.stringify(window.CXPT.data.createDemoData(window.CXPT_APP.D.nowMs)));
  check('banner de demonstração visível', /AMBIENTE DE DEMONSTRAÇÃO/.test(await txt('.demo-banner')));
  check('logotipo carregado', await page.evaluate(() => { const i = document.querySelector('.brand-logo'); return i && i.complete && i.naturalWidth > 0; }));

  // ---- navegação por todas as telas + larguras
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 800 });
    for (const r of ROUTES) {
      await go(r);
      const info = await page.evaluate(() => ({
        h1: (document.querySelector('h1') || {}).textContent || '', over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        errBox: !!document.querySelector('.callout--danger'),
      }));
      check(`${w}px ${r}: título presente`, info.h1.length > 2, info.h1);
      check(`${w}px ${r}: sem rolagem horizontal`, info.over <= 1, 'excesso=' + info.over);
      check(`${w}px ${r}: sem erro de montagem`, !info.errBox);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  if (process.env.SHOTS_DIR) {
    fs.mkdirSync(process.env.SHOTS_DIR, { recursive: true });
    for (const r of ROUTES) { await go(r); await page.screenshot({ path: path.join(process.env.SHOTS_DIR, label.split(' ')[0] + '-' + r + '.png'), fullPage: true }); }
  }

  // ---- acessibilidade básica
  for (const r of ROUTES) {
    await go(r);
    const bad = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('main input:not([type=hidden]), main select, main textarea').forEach((e) => {
        const has = (e.id && document.querySelector('label[for="' + e.id + '"]')) || e.getAttribute('aria-label') || e.closest('label');
        if (!has) out.push(e.name || e.id || e.tagName);
      });
      document.querySelectorAll('main button').forEach((b) => { if (!b.textContent.trim() && !b.getAttribute('aria-label')) out.push('button sem nome'); });
      return out;
    });
    check(`a11y ${r}: campos e botões com nome`, bad.length === 0, bad.join(','));
  }
  // botões desabilitados explicam o motivo
  for (const r of ROUTES) {
    await go(r);
    const bad = await page.evaluate(() => Array.from(document.querySelectorAll('main button[disabled]')).filter((b) => {
      if (b.classList.contains('btn--blocked')) { const n = b.parentElement.querySelector('.blocked-why'); return !n || !/Indispon/.test(n.textContent); }
      return !(b.title || b.getAttribute('aria-label')) && !b.closest('.pager') && !b.closest('.row-actions');
    }).map((b) => b.textContent.trim()));
    check(`botões bloqueados com motivo visível em ${r}`, bad.length === 0, bad.join('|'));
  }
  await go('exit');
  check('saída real bloqueada com motivo', /Indispon[^\n]*D-07|Indispon[^\n]*backend|Indispon[^\n]*confirma/i.test(await txt('.blocked')));
  await go('ops');
  check('criação de operação bloqueada na tela de operações', (await page.locator('.btn--blocked').count()) >= 1);

  // ---- Entrada: formulário, duplicidade, isolamento, sem persistência
  await go('entry');
  await page.fill('#code-in', ' abc-123 '); await page.press('#code-in', 'Enter');
  check('código normalizado para maiúsculas e sem espaços', (await page.inputValue('#code-in')) === 'ABC-123');
  await page.fill('#code-in', 'AB CD'); await page.press('#code-in', 'Enter');
  check('código inválido gera erro acessível', (await page.locator('.field-error').count()) >= 1);
  check('localização bloqueada até preencher campos', await page.locator('#loc-box').isHidden());
  await fillEntry('t-100', 'M', 'r_ausente');
  check('localização liberada após código+tamanho+motivo', await page.locator('#loc-box').isVisible(), await page.evaluate(() => JSON.stringify({ code: document.getElementById('code-in') && document.getElementById('code-in').value, hidden: document.getElementById('loc-box') && document.getElementById('loc-box').hidden, size: (document.querySelector('select[name=size]') || {}).value, err: Array.from(document.querySelectorAll('.field-error')).map((x) => x.textContent) })));
  await page.click('#add-btn');
  check('item entra no rascunho', /1 item/.test(await txt('#draft-count')));
  await fillEntry('t-100', 'P', 'r_outros'); await page.click('#add-btn');
  check('leitura repetida não infla o rascunho', /1 item/.test(await txt('#draft-count')));
  await fillEntry('DEMO-000001', 'P', 'r_outros'); await page.click('#add-btn');
  check('duplicidade com pacote existente é barrada', /1 item/.test(await txt('#draft-count')));
  check('duplicidade não nomeia outra XPT', !/Alfa|Beta|Gama/.test(await txt('#entry-form')));
  await page.click('[data-act=remove]');
  check('remover item do rascunho', /0 item/.test(await txt('#draft-count')));
  await fillEntry('t-200', 'G', 'r_recusou'); await page.click('#add-btn');
  await setXpt('x2');
  check('trocar XPT separa o rascunho', /0 item/.test(await txt('#draft-count')));
  await setXpt('x1');
  check('rascunho da XPT original preservado', /1 item/.test(await txt('#draft-count')));
  await reloadPage(); await go('entry');
  check('recarregar descarta o rascunho', /0 item/.test(await txt('#draft-count')));
  const storage = await page.evaluate(() => ({ l: localStorage.length, s: sessionStorage.length, c: document.cookie }));
  check('nenhum armazenamento do navegador usado', storage.l === 0 && storage.s === 0 && storage.c === '', JSON.stringify(storage));

  // ---- Mapa indisponível (sem provedor)
  await go('map');
  check('mapa indisponível declarado', /Mapa indisponível/.test(await txt('#map-unavailable')));
  check('nenhum mapa/grade/canvas desenhado', (await page.locator('.gmap, canvas, main img').count()) === 0);
  check('sem pontos: estado vazio explicado', /0 ponto/.test(await txt('#points-count')));
  await go('entry'); await fillEntry('t-300', 'P', 'r_ausente');
  check('sem mapa: sem marcar ponto, item segue sem localização confirmada (e sem as 4 opções antigas)', /sem localização confirmada/.test(await txt('#loc-hint')) && (await page.locator('input[name=kind], [id^=kind-]').count()) === 0 && (await page.locator('#confirm-loc').count()) === 0);
  check('aviso de mapa indisponível na entrada', /Mapa indisponível/.test(await txt('#map-unavailable')));

  // ---- Provedor de mapa SIMULADO (apenas teste do componente; não é cartografia real)
  await setMap('sim');
  await go('map');
  check('[simulado] mapa montado quando há provedor', (await page.locator('.gmap').count()) === 1);
  check('[simulado] atribuição do provedor exibida', /OpenStreetMap contributors/.test(await txt('.gmap-attr')));
  await page.waitForFunction(() => document.querySelectorAll('.gmap-tile').length > 0);
  await go('entry');
  await fillEntry('SIM-001', 'M', 'r_ausente');
  check('[simulado] mapa liberado na entrada', await page.locator('#entry-map .gmap').isVisible());
  const box = await page.locator('#entry-map .gmap').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const c1 = await txt('#coords-out');
  check('[simulado] clique marca ponto com coordenadas', /-?\d+\.\d{6}/.test(c1), c1);
  check('[simulado] ponto no centro ≈ centro configurado (Anápolis)', /-16\.3\d+/.test(c1) && /-48\.9\d+/.test(c1), c1);
  check('[simulado] marcador visível no ponto escolhido', (await page.locator('#entry-map .gmap .pin').count()) === 1);
  await page.click('#confirm-loc');
  check('localização confirmada exibida', /Localização confirmada/.test(await txt('#coords-out')));
  await page.click('#add-btn');
  await fillEntry('SIM-002', 'P', 'r_recusou');
  check('[simulado] novo item não herda o ponto anterior', /Nenhum ponto/.test(await txt('#coords-out')));
  await page.mouse.click(box.x + box.width / 2 + 60, box.y + box.height / 2 - 40);
  const c2 = await txt('#coords-out'); check('[simulado] segundo ponto diferente do primeiro', c1 !== c2);
  await page.click('#confirm-loc');
  await page.click('#add-btn');
  await fillEntry('SIM-003', 'G', 'r_outros'); await page.click('#add-btn');
  check('[simulado] 3 itens no rascunho', /3 item/.test(await txt('#draft-count')));

  // ---- Mapa/Regiões consumindo o rascunho
  await go('map');
  check('mapa mostra 2 pontos (o sem coordenadas fica de fora)', /2 ponto/.test(await txt('#points-count')));
  check('marcadores no mapa = pontos', (await page.locator('.gmap .pin').count()) === 2, String(await page.locator('.gmap .pin').count()));
  check('item sem coordenadas listado à parte e não selecionável', (await page.locator('#nocoord-list [data-code=SIM-003]').count()) === 1 && (await page.locator('.sel-box[data-code=SIM-003]').count()) === 0);
  check('pontos apontam para os códigos corretos', (await page.locator('.sel-box').evaluateAll((l) => l.map((x) => x.dataset.code).sort().join(','))) === 'SIM-001,SIM-002');
  await page.click('[data-code=SIM-001] [data-act=detail]');
  const det = await txt('#detail-dl');
  check('detalhes: código, tamanho, motivo e classificação', /SIM-001/.test(det) && /Médio/.test(det) && /Cliente ausente/.test(det) && /Localização confirmada/.test(det), det);
  await page.check('.sel-box[data-code=SIM-001]'); await page.check('.sel-box[data-code=SIM-002]');
  check('contagem de selecionados = 2', (await page.getAttribute('#sel-count', 'data-count')) === '2');
  await page.click('#undo-sel');
  check('desfazer reduz para 1', (await page.getAttribute('#sel-count', 'data-count')) === '1');
  await page.click('#select-all'); check('selecionar todos com coordenadas = 2 (nunca inclui sem coordenadas)', (await page.getAttribute('#sel-count', 'data-count')) === '2');
  await page.click('#clear-sel'); check('limpar seleção = 0', (await page.getAttribute('#sel-count', 'data-count')) === '0');
  check('criar ambulância bloqueada com motivo para perfil sem permissão (Despacho)', /Indispon[^\n]*não pode criar operações/i.test(await txt('#amb-box .blocked')));
  // marcador no mapa seleciona
  // o mapa se ajusta aos pontos (sem sobreposição); rola o mapa para baixo do cabeçalho fixo
  await page.locator('.gmap').evaluate((e) => e.scrollIntoView());
  check('ajuste automático separa os marcadores (não se sobrepõem)', await page.evaluate(() => { const r = Array.from(document.querySelectorAll('.gmap .pin')).map((p) => p.getBoundingClientRect()); return r.length === 2 && Math.hypot(r[0].x - r[1].x, r[0].y - r[1].y) > 32; }));
  await page.locator('.gmap .pin').first().click();
  check('clicar no marcador seleciona', (await page.getAttribute('#sel-count', 'data-count')) === '1');
  check('marcador selecionado é diferenciado', (await page.locator('.gmap .pin--sel, .gmap .pin[aria-pressed=true]').count()) === 1);
  check('tipos de ponto distinguíveis por classe', (await page.locator('.gmap .pin--marcada').count()) === 2);
  // remover item do rascunho com seleção ativa → seleção consistente
  await page.check('.sel-box[data-code=SIM-002]');
  await go('entry'); await page.locator('tr[data-code], #draft-list tr').filter({ hasText: 'SIM-002' }).locator('[data-act=remove]').click();
  await go('map');
  check('após remover do rascunho a tela atualiza (1 ponto)', /1 ponto/.test(await txt('#points-count')));
  check('seleção consistente após remoção (só o pacote restante)', (await page.getAttribute('#sel-count', 'data-count')) === '1' && (await page.locator('.sel-box:checked').evaluateAll((l) => l.map((x) => x.dataset.code).join(','))) === 'SIM-001');
  // isolamento
  await setXpt('x2');
  check('XPT 2 não carrega pontos da XPT 1', /0 ponto/.test(await txt('#points-count')) && (await page.locator('.sel-box').count()) === 0 && (await page.locator('.gmap .pin').count()) === 0);
  check('seleção da XPT 2 vazia', (await page.getAttribute('#sel-count', 'data-count')) === '0');
  await setXpt('x1');
  check('XPT 1 mantém seu ponto e sua seleção', /1 ponto/.test(await txt('#points-count')) && (await page.getAttribute('#sel-count', 'data-count')) === '1');
  // sem persistência e sem alterar dados demonstrativos
  const demoAfter = JSON.parse(await D()), before = JSON.parse(await expectedDemo());
  check('dados demonstrativos intactos (nem pacotes, nem histórico, nem operações)',
    JSON.stringify(demoAfter.packages) === JSON.stringify(before.packages) && JSON.stringify(demoAfter.operations) === JSON.stringify(before.operations),
    (() => { const i = before.packages.findIndex((p, k) => JSON.stringify(p) !== JSON.stringify(demoAfter.packages[k])); return i < 0 ? 'ops' : JSON.stringify(before.packages[i]).slice(0, 300) + ' != ' + JSON.stringify(demoAfter.packages[i]).slice(0, 300); })());
  await reloadPage(); await go('map');
  check('recarregar descarta pontos e grupos', /0 ponto/.test(await txt('#points-count')) && (await page.getAttribute('#sel-count', 'data-count')) === '0');

  // ---- Mapa: pan/zoom (simulado)
  await setMap('sim');
  await go('entry'); await fillEntry('SIM-Z', 'P', 'r_ausente');
  const bx = await page.locator('#entry-map .gmap').boundingBox();
  const tilesBefore = await page.locator('#entry-map .gmap-tile').first().getAttribute('src');
  await page.click('#entry-map .gmap-zoom[aria-label=Aproximar]');
  const tilesAfter = await page.locator('#entry-map .gmap-tile').first().getAttribute('src');
  check('[simulado] zoom troca o nível dos ladrilhos', tilesBefore !== tilesAfter);
  await page.mouse.move(bx.x + 50, bx.y + 50); await page.mouse.down(); await page.mouse.move(bx.x + 150, bx.y + 120, { steps: 5 }); await page.mouse.up();
  check('[simulado] arrastar não marca ponto', /Nenhum ponto/.test(await txt('#coords-out')));

  // ---- Conferência
  await setMap('none');
  await go('exit');
  const op = await page.evaluate(() => { const D = window.CXPT_APP.D; const o = D.operations.filter((x) => x.xptId === 'x1')[0]; return { id: o.id, codes: o.packageIds.map((i) => D.packages.filter((p) => p.id === i)[0].code), x2: D.packages.filter((p) => p.xptId === 'x2')[0].code }; });
  const scan = async (v) => { await page.fill('#scan-in', v); await page.press('#scan-in', 'Enter'); return page.locator('#scan-result').getAttribute('data-status'); };
  check('conferência inicia em 0 de Y', new RegExp('^0 de ' + op.codes.length).test(await txt('#conf-progress')));
  check('código esperado conferido', (await scan(op.codes[0].toLowerCase())) === 'ok');
  check('leitura repetida não conta', (await scan(op.codes[0])) === 'repetido' && /^1 de/.test(await txt('#conf-progress')));
  check('código de outra XPT/operação rejeitado', ['outra_operacao', 'inexistente'].includes(await scan(op.x2)) && /^1 de/.test(await txt('#conf-progress')));
  check('código inválido rejeitado', (await scan('a b!')) === 'invalido');
  check('código inexistente rejeitado', (await scan('NAO-EXISTE-1')) === 'inexistente');
  await page.click('[data-act=unscan]');
  check('remover leitura volta a 0', /^0 de/.test(await txt('#conf-progress')));
  for (const cd of op.codes) await scan(cd);
  check('conferência completa X de X', new RegExp('^' + op.codes.length + ' de ' + op.codes.length).test(await txt('#conf-progress')));
  const afterConf = JSON.parse(await D());
  check('conferir não altera estado dos pacotes', JSON.stringify(afterConf.packages) === JSON.stringify(JSON.parse(await expectedDemo()).packages));
  await setXpt('x2');
  check('conferência da XPT 2 não mostra códigos da XPT 1', !(await txt('main')).includes(op.codes[0]));
  await setXpt('x1');

  // ---- Pacotes e alertas
  await go('packages');
  const total1 = await txt('#pkg-count');
  await page.fill('input[name=code]', 'DEMO-000002'); await page.press('input[name=code]', 'Enter');
  check('filtro por código', /1 /.test(await txt('#pkg-count')) && total1 !== (await txt('#pkg-count')));
  check('lista de pacotes nunca mostra outra XPT', !(await txt('main')).includes('DEMO-000070'));
  await go('package/DEMO-000002');
  check('detalhe do pacote com histórico', /Histórico/.test(await txt('main')) && /DEMO-000002/.test(await txt('main')));
  await go('package/DEMO-000090');
  check('pacote de outra XPT não é revelado', !/DEMO-000090[\s\S]*Histórico/.test(await txt('main')));
  await go('alerts');
  const a4 = await txt('main');
  await page.fill('#limit-days', '1'); await page.press('#limit-days', 'Tab');
  await page.waitForFunction(() => document.getElementById('main').dataset.render > 0);
  check('limite de dias configurável altera a lista', (await txt('main')) !== a4);
  await page.fill('#limit-days', '99'); await page.press('#limit-days', 'Tab');
  check('limite inválido é recusado', /1 a 60/.test(await txt('#limit-msg')));

  // ---- Tema, perfil, relatórios
  await page.click('#theme-btn');
  check('tema escuro alterna', (await page.getAttribute('html', 'data-theme')) === 'dark');
  await go('reports');
  check('relatórios identificados como demonstrativos', /demonstrativ/i.test(await txt('main')));
  await go('help');
  check('ajuda explica perda de dados ao recarregar', /recarreg/i.test(await txt('main')));
  await page.selectOption('#profile-select', 'motorista');
  await page.evaluate(() => { location.hash = '#/entry'; }); await page.waitForTimeout(200);
  check('perfil motorista não acessa a entrada (redirecionado à própria bipagem)', (await page.evaluate(() => document.getElementById('main').dataset.route)) === 'separation' && (await page.locator('#code-in').count()) === 0);
  await page.selectOption('#profile-select', 'despacho');

  // ---- requisições externas e erros
  const unexpected = failed.filter((u) => !/tile-simulado/.test(u));
  check('nenhuma requisição externa além dos ladrilhos do provedor configurado (interceptados)', external.filter((u) => !u.startsWith(TILE_HOST)).length === 0, external.join(','));
  check('ladrilhos pedidos só ao host do provedor, com z/x/y', tileReqs.length > 0 && tileReqs.every((u) => /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(u)), String(tileReqs.length));
  check('nenhum erro JS/console', errors.filter((e) => !/tile-simulado|Failed to load resource/.test(e)).length === 0, errors.slice(0, 3).join(' | '));
  check('nenhuma requisição falhou', unexpected.length === 0, unexpected.join(','));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const srv = await serve();
  const url = 'http://127.0.0.1:' + srv.address().port + '/';
  await suite(browser, 'file://', 'file://' + path.join(ROOT, 'index.html'));
  await suite(browser, 'http://', url);
  await browser.close(); srv.close();
  console.log('e2e: ' + pass + ' aprovados, ' + fail + ' reprovados');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
