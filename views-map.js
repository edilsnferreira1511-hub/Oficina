/* COOPMETRO XPT — Mapa e Regiões: consome os pontos do rascunho de Entrada (mesma estrutura geoPoints).
 * O grupo formado é só um RASCUNHO VISUAL em memória: não cria operação, não altera pacotes, não persiste. */
(function (root) {
  'use strict';
  var NS = root.CXPT, ui = NS.ui, el = ui.el, H = NS.vh, G = NS.geo;
  var V = NS.views, A = NS.ambulance;
  var ambForm = {}; // campos do formulário de ambulância por XPT (sobrevivem aos redesenhos)

  V.map = function (c) {
    var g = H.guard(c, 'ver_base'); if (g) return g;
    var D = c.D, store = c.store, group = store.group(c.xptId);
    var points = store.mapPoints(c.xptId); // somente desta XPT (rascunho + pacotes confirmados); seleção já reconciliada
    var selectable = store.selectable(points);
    var af = ambForm[c.xptId] || (ambForm[c.xptId] = { name: '', responsible: '', driverId: '' });
    var drawing = false;
    var av = NS.map.availability(root.CXPT_MAP), ctl = null, destroyed = false, focusId = null, notice = '';
    var mapHost = el('div', { class: 'map-host map-host--tall', id: 'regions-map' });
    var unavailable = el('div', { id: 'map-unavailable-box' });
    var list = el('div', { id: 'points-list' }), panel = el('div', { id: 'group-panel' }), detail = el('div', { id: 'point-detail' }), nocoord = el('div', { id: 'nocoord-list' });
    var live = el('p', { class: 'form-msg', id: 'group-msg', role: 'status' });

    function pts() { return points; }
    function pointById(id) { return points.filter(function (p) { return p.id === id; })[0]; }
    function toggle(id) {
      var pt = pointById(id);
      if (pt && !pt.eligible) { live.textContent = pt.code + ': ' + pt.why; redraw(); return; }
      var r = group.toggle(id, selectable);
      live.textContent = r.ok ? '' : r.reason;
      if (r.ok) focusId = id;
      redraw(); if (r.ok) ui.announce(group.count() + ' pacote(s) selecionado(s)');
    }
    function markers() {
      return points.map(function (p) {
        return { id: p.id, lat: p.lat, lng: p.lng, kind: p.kind, selected: group.has(p.id), focus: p.id === focusId, label: 'Pacote ' + p.code + ' — ' + G.LOC_LABEL[p.kind] + (group.has(p.id) ? ' (selecionado)' : '') + (p.source === 'pacote' ? '' : ' (rascunho)') + (p.eligible ? '' : ' (indisponível: ' + p.why + ')') };
      });
    }
    function drawDetail() {
      var p = focusId && pointById(focusId);
      detail.replaceChildren(p ? el('dl', { class: 'dl', id: 'detail-dl', 'data-code': p.code }, [
        ['Código do pacote', p.code], ['XPT', H.xptName(D, p.xptId)], ['Tamanho', H.sizeLabel(D, p.size)], ['Motivo da devolução', H.reasonLabel(D, p.reasonId)],
        ['Origem do ponto', p.source === 'pacote' ? 'Pacote confirmado (localização salva)' : 'Rascunho de entrada'], ['Situação para operação', p.eligible ? 'Disponível' : p.why], ['Classificação da localização', G.LOC_LABEL[p.kind]], ['Coordenadas', G.formatLatLng(p.lat, p.lng)], ['Região (escolhida na entrada)', p.regionId ? H.regionLabel(D, p.regionId) : 'não informada'],
      ].map(function (r) { return [el('dt', { text: r[0] }), el('dd', { text: r[1] })]; }).reduce(function (a, b) { return a.concat(b); }, []))
        : ui.empty('Nenhum ponto em foco.', 'Selecione um ponto na lista ou no mapa para ver os detalhes.'));
    }
    function drawList() {
      list.replaceChildren(
        el('p', { class: 'result-count', id: 'points-count', role: 'status', text: points.length + ' ponto(s) com coordenadas · ' + c.xpt.name }),
        points.length ? ui.table([
          { label: 'Selecionar', cls: 'actions', render: function (p) {
            return el('input', { type: 'checkbox', class: 'sel-box', 'data-id': p.id, 'data-code': p.code, checked: group.has(p.id), disabled: !p.eligible, title: p.eligible ? null : p.why, 'aria-label': 'Selecionar pacote ' + p.code + (p.eligible ? ' para o grupo' : ' (indisponível: ' + p.why + ')'), onchange: function () { toggle(p.id); } }); } },
          { label: 'Código', render: function (p) { return el('span', { class: 'mono', text: p.code }); } },
          { label: 'Origem', render: function (p) { return p.source === 'pacote' ? ui.badge(p.eligible ? 'Pacote confirmado' : 'Em operação/indisponível', p.eligible ? 'ok' : 'neutral') : ui.badge('Rascunho', 'warn'); } },
          { label: 'Tamanho', render: function (p) { return H.sizeLabel(D, p.size); } }, { label: 'Motivo', render: function (p) { return H.reasonLabel(D, p.reasonId); } },
          { label: 'Localização', render: function (p) { return H.locBadge({ kind: p.kind }); } },
          { label: 'Coordenadas', render: function (p) { return el('span', { class: 'mono small', text: G.formatLatLng(p.lat, p.lng) }); } },
          { label: 'Detalhes', cls: 'actions', render: function (p) { return el('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'data-act': 'detail', 'aria-label': 'Ver detalhes de ' + p.code, onclick: function () { focusId = p.id; redraw(); } }, 'Ver'); } },
        ], points, { label: 'Pontos georreferenciados', rowAttrs: function (p) { return { 'data-code': p.code, 'data-source': p.source, class: group.has(p.id) ? 'row--sel' : null }; } })
          : ui.empty('Nenhum pacote com coordenadas nesta XPT.', 'Os pacotes demonstrativos não têm coordenadas. Marque a casa do cliente na tela Entrada de Pacotes; depois de confirmar a entrada a localização fica salva e aparece aqui.'));
    }
    function drawGroup() {
      var ids = group.ids(), sel = ids.map(pointById).filter(Boolean), byReg = G.groupByRegion(sel);
      var regRows = Object.keys(byReg).sort().map(function (k) { return [k === 'sem_regiao' ? 'Sem região informada' : H.regionLabel(D, k), String(byReg[k].length)]; });
      panel.replaceChildren(
        el('p', { class: 'group-count', id: 'sel-count', role: 'status', 'data-count': String(group.count()), text: group.count() + ' pacote(s) selecionado(s) · grupo preliminar (rascunho visual)' }),
        el('div', { class: 'row-actions' },
          el('button', { type: 'button', class: 'btn btn--ghost', id: 'undo-sel', disabled: !group.canUndo(), onclick: function () { group.undo(); live.textContent = ''; redraw(); } }, 'Desfazer última alteração'),
          el('button', { type: 'button', class: 'btn btn--ghost', id: 'clear-sel', disabled: !group.count(), onclick: function () { group.clear(); live.textContent = ''; redraw(); } }, 'Limpar seleção'),
          el('button', { type: 'button', class: 'btn btn--ghost', id: 'select-all', disabled: !selectable.length, onclick: function () { group.selectMany(selectable.map(function (p) { return p.id; }), selectable); redraw(); } }, 'Selecionar todos com coordenadas')),
        regRows.length ? ui.table([{ label: 'Região (informada na entrada)', render: function (r) { return r[0]; } }, { label: 'Pacotes', render: function (r) { return r[1]; } }], regRows, { label: 'Seleção por região' }) : null,
        areaForm(),
        live,
        ambPanel(sel));
    }

    function selectArea(b) {
      var inside = G.pointsInBounds(points, b), ok = inside.filter(function (p) { return p.eligible; }), r = group.selectMany(ok.map(function (p) { return p.id; }), selectable);
      var blocked = inside.length - ok.length;
      live.textContent = r.added.length + ' pacote(s) adicionados pela região' + (blocked ? ' (' + blocked + ' ignorado(s): já em operação ativa)' : '') + '. Pacotes sem coordenadas nunca entram.';
      ui.announce(live.textContent); redraw();
    }
    function profileLabel() { var p = NS.permissions.PROFILES.filter(function (x) { return x.id === c.profile; })[0]; return p ? p.label : c.profile; }
    function ambPanel(sel) {
      if (!H.can(c, 'operacao')) return ui.blocked('Criar ambulância', 'o perfil "' + profileLabel() + '" não pode criar operações (simulação; o servidor validará no futuro).');
      var drv = D.drivers.filter(function (d) { return d.xptId === c.xptId && d.state === 'ativo'; });
      var drafts = sel.filter(function (p) { return p.source !== 'pacote'; });
      var nameIn = el('input', { type: 'text', id: 'amb-name', name: 'ambName', maxlength: '60', value: af.name, placeholder: 'ex.: Ambulância 01' });
      var respIn = el('input', { type: 'text', id: 'amb-resp', name: 'ambResp', maxlength: '80', value: af.responsible, placeholder: 'Responsável pela operação' });
      var drvSel = ui.select('ambDriver', drv.map(function (d) { return { id: d.id, label: d.name }; }), af.driverId, 'Sem motorista designado'); drvSel.id = 'amb-driver';
      nameIn.addEventListener('input', function () { af.name = nameIn.value; }); respIn.addEventListener('input', function () { af.responsible = respIn.value; });
      drvSel.addEventListener('change', function () { af.driverId = drvSel.value; });
      var msg = el('small', { class: 'form-msg', id: 'amb-msg', role: 'status' });
      var review = el('div', { id: 'amb-review', 'data-count': String(sel.length) }, el('h3', { text: 'Revisão da seleção (' + sel.length + ')' }),
        sel.length ? ui.table([{ label: 'Código', render: function (p) { return el('span', { class: 'mono', text: p.code }); } }, { label: 'Tamanho', render: function (p) { return H.sizeLabel(D, p.size); } },
          { label: 'Motivo', render: function (p) { return H.reasonLabel(D, p.reasonId); } }, { label: 'Localização', render: function (p) { return G.LOC_LABEL[p.kind]; } },
          { label: 'Situação', render: function (p) { return p.source === 'pacote' ? ui.badge('Pronto', 'ok') : ui.badge('Rascunho: confirme a entrada antes', 'warn'); } }], sel, { label: 'Revisão da seleção' })
          : el('p', { class: 'hint', text: 'Selecione pacotes no mapa, na lista ou desenhando uma região.' }));
      function submit() {
        if (!af.name.trim() || !af.responsible.trim()) { msg.textContent = 'Informe o nome da ambulância e o responsável.'; return; }
        var ids = sel.map(function (p) { return p.id; });
        var body = el('div', null, el('p', { id: 'amb-confirm-text', text: ids.length + ' pacote(s) serão vinculados à ambulância "' + af.name.trim() + '" (responsável: ' + af.responsible.trim() + ', ' + c.xpt.name + ') e passarão de "Em estoque" para "Em separação".' }),
          el('p', { class: 'hint', text: 'Cada pacote só pode estar em uma operação ativa. Demonstração em memória: nada é gravado fora desta página.' }));
        ui.modal('Criar a ambulância?', body, [
          { label: 'Voltar e revisar', onClick: function (close) { close(); } },
          { label: 'Criar ambulância', cls: 'btn--primary', id: 'amb-create-ok', onClick: function (close) {
            var r = A.createAmbulance(D, c.xptId, { name: af.name, responsible: af.responsible, driverId: af.driverId, packageIds: ids },
              { authorized: H.can(c, 'operacao'), nowMs: store.nowMs(), operator: 'Operador Demo (' + profileLabel() + ')' });
            close();
            if (!r.ok) { live.textContent = r.message || Object.keys(r.errors || {}).map(function (k) { return r.errors[k]; }).join(' '); ui.announce(live.textContent); redraw(); return; }
            store.audit.log('ambulancia_criada_demo', c.xptId, r.op.id + ':' + ids.length);
            group.clear(); af.name = ''; af.responsible = ''; af.driverId = '';
            store.changed('ops'); // redesenha: os pacotes passam a "em separação" e saem dos pontos selecionáveis
            H.showQr(c, r.op);
          } },
        ], { id: 'amb-modal' });
      }
      return el('div', { class: 'amb-panel', id: 'amb-panel' }, el('h3', { text: 'Criar ambulância' }), review,
        el('div', { class: 'form-grid' }, ui.field('Nome ou número da ambulância', nameIn), ui.field('Responsável pela operação', respIn), ui.field('Motorista (opcional)', drvSel)),
        drafts.length ? ui.callout('warn', drafts.length + ' item(ns) selecionado(s) ainda são rascunho.', 'Confirme a entrada em "Entrada de Pacotes" para poder vinculá-los a uma ambulância.') : null,
        el('div', { class: 'row-actions' },
          drafts.length ? el('button', { type: 'button', class: 'btn btn--ghost', id: 'amb-drop-drafts', onclick: function () { drafts.forEach(function (p) { group.toggle(p.id, selectable); }); redraw(); } }, 'Remover rascunhos da seleção') : null,
          el('button', { type: 'button', class: 'btn btn--primary', id: 'amb-create', disabled: !sel.length || drafts.length > 0, onclick: submit }, 'Revisar e criar ambulância')),
        msg);
    }
    function areaForm() {
      var f = {}; ['minLat', 'maxLat', 'minLng', 'maxLng'].forEach(function (k) { f[k] = el('input', { type: 'number', step: 'any', name: k, id: 'area-' + k, inputmode: 'decimal' }); });
      var m = el('small', { class: 'hint', id: 'area-msg', role: 'status' });
      return el('details', { class: 'area' }, el('summary', { text: 'Selecionar por retângulo de coordenadas' }),
        el('form', { class: 'form-grid', onsubmit: function (e) {
          e.preventDefault();
          var b = { minLat: parseFloat(f.minLat.value), maxLat: parseFloat(f.maxLat.value), minLng: parseFloat(f.minLng.value), maxLng: parseFloat(f.maxLng.value) };
          if (!G.validCoord(b.minLat, b.minLng) || !G.validCoord(b.maxLat, b.maxLng)) { m.textContent = 'Informe as quatro coordenadas válidas.'; return; }
          selectArea(b);
        } }, ui.field('Latitude mín.', f.minLat), ui.field('Latitude máx.', f.maxLat), ui.field('Longitude mín.', f.minLng), ui.field('Longitude máx.', f.maxLng),
          el('button', { type: 'submit', class: 'btn btn--ghost', id: 'area-go' }, 'Selecionar pontos na área'), m));
    }
    function drawNoCoord() {
      var items = store.draft(c.xptId).withoutCoords();
      var saved = H.pkgsOf(c).filter(function (p) { return !G.hasCoords(p.location) && NS.packages.inWarehouse(p); });
      var demoNo = saved.filter(function (p) { return /^DEMO-/.test(p.code); }).length;
      var mine = saved.filter(function (p) { return !/^DEMO-/.test(p.code); }); // confirmados nesta sessão (não demonstrativos)
      nocoord.replaceChildren(
        el('p', { id: 'nocoord-demo', class: 'hint', text: demoNo + ' pacote(s) demonstrativo(s) desta XPT não têm coordenadas e não entram em grupos geográficos.' }),
        mine.length ? el('div', { id: 'nocoord-saved' }, el('h3', { text: 'Pacotes confirmados sem coordenadas (' + mine.length + ')' }), ui.table([
          { label: 'Código', render: function (p) { return el('span', { class: 'mono', text: p.code }); } }, { label: 'Tamanho', render: function (p) { return H.sizeLabel(D, p.size); } },
          { label: 'Motivo', render: function (p) { return H.reasonLabel(D, p.reasonId); } }, { label: 'Localização', render: function (p) { return H.locBadge(p.location); } },
          { label: 'Grupo', render: function () { return el('span', { class: 'muted', text: 'não selecionável: sem coordenadas' }); } }], mine, { label: 'Pacotes confirmados sem coordenadas', rowAttrs: function (p) { return { 'data-code': p.code }; } })) : null,
        items.length ? ui.table([{ label: 'Código', render: function (i) { return el('span', { class: 'mono', text: i.code }); } }, { label: 'Tamanho', render: function (i) { return H.sizeLabel(D, i.size); } },
          { label: 'Motivo', render: function (i) { return H.reasonLabel(D, i.reasonId); } }, { label: 'Localização', render: function (i) { return H.locBadge(i.location); } },
          { label: 'Grupo', render: function () { return el('span', { class: 'muted', text: 'não selecionável: sem coordenadas' }); } }], items, { label: 'Itens do rascunho sem coordenadas', rowAttrs: function (i) { return { 'data-code': i.code }; } })
          : el('p', { class: 'hint', text: 'Nenhum item do rascunho está sem coordenadas.' }));
    }
    function drawRegions() {
      var counts = NS.reports.countBy(H.pkgsOf(c).filter(function (p) { return p.location.regionId; }), function (p) { return p.location.regionId; });
      var rows = D.regions.filter(function (r) { return r.xptId === c.xptId; }).map(function (r) { return { label: r.label, n: counts[r.id] || 0 }; });
      return ui.card('Regiões (demonstrativo, sem limites geográficos)', el('div', null,
        el('p', { class: 'hint', text: 'Contagem por região informada nos dados demonstrativos. Não há fronteiras, bairros ou ruas desenhados: nada disso foi fornecido.' }),
        ui.table([{ label: 'Região', key: 'label' }, { label: 'Pacotes demonstrativos', render: function (r) { return String(r.n); } }], rows, { label: 'Regiões' })));
    }
    function redraw() {
      if (destroyed) return;
      drawList(); drawGroup(); drawDetail(); drawNoCoord();
      if (ctl) ctl.setMarkers(markers());
    }

    var xsel = ui.select('xpt', D.xpts.filter(function (x) { return x.active && (H.can(c, 'ver_global') || x.id === c.xptId); }).map(function (x) { return { id: x.id, label: x.name }; }), c.xptId);
    xsel.id = 'map-xpt'; xsel.addEventListener('change', function () { c.setXpt(xsel.value); });

    var mapCard;
    var drawBtn = el('button', { type: 'button', class: 'btn btn--ghost', id: 'draw-area', 'aria-pressed': 'false', onclick: function () {
      drawing = !drawing; if (ctl) ctl.setDrawMode(drawing); drawBtn.setAttribute('aria-pressed', String(drawing));
      drawBtn.textContent = drawing ? 'Arraste no mapa para desenhar (toque aqui para cancelar)' : 'Desenhar região no mapa';
    } }, 'Desenhar região no mapa');
    if (av.ok) {
      ctl = NS.map.create(mapHost, {
        config: root.CXPT_MAP, label: 'Mapa dos pacotes com localização', mode: 'markers', onMarker: toggle,
        onArea: function (b) { selectArea(b); drawing = false; ctl && ctl.setDrawMode(false); drawBtn.setAttribute('aria-pressed', 'false'); drawBtn.textContent = 'Desenhar região no mapa'; },
        onStatus: function (s) { if (s === 'falhou') { mapHost.replaceChildren(); unavailable.replaceChildren(ui.callout('warn', NS.map.MESSAGES.falhou)); ctl = null; } },
      });
      if (ctl) { if (points.length) ctl.fit(points); }
      mapCard = ui.card('Mapa — ' + (root.CXPT_MAP.cityLabel || 'centro configurado'), el('div', null, mapHost, unavailable,
        el('ul', { class: 'legend', 'aria-label': 'Legenda' },
          el('li', null, el('span', { class: 'legend-pin legend-pin--marcada' }), 'Ponto marcado'), el('li', null, el('span', { class: 'legend-pin legend-pin--aproximada' }), 'Localização aproximada'),
          el('li', null, el('span', { class: 'legend-pin legend-pin--sel' }), 'Selecionado'), el('li', null, 'Pacotes sem coordenadas: lista abaixo (não aparecem no mapa)')),
        el('div', { class: 'row-actions' }, drawBtn, el('button', { type: 'button', class: 'btn btn--ghost', id: 'fit-map', onclick: function () { if (ctl) ctl.fit(points); } }, 'Ajustar aos pontos'))));
    } else {
      mapCard = ui.card('Mapa', el('div', { id: 'map-unavailable', class: 'unavailable' },
        ui.callout('warn', 'Mapa real não configurado.', av.message), el('p', { class: 'hint', text: 'Nenhuma imagem ou grade substitui o mapa. Seleção, detalhes e grupo preliminar funcionam pela lista abaixo.' })));
    }
    var node = H.page([
      ui.callout('info', 'Pontos desta XPT: rascunho de Entrada e pacotes já confirmados com a localização salva.', 'Cada ponto continua ligado ao seu código e à sua XPT. Tudo vive só na memória desta demonstração.'),
      ui.card('Filtro', ui.field('XPT', xsel, null, 'Somente dados e rascunhos da XPT escolhida.')),
      mapCard,
      el('div', { class: 'grid2' }, ui.card('Detalhes do ponto', detail), ui.card('Seleção e criação de ambulância', panel)),
      ui.card('Pontos com coordenadas', list), ui.card('Pacotes sem coordenadas', nocoord), drawRegions(), H.demoNote(),
    ]);
    redraw();
    return { node: node, destroy: function () { destroyed = true; if (ctl) ctl.destroy(); } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
