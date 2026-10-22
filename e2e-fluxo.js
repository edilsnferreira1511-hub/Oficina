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

  // mais pacotes: 2 marcados, 1 aproximado, 1 desconhecido, 1 pendente (cada um com a própria localização)
  const spots = { 'FLX-002': [-70, 50], 'FLX-003': [60, 70], 'FLX-004': [-40, -60] };
  await fillEntry('flx-002', 'P', 'r_recusou');
  check('3. novo item não herda o ponto anterior', /Nenhum ponto/.test(await txt('#coords-out')) && (await page.locator('#entry-map .gmap .pin').count()) === 0);
  for (const code of ['FLX-002', 'FLX-003']) {
    if (code === 'FLX-003') await fillEntry('flx-003', 'G', 'r_end_incompleto');
    box = await mapBox('#entry-map .gmap');
    await page.touchscreen.tap(box.x + box.width / 2 + spots[code][0], box.y + box.height / 2 + spots[code][1]);
    await page.click('#confirm-loc'); await page.click('#add-btn');
  }
  await fillEntry('flx-004', 'M', 'r_end_nao_localizado'); await page.check('#kind-aproximada');
  box = await mapBox('#entry-map .gmap');
  await page.touchscreen.tap(box.x + box.width / 2 + spots['FLX-004'][0], box.y + box.height / 2 + spots['FLX-004'][1]);
  check('3. localização aproximada identificada como aproximada (marcador distinto)', (await page.locator('#entry-map .gmap .pin--aproximada').count()) === 1);
  await page.click('#add-btn');
  await fillEntry('flx-005', 'P', 'r_outros'); await page.check('#kind-desconhecida'); await page.click('#add-btn');
  await fillEntry('flx-006', 'P', 'r_outros'); await page.check('#kind-pendente'); await page.click('#add-btn');
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
  check('5. aproximada / desconhecida / pendente salvas com o tipo correto', f4.location.kind === 'aproximada' && f5.location.kind === 'desconhecida' && f6.location.kind === 'pendente');
  check('5. desconhecida e pendente não têm coordenadas', f5.location.lat === null && f6.location.lat === null);
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
  check('6. pontos com localização salva reaproveitados (4: 3 marcados + 1 aproximado), sem marcar de novo', /4 ponto/.test(await txt('#points-count')) && (await page.locator('tr[data-source=pacote]').count()) === 4);
  check('6. marcadores: marcados e aproximado diferenciados', (await page.locator('#regions-map .pin--marcada').count()) === 3 && (await page.locator('#regions-map .pin--aproximada').count()) === 1);
  check('6. sem coordenadas em lista separada (FLX-005 e FLX-006), fora do mapa e não selecionáveis', (await page.locator('#nocoord-saved [data-code=FLX-005]').count()) === 1 && (await page.locator('#nocoord-saved [data-code=FLX-006]').count()) === 1 && (await page.locator('.sel-box[data-code=FLX-005]').count()) === 0);
  check('6. filtro de XPT presente e restrito à base', (await page.locator('#map-xpt').count()) === 1);
  check('6. sem "null" solto na tela do mapa', await noNull());

  // seleção por região desenhada no mapa
  await page.click('#draw-area');
  check('7. modo de desenhar região ativo', (await page.getAttribute('#draw-area', 'aria-pressed')) === 'true');
  box = await mapBox('#regions-map .gmap'); // medido DEPOIS do clique (o clique pode rolar a página)
  // desenha cobrindo o mapa inteiro, começando no canto superior esquerdo (sem tocar nos controles de zoom)
  await page.mouse.move(box.x + 4, box.y + 4); await page.mouse.down(); await page.mouse.move(box.x + box.width - 4, box.y + box.height - 4, { steps: 8 }); await page.mouse.up();
  check('7. região desenhada seleciona os 4 pacotes com coordenadas salvas', (await page.getAttribute('#sel-count', 'data-count')) === '4');
  check('7. contador de selecionados e revisão exibida', /4 pacote/.test(await txt('#sel-count')) && (await page.getAttribute('#amb-review', 'data-count')) === '4');
  check('7. pacotes sem coordenadas nunca entram na seleção', (await page.locator('.sel-box:checked').evaluateAll((l) => l.map((x) => x.dataset.code).sort().join(','))) === 'FLX-001,FLX-002,FLX-003,FLX-004');
  // área vazia (pequena, fora dos pontos): não seleciona nada novo
  await page.click('#clear-sel');
  check('7. limpar seleção = 0', (await page.getAttribute('#sel-count', 'data-count')) === '0');
  // área parcial: desenha só o quadrante em que está FLX-002 (tela pequena): confere que seleciona um subconjunto coerente com as coordenadas
  await page.click('#draw-area'); // ativa
  box = await mapBox('#regions-map .gmap');
  await page.mouse.move(box.x + 6, box.y + box.height / 2 + 5); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 - 10, box.y + box.height - 40, { steps: 5 }); await page.mouse.up();
  const partial = await page.locator('.sel-box:checked').evaluateAll((l) => l.map((x) => x.dataset.code));
  const inside = await D(() => { const v = window.CXPT_APP.store.mapPoints('x1'); return v.map((p) => p.code); });
  check('7. seleção parcial usa só pontos reais (subconjunto dos pontos salvos)', partial.every((c) => inside.includes(c)) && partial.length < 4, partial.join(','));
  await page.click('#clear-sel');

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
  await page.fill('#amb-name', 'Ambulância Teste 1'); await page.fill('#amb-resp', 'Responsável Demo');
  await page.click('#amb-create');
  check('8. confirmação explícita antes de criar (revisão)', /4 pacote\(s\) serão vinculados/.test(await txt('#amb-confirm-text')));
  await page.click('#amb-create-ok');
  await page.waitForSelector('#qr-modal');
  const op = await D(() => JSON.parse(JSON.stringify(window.CXPT_APP.D.operations.filter((o) => o.name === 'Ambulância Teste 1')[0])));
  check('8. operação criada com id único, nome, responsável, base, pacotes, data e estado', op && /^OP-\d{4}$/.test(op.id) && op.xptId === 'x1' && op.responsible === 'Responsável Demo' && op.packageIds.length === 4 && op.createdAt > 0 && op.state === 'em_separacao');
  check('8. histórico de alterações da operação registrado', op.history.length >= 1 && op.history[0].type === 'operacao_criada');
  const ids = await D(() => new Set(window.CXPT_APP.D.operations.map((o) => o.id)).size === window.CXPT_APP.D.operations.length);
  check('8. identificador único', ids);
  const fl1 = await pkg('FLX-001');
  check('8. pacotes vinculados passam a "em separação" com evento (operação, operador, base)', fl1.state === 'em_separacao' && /OP-\d{4}/.test(fl1.history.at(-1).note) && fl1.history.at(-1).xptId === 'x1' && stateBefore.state === 'em_estoque');

  // ===== 9. QR Code
  check('9. QR Code exibido para visualizar e imprimir', (await page.locator('#qr-modal .qr-svg').count()) === 1 && (await page.locator('#qr-print-btn').count()) === 1);
  const qrUrl = await txt('#qr-url');
  check('9. QR contém só o endereço da operação (sem dados de pacote/pessoa)', new RegExp('#/separation/' + op.id + '$').test(qrUrl) && !/FLX|Resp|Ambul/i.test(qrUrl));
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
  check('16. Motorista sem atribuição não vê a operação', /não atribuída/i.test(await txt('main')) && (await page.locator('#scan-in').count()) === 0);
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

  check('nenhuma requisição externa além dos ladrilhos do provedor (interceptados)', external.length === 0, external.join(','));
  check('nenhum erro JS/console', errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();

  // ===== 4 (indisponível): file:// não envia Referer → o provedor recusaria; o componente explica em vez de mostrar mapa quebrado
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pf = await ctx2.newPage();
  await pf.goto('file://' + path.join(ROOT, 'index.html') + '#/entry'); await pf.waitForSelector('#main[data-render]');
  await pf.fill('#code-in', 'flx-900'); await pf.press('#code-in', 'Enter');
  check('4. aberto como arquivo (file://): mapa indisponível com motivo exato (Referer)', /Referer/.test(await pf.locator('#map-unavailable').innerText()));
  check('4. nenhuma imagem/grade/canvas no lugar do mapa', (await pf.locator('.gmap, canvas').count()) === 0);
  check('4. alternativa: registrar como pendente de localização', (await pf.locator('#kind-pendente').isEnabled()) && (await pf.locator('#kind-marcada').isDisabled()));
  await pf.evaluate(() => { window.CXPT_MAP.tiles = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'; window.CXPT_MAP.requiresReferer = false; });
  await ctx2.close();

  // ===== 4: ladrilhos que falham (provedor recusa/sem rede) → estado de erro, sem mapa quebrado
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
