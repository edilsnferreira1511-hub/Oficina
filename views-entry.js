/* COOPMETRO XPT — tela Entrada de Pacotes (rascunho local, mapa para o destino de entrega). */
(function (root) {
  'use strict';
  var NS = root.CXPT, ui = NS.ui, el = ui.el, H = NS.vh, G = NS.geo;
  var V = NS.views;

  var KIND_HELP = {
    marcada: 'Você marcou o ponto de destino no mapa.',
    aproximada: 'Destino aproximado (marque no mapa se possível; região opcional).',
    desconhecida: 'O destino não é conhecido. Não haverá coordenadas.',
    pendente: 'A localização será definida depois. Não haverá coordenadas.',
  };

  V.entry = function (c) {
    var g = H.guard(c, 'entrada'); if (g) return g;
    var D = c.D, draft = c.store.draft(c.xptId);
    var av = NS.map.availability(root.CXPT_MAP);
    var S = { kind: 'pendente', lat: null, lng: null, regionId: '', editId: null };
    var mapCtl = null, destroyed = false;

    // ---- campos
    var codeIn = el('input', { type: 'text', id: 'code-in', name: 'code', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '80', inputmode: 'text', 'aria-describedby': 'scan-hint' });
    var sizeSel = ui.select('size', D.sizes, '', 'Selecione o tamanho');
    var reasonSel = ui.select('reasonId', D.reasons, '', 'Selecione o motivo');
    var noteIn = el('input', { type: 'text', name: 'note', maxlength: '200', placeholder: 'Opcional' });
    var errBox = el('div', { class: 'errs', id: 'entry-errs' });
    var fieldWrap = el('div', { class: 'form-grid' });
    var msg = el('p', { class: 'form-msg', id: 'entry-msg', role: 'status' });
    var gateHint = el('p', { class: 'hint', id: 'gate-hint' });
    var locBox = el('div', { class: 'loc-box', id: 'loc-box' });
    var mapHost = el('div', { class: 'map-host', id: 'entry-map' });
    var addBtn = el('button', { type: 'submit', class: 'btn btn--primary', id: 'add-btn' }, 'Adicionar ao rascunho (demonstração)');
    var cancelBtn = el('button', { type: 'button', class: 'btn btn--ghost', id: 'cancel-edit', hidden: true, onclick: resetForm }, 'Cancelar edição');
    var listBox = el('div', { id: 'draft-list' });

    function fieldErrors(errs) {
      fieldWrap.replaceChildren(
        ui.field('Código do pacote (leitor ou digitação)', codeIn, errs.code, 'Leitores USB/Bluetooth digitam o código e enviam Enter. Regra provisória: A–Z, 0–9, . _ - (máx. 64).'),
        ui.field('Tamanho', sizeSel, errs.size), ui.field('Motivo da devolução', reasonSel, errs.reasonId), ui.field('Observação (opcional)', noteIn, errs.note));
    }
    fieldErrors({});

    function gateOpen() {
      return (S.editId || NS.codes.validate(codeIn.value).ok) && sizeSel.value && reasonSel.value;
    }
    function currentLocation() {
      var hasPin = S.lat !== null && S.lng !== null;
      var loc = { kind: S.kind, lat: null, lng: null, regionId: null };
      if (S.kind === 'marcada' || S.kind === 'aproximada') { if (hasPin) { loc.lat = S.lat; loc.lng = S.lng; } loc.regionId = S.regionId || null; }
      return loc;
    }
    function drawMarker() {
      if (!mapCtl) return;
      mapCtl.setMarkers(S.lat !== null ? [{ id: 'pin', lat: S.lat, lng: S.lng, kind: S.kind === 'aproximada' ? 'aproximada' : 'marcada', label: 'Ponto atual do pacote' }] : []);
    }
    function ensureMap() {
      if (!av.ok || mapCtl || destroyed) return;
      mapCtl = NS.map.create(mapHost, {
        config: root.CXPT_MAP, label: 'Mapa para marcar o destino de entrega', mode: 'pick',
        onMapClick: function (lat, lng) {
          if (!gateOpen()) return;
          if (S.kind !== 'marcada' && S.kind !== 'aproximada') S.kind = 'marcada';
          S.lat = G.round6(lat); S.lng = G.round6(lng); drawLoc(); drawMarker();
        },
        onStatus: function (s) { if (s === 'falhou') { mapHost.replaceChildren(ui.callout('warn', NS.map.MESSAGES.falhou)); mapCtl = null; } },
      });
    }
    function kindRadio(k) {
      var disabled = k === 'marcada' && !av.ok;
      var r = el('input', { type: 'radio', name: 'kind', value: k, id: 'kind-' + k, checked: S.kind === k, disabled: disabled,
        onchange: function () {
          S.kind = k;
          if (k === 'desconhecida' || k === 'pendente') { S.lat = null; S.lng = null; S.regionId = ''; }
          drawLoc(); drawMarker();
        } });
      return el('label', { class: 'radio' + (disabled ? ' radio--off' : ''), for: 'kind-' + k }, r, el('span', { text: G.LOC_LABEL[k] + (disabled ? ' (requer mapa)' : '') }));
    }
    function drawLoc() {
      var hasPin = S.lat !== null;
      var regs = D.regions.filter(function (r) { return r.xptId === c.xptId; });
      var regionSel = ui.select('regionId', regs, S.regionId, 'Sem região');
      regionSel.addEventListener('change', function () { S.regionId = regionSel.value; });
      locBox.replaceChildren(
        el('fieldset', { class: 'kinds' }, el('legend', { text: 'Localização do destino de entrega (não é o lugar no galpão)' }), G.LOC_KINDS.map(kindRadio)),
        el('p', { class: 'hint', text: KIND_HELP[S.kind] }),
        (S.kind === 'marcada' || S.kind === 'aproximada') ? ui.field('Região (opcional — escolhida por você, nunca deduzida das coordenadas)', regionSel) : null,
        el('p', { class: 'coords', id: 'coords-out', text: hasPin ? 'Ponto: ' + G.formatLatLng(S.lat, S.lng) : 'Nenhum ponto marcado.' }),
        hasPin ? el('button', { type: 'button', class: 'btn btn--ghost', id: 'remove-pin', onclick: function () { S.lat = null; S.lng = null; if (S.kind === 'marcada') S.kind = 'pendente'; drawLoc(); drawMarker(); } }, 'Remover ponto') : null);
    }
    function refreshGate() {
      var open = gateOpen();
      gateHint.textContent = open ? '' : 'Informe um código válido, o tamanho e o motivo para liberar a localização.';
      locBox.hidden = !open; mapHost.hidden = !open || !av.ok; mapBoxMsg.hidden = !open || av.ok;
      if (open) { ensureMap(); if (mapCtl) { mapCtl.resize(); } }
    }
    var mapBoxMsg = ui.callout('warn', av.ok ? '' : av.message, av.ok ? '' : 'Você ainda pode registrar localização aproximada (sem ponto), desconhecida ou pendente.');
    mapBoxMsg.id = 'map-unavailable';

    function resetForm() {
      S = { kind: 'pendente', lat: null, lng: null, regionId: '', editId: null };
      codeIn.value = ''; codeIn.readOnly = false; sizeSel.value = ''; reasonSel.value = ''; noteIn.value = '';
      addBtn.textContent = 'Adicionar ao rascunho (demonstração)'; cancelBtn.hidden = true;
      fieldErrors({}); drawLoc(); drawMarker(); refreshGate(); codeIn.focus();
    }
    function precheck() {
      if (S.editId) return;
      var v = NS.codes.validate(codeIn.value);
      if (!codeIn.value.trim()) { fieldErrors({}); return; }
      var r = draft.check({ code: codeIn.value, size: 'P', reasonId: D.reasons[0].id, location: { kind: 'pendente' } });
      var errs = {}; if (r.errors.code) errs.code = r.errors.code; else if (!v.ok) errs.code = v.message;
      var keep = { s: sizeSel.value, r: reasonSel.value, n: noteIn.value, v: codeIn.value };
      fieldErrors(errs); codeIn.value = keep.v; sizeSel.value = keep.s; reasonSel.value = keep.r; noteIn.value = keep.n;
      return errs.code;
    }
    codeIn.addEventListener('input', refreshGate);
    codeIn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); codeIn.value = NS.codes.normalize(codeIn.value); if (!precheck()) sizeSel.focus(); else codeIn.focus(); }
    });
    // adiado: o blur também dispara quando a tela é trocada (o campo sai do DOM); reconstruir nesse momento quebrava a navegação
    codeIn.addEventListener('blur', function () {
      setTimeout(function () { if (codeIn.isConnected && codeIn.value) { codeIn.value = NS.codes.normalize(codeIn.value); precheck(); refreshGate(); } }, 0);
    });
    sizeSel.addEventListener('change', refreshGate); reasonSel.addEventListener('change', refreshGate);

    function submit(e) {
      e.preventDefault();
      var f = { code: codeIn.value, size: sizeSel.value, reasonId: reasonSel.value, note: noteIn.value, location: currentLocation() };
      var r = S.editId ? draft.update(S.editId, { size: f.size, reasonId: f.reasonId, note: f.note, location: f.location }) : draft.add(f);
      if (!r.ok) {
        var keep = { v: codeIn.value, s: sizeSel.value, r: reasonSel.value, n: noteIn.value };
        fieldErrors(r.errors); codeIn.value = keep.v; sizeSel.value = keep.s; reasonSel.value = keep.r; noteIn.value = keep.n;
        var first = r.errors.code ? codeIn : r.errors.size ? sizeSel : r.errors.reasonId ? reasonSel : null;
        msg.textContent = r.errors.location || (r.duplicate ? 'Leitura repetida: o rascunho não foi alterado.' : 'Corrija os campos indicados.');
        if (first) first.focus();
        return;
      }
      c.store.audit.log(S.editId ? 'rascunho_item_alterado' : 'rascunho_item_adicionado', c.xptId, r.item.code);
      msg.textContent = (S.editId ? 'Item atualizado' : 'Item adicionado') + ' no rascunho local (demonstração; nada foi registrado).';
      ui.announce(msg.textContent);
      resetForm(); drawList(); c.store.changed('entry');
    }

    function drawList() {
      var items = draft.list();
      var cols = [
        { label: 'Código', render: function (i) { return el('span', { class: 'mono', text: i.code }); } },
        { label: 'Tamanho', render: function (i) { return H.sizeLabel(D, i.size); } },
        { label: 'Motivo', render: function (i) { return H.reasonLabel(D, i.reasonId); } },
        { label: 'Localização', render: function (i) { return el('span', null, H.locBadge(i.location), i.location.lat !== null ? el('span', { class: 'mono small', text: ' ' + G.formatLatLng(i.location.lat, i.location.lng) }) : null, i.location.regionId ? ' · ' + H.regionLabel(D, i.location.regionId) : null); } },
        { label: 'Ações', cls: 'actions', render: function (i) {
          return el('span', { class: 'row-actions' },
            el('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'data-act': 'edit', 'aria-label': 'Corrigir ponto de ' + i.code, onclick: function () { edit(i); } }, 'Corrigir'),
            i.location.kind === 'marcada' || i.location.lat !== null ? el('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'data-act': 'clear', 'aria-label': 'Remover localização de ' + i.code, onclick: function () { draft.clearLocation(i.id); c.store.audit.log('rascunho_localizacao_removida', c.xptId, i.code); drawList(); c.store.changed('entry'); } }, 'Remover localização') : null,
            el('button', { type: 'button', class: 'btn btn--danger btn--sm', 'data-act': 'remove', 'aria-label': 'Remover item ' + i.code, onclick: function () { draft.remove(i.id); c.store.audit.log('rascunho_item_removido', c.xptId, i.code); if (S.editId === i.id) resetForm(); drawList(); c.store.changed('entry'); } }, 'Remover item'));
        } },
      ];
      listBox.replaceChildren(
        el('p', { class: 'result-count', id: 'draft-count', role: 'status', text: items.length + ' item(ns) no rascunho local · ' + c.xpt.name }),
        items.length ? ui.table(cols, items, { label: 'Rascunho de entrada' }) : ui.empty('Rascunho vazio.', 'Leia ou digite um código para começar. Os itens são descartados ao recarregar a página.'),
        el('div', { class: 'row-actions' }, items.length ? el('button', { type: 'button', class: 'btn btn--ghost', id: 'clear-draft', onclick: function () { ui.confirmModal('Limpar rascunho?', 'Remove os ' + items.length + ' itens do rascunho local desta XPT. Nada real é afetado.', 'Limpar', function () { draft.clear(); c.store.audit.log('rascunho_limpo', c.xptId, String(items.length)); resetForm(); drawList(); c.store.changed('entry'); }); } }, 'Limpar rascunho') : null,
          ui.blocked('Confirmar entrada no sistema', 'o backend ainda não existe; a entrada real permanece bloqueada.')));
    }
    function edit(i) {
      S = { kind: i.location.kind, lat: i.location.lat, lng: i.location.lng, regionId: i.location.regionId || '', editId: i.id };
      codeIn.value = i.code; codeIn.readOnly = true; sizeSel.value = i.size; reasonSel.value = i.reasonId; noteIn.value = i.note;
      addBtn.textContent = 'Salvar alterações do item'; cancelBtn.hidden = false;
      fieldErrors({}); codeIn.value = i.code; sizeSel.value = i.size; reasonSel.value = i.reasonId; noteIn.value = i.note;
      drawLoc(); refreshGate();
      if (mapCtl && i.location.lat !== null) mapCtl.setView({ lat: i.location.lat, lng: i.location.lng, zoom: mapCtl.getView().zoom });
      drawMarker(); sizeSel.focus();
    }

    var form = el('form', { class: 'entry-form', id: 'entry-form', novalidate: true, onsubmit: submit },
      fieldWrap, gateHint, locBox, mapHost, mapBoxMsg, el('div', { class: 'row-actions' }, addBtn, cancelBtn), msg, errBox);
    drawLoc(); drawList(); refreshGate();
    var node = H.page([
      ui.callout('warn', 'Registro demonstrativo e temporário.', 'A entrada real está bloqueada até a implementação do backend. O rascunho vale só para ' + c.xpt.name + ' e some ao recarregar.'),
      ui.card('Novo pacote', form), ui.card('Rascunho local desta XPT', listBox), H.demoNote(),
    ]);
    setTimeout(function () { if (!destroyed && !(document.activeElement && document.activeElement.tagName === 'SELECT')) codeIn.focus({ preventScroll: true }); }, 0);
    return { node: node, destroy: function () { destroyed = true; if (mapCtl) mapCtl.destroy(); } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
