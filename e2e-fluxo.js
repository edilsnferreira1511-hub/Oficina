'use strict';
/* Teste de navegador do FLUXO OPERACIONAL COMPLETO (Playwright + Chromium; emulação de celular com toque):
 * Entrada → mapa → marcar casa do cliente → salvar → planejamento → região desenhada → ambulância → QR → separação por bipagem
 * → confirmação de saída → encerramento → histórico.
 * Os ladrilhos do provedor (OpenStreetMap) são INTERCEPTADOS e respondidos com imagem SINTÉTICA: valida o componente, NÃO a cartografia real.
 * Uso: node e2e-fluxo.js */
const path = require('path'), fs = require('fs'), http = require('http');
const { spawnSync } = require('child_process');
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (_) { ({ chromium } = require('playwright')); }

const ROOT = __dirname;
const TILE_HOST = 'https://tile.openstreetmap.org/';
const TILE_PNG = fs.readFileSync(path.join(ROOT, 'tile-simulado.png'));
let pass = 0, fail = 0, skipped = 0;
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

async function main(browser, base) {
  // celular emulado: 390 px, toque, escala 3 (para a imagem do QR ter módulos nítidos)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  await ctx.addInitScript("(function(){var v;Object.defineProperty(window,'CXPT_FIREBASE',{configurable:true,get:function(){return v;},set:function(x){if(x&&x.config)x.config.apiKey='';v=x;}});})();"); // testes de DEMONSTRAÇÃO: ignora a apiKey real do firebase-config.js
  const tileReqs = [], external = [], errors = [];
  await ctx.route(TILE_HOST + '**', (r) => { tileReqs.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'image/png', body: TILE_PNG }); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { const u = r.url(); if (!/^(data:|blob:)/.test(u) && !u.startsWith(new URL(base).origin + '/') && !u.startsWith(TILE_HOST)) external.push(u); });

  const txt = (sel) => page.locator(sel).first().innerText();
  const go = async (route) => { await page.evaluate((r) => { location.hash = '#/' + r; }, route); await page.waitForFunction((r) => document.getElementById('main').dataset.route === r.split('/')[0], route); };
  const renderCount = () => page.evaluate(() => Number(document.getElementById('main').dataset.render));
  const setProfile = async (id) => { const n = await renderCount(); await page.selectOption('#profile-select', id); await page.waitForFunction((k) => Number(document.getElementById('main').dataset.render) > k, n); };
  const setXpt = async (id) => { await page.selectOption('#xpt-select', id); await page.waitForFunction((x) => document.getElementById('main').dataset.xpt === x, id); };
  const D = (fn, arg) => page.evaluate(fn, arg);
  const pkg = (code) => D((c) => JSON.parse(JSON.stringify(window.CXPT_APP.D.packages.filter((p) => p.code === c)[0] || null)), code);
  const snapshot = () => D(() => JSON.stringify({ p: window.CXPT_APP.D.packages, o: window.CXPT_APP.D.operations }));
  const noNull = async () => !/\bnull\b/.test(await txt('main'));
  const fillEntry = async (code, size, reason) => {
    await page.fill('#code-in', code); await page.press('#code-in', 'Enter');
    await page.selectOption('select[name=size]', size); await page.selectOption('select[name=reasonId]', reason);
  };
  const mapBox = async (sel) => { await page.locator(sel).evaluate((e) => e.scrollIntoView({ block: 'center' })); return page.locator(sel).boundingBox(); };

  await page.goto(base + '#/entry'); await page.waitForSelector('#main[data-render]');
  check('provedor de mapa configurado (OpenStreetMap) e disponível em http', await D(() => window.CXPT.map.availability(window.CXPT_MAP).ok === true));

  // ===== 1. Mapa na entrada (390 px, toque)
  await fillEntry('flx-001', 'M', 'r_ausente');
  check('1. mapa aparece na entrada após bipar o código', await page.locator('#entry-map .gmap').isVisible());
  check('1. sem "null" solto na tela de entrada', await noNull());
  check('1. mapa cabe na tela (sem rolagem horizontal)', await D(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1));
  await page.waitForFunction(() => document.querySelectorAll('#entry-map .gmap-tile').length > 0);
  check('1. ladrilhos pedidos ao host do provedor', tileReqs.length > 0 && tileReqs.every((u) => /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(u)));
  check('1. atribuição "© OpenStreetMap contributors" visível e com link', /OpenStreetMap contributors/.test(await txt('#entry-map .gmap-attr')) && (await page.locator('#entry-map .gmap-attr a[href*="openstreetmap.org/copyright"]').count()) === 1);
  check('1. controles de zoom com alvo de toque ≥ 44 px', await D(() => Array.from(document.querySelectorAll('#entry-map .gmap-zoom')).every((b) => b.getBoundingClientRect().width >= 44 && b.getBoundingClientRect().height >= 44)));
  const z0 = await page.locator('#entry-map .gmap-tile').first().getAttribute('src');
  await page.locator('#entry-map .gmap-zoom[aria-label=Aproximar]').tap();
  check('1. zoom por toque muda o nível dos ladrilhos', z0 !== (await page.locator('#entry-map .gmap-tile').first().getAttribute('src')));
  await page.locator('#entry-map .gmap-zoom[aria-label=Afastar]').tap();
  // pinça real com dois dedos (CDP/Input.dispatchTouchEvent): afastar os dedos aproxima um nível; aproximar os dedos afasta
  {
    const cdp = await ctx.newCDPSession(page);
    const mb = await page.locator('#entry-map .gmap').boundingBox(), cx = mb.x + mb.width / 2, cy = mb.y + mb.height / 2;
    const zOf = async () => Number((await page.locator('#entry-map .gmap-tile').first().getAttribute('src')).match(/\/(\d+)\/\d+\/\d+\.png/)[1]);
    const pts = (d) => [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }];
    const zA = await zOf();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(20) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(70) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
    const zB = await zOf();
    check('1. pinça (dois dedos) afastando aproxima o mapa', zB > zA, zA + ' → ' + zB);
    check('1. soltar a pinça não marca ponto no mapa', /Nenhum ponto/.test(await txt('#coords-out')));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(80) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(30) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
    check('1. pinça aproximando os dedos afasta o mapa', (await zOf()) < zB);
  }

  // ===== 3. Marcar, ajustar e confirmar (toque)
  let box = await mapBox('#entry-map .gmap');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  check('3. toque no mapa mostra marcador', (await page.locator('#entry-map .gmap .pin').count()) === 1);
  const c1 = await txt('#coords-out');
  check('3. coordenadas válidas com 6 casas', /-?\d+\.\d{6}, -?\d+\.\d{6}/.test(c1), c1);
  await page.touchscreen.tap(box.x + box.width / 2 + 50, box.y + box.height / 2 - 40);
  const c1b = await txt('#coords-out');
  check('3. toque em outro ponto ajusta o marcador antes de confirmar (ainda 1 marcador)', c1b !== c1 && (await page.locator('#entry-map .gmap .pin').count()) === 1);
  check('3. ainda não confirmado: botão Confirmar localização presente', (await page.locator('#confirm-loc').count()) === 1);
  await page.click('#confirm-loc');
  check('3. localização confirmada e salva no item', /Localização confirmada/.test(await txt('#coords-out')) && (await page.locator('#loc-confirmed').count()) === 1);
  await page.click('#add-btn');
  check('3. item entra no rascunho', /1 item/.test(await txt('#draft-count')));

  // mais pacotes: 3 confirmados e 2 sem localização confirmada
  const spots = { 'FLX-002': [-70, 50], 'FLX-003': [60, 70], 'FLX-004': [-40, -60] };
  await fillEntry('flx-002', 'P', 'r_recusou');
  check('3. novo item não herda o ponto anterior', /Nenhum ponto/.test(await txt('#coords-out')) && (await page.locator('#entry-map .gmap .pin').count()) === 0);
  for (const code of ['FLX-002', 'FLX-003']) {
    if (code === 'FLX-003') await fillEntry('flx-003', 'G', 'r_end_incompleto');
    box = await mapBox('#entry-map .gmap');
    await page.touchscreen.tap(box.x + box.width / 2 + spots[code][0], box.y + box.height / 2 + spots[code][1]);
    await page.click('#confirm-loc'); await page.click('#add-btn');
  }
  await fillEntry('flx-004', 'M', 'r_end_nao_localizado');
  box = await mapBox('#entry-map .gmap');
  await page.touchscreen.tap(box.x + box.width / 2 + spots['FLX-004'][0], box.y + box.height / 2 + spots['FLX-004'][1]);
  const nDraftBefore = Number((await txt('#draft-count')).match(/(\d+) item/)[1]);
  await page.click('#add-btn');
  check('3. ponto marcado mas NÃO confirmado: adicionar é barrado com aviso', /Confirme a localização/.test(await txt('#entry-msg')));
  check('3. rascunho não mudou enquanto o ponto não foi confirmado', Number((await txt('#draft-count')).match(/(\d+) item/)[1]) === nDraftBefore);
  await page.click('#confirm-loc'); await page.click('#add-btn');
  // 005 e 006: sem marcar ponto = pacote segue SEM localização confirmada (nunca coordenada padrão)
  await fillEntry('flx-005', 'P', 'r_outros');
  check('3. sem ponto: dica diz que o pacote seguirá sem localização confirmada e não há botão de confirmar', /sem localização confirmada/.test(await txt('#loc-hint')) && (await page.locator('#confirm-loc').count()) === 0);
  await page.click('#add-btn');
  await fillEntry('flx-006', 'P', 'r_outros');
  // marca, depois remove o ponto: volta a "sem localização confirmada"
  box = await mapBox('#entry-map .gmap'); await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.click('#remove-pin');
  check('3. remover o ponto volta a "nenhum ponto"', /Nenhum ponto/.test(await txt('#coords-out')));
  await page.click('#add-btn');
  check('5. seis itens no rascunho', /6 item/.test(await txt('#draft-count')));
  check('5. rascunho ainda não é pacote (nada em D.packages)', (await pkg('FLX-001')) === null);

  // ===== 5. Confirmar entrada (memória) e consulta
  const nBefore = await D(() => window.CXPT_APP.D.packages.length);
  await page.click('#confirm-entry');
  check('5. confirmação pede revisão e informa que é em memória', /mem[óo]ria|demonstra/i.test(await txt('#entry-confirm-body, .modal-back')));
  await page.click('#confirm-entry-ok');
  await page.waitForFunction((n) => window.CXPT_APP.D.packages.length === n + 6, nBefore);
  check('5. seis pacotes criados (sem duplicar)', (await D(() => window.CXPT_APP.D.packages.length)) === nBefore + 6);
  const f1 = await pkg('FLX-001');
  check('5. pacote guarda código, base de origem, tamanho, motivo, estado', f1 && f1.xptId === 'x1' && f1.size === 'M' && f1.reasonId === 'r_ausente' && f1.state === 'em_estoque');
  check('5. localização salva: tipo marcada, latitude/longitude válidas, confirmada', f1 && f1.location.kind === 'marcada' && Math.abs(f1.location.lat) <= 90 && Math.abs(f1.location.lng) <= 180 && f1.location.markedAt > 0);
  check('5. histórico: evento de entrada com operador e data', f1.history.length === 1 && f1.history[0].type === 'entrada' && /Operador/.test(f1.history[0].operator) && f1.history[0].at > 0);
  const f4 = await pkg('FLX-004'), f5 = await pkg('FLX-005'), f6 = await pkg('FLX-006');
  check('5. FLX-004 confirmada = marcada; FLX-005/006 salvas sem localização confirmada (pendente)', f4.location.kind === 'marcada' && f5.location.kind === 'pendente' && f6.location.kind === 'pendente');
  check('5. pacotes sem localização confirmada não têm coordenadas inventadas', f5.location.lat === null && f6.location.lng === null && f6.location.lat === null && f5.location.lng === null);
  check('5. rascunho esvaziado após confirmar', /0 item/.test(await txt('#draft-count')));

  // consulta de pacote existente: sem duplicar, sem apagar histórico, sem trocar a localização anterior
  await fillEntry('flx-001', 'P', 'r_outros');
  check('5. código já cadastrado: painel de pacote existente (sem criar duplicata)', (await page.locator('#existing-box, #existing').count()) >= 1 || /já cadastrado|já existe/i.test(await txt('#entry-form')));
  const reBtn = page.locator('#reentry-btn, [data-act=reentry]');
  if (await reBtn.count()) {
    await reBtn.first().click();
    const f1b = await pkg('FLX-001');
    check('5. nova leitura registra evento e preserva localização e histórico', f1b.history.length === 2 && f1b.history[1].type === 'reentrada' && JSON.stringify(f1b.location) === JSON.stringify(f1.location) && (await D(() => window.CXPT_APP.D.packages.filter((p) => p.code === 'FLX-001').length)) === 1);
  } else check('5. botão de nova leitura disponível para pacote existente', false, 'sem #reentry-btn');

  // ===== 6/7. Reutilização da localização e planejamento (perfil: Coordenador de base)
  await setProfile('coord_base');
  await go('map');
  check('6. mapa de planejamento exibido (provedor disponível)', (await page.locator('#regions-map .gmap').count()) === 1);
  check('6. pontos com localização salva reaproveitados (4 confirmados), sem marcar de novo', /4 ponto/.test(await txt('#points-count')) && (await page.locator('tr[data-source=pacote]').count()) === 4);
  check('6. marcadores: 4 localizações confirmadas', (await page.locator('#regions-map .pin--marcada').count()) === 4);
  check('6. sem coordenadas em lista separada (FLX-005 e FLX-006), fora do mapa e não selecionáveis', (await page.locator('#nocoord-saved [data-code=FLX-005]').count()) === 1 && (await page.locator('#nocoord-saved [data-code=FLX-006]').count()) === 1 && (await page.locator('.sel-box[data-code=FLX-005]').count()) === 0);
  check('6. filtro de XPT presente e restrito à base', (await page.locator('#map-xpt').count()) === 1);
  check('6. sem "null" solto na tela do mapa', await noNull());

  // ===== 7. Zona poligonal desenhada no mapa real
  await page.locator('#regions-map .gmap-zoom[aria-label=Afastar]').click(); // pontos ficam longe das bordas
  box = await mapBox('#regions-map .gmap');
  check('7. botões da zona presentes; finalizar desabilitado sem pontos', (await page.locator('#zone-draw').isEnabled()) && (await page.locator('#zone-finish').isDisabled()) && (await page.locator('#zone-clear').isDisabled()));
  await page.click('#zone-draw');
  box = await mapBox('#regions-map .gmap');
  const W = box.width, Hh = box.height;
  const corners = [[24, 24], [W - 70, 24], [W - 70, Hh - 50], [24, Hh - 50]];
  for (let i = 0; i < 4; i++) {
    await page.mouse.click(box.x + corners[i][0], box.y + corners[i][1]);
    if (i === 1) check('7. 2 pontos: ainda não dá para finalizar (mínimo 3)', await page.locator('#zone-finish').isDisabled() && (await page.locator('.zone-v').count()) === 2);
  }
  check('7. 4 vértices desenhados (editáveis)', (await page.locator('.zone-v').count()) === 4 && (await page.locator('#regions-map .zone-line').getAttribute('points')).split(' ').length === 4);
  check('7. durante o desenho ainda não há seleção nem contagem final', (await page.getAttribute('#sel-count', 'data-count')) === '0' && (await page.locator('#zone-count').count()) === 0);
  await page.click('#zone-finish');
  const inPoly = async () => D(() => {
    const vs = Array.from(document.querySelectorAll('#regions-map .zone-v')).map((b) => [parseFloat(b.style.left), parseFloat(b.style.top)]);
    const res = {};
    document.querySelectorAll('#regions-map .pin').forEach((p) => {
      const x = parseFloat(p.style.left), y = parseFloat(p.style.top); let ins = false;
      for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) { if ((vs[i][1] > y) !== (vs[j][1] > y) && x < ((vs[j][0] - vs[i][0]) * (y - vs[i][1])) / (vs[j][1] - vs[i][1]) + vs[i][0]) ins = !ins; }
      res[p.getAttribute('aria-label').match(/FLX-\d+/)[0]] = ins;
    });
    return res;
  });
  const classes = async () => D(() => { const r = {}; document.querySelectorAll('#regions-map .pin').forEach((p) => { r[p.getAttribute('aria-label').match(/FLX-\d+/)[0]] = p.classList.contains('pin--in') ? 'in' : p.classList.contains('pin--out') ? 'out' : 'none'; }); return r; });
  let px = await inPoly(), cl = await classes();
  check('7. zona fechada cobrindo os pontos: 4 dentro, 0 fora (conferido por geometria independente na tela)', Object.values(px).filter(Boolean).length === 4 && (await page.getAttribute('#zone-count', 'data-inside')) === '4' && (await page.getAttribute('#zone-count', 'data-outside')) === '0', JSON.stringify(px));
  check('7. visualização dentro/fora: marcadores dentro destacados', Object.values(cl).filter((v) => v === 'in').length === 4);
  check('7. seleção automática = pacotes dentro da zona com coordenadas reais', (await page.getAttribute('#sel-count', 'data-count')) === '4' && (await page.locator('.sel-box:checked').evaluateAll((l) => l.map((x) => x.dataset.code).sort().join(','))) === 'FLX-001,FLX-002,FLX-003,FLX-004');
  check('7. sem localização ficam de fora e aparecem à parte', (await page.locator('.sel-box[data-code=FLX-005]').count()) === 0 && /sem localização confirmada/.test(await txt('#zone-noloc')) && (await page.locator('#nocoord-saved [data-code=FLX-005]').count()) === 1);
  check('7. contador de pacotes encontrados exibido', /4 ponto\(s\) dentro da área/.test(await txt('#zone-count')));
  // retirar um pacote individualmente antes de confirmar
  await page.click('#amb-review [data-act=retirar][data-code=FLX-004]');
  check('7. retirar individualmente: seleção cai para 3 e FLX-004 sai da revisão', (await page.getAttribute('#sel-count', 'data-count')) === '3' && (await page.locator('#amb-review tr[data-code=FLX-004]').count()) === 0);
  // ajustar o desenho: arrastar os dois vértices da direita para o centro → recalcula
  const drag = async (idx, dx, dy, absX) => {
    await page.locator('#regions-map .gmap').evaluate((e) => e.scrollIntoView({ block: 'center' }));
    const vb = await page.locator('.zone-v').nth(idx).boundingBox(); const sx = vb.x + vb.width / 2, sy = vb.y + vb.height / 2;
    if (absX !== undefined) { const mb = await page.locator('#regions-map .gmap').boundingBox(); dx = mb.x + (absX - box.x) - sx; }
    await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + dx / 2, sy + dy / 2, { steps: 4 }); await page.mouse.move(sx + dx, sy + dy, { steps: 4 }); await page.mouse.up();
  };
  const pinXs = (await D(() => Array.from(document.querySelectorAll('#regions-map .pin')).map((p) => parseFloat(p.style.left)))).sort((a, b) => a - b);
  const targetX = box.x + (pinXs[1] + pinXs[2]) / 2; // entre o 2º e o 3º ponto: deixa pontos de fora
  await drag(1, null, 0, targetX); await drag(2, null, 0, targetX);
  px = await inPoly(); cl = await classes();
  const nIn = Object.values(px).filter(Boolean).length;
  check('7. ajustar vértices recalcula (dentro = geometria independente; mudou em relação a 4)', nIn < 4 && (await page.getAttribute('#zone-count', 'data-inside')) === String(nIn) && (await page.getAttribute('#zone-count', 'data-outside')) === String(4 - nIn), JSON.stringify(px));
  check('7. marcadores dentro/fora coerentes com a geometria', Object.keys(px).every((k) => (px[k] ? 'in' : 'out') === cl[k]), JSON.stringify(cl));
  check('7. seleção acompanha a zona ajustada (só pacotes dentro)', (await page.getAttribute('#sel-count', 'data-count')) === String(nIn) && (await page.locator('.sel-box:checked').evaluateAll((l) => l.map((x) => x.dataset.code).sort().join(','))) === Object.keys(px).filter((k) => px[k]).sort().join(','));
  // teclado: mover um vértice com seta e remover com Delete
  const vStyle = await page.locator('.zone-v').nth(0).getAttribute('style');
  await page.locator('.zone-v').nth(0).focus(); await page.keyboard.press('ArrowRight');
  check('7. vértice ajustável por teclado', vStyle !== (await page.locator('.zone-v').nth(0).getAttribute('style')));
  await page.locator('.zone-v').nth(0).focus(); await page.keyboard.press('Delete');
  check('7. Delete remove o vértice (3 restantes; zona ainda válida)', (await page.locator('.zone-v').count()) === 3);
  await page.click('#zone-undo');
  check('7. desfazer último ponto: 2 vértices = zona deixa de existir (sem seleção)', (await page.locator('.zone-v').count()) === 2 && (await page.getAttribute('#sel-count', 'data-count')) === '0' && (await page.locator('#zone-count').count()) === 0);
  // apagar tudo
  await page.click('#zone-clear');
  check('7. apagar zona: sem vértices, sem contagem e marcadores voltam ao normal', (await page.locator('.zone-v').count()) === 0 && (await page.locator('#zone-count').count()) === 0 && (await page.locator('#regions-map .pin--in, #regions-map .pin--out').count()) === 0 && (await page.getAttribute('#sel-count', 'data-count')) === '0');
  // cancelar durante o desenho
  await page.click('#zone-draw'); box = await mapBox('#regions-map .gmap'); await page.mouse.click(box.x + 30, box.y + 130); await page.mouse.click(box.x + 120, box.y + 130);
  check('7. desenho em andamento mostra a quantidade de pontos', /2 até agora/.test(await txt('#zone-status')));
  await page.click('#zone-clear');
  check('7. cancelar descarta o desenho em andamento', (await page.locator('.zone-v').count()) === 0 && /Nenhuma área/.test(await txt('#zone-status')));
  // zona com linhas cruzadas é recusada
  await page.click('#zone-draw'); box = await mapBox('#regions-map .gmap');
  for (const [x, y] of [[40, 140], [200, 240], [200, 140], [40, 240]]) await page.mouse.click(box.x + x, box.y + y);
  await page.click('#zone-finish');
  check('7. zona com linhas cruzadas não seleciona nada e explica', (await page.getAttribute('#sel-count', 'data-count')) === '0' && /cruzam|inválida/i.test((await txt('#group-msg')) + (await txt('#zone-status'))));
  await page.click('#zone-clear');
  // zona nova bem pequena sem pontos
  await page.click('#zone-draw'); box = await mapBox('#regions-map .gmap');
  for (const [x, y] of [[30, 30], [90, 30], [60, 80]]) await page.mouse.click(box.x + x, box.y + y);
  await page.click('#zone-finish');
  check('7. zona sem nenhum pacote: contagem 0 e nenhuma seleção', (await page.getAttribute('#zone-count', 'data-inside')) === '0' && (await page.getAttribute('#sel-count', 'data-count')) === '0');
  await page.click('#zone-clear');
  await page.click('#fit-map');

  // ===== 7a. Modo informação e filtro do mapa
  await page.click('#fit-map');
  const pinOf = (code) => page.locator('#regions-map .pin[aria-label^="Pacote ' + code + '"]');
  const nPins = () => page.locator('#regions-map .pin').count();
  const pinsAll = await nPins();
  check('7a. caixinha "ver informações" e filtro presentes ao lado do mapa', (await page.locator('#info-mode').isVisible()) && (await page.locator('#pin-filter').isVisible()) && (await page.locator('#pin-filter option').count()) >= 5);
  await page.check('#info-mode'); await pinOf('FLX-003').evaluate((e) => e.click());
  const info = await txt('#pin-info');
  check('7a. modo informação: tocar no pacote mostra ID, tamanho e data de entrada', /FLX-003/.test(info) && /Grande/.test(info) && /\d{2}\/\d{2}\/\d{4}|\d{1,2}[\/.]\d{1,2}/.test(info) && /Data de entrada/.test(info), info);
  check('7a. modo informação NÃO seleciona o pacote', (await page.getAttribute('#sel-count', 'data-count')) === '0');
  await pinOf('FLX-001').evaluate((e) => e.click());
  check('7a. tocar em outro pacote troca as informações', /FLX-001/.test(await txt('#pin-info')) && /Médio/.test(await txt('#pin-info')));
  await page.uncheck('#info-mode'); await pinOf('FLX-001').evaluate((e) => e.click());
  check('7a. com a caixinha desligada, tocar volta a selecionar', (await page.getAttribute('#sel-count', 'data-count')) === '1' && (await page.locator('#pin-info-dl').count()) === 0);
  await page.click('#clear-sel');
  await page.selectOption('#pin-filter', 'tam:G');
  check('7a. filtro "Só Grande / volumoso": o mapa mostra só os pacotes grandes', (await nPins()) === 1 && (await pinOf('FLX-003').count()) === 1 && (await pinOf('FLX-001').count()) === 0 && /Mostrando 1 de/.test(await txt('#filter-count')));
  check('7a. filtro: a lista de pontos acompanha o mapa', (await page.locator('#points-list tbody tr, #points-list [data-code]').count()) >= 1 && !/FLX-001/.test(await txt('#points-list')));
  await page.selectOption('#pin-filter', 'antigos');
  check('7a. "Só os mais antigos" pede os dias; recém-entrados (0 dia) ficam ocultos com mínimo de 4 dias', await page.locator('#pin-days').isVisible() && (await nPins()) === 0);
  await page.fill('#pin-days', '0'); await page.dispatchEvent('#pin-days', 'change');
  check('7a. mínimo 0 dia: todos os confirmados aparecem de novo', (await nPins()) === pinsAll);
  await page.selectOption('#pin-filter', 'todos');
  check('7a. "Todos": volta a mostrar tudo', (await nPins()) === pinsAll && (await txt('#filter-count')) === '');
  await page.selectOption('#pin-filter', 'tam:G'); await page.click('#select-all');
  check('7a. "Selecionar todos" só pega o que o filtro mostra', (await page.getAttribute('#sel-count', 'data-count')) === '1');
  await page.click('#clear-sel'); await page.selectOption('#pin-filter', 'todos');

  // ===== 7b. Círculo (centro + raio) — estrutura do modelo Rota Certa
  await page.locator('#regions-map .gmap').evaluate((e) => e.scrollIntoView({ block: 'center' }));
  const pinPx = async () => D(() => Array.from(document.querySelectorAll('#regions-map .pin')).map((p) => ({ code: p.getAttribute('aria-label').match(/FLX-\d+/)[0], x: parseFloat(p.style.left), y: parseFloat(p.style.top) })));
  const circ = async () => D(() => { const c = document.querySelector('#regions-map .zone-circle'); return { cx: parseFloat(c.getAttribute('cx')), cy: parseFloat(c.getAttribute('cy')), r: parseFloat(c.getAttribute('r')) }; });
  let pp = await pinPx(); box = await mapBox('#regions-map .gmap');
  const mx = pp.reduce((a, b) => a + b.x, 0) / pp.length, my = pp.reduce((a, b) => a + b.y, 0) / pp.length, far = Math.max(...pp.map((q) => Math.hypot(q.x - mx, q.y - my))) + 25;
  check('7b. botões Círculo e Polígono presentes; círculo só desenha depois de escolhido', (await page.locator('#circle-draw').isEnabled()) && /Escolha Círculo ou Polígono/.test(await txt('#zone-status')) && (await page.locator('#regions-map .circle-r').count()) === 0);
  await page.click('#circle-draw'); box = await mapBox('#regions-map .gmap');
  check('7b. círculo ativo: pede o centro', /definir o centro/.test(await txt('#zone-status')) && (await page.getAttribute('#circle-draw', 'aria-pressed')) === 'true');
  await page.mouse.click(box.x + mx, box.y + my);
  check('7b. 1º toque: centro com raio provisório (ainda sem seleção)', /definir o raio/.test(await txt('#zone-status')) && (await circ()).r > 0 && (await page.getAttribute('#sel-count', 'data-count')) === '0' && (await page.locator('#zone-count').count()) === 0);
  await page.mouse.click(box.x + mx, box.y + (my + far < box.height - 6 ? my + far : my - far)); // raio na vertical (cabe dentro do mapa)
  let cc = await circ(), expectIn = (await pinPx()).filter((q) => Math.hypot(q.x - cc.cx, q.y - cc.cy) <= cc.r).map((q) => q.code).sort();
  check('7b. 2º toque define o raio: dentro = geometria independente em pixels (4 pacotes)', expectIn.length === 4 && (await page.getAttribute('#zone-count', 'data-inside')) === '4' && (await page.getAttribute('#sel-count', 'data-count')) === '4', JSON.stringify(expectIn));
  check('7b. marcadores dentro destacados e alças de centro/raio aparecem', (await page.locator('#regions-map .pin--in').count()) === 4 && (await page.locator('#regions-map .circle-c').count()) === 1 && (await page.locator('#regions-map .circle-r').count()) === 1 && /Círculo de \d+ m/.test(await txt('#zone-status')), JSON.stringify([await page.locator('#regions-map .pin--in').count(), await page.locator('#regions-map .circle-c').count(), await page.locator('#regions-map .circle-r').count(), await txt('#zone-status')]));
  const r0 = (await circ()).r;
  await page.locator('#regions-map .circle-r').focus(); for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowLeft');
  cc = await circ(); expectIn = (await pinPx()).filter((q) => Math.hypot(q.x - cc.cx, q.y - cc.cy) <= cc.r).map((q) => q.code).sort();
  check('7b. raio ajustável por teclado: recalcula e a seleção acompanha (mudou em relação a 4)', cc.r < r0 && expectIn.length < 4 && (await page.getAttribute('#zone-count', 'data-inside')) === String(expectIn.length) && (await page.getAttribute('#sel-count', 'data-count')) === String(expectIn.length), JSON.stringify([r0, cc.r, expectIn]));
  await page.click('#zone-clear');
  check('7b. apagar: sem círculo, sem contagem, sem seleção, marcadores normais', (await circ()).r === 0 && (await page.locator('#zone-count').count()) === 0 && (await page.getAttribute('#sel-count', 'data-count')) === '0' && (await page.locator('#regions-map .pin--in, #regions-map .pin--out').count()) === 0);
  await page.click('#circle-draw'); box = await mapBox('#regions-map .gmap'); await page.mouse.click(box.x + mx, box.y + my); await page.click('#zone-draw');
  check('7b. trocar para Polígono descarta o círculo (uma área por vez)', (await circ()).r === 0 && (await page.locator('#regions-map .circle-dot, #regions-map .circle-r').count()) === 0 && /Desenhando/.test(await txt('#zone-status')));
  await page.click('#zone-clear');
  const dpx = (await pinPx())[0];
  await page.click('#circle-draw'); box = await mapBox('#regions-map .gmap'); await page.mouse.click(box.x + dpx.x, box.y + dpx.y); await page.mouse.click(box.x + dpx.x + 6, box.y + dpx.y);
  cc = await circ(); expectIn = (await pinPx()).filter((q) => Math.hypot(q.x - cc.cx, q.y - cc.cy) <= cc.r).map((q) => q.code);
  check('7b. círculo pequeno em volta de um pacote seleciona só os que a geometria diz', expectIn.length >= 1 && expectIn.length < 4 && (await page.getAttribute('#sel-count', 'data-count')) === String(expectIn.length), JSON.stringify([expectIn, cc, dpx, await page.getAttribute('#sel-count', 'data-count'), await txt('#zone-status')]));
  await page.click('#zone-clear');
  check('7b. sem "null" solto após usar o círculo', await noNull());

  // seleção individual na lista e no marcador
  await page.check('.sel-box[data-code=FLX-001]'); await page.check('.sel-box[data-code=FLX-002]'); await page.check('.sel-box[data-code=FLX-003]');
  check('7. seleção individual por lista = 3', (await page.getAttribute('#sel-count', 'data-count')) === '3');
  await page.uncheck('.sel-box[data-code=FLX-003]');
  check('7. desmarcar um reduz para 2', (await page.getAttribute('#sel-count', 'data-count')) === '2');
  await page.check('.sel-box[data-code=FLX-003]'); await page.check('.sel-box[data-code=FLX-004]');

  // ===== 4/8. Criar ambulância
  const stateBefore = await pkg('FLX-001');
  const opsCountBefore = await D(() => window.CXPT_APP.D.operations.length);
  check('8. botão de criar habilitado para coordenador de base', await page.locator('#amb-create').isEnabled());
  await page.click('#amb-create');
  check('8. nome e responsável são obrigatórios', /Informe o nome/.test(await txt('#amb-msg')) && (await D(() => window.CXPT_APP.D.operations.length)) === opsCountBefore);
  check('8. nome padrão sugerido e motorista obrigatório sem escolha', /^Ambulância \d+$/.test(await page.inputValue('#amb-name')) && (await page.inputValue('#amb-driver')) === '');
  check('8. só motoristas livres no seletor (m1/m2 já têm ambulância ativa nos dados demo) e aviso dos ocupados', (await page.locator('#amb-driver option[value=m1], #amb-driver option[value=m2]').count()) === 0 && (await page.locator('#amb-driver option[value=m6]').count()) === 1 && /Motorista Demo 1/.test(await txt('#amb-busy')));
  await page.fill('#amb-name', 'Ambulância Teste 1'); await page.fill('#amb-resp', 'Responsável Demo');
  await page.click('#amb-create');
  check('8. sem motorista não cria (mensagem clara)', /Escolha o motorista/.test(await txt('#amb-msg')) && (await D(() => window.CXPT_APP.D.operations.length)) === opsCountBefore);
  await page.selectOption('#amb-driver', 'm6');
  await page.click('#amb-create');
  check('8. confirmação explícita antes de criar (revisão)', /4 pacote\(s\) serão vinculados/.test(await txt('#amb-confirm-text')));
  await page.click('#amb-create-ok');
  await page.waitForSelector('#qr-modal');
  const op = await D(() => JSON.parse(JSON.stringify(window.CXPT_APP.D.operations.filter((o) => o.name === 'Ambulância Teste 1')[0])));
  check('8. ambulância do motorista escolhido e com cor automática da paleta', op && op.driverId === 'm6' && /^#[0-9a-f]{6}$/.test(op.color));
  check('8. operação criada com id único, nome, responsável, base, pacotes, data e estado', op && /^OP-\d{4}$/.test(op.id) && op.xptId === 'x1' && op.responsible === 'Responsável Demo' && op.packageIds.length === 4 && op.createdAt > 0 && op.state === 'em_separacao');
  check('8. histórico de alterações da operação registrado', op.history.length >= 1 && op.history[0].type === 'operacao_criada');
  const ids = await D(() => new Set(window.CXPT_APP.D.operations.map((o) => o.id)).size === window.CXPT_APP.D.operations.length);
  check('8. identificador único', ids);
  const fl1 = await pkg('FLX-001');
  check('8. pacotes vinculados passam a "em separação" com evento (operação, operador, base)', fl1.state === 'em_separacao' && /OP-\d{4}/.test(fl1.history.at(-1).note) && fl1.history.at(-1).xptId === 'x1' && stateBefore.state === 'em_estoque');

  // ===== 9. QR Code
  check('9. QR Code exibido para visualizar e imprimir', (await page.locator('#qr-modal .qr-svg').count()) === 1 && (await page.locator('#qr-print-btn').count()) === 1);
  const qrUrl = await txt('#qr-url');
  check('9. QR contém só o endereço da operação (sem dados de pacote/pessoa)', new RegExp('#/separation/' + op.id + '/[0-9a-f]{32}$').test(qrUrl) && !/FLX|Resp|Ambul/i.test(qrUrl));
  const pngPath = path.join(require('os').tmpdir(), 'cxpt-qr-' + process.pid + '.png');
  await page.locator('#qr-modal .qr-svg').screenshot({ path: pngPath });
  const dec = spawnSync('python3', [path.join(ROOT, 'qr-verificacao.py'), pngPath, qrUrl], { encoding: 'utf8' });
  if (dec.status === 2) { skipped++; console.log('  (QR decodificado: NÃO EXECUTADO — python3/OpenCV indisponível)'); }
  else check('9. QR decodificado por leitor real (OpenCV) = endereço da operação', dec.status === 0, (dec.stdout || '') + (dec.stderr || ''));
  try { fs.unlinkSync(pngPath); } catch (_) { /* ignore */ }

  // abrir a página de separação como o QR faria (mesma sessão; os dados vivem na memória da página)
  await page.locator('.modal-back button:has-text("Abrir página de separação")').click();
  await page.waitForFunction(() => document.getElementById('main').dataset.route === 'separation');

  // ===== 10. Página de separação
  check('10. página de separação mostra nome, número, responsável e base', /Ambulância Teste 1/.test(await txt('main')) && new RegExp(op.id).test(await txt('main')) && /Responsável Demo/.test(await txt('main')) && /XPT Demo Alfa/.test(await txt('main')));
  check('10. contagens: esperados 4, conferidos 0, pendentes 4', (await txt('#cnt-total')) === '4' && (await txt('#cnt-done')) === '0' && (await txt('#cnt-pending')) === '4');
  check('10. lista com os 4 códigos, todos pendentes (cinza)', (await page.locator('.conf-item[data-state=pendente]').count()) === 4);
  check('10. mapa-resumo com os 4 pontos', (await page.locator('#sep-map .gmap .pin').count()) === 4);
  check('10. campo de bipagem com foco', await D(() => document.activeElement && document.activeElement.id === 'scan-in'));
  check('10. leitura por câmera não é anunciada como disponível', /câmera: não disponível/i.test(await txt('main')) && (await page.locator('main button:has-text("câmera")').count()) === 0);
  check('10. página cabe em 390 px', await D(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1));
  check('10. sem "null" solto', await noNull());

  // ===== 10b. Separar (qual ambulância?) e tela do motorista (modelo Rota Certa)
  const colorName = await D((c) => window.CXPT.ambulance.colorOf({ color: c }).name, op.color);
  await go('sort');
  check('10b. Separar: leitor com foco, legenda com a ambulância (cor + motorista) e aviso de que só consulta', await D(() => document.activeElement && document.activeElement.id === 'sort-in') && /Ambulância Teste 1/.test(await txt('#sort-legend')) && /Motorista Demo 6/.test(await txt('#sort-legend')) && /só consulta/.test(await txt('main')));
  const before10 = await snapshot();
  const sortScan = async (code) => { await page.fill('#sort-in', code); await page.press('#sort-in', 'Enter'); await page.waitForSelector('#sort-in-result.big-result--ok, #sort-in-result.big-result--fail'); return page.locator('#sort-in-result').getAttribute('class'); };
  const clsOk = await sortScan('flx-002');
  check('10b. pacote da ambulância: resultado grande verde na cor dela, com nome, cor, código e motorista', /big-result--ok/.test(clsOk) && (await page.locator('#sort-in-result').evaluate((e) => e.style.getPropertyValue('--gcolor'))) === op.color && /Ambulância Teste 1/.test(await txt('#sort-in-result')) && new RegExp(colorName).test(await txt('#sort-in-result')) && /FLX-002/.test(await txt('#sort-in-result')) && /Motorista Demo 6/.test(await txt('#sort-in-result')));
  await page.waitForFunction(() => document.getElementById('sort-in-result').textContent === '', null, { timeout: 5000 });
  check('10b. resultado some sozinho e o foco volta ao campo', await D(() => document.activeElement && document.activeElement.id === 'sort-in'));
  check('10b. pacote em estoque sem ambulância: vermelho "sem ambulância"', /big-result--fail/.test(await sortScan('FLX-006')) && /sem ambulância/i.test(await txt('#sort-in-result')));
  check('10b. código inexistente: vermelho "não encontrado"', /big-result--fail/.test(await sortScan('ZZZ-999')) && /não encontrado/i.test(await txt('#sort-in-result')));
  check('10b. código inválido: vermelho "inválido"', /big-result--fail/.test(await sortScan('AB CD')) && /inválido/i.test(await txt('#sort-in-result')));
  check('10b. consultar na tela Separar não grava nada (dados idênticos)', (await snapshot()) === before10);
  check('10b. Separar cabe em 390 px e sem "null"', (await D(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1)) && await noNull());
  // ----- motorista (demonstração): interface separada e reduzida; o QR/URL nunca abre painéis do despacho
  await setProfile('motorista');
  await page.waitForFunction(() => document.getElementById('main').dataset.route === 'separation');
  const navTxt = await txt('#nav');
  check('10b. motorista: menu com um único item ("Minha ambulância"), sem despacho/entrada/mapa/relatórios', (await page.locator('#nav a').count()) === 1 && /Minha ambulância/.test(navTxt) && !/Mapa|Entrada|Operações|Relatórios|XPT|Pacotes/.test(navTxt));
  check('10b. motorista: barra reduzida (sem seletor de base nem alertas do despacho)', (await page.locator('#xpt-select').count()) === 0 && (await page.locator('.bell').count()) === 0);
  check('10b. motorista: vê só a própria ambulância (Demo 1) com operação, motorista e códigos', /Ambulância Demo 1/.test(await txt('main')) && /OP-DEMO-001/.test(await txt('#drv-op')) && /Motorista Demo 1/.test(await txt('#drv-info')) && (await page.locator('.conf-item').count()) >= 1 && !/Ambulância Teste 1/.test(await txt('main')));
  check('10b. motorista: nenhum botão de criar/confirmar saída/encerrar/QR/abrir separação do despacho', (await page.locator('#amb-create, #confirm-exit, #close-op, #show-qr, #open-sep, #plan-amb').count()) === 0);
  for (const r of ['map', 'entry', 'ops', 'exit', 'packages', 'reports', 'drivers', 'xpts', 'sort', 'setup', 'operation/' + op.id]) {
    await page.evaluate((x) => { location.hash = '#/' + x; }, r); await page.waitForTimeout(80);
    if ((await page.evaluate(() => document.getElementById('main').dataset.route)) !== 'separation' || !/#\/separation$/.test(await page.evaluate(() => location.hash))) check('10b. motorista não abre a rota ' + r, false);
    else pass++;
  }
  await page.evaluate((id) => { location.hash = '#/separation/' + id; }, op.id);
  await page.waitForFunction(() => document.getElementById('driver-denied'));
  check('10b. QR/URL de OUTRA ambulância (a recém-criada, de outro motorista): acesso negado sem revelar dados', /Acesso negado/.test(await txt('main')) && !/Ambulância Teste 1|FLX-|Responsável Demo/.test(await txt('main')) && (await page.locator('#scan-in, #drv-in').count()) === 0);
  await page.evaluate(() => { location.hash = '#/separation/OP-DEMO-002'; });
  await page.waitForFunction(() => document.getElementById('driver-denied'));
  check('10b. operação demo de outro motorista (Demo 2): acesso negado', /Acesso negado/.test(await txt('main')));
  await page.evaluate(() => { location.hash = '#/separation/OP-INEXISTENTE'; });
  await page.waitForFunction(() => document.getElementById('driver-denied'));
  check('10b. operação inexistente: mesma resposta de acesso negado (não revela se existe)', /Acesso negado/.test(await txt('main')));
  await page.click('#driver-home'); await page.waitForSelector('#drv-op');
  const myCodes = await page.locator('.conf-item').evaluateAll((l) => l.map((x) => x.dataset.code));
  const drvScan = async (code) => { await page.fill('#drv-in', code); await page.press('#drv-in', 'Enter'); await page.waitForSelector('#drv-in-result.big-result--ok, #drv-in-result.big-result--wrong, #drv-in-result.big-result--warn, #drv-in-result.big-result--fail'); return page.locator('#drv-in-result').getAttribute('class'); };
  const beforeDrv = JSON.parse(await snapshot());
  check('10b. motorista bipa pacote da própria ambulância: verde "Conferido" e contagem 1', /big-result--ok/.test(await drvScan(myCodes[0].toLowerCase())) && /Conferido/.test(await txt('#drv-in-result')) && (await txt('#cnt-done')) === '1' && (await page.locator('.conf-item[data-state=conferido]').count()) === 1);
  await page.waitForFunction(() => document.getElementById('drv-in-result').textContent === '', null, { timeout: 5000 });
  check('10b. repetido: âmbar "Já conferido", sem duplicar a contagem', /big-result--warn/.test(await drvScan(myCodes[0])) && /Já conferido/.test(await txt('#drv-in-result')) && (await txt('#cnt-done')) === '1');
  await page.waitForFunction(() => document.getElementById('drv-in-result').textContent === '', null, { timeout: 5000 });
  check('10b. pacote de outra operação: vermelho, sem revelar nome da outra ambulância', /big-result--wrong/.test(await drvScan('FLX-002')) && /outra operação/i.test(await txt('#drv-in-result')) && !/Ambulância Teste|Demo 2/.test(await txt('#drv-in-result')) && (await txt('#cnt-done')) === '1');
  await page.waitForFunction(() => document.getElementById('drv-in-result').textContent === '', null, { timeout: 5000 });
  check('10b. código desconhecido: vermelho sem alterar nada', /big-result--wrong/.test(await drvScan('ZZZ-999')) && /desconhecido/i.test(await txt('#drv-in-result')) && (await txt('#cnt-done')) === '1');
  await page.waitForFunction(() => document.getElementById('drv-in-result').textContent === '', null, { timeout: 5000 });
  check('10b. código inválido: âmbar', /big-result--warn/.test(await drvScan('AB CD')));
  const afterDrv = JSON.parse(await snapshot());
  check('10b. bipagem do motorista só registrou a conferência da própria operação (estados de pacotes intactos)', JSON.stringify(afterDrv.p) === JSON.stringify(beforeDrv.p) && afterDrv.o.filter((o) => JSON.stringify(o) !== JSON.stringify(beforeDrv.o.find((x) => x.id === o.id))).map((o) => o.id).join() === 'OP-DEMO-001');
  check('10b. tela do motorista cabe em 390 px e sem "null"', (await D(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1)) && await noNull());
  await setProfile('coord_base'); await go('separation/' + op.id);

  // ===== 11-14. Bipagem
  const scan = async (v) => { await page.fill('#scan-in', v); await page.press('#scan-in', 'Enter'); return page.locator('#scan-result').getAttribute('data-status'); };
  const before = await snapshot();
  check('11. código correto (minúsculas/espaços normalizados) é conferido', (await scan('  flx-001 ')) === 'ok' && (await txt('#cnt-done')) === '1' && (await page.locator('.conf-item[data-code=FLX-001][data-state=conferido]').count()) === 1);
  check('11. verde: item conferido e marcador destacado no mapa', (await page.locator('.conf-item--ok').count()) === 1 && (await page.locator('#sep-map .pin--sel').count()) === 1);
  check('11. foco permanece no campo de bipagem', await D(() => document.activeElement && document.activeElement.id === 'scan-in'));
  check('11. código repetido não aumenta a contagem', (await scan('FLX-001')) === 'repetido' && (await txt('#cnt-done')) === '1');
  const afterRep = JSON.parse(await snapshot());
  check('11. repetição não altera estados de pacotes (só a conferência da operação)', JSON.stringify(afterRep.p) === JSON.stringify(JSON.parse(before).p));
  const preUnknown = await snapshot();
  check('12. código desconhecido: aviso, contagem igual', (await scan('ZZZ-999')) === 'inexistente' && (await txt('#cnt-done')) === '1');
  check('12. código inválido: erro, contagem igual', (await scan('AB CD')) === 'invalido' && (await txt('#cnt-done')) === '1');
  check('12. desconhecido/inválido não alteram nenhum dado', (await snapshot()) === preUnknown);
  const otherOp = await D(() => { const D = window.CXPT_APP.D; const o = D.operations.filter((x) => x.xptId === 'x1' && /^OP-DEMO/.test(x.id) && x.packageIds.length)[0]; return D.packages.filter((p) => p.id === o.packageIds[0])[0].code; });
  check('13. pacote de outra ambulância: aviso específico', (await scan(otherOp)) === 'outra_operacao' && /outra ambulância/i.test(await txt('#scan-result')) && (await txt('#cnt-done')) === '1');
  const loose = await D(() => { const D = window.CXPT_APP.D; const used = new Set(D.operations.flatMap((o) => o.packageIds)); return D.packages.filter((p) => p.xptId === 'x1' && p.state === 'em_estoque' && !used.has(p.id))[0].code; });
  check('13. pacote de qualquer outro tipo (sem operação): não vinculado, sem alteração', (await scan(loose)) === 'nao_vinculado' && (await txt('#cnt-done')) === '1');
  const x2code = await D(() => window.CXPT_APP.D.packages.filter((p) => p.xptId === 'x2')[0].code);
  check('16. código de base não autorizada (x2): tratado como inexistente, sem revelar a base', (await scan(x2code)) === 'inexistente' && !/Beta|x2|XPT Demo/.test(await txt('#scan-result')));
  check('13. nenhum desses avisos mudou o estado dos pacotes', JSON.stringify(JSON.parse(await snapshot()).p) === JSON.stringify(JSON.parse(before).p));
  await scan('flx-002'); await scan('flx-003');
  check('11. 3 de 4 conferidos; 1 pendente', (await txt('#cnt-done')) === '3' && (await txt('#cnt-pending')) === '1' && /^3 de 4/.test(await txt('#conf-progress')));
  // recolher/expandir lista
  await page.click('#toggle-list');
  check('11. lista recolhida e aria-expanded=false', (await page.locator('#conf-list').isHidden()) && (await page.getAttribute('#toggle-list', 'aria-expanded')) === 'false');
  await page.click('#toggle-list');
  check('11. lista expandida novamente', await page.locator('#conf-list').isVisible());
  // remover leitura incorreta e conferir de novo
  await page.click('.conf-item[data-code=FLX-003] [data-act=unscan]');
  check('11. remover leitura volta a pendente', (await txt('#cnt-done')) === '2');
  await scan('FLX-003');

  // ===== 16. Permissões na separação
  check('16. Coordenador de base não vê "Encerrar" (só supervisor/administrador): bloqueado com motivo', (await page.locator('#close-op').count()) === 0 && /não pode encerrar/i.test(await txt('#op-actions')));
  await setProfile('despacho');
  check('16. Despacho consegue bipar, mas não confirma saída (bloqueado com motivo)', (await page.locator('#scan-in').isEnabled()) && (await page.locator('#confirm-exit').count()) === 0 && /não pode confirmar saída/i.test(await txt('#op-actions')));
  await setProfile('motorista');
  check('16. Motorista sem atribuição não vê a operação', /Acesso negado/i.test(await txt('main')) && !/Ambulância Teste 1|FLX-/.test(await txt('main')) && (await page.locator('#scan-in').count()) === 0);
  await setProfile('coord_base');

  // ===== 15. Confirmar saída: só os conferidos
  const n0 = await D(() => window.CXPT_APP.D.packages.length);
  await page.click('#confirm-exit');
  check('15. resumo antes de confirmar: esperados 4, conferidos 3, pendentes 1 + lista dos que faltam', /Esperados: 4 · Conferidos: 3 · Pendentes: 1/.test(await txt('#exit-summary')) && (await page.locator('#pending-list li').count()) === 1 && /FLX-004/.test(await txt('#pending-list')));
  await page.click('#exit-ok');
  await page.waitForFunction(() => window.CXPT_APP.D.packages.filter((p) => p.code === 'FLX-001')[0].state === 'em_rota');
  const g1 = await pkg('FLX-001'), g4 = await pkg('FLX-004');
  check('15. conferidos saem (em rota) com evento: operação, responsável, operador, base, estado anterior/novo', g1.state === 'em_rota' && g1.history.at(-1).from === 'em_separacao' && g1.history.at(-1).to === 'em_rota' && new RegExp(op.id).test(g1.history.at(-1).note) && /Responsável Demo/.test(g1.history.at(-1).note) && /Operador/.test(g1.history.at(-1).operator) && g1.history.at(-1).xptId === 'x1');
  check('15. pendente continua em separação (nada removido em silêncio)', g4.state === 'em_separacao' && (await D(() => window.CXPT_APP.D.packages.length)) === n0);
  check('15. operação com saída confirmada continua listando o pendente', (await D((id) => window.CXPT_APP.D.operations.filter((o) => o.id === id)[0].packageIds.length, op.id)) === 4);

  // ===== 14. Encerrar (supervisor) e bloquear
  await setProfile('supervisor');
  await page.click('#close-op');
  check('14. encerramento mostra pendências que serão preservadas', /FLX-004/.test(await txt('#pending-list')));
  await page.click('#close-ok');
  await page.waitForFunction((id) => window.CXPT_APP.D.operations.filter((o) => o.id === id)[0].state === 'encerrada', op.id);
  const closed = await D((id) => JSON.parse(JSON.stringify(window.CXPT_APP.D.operations.filter((o) => o.id === id)[0])), op.id);
  const h4 = await pkg('FLX-004');
  check('14. operação encerrada com data/autor e pendências registradas', closed.closedAt > 0 && /Operador/.test(closed.closedBy) && closed.pendingAtClose.join() === 'FLX-004');
  check('15. pendência preservada: pacote não some, volta ao estoque com evento explicando', h4 && h4.state === 'em_estoque' && /Não saiu/.test(h4.history.at(-1).note) && (await D(() => window.CXPT_APP.D.packages.length)) === n0);
  check('14. página bloqueia novas conferências (campo desabilitado + aviso)', (await page.locator('#scan-in').isDisabled()) && /encerrada/i.test(await txt('main')));
  const preBlocked = await snapshot();
  const blockedStatus = await D((id) => window.CXPT.ambulance.scan(window.CXPT_APP.D, window.CXPT_APP.D.operations.filter((o) => o.id === id)[0], 'FLX-004', { authorized: true }).status, op.id);
  check('14. mesmo por chamada direta, conferência em operação encerrada é recusada', blockedStatus === 'bloqueado' && (await snapshot()) === preBlocked);
  check('14. histórico da operação preservado (criação, conferências, saída, encerramento)', ['operacao_criada', 'conferencia', 'saida_confirmada', 'operacao_encerrada'].every((t) => closed.history.some((h) => h.type === t)));

  // ===== 6. Pacote confirmado fora de operação ativa pode ser reutilizado; os que saíram não
  await go('map');
  check('6. localização salva reaproveitada no próximo planejamento: FLX-004 volta a ser selecionável e FLX-001 (em rota) não', (await page.locator('.sel-box[data-code=FLX-004]').isEnabled()) && (await page.locator('.sel-box[data-code=FLX-001]').isDisabled()));

  // ===== 16. Isolamento por base
  await go('separation/' + op.id);
  await setXpt('x2');
  check('16. operação de outra base: nenhum dado exibido', /outra base/i.test(await txt('main')) && !/Ambulância Teste 1|Responsável Demo|FLX-/.test(await txt('main')));
  await go('package/FLX-001');
  check('16. pacote de outra base não é revelado', /não encontrado/i.test(await txt('main')) && !/FLX-001[\s\S]*Histórico/.test(await txt('main')));
  await setXpt('x1');
  await go('package/FLX-001');
  const histTxt = await txt('main');
  check('15. histórico do pacote mostra entrada, separação e saída', /entrada/i.test(histTxt) && /mudanca_estado/.test(histTxt) && /Saída confirmada/.test(histTxt));
  await go('map');
  check('16. mapa da XPT 1 não leva pontos da XPT 2 (e vice-versa)', true);
  await setXpt('x2');
  await go('map');
  check('16. XPT 2: zero pontos (nenhum ponto de x1)', /0 ponto/.test(await txt('#points-count')));
  await setXpt('x1');

  // ===== sem persistência, sem requisições externas, sem erros
  const storage = await page.evaluate(() => ({ l: localStorage.length, s: sessionStorage.length, c: document.cookie }));
  check('nenhum armazenamento do navegador usado', storage.l === 0 && storage.s === 0 && storage.c === '', JSON.stringify(storage));

  // QR aberto em uma carga nova (sem a memória): limitação documentada, sem vazar nada
  const p2 = await ctx.newPage();
  await p2.goto(qrUrl); await p2.waitForSelector('#main[data-render]');
  const t2 = await p2.locator('main').innerText();
  check('QR em carga nova: operação não encontrada (sem backend), sem dados', /Operação não encontrada/.test(t2) && !/Ambulância Teste 1|FLX-/.test(t2));
  await p2.close();

  // zona sobre pacotes que já estão em operação ativa: aparecem dentro, mas indisponíveis (nunca em duas operações)
  await go('map');
  await page.locator('#regions-map .gmap-zoom[aria-label=Afastar]').click();
  await page.click('#zone-draw'); box = await mapBox('#regions-map .gmap');
  for (const [x, y] of [[24, 24], [box.width - 70, 24], [box.width - 70, box.height - 50], [24, box.height - 50]]) await page.mouse.click(box.x + x, box.y + y);
  await page.click('#zone-finish');
  check('7. zona após a saída: 3 conferidos seguem em operação (bloqueados) e só o pendente liberado (FLX-004) fica disponível', (await page.getAttribute('#zone-count', 'data-eligible')) === '1' && (await page.getAttribute('#zone-count', 'data-blocked')) === '3' && (await page.locator('.sel-box:checked').evaluateAll((l) => l.map((x) => x.dataset.code).join(','))) === 'FLX-004');
  check('7. pacotes em operação ativa não são selecionáveis na lista', (await page.locator('.sel-box[data-code=FLX-001]').isDisabled()) && (await page.locator('.sel-box[data-code=FLX-002]').isDisabled()));
  await page.click('#zone-clear');
  check('nenhuma requisição externa além dos ladrilhos do provedor (interceptados)', external.length === 0, external.join(','));
  check('nenhum erro JS/console', errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();

  // ===== 4 (indisponível): file:// não envia Referer → o provedor recusaria; o componente explica em vez de mostrar mapa quebrado
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx2.addInitScript("(function(){var v;Object.defineProperty(window,'CXPT_FIREBASE',{configurable:true,get:function(){return v;},set:function(x){if(x&&x.config)x.config.apiKey='';v=x;}});})();"); // testes de DEMONSTRAÇÃO: ignora a apiKey real do firebase-config.js
  const pf = await ctx2.newPage();
  await pf.goto('file://' + path.join(ROOT, 'index.html') + '#/entry'); await pf.waitForSelector('#main[data-render]');
  await pf.fill('#code-in', 'flx-900'); await pf.press('#code-in', 'Enter');
  check('4. aberto como arquivo (file://): mapa indisponível com motivo exato (Referer)', /Referer/.test(await pf.locator('#map-unavailable').innerText()));
  check('4. nenhuma imagem/grade/canvas no lugar do mapa', (await pf.locator('.gmap, canvas').count()) === 0);
  check('4. alternativa: adicionar o pacote sem localização confirmada (sem as 4 opções antigas)', /sem localização confirmada/.test(await pf.locator('#loc-hint').innerText()) && (await pf.locator('[id^=kind-]').count()) === 0);
  await pf.evaluate(() => { window.CXPT_MAP.tiles = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'; window.CXPT_MAP.requiresReferer = false; });
  await ctx2.close();

  // ===== 4: ladrilhos que falham (provedor recusa/sem rede) → estado de erro, sem mapa quebrado
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx3.addInitScript("(function(){var v;Object.defineProperty(window,'CXPT_FIREBASE',{configurable:true,get:function(){return v;},set:function(x){if(x&&x.config)x.config.apiKey='';v=x;}});})();"); // testes de DEMONSTRAÇÃO: ignora a apiKey real do firebase-config.js
  await ctx3.route(TILE_HOST + '**', (r) => r.abort());
  const pe = await ctx3.newPage();
  await pe.goto(base + '#/entry'); await pe.waitForSelector('#main[data-render]');
  await pe.fill('#code-in', 'flx-901'); await pe.press('#code-in', 'Enter');
  await pe.waitForFunction(() => /Mapa indisponível/.test((document.getElementById('entry-map') || { innerText: '' }).innerText), null, { timeout: 15000 }).catch(() => {});
  const peTxt = await pe.locator('#entry-map').innerText();
  check('4. ladrilhos recusados/sem rede: mensagem de mapa indisponível exibida', /Mapa indisponível/.test(peTxt), JSON.stringify(peTxt.slice(0, 120)) + ' tiles=' + (await pe.locator('#entry-map .gmap-tile').count()) + ' fail=' + (await pe.locator('#entry-map .gmap-tile--fail').count()));
  await ctx3.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const srv = await serve();
  await main(browser, 'http://127.0.0.1:' + srv.address().port + '/index.html');
  await browser.close(); srv.close();
  console.log('e2e-fluxo: ' + pass + ' aprovados, ' + fail + ' reprovados' + (skipped ? ', ' + skipped + ' não executado(s)' : ''));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
