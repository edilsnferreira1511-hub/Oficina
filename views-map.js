/* COOPMETRO XPT — Mapa e Regiões: consome os pontos do rascunho de Entrada (mesma estrutura geoPoints).
 * O grupo formado é só um RASCUNHO VISUAL em memória: não cria operação, não altera pacotes, não persiste. */
(function (root) {
  'use strict';
  var NS = root.CXPT, ui = NS.ui, el = ui.el, H = NS.vh, G = NS.geo;
  var V = NS.views;

  V.map = function (c) {
    var g = H.guard(c, 'ver_base'); if (g) return g;
    var D = c.D, store = c.store, group = store.group(c.xptId);
    var points = store.mapPoints(c.xptId); // somente desta XPT; seleção já reconciliada
    var av = NS.map.availability(root.CXPT_MAP), ctl = null, destroyed = false, focusId = null, notice = '';
    var mapHost = el('div', { class: 'map-host map-host--tall', id: 'regions-map' });
    var unavailable = el('div', { id: 'map-unavailable-box' });
    var list = el('div', { id: 'points-list' }), panel = el('div', { id: 'group-panel' }), detail = el('div', { id: 'point-detail' }), nocoord = el('div', { id: 'nocoord-list' });
    var live = el('p', { class: 'form-msg', id: 'group-msg', role: 'status' });

    function pts() { return points; }
    function pointById(id) { return points.filter(function (p) { return p.id === id; })[0]; }
    function toggle(id) {
      var r = group.toggle(id, points);
      live.textContent = r.ok ? '' : r.reason;
      if (r.ok) focusId = id;
      redraw(); if (r.ok) ui.announce(group.count() + ' pacote(s) selecionado(s)');
    }
    function markers() {
      return points.map(function (p) {
        return { id: p.id, lat: p.lat, lng: p.lng, kind: p.kind, selected: group.has(p.id), focus: p.id === focusId, label: 'Pacote ' + p.code + ' — ' + G.LOC_LABEL[p.kind] + (group.has(p.id) ? ' (selecionado)' : '') };
      });
    }
    function drawDetail() {
      var p = focusId && pointById(focusId);
      detail.replaceChildren(p ? el('dl', { class: 'dl', id: 'detail-dl', 'data-code': p.code }, [
        ['Código do pacote', p.code], ['XPT', H.xptName(D, p.xptId)], ['Tamanho', H.sizeLabel(D, p.size)], ['Motivo da devolução', H.reasonLabel(D, p.reasonId)],
        ['Classificação da localização', G.LOC_LABEL[p.kind]], ['Coordenadas', G.formatLatLng(p.lat, p.lng)], ['Região (escolhida na entrada)', p.regionId ? H.regionLabel(D, p.regionId) : 'não informada'],
      ].map(function (r) { return [el('dt', { text: r[0] }), el('dd', { text: r[1] })]; }).reduce(function (a, b) { return a.concat(b); }, []))
        : ui.empty('Nenhum ponto em foco.', 'Selecione um ponto na lista ou no mapa para ver os detalhes.'));
    }
    function drawList() {
      list.replaceChildren(
        el('p', { class: 'result-count', id: 'points-count', role: 'status', text: points.length + ' ponto(s) com coordenadas · ' + c.xpt.name }),
        points.length ? ui.table([
          { label: 'Selecionar', cls: 'actions', render: function (p) {
            return el('input', { type: 'checkbox', class: 'sel-box', 'data-id': p.id, 'data-code': p.code, checked: group.has(p.id), 'aria-label': 'Selecionar pacote ' + p.code + ' para o grupo', onchange: function () { toggle(p.id); } }); } },
          { label: 'Código', render: function (p) { return el('span', { class: 'mono', text: p.code }); } },
          { label: 'Tamanho', render: function (p) { return H.sizeLabel(D, p.size); } }, { label: 'Motivo', render: function (p) { return H.reasonLabel(D, p.reasonId); } },
          { label: 'Localização', render: function (p) { return H.locBadge({ kind: p.kind }); } },
          { label: 'Coordenadas', render: function (p) { return el('span', { class: 'mono small', text: G.formatLatLng(p.lat, p.lng) }); } },
          { label: 'Detalhes', cls: 'actions', render: function (p) { return el('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'data-act': 'detail', 'aria-label': 'Ver detalhes de ' + p.code, onclick: function () { focusId = p.id; redraw(); } }, 'Ver'); } },
        ], points, { label: 'Pontos georreferenciados', rowAttrs: function (p) { return { 'data-code': p.code, class: group.has(p.id) ? 'row--sel' : null }; } })
          : ui.empty('Nenhum pacote com coordenadas nesta XPT.', 'Os pacotes demonstrativos não têm coordenadas. Marque pontos na tela Entrada de Pacotes (rascunho local) e volte aqui.'));
    }
    function drawGroup() {
      var ids = group.ids(), sel = ids.map(pointById).filter(Boolean), byReg = G.groupByRegion(sel);
      var regRows = Object.keys(byReg).sort().map(function (k) { return [k === 'sem_regiao' ? 'Sem região informada' : H.regionLabel(D, k), String(byReg[k].length)]; });
      panel.replaceChildren(
        el('p', { class: 'group-count', id: 'sel-count', role: 'status', 'data-count': String(group.count()), text: group.count() + ' pacote(s) selecionado(s) · grupo preliminar (rascunho visual)' }),
        el('div', { class: 'row-actions' },
          el('button', { type: 'button', class: 'btn btn--ghost', id: 'undo-sel', disabled: !group.canUndo(), onclick: function () { group.undo(); live.textContent = ''; redraw(); } }, 'Desfazer última alteração'),
          el('button', { type: 'button', class: 'btn btn--ghost', id: 'clear-sel', disabled: !group.count(), onclick: function () { group.clear(); live.textContent = ''; redraw(); } }, 'Limpar seleção'),
          el('button', { type: 'button', class: 'btn btn--ghost', id: 'select-all', disabled: !points.length, onclick: function () { group.selectMany(points.map(function (p) { return p.id; }), points); redraw(); } }, 'Selecionar todos com coordenadas')),
        regRows.length ? ui.table([{ label: 'Região (informada na entrada)', render: function (r) { return r[0]; } }, { label: 'Pacotes', render: function (r) { return r[1]; } }], regRows, { label: 'Seleção por região' }) : null,
        areaForm(),
        live,
        ui.callout('info', 'Grupo apenas visual.', 'Não cria operação, não muda estado de pacotes e some ao recarregar a página.'),
        ui.blocked('Criar operação a partir do grupo', 'criação e confirmação de operações dependem do backend e de regras de negócio pendentes.'));
    }
    function areaForm() {
      var f = {}; ['minLat', 'maxLat', 'minLng', 'maxLng'].forEach(function (k) { f[k] = el('input', { type: 'number', step: 'any', name: k, id: 'area-' + k, inputmode: 'decimal' }); });
      var m = el('small', { class: 'hint', id: 'area-msg', role: 'status' });
      return el('details', { class: 'area' }, el('summary', { text: 'Selecionar por retângulo de coordenadas' }),
        el('form', { class: 'form-grid', onsubmit: function (e) {
          e.preventDefault();
          var b = { minLat: parseFloat(f.minLat.value), maxLat: parseFloat(f.maxLat.value), minLng: parseFloat(f.minLng.value), maxLng: parseFloat(f.maxLng.value) };
          if (!G.validCoord(b.minLat, b.minLng) || !G.validCoord(b.maxLat, b.maxLng)) { m.textContent = 'Informe as quatro coordenadas válidas.'; return; }
          var inside = G.pointsInBounds(points, b), r = group.selectMany(inside.map(function (p) { return p.id; }), points);
          live.textContent = r.added.length + ' pacote(s) adicionados pela área.'; redraw();
        } }, ui.field('Latitude mín.', f.minLat), ui.field('Latitude máx.', f.maxLat), ui.field('Longitude mín.', f.minLng), ui.field('Longitude máx.', f.maxLng),
          el('button', { type: 'submit', class: 'btn btn--ghost', id: 'area-go' }, 'Selecionar pontos na área'), m));
    }
    function drawNoCoord() {
      var items = store.draft(c.xptId).withoutCoords();
      var demoNo = H.pkgsOf(c).filter(function (p) { return !G.hasCoords(p.location); }).length;
      nocoord.replaceChildren(
        el('p', { id: 'nocoord-demo', class: 'hint', text: demoNo + ' pacote(s) demonstrativo(s) desta XPT não têm coordenadas e não entram em grupos geográficos.' }),
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
    if (av.ok) {
      ctl = NS.map.create(mapHost, {
        config: root.CXPT_MAP, label: 'Mapa dos pacotes com localização', mode: 'markers', onMarker: toggle,
        onStatus: function (s) { if (s === 'falhou') { mapHost.replaceChildren(); unavailable.replaceChildren(ui.callout('warn', NS.map.MESSAGES.falhou)); ctl = null; } },
      });
      if (ctl) { if (points.length) ctl.fit(points); }
      mapCard = ui.card('Mapa — ' + (root.CXPT_MAP.cityLabel || 'centro configurado'), el('div', null, mapHost, unavailable,
        el('ul', { class: 'legend', 'aria-label': 'Legenda' },
          el('li', null, el('span', { class: 'legend-pin legend-pin--marcada' }), 'Ponto marcado'), el('li', null, el('span', { class: 'legend-pin legend-pin--aproximada' }), 'Localização aproximada'),
          el('li', null, el('span', { class: 'legend-pin legend-pin--sel' }), 'Selecionado'), el('li', null, 'Pacotes sem coordenadas: lista abaixo (não aparecem no mapa)')),
        el('button', { type: 'button', class: 'btn btn--ghost', id: 'fit-map', onclick: function () { if (ctl) ctl.fit(points); } }, 'Ajustar aos pontos')));
    } else {
      mapCard = ui.card('Mapa', el('div', { id: 'map-unavailable', class: 'unavailable' },
        ui.callout('warn', 'Mapa real não configurado.', av.message), el('p', { class: 'hint', text: 'Nenhuma imagem ou grade substitui o mapa. Seleção, detalhes e grupo preliminar funcionam pela lista abaixo.' })));
    }
    var node = H.page([
      ui.callout('info', 'Os pontos vêm do rascunho local de Entrada de Pacotes desta XPT.', 'Cada ponto continua ligado ao seu código e à sua XPT. Nada é gravado.'),
      ui.card('Filtro', ui.field('XPT', xsel, null, 'Somente dados e rascunhos da XPT escolhida.')),
      mapCard,
      el('div', { class: 'grid2' }, ui.card('Detalhes do ponto', detail), ui.card('Grupo preliminar de ambulância', panel)),
      ui.card('Pontos com coordenadas', list), ui.card('Pacotes sem coordenadas', nocoord), drawRegions(), H.demoNote(),
    ]);
    redraw();
    return { node: node, destroy: function () { destroyed = true; if (ctl) ctl.destroy(); } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
