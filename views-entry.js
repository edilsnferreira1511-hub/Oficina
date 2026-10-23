/* COOPMETRO XPT — tela Entrada de Pacotes (rascunho local, mapa para o destino de entrega). */
(function (root) {
  'use strict';
  var NS = root.CXPT, ui = NS.ui, el = ui.el, H = NS.vh, G = NS.geo;
  var V = NS.views;

  V.entry = function (c) {
    var g = H.guard(c, 'entrada'); if (g) return g;
    var D = c.D, draft = c.store.draft(c.xptId);
    var av = NS.map.availability(root.CXPT_MAP);
    var S = { lat: null, lng: null, editId: null, confirmed: false }; // sem escolha de "tipo": ponto confirmado = localização salva; sem ponto confirmado = sem localização
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
    var locInfo = el('div', { class: 'loc-info', id: 'loc-info' });
    var addBtn = el('button', { type: 'submit', class: 'btn btn--primary', id: 'add-btn' }, 'Adicionar ao rascunho (demonstração)');
    var cancelBtn = el('button', { type: 'button', class: 'btn btn--ghost', id: 'cancel-edit', hidden: true, onclick: resetForm }, 'Cancelar edição');
    var listBox = el('div', { id: 'draft-list' });

    var lastErrKey = '{}';
    function fieldErrors(errs) {
      lastErrKey = JSON.stringify(errs);
      fieldWrap.replaceChildren(
        ui.field('Código do pacote (leitor ou digitação)', codeIn, errs.code, 'Leitores USB/Bluetooth digitam o código e enviam Enter. Regra provisória: A–Z, 0–9, . _ - (máx. 64).'),
        ui.field('Tamanho', sizeSel, errs.size), ui.field('Motivo da devolução', reasonSel, errs.reasonId), ui.field('Observação (opcional)', noteIn, errs.note));
    }
    fieldErrors({});

    // O mapa abre assim que há um código válido (tamanho e motivo continuam obrigatórios para ADICIONAR o item).
    function gateOpen() { return !!(S.editId || NS.codes.validate(codeIn.value).ok); }
    // Só um ponto CONFIRMADO explicitamente vira localização; caso contrário o pacote segue sem localização confirmada (sem coordenadas padrão).
    function currentLocation() {
      if (S.lat !== null && S.lng !== null && S.confirmed) return { kind: 'marcada', lat: S.lat, lng: S.lng, regionId: null };
      return { kind: 'pendente', lat: null, lng: null, regionId: null };
    }
    function drawMarker() {
      if (!mapCtl) return;
      mapCtl.setMarkers(S.lat !== null ? [{ id: 'pin', lat: S.lat, lng: S.lng, kind: 'marcada', selected: !S.confirmed, label: (S.confirmed ? 'Localização confirmada' : 'Marcador (ainda não confirmado)') }] : []);
    }
    var mapFailed = false; // depois de uma falha dos ladrilhos o aviso permanece (não recria o mapa a cada foco/blur)
    function ensureMap() {
      if (!av.ok || mapCtl || destroyed || mapFailed) return;
      mapCtl = NS.map.create(mapHost, {
        config: root.CXPT_MAP, label: 'Mapa para marcar o destino de entrega', mode: 'pick',
        onMapClick: function (lat, lng) {
          if (!gateOpen()) return;
          S.lat = G.round6(lat); S.lng = G.round6(lng); S.confirmed = false; drawLoc(); drawMarker();
        },
        onStatus: function (s) { if (s === 'falhou') { mapFailed = true; mapHost.replaceChildren(ui.callout('warn', NS.map.MESSAGES.falhou)); mapCtl = null; } },
      });
    }
    function drawLoc() {
      var hasPin = S.lat !== null;
      locBox.replaceChildren(el('p', { class: 'loc-title', id: 'loc-title', text: 'Localização do destino de entrega (a casa do cliente — não é o lugar no galpão)' }));
      // Layout ESTÁVEL no celular: tudo que muda de tamanho após marcar o ponto fica ABAIXO do mapa, para o mapa não "pular" sob o dedo.
      locInfo.replaceChildren(
        el('p', { class: 'hint', id: 'loc-hint', text: !hasPin ? (av.ok ? 'Toque no mapa para marcar a casa do cliente. Se não conseguir localizar, adicione o pacote assim mesmo: ele seguirá sem localização confirmada.' : 'Sem mapa: o pacote será adicionado sem localização confirmada.')
          : S.confirmed ? 'Localização confirmada. Ela será salva com o pacote.' : 'Toque em outro ponto do mapa para reposicionar o marcador e depois confirme.' }),
        el('p', { class: 'coords', id: 'coords-out', text: hasPin ? (S.confirmed ? 'Localização confirmada: ' : 'Ponto: ') + G.formatLatLng(S.lat, S.lng) : 'Nenhum ponto marcado.' }),
        hasPin && !S.confirmed ? el('button', { type: 'button', class: 'btn btn--primary', id: 'confirm-loc', onclick: function () { S.confirmed = true; drawLoc(); drawMarker(); ui.announce('Localização confirmada.'); } }, 'Confirmar localização') : null,
        hasPin && S.confirmed ? el('p', { class: 'loc-ok', id: 'loc-confirmed', role: 'status', text: 'Localização confirmada. Toque em "Ajustar posição" para mover o marcador.' }) : null,
        hasPin && S.confirmed ? el('button', { type: 'button', class: 'btn btn--ghost', id: 'adjust-loc', onclick: function () { S.confirmed = false; drawLoc(); drawMarker(); } }, 'Ajustar posição') : null,
        hasPin ? el('button', { type: 'button', class: 'btn btn--ghost', id: 'remove-pin', onclick: function () { S.lat = null; S.lng = null; S.confirmed = false; drawLoc(); drawMarker(); } }, 'Remover ponto') : null);
    }
    function refreshGate() {
      var open = gateOpen();
      gateHint.textContent = open ? '' : 'Bipe ou digite um código válido para abrir o mapa e marcar a casa do cliente.';
      showExisting();
      locBox.hidden = !open; locInfo.hidden = !open; mapHost.hidden = !open || !av.ok; mapBoxMsg.hidden = !open || av.ok;
      if (open) { ensureMap(); if (mapCtl) { mapCtl.resize(); } }
    }
    var mapBoxMsg = ui.callout('warn', av.ok ? '' : av.message, av.ok ? '' : 'Você ainda pode adicionar o pacote sem localização confirmada.');
    mapBoxMsg.id = 'map-unavailable';

    function resetForm() {
      S = { lat: null, lng: null, editId: null, confirmed: false };
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
      if (JSON.stringify(errs) === lastErrKey) return errs.code; // nada mudou: não reconstruir os campos (evita perder foco/valor em corridas)
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
      if (S.lat !== null && !S.confirmed) { msg.textContent = 'Confirme a localização (botão "Confirmar localização") ou remova o ponto para adicionar o pacote sem localização confirmada.'; var cb = document.getElementById('confirm-loc'); if (cb) cb.focus(); return; }
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
          items.length ? el('button', { type: 'button', class: 'btn btn--primary', id: 'confirm-entry', onclick: confirmEntry }, 'Confirmar entrada (' + items.length + ') — ' + (c.svc.mode === 'demo' ? 'memória da demonstração' : 'gravar no servidor')) : null));
    }
    function confirmEntry() {
      var items = draft.list(); if (!items.length) return;
      var body = el('div', null, el('p', { text: 'Vai registrar ' + items.length + ' pacote(s) de ' + c.xpt.name + ' ' + (c.svc.mode === 'demo' ? 'na MEMÓRIA desta demonstração. Nada é gravado em servidor e tudo se perde ao recarregar a página.' : 'no servidor (Firestore, ambiente de teste). O pacote só aparece como registrado depois que o servidor confirmar a gravação.') }),
        el('ul', { class: 'plain' }, items.map(function (i) { return el('li', { text: i.code + ' · ' + H.sizeLabel(D, i.size) + ' · ' + G.LOC_LABEL[i.location.kind] }); })));
      ui.modal('Confirmar entrada dos pacotes?', body, [
        { label: 'Cancelar', onClick: function (close) { close(); } },
        { label: 'Confirmar entrada', cls: 'btn--primary', id: 'confirm-entry-ok', onClick: function (close) {
          close();
          msg.textContent = 'Gravando…';
          c.svc.registerEntries(c.xptId, items, c.who).then(function (r) {
          r.created.forEach(function (p) {
            var it = items.filter(function (x) { return x.code === p.code; })[0];
            if (it) draft.remove(it.id);
            c.store.index.register(p.code, p.xptId); // o código continua reservado no índice global, agora como pacote
            c.store.audit.log('entrada_confirmada_demo', c.xptId, p.code);
          });
          msg.textContent = r.created.length + ' pacote(s) registrado(s) ' + (c.svc.mode === 'demo' ? 'na memória desta demonstração' : 'e gravado(s) no servidor') + '' + (r.skipped.length ? '; ' + r.skipped.length + ' não registrado(s): ' + r.skipped.map(function (s) { return s.code + ' (' + s.reason + ')'; }).join(', ') : '') + '.';
          if (r.error) msg.textContent += ' ' + r.error;
          ui.announce(msg.textContent); drawList(); c.store.changed('entry');
          });
        } },
      ]);
    }
    function edit(i) {
      S = { lat: i.location.lat, lng: i.location.lng, editId: i.id, confirmed: i.location.lat !== null };
      codeIn.value = i.code; codeIn.readOnly = true; sizeSel.value = i.size; reasonSel.value = i.reasonId; noteIn.value = i.note;
      addBtn.textContent = 'Salvar alterações do item'; cancelBtn.hidden = false;
      fieldErrors({}); codeIn.value = i.code; sizeSel.value = i.size; reasonSel.value = i.reasonId; noteIn.value = i.note;
      drawLoc(); refreshGate();
      if (mapCtl && i.location.lat !== null) mapCtl.setView({ lat: i.location.lat, lng: i.location.lng, zoom: mapCtl.getView().zoom });
      drawMarker(); sizeSel.focus();
    }

    // ---- pacote já cadastrado nesta base: consulta + evento de reentrada (sem duplicar, sem apagar histórico)
    var existBox = el('div', { id: 'existing-box' });
    function showExisting() {
      var v = NS.codes.validate(codeIn.value), pk = v.ok && !S.editId ? NS.registry.findIn(D, c.xptId, v.code) : null;
      if (!pk) { existBox.replaceChildren(); existBox.hidden = true; return; }
      existBox.hidden = false;
      existBox.replaceChildren(ui.callout('info', 'Pacote já cadastrado nesta base: ' + pk.code,
        'Nenhuma duplicata será criada e a localização anterior não será substituída em silêncio.'),
        el('dl', { class: 'dl dl--compact' }, el('dt', { text: 'Estado' }), el('dd', null, H.stateBadge(D, pk.state)), el('dt', { text: 'Retornos / ciclo' }), el('dd', { text: pk.returns + ' / ' + pk.cycle }),
          el('dt', { text: 'Localização' }), el('dd', null, H.locBadge(pk.location), pk.location.lat !== null ? el('span', { class: 'mono small', text: ' ' + G.formatLatLng(pk.location.lat, pk.location.lng) }) : null)),
        el('div', { class: 'row-actions' },
          el('a', { class: 'btn btn--ghost', href: '#/package/' + encodeURIComponent(pk.id), id: 'existing-link' }, 'Ver histórico do pacote'),
          el('button', { type: 'button', class: 'btn btn--primary', id: 'reentry-btn', onclick: function () {
            var loc = (S.lat !== null && S.confirmed) ? currentLocation() : null;
            c.svc.registerReentry(c.xptId, pk.code, { note: noteIn.value, location: loc }, c.who).then(function (r) {
              msg.textContent = r.ok ? 'Reentrada registrada como evento em ' + r.pkg.code + (c.svc.mode === 'demo' ? ' (demonstração em memória)' : ' (gravada no servidor)') + ' · ' + r.locationNote + '.' : r.reason;
              if (r.ok) { c.store.audit.log('reentrada_registrada', c.xptId, pk.code); c.store.changed('entry'); showExisting(); }
              ui.announce(msg.textContent);
            });
          } }, 'Registrar reentrada (novo evento)')));
    }
    var form = el('form', { class: 'entry-form', id: 'entry-form', novalidate: true, onsubmit: submit },
      fieldWrap, gateHint, existBox, locBox, mapHost, mapBoxMsg, locInfo, el('div', { class: 'row-actions' }, addBtn, cancelBtn), msg, errBox);
    drawLoc(); drawList(); refreshGate();
    var node = H.page([
      (c.svc.mode === 'demo' ? ui.callout('warn', 'Registro demonstrativo, só em memória.', 'Não há backend: pacotes confirmados aqui existem apenas nesta página e somem ao recarregar. O rascunho vale só para ' + c.xpt.name + '.') : ui.callout('info', 'Os pacotes confirmados são gravados no servidor (ambiente de teste).', 'O rascunho abaixo é só local e vale para ' + c.xpt.name + ' até você confirmar a entrada.')),
      ui.card('Novo pacote', form), ui.card('Rascunho local desta XPT', listBox), H.demoNote(),
    ]);
    setTimeout(function () { if (!destroyed && !(document.activeElement && document.activeElement.tagName === 'SELECT')) codeIn.focus({ preventScroll: true }); }, 0);
    return { node: node, destroy: function () { destroyed = true; if (mapCtl) mapCtl.destroy(); } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
