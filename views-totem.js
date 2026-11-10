/* COOPMETRO XPT — Totem de autoatendimento: o motorista que chega com a devolução registra o próprio pacote, passo a passo
 * (motorista da lista → código → tamanho → motivo → local → confirmar). Usa o MESMO registro de entrada do sistema (svc.registerEntries);
 * o motorista que devolveu é gravado no pacote (returnedBy) e no histórico. O login do totem só consegue registrar entrada na própria base. */
(function (root) {
  'use strict';
  var NS = root.CXPT, ui = NS.ui, el = ui.el, H = NS.vh, G = NS.geo, V = NS.views;
  var IDLE_MS = 90000, DONE_MS = 10000, TITLES = ['Motorista', 'Pacote', 'Tamanho', 'Motivo', 'Local', 'Conferir'];

  V.totem = function (c) {
    var g = H.guard(c, ['totem_entrada']); if (g) return g;
    var D = c.D, live = H.live();
    var names = live ? (c.user.totemDrivers || []).slice() : D.drivers.filter(function (d) { return d.xptId === c.xptId; }).map(function (d) { return d.name; });
    var av = NS.map.availability(root.CXPT_MAP);
    var S, box = el('div', { class: 'tt', id: 'tt' }), mapCtl = null, idle = null, doneTimer = null, countdown = null, destroyed = false, saving = false;
    function blank() { return { code: '', size: '', reasonId: '', note: '', lat: null, lng: null, confirmed: false }; }
    function reset() { clearTimeout(doneTimer); clearInterval(countdown); killMap(); S = { step: 0, driver: '', search: '', list: [], cur: blank(), err: '' }; draw(); }
    function touch() { clearTimeout(idle); idle = setTimeout(function () { if (!destroyed && S.step !== 'fim') reset(); }, IDLE_MS); }
    function killMap() { if (mapCtl) { try { mapCtl.destroy(); } catch (_) { /* ignore */ } mapCtl = null; } }

    function sizeLabel(id) { return H.sizeLabel(D, id); }
    function reasonLabel(id) { return H.reasonLabel(D, id); }
    function steps(s) {
      return el('div', { class: 'tt-steps', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': '6', 'aria-valuenow': String(s + 1), 'aria-label': 'Passo ' + (s + 1) + ' de 6' },
        TITLES.map(function (_, i) { return el('i', { class: i < s ? 'on' : i === s ? 'cur' : '' }); }));
    }
    function nav(back, nextLabel, nextOk, onNext) {
      return el('div', { class: 'tt-foot' },
        back ? el('button', { type: 'button', class: 'tt-btn tt-sec', id: 'tt-back', onclick: function () { S.err = ''; if (S.step === 4) killMap(); S.step--; draw(); } }, '← Voltar') : null,
        el('button', { type: 'button', class: 'tt-btn tt-pri', id: 'tt-next', disabled: !nextOk, onclick: onNext }, nextLabel + ' →'));
    }
    function frame(s, title, sub, body, foot) {
      return [steps(s), el('div', { class: 'tt-count' }, el('span', { text: 'Passo ' + (s + 1) + ' de 6 · ' + TITLES[s] }), el('span', { id: 'tt-added', text: S.list.length ? S.list.length + ' pacote(s) já registrado(s)' : '' })),
        el('div', { class: 'tt-body' }, el('h2', { class: 'tt-h', id: 'tt-title', text: title }), sub ? el('p', { class: 'tt-sub', text: sub }) : null, body, S.err ? el('p', { class: 'tt-err', id: 'tt-err', role: 'alert', text: S.err }) : null), foot];
    }

    // ---------- passos
    function stepDriver() {
      var q = S.search.toLowerCase(), shown = names.filter(function (n) { return !q || n.toLowerCase().indexOf(q) >= 0; });
      var search = el('input', { type: 'text', id: 'tt-search', class: 'tt-in', placeholder: 'Procurar o seu nome…', autocomplete: 'off', value: S.search, 'aria-label': 'Procurar o seu nome' });
      var list = el('div', { class: 'tt-list', id: 'tt-drivers', role: 'listbox', 'aria-label': 'Motoristas' });
      function fill() {
        var qq = search.value.toLowerCase(), sh = names.filter(function (n) { return !qq || n.toLowerCase().indexOf(qq) >= 0; });
        list.replaceChildren.apply(list, sh.length ? sh.map(function (n) { return el('button', { type: 'button', class: 'tt-opt tt-row' + (S.driver === n ? ' sel' : ''), role: 'option', 'aria-selected': S.driver === n ? 'true' : 'false', onclick: function () { S.driver = n; S.search = search.value; draw(); } }, el('span', { class: 'tt-ic', text: '🚚' }), n); })
          : [el('p', { class: 'tt-sub', text: names.length ? 'Nenhum nome encontrado. Procure outro ou chame a equipe.' : 'Nenhum motorista cadastrado neste totem. Chame a equipe.' })]);
      }
      search.addEventListener('input', function () { S.search = search.value; fill(); touch(); }); fill();
      return frame(0, 'Olá! Quem está devolvendo?', 'Toque no seu nome na lista.', el('div', null, names.length > 8 ? search : null, list), nav(false, 'Continuar', !!S.driver, function () { S.step = 1; draw(); }));
    }
    function stepCode() {
      var inp = el('input', { type: 'text', id: 'tt-code', class: 'tt-in tt-code', placeholder: 'Aguardando leitura do código…', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '80', inputmode: 'text', value: S.cur.code, 'aria-label': 'Código de barras do pacote' });
      function check() {
        var v = NS.codes.validate(inp.value);
        if (!v.ok) return { ok: false, msg: inp.value.trim() ? v.message : '' };
        if (S.list.some(function (p) { return p.code === v.code; })) return { ok: false, msg: 'Você já registrou este pacote agora.' };
        return { ok: true, code: v.code };
      }
      var hint = el('p', { class: 'tt-hint', id: 'tt-codehint' });
      function go() { var r = check(); if (!r.ok) { hint.textContent = r.msg || 'Leia o código de barras do pacote.'; return; } S.cur.code = r.code; S.err = ''; S.step = 2; draw(); }
      inp.addEventListener('input', function () { S.cur.code = inp.value; var r = check(); hint.textContent = r.ok || !inp.value.trim() ? '' : r.msg; document.getElementById('tt-next').disabled = !r.ok; touch(); });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); inp.value = NS.codes.normalize(inp.value); go(); } });
      var n = nav(true, 'Continuar', check().ok, go);
      setTimeout(function () { if (inp.isConnected) inp.focus(); }, 0);
      return frame(1, 'Leia o código de barras do pacote', 'Aponte a etiqueta para o leitor do totem. Se não ler, digite o código.',
        el('div', null, el('div', { class: 'tt-scan' }, el('div', { class: 'tt-barcode', 'aria-hidden': 'true', text: '▮▯▮▮▯▮▯▮' }), inp), hint), n);
    }
    function stepSize() {
      return frame(2, 'Qual o tamanho do pacote?', 'Toque na opção mais parecida.', el('div', { class: 'tt-grid3', id: 'tt-sizes' }, D.sizes.map(function (z, i) {
        var dim = 22 + i * 16, bx = el('span', { class: 'tt-box', 'aria-hidden': 'true' });
        bx.style.width = dim + 'px'; bx.style.height = Math.round(dim * .8) + 'px'; // CSSOM (a política de segurança do site bloqueia o atributo style)
        return el('button', { type: 'button', class: 'tt-opt tt-card' + (S.cur.size === z.id ? ' sel' : ''), 'data-id': z.id, onclick: function () { S.cur.size = z.id; draw(); } }, bx, el('span', { text: z.label }));
      })), nav(true, 'Continuar', !!S.cur.size, function () { S.step = 3; draw(); }));
    }
    function stepReason() {
      var note = el('textarea', { id: 'tt-note', class: 'tt-ta', maxlength: '200', placeholder: 'Observação (opcional)', 'aria-label': 'Observação (opcional)' }); note.value = S.cur.note;
      note.addEventListener('input', function () { S.cur.note = note.value; touch(); });
      return frame(3, 'Por que não foi entregue?', null, el('div', null, el('div', { class: 'tt-list', id: 'tt-reasons' }, D.reasons.map(function (r) {
        return el('button', { type: 'button', class: 'tt-opt tt-row' + (S.cur.reasonId === r.id ? ' sel' : ''), 'data-id': r.id, onclick: function () { S.cur.note = note.value; S.cur.reasonId = r.id; draw(); } }, r.label);
      })), note), nav(true, 'Continuar', !!S.cur.reasonId, function () { S.cur.note = note.value; S.step = 4; draw(); }));
    }
    function stepWhere() {
      var host = el('div', { class: 'map-host tt-map', id: 'tt-map' }), info = el('p', { class: 'tt-hint', id: 'tt-loc' });
      function marker() { if (mapCtl) mapCtl.setMarkers(S.cur.lat !== null ? [{ id: 'pin', lat: S.cur.lat, lng: S.cur.lng, kind: 'marcada', selected: !S.cur.confirmed, label: S.cur.confirmed ? 'Localização confirmada' : 'Marcador (ainda não confirmado)' }] : []); }
      function text() { info.textContent = S.cur.lat === null ? 'Toque no mapa no ponto da casa do cliente.' : S.cur.confirmed ? 'Localização confirmada.' : 'Ponto marcado. Toque em outro lugar para mover ou confirme.'; }
      text();
      var body = el('div', { class: 'tt-wrap-map' }, av.ok ? host : ui.callout('warn', av.message, 'Você pode continuar sem localização.'), info);
      var confirm = el('button', { type: 'button', class: 'tt-btn tt-pri', id: 'tt-confirm-loc', disabled: S.cur.lat === null, onclick: function () { S.cur.confirmed = true; text(); marker(); ui.announce('Localização confirmada.'); killMap(); S.step = 5; draw(); } }, 'Confirmar localização →');
      var skip = el('button', { type: 'button', class: 'tt-btn tt-sec tt-small', id: 'tt-skip-loc', onclick: function () { S.cur.lat = null; S.cur.lng = null; S.cur.confirmed = false; killMap(); S.step = 5; draw(); } }, 'Não sei o local');
      var foot = el('div', { class: 'tt-foot' }, el('button', { type: 'button', class: 'tt-btn tt-sec', id: 'tt-back', onclick: function () { killMap(); S.step = 3; draw(); } }, '← Voltar'), skip, confirm);
      setTimeout(function () {
        if (!av.ok || destroyed || !host.isConnected) return;
        mapCtl = NS.map.create(host, { config: root.CXPT_MAP, label: 'Mapa para marcar o local da entrega', mode: 'pick',
          onMapClick: function (lat, lng) { S.cur.lat = G.round6(lat); S.cur.lng = G.round6(lng); S.cur.confirmed = false; confirm.disabled = false; text(); marker(); touch(); },
          onStatus: function (s) { if (s === 'falhou') { host.replaceChildren(ui.callout('warn', NS.map.MESSAGES.falhou)); mapCtl = null; } } });
        if (mapCtl) { mapCtl.resize(); marker(); }
      }, 0);
      return frame(4, 'Onde era a entrega?', 'Marque o endereço do cliente (não o galpão).', body, foot);
    }
    function currentItem() {
      var cu = S.cur, loc = cu.lat !== null && cu.confirmed ? { kind: 'marcada', lat: cu.lat, lng: cu.lng, regionId: null } : { kind: 'pendente', lat: null, lng: null, regionId: null };
      return { code: cu.code, size: cu.size, reasonId: cu.reasonId, note: cu.note, location: loc, returnedBy: S.driver };
    }
    function save(after) {
      if (saving) return; saving = true; S.err = ''; var b1 = document.getElementById('tt-more'), b2 = document.getElementById('tt-finish'); if (b1) b1.disabled = true; if (b2) b2.disabled = true;
      var item = currentItem();
      Promise.resolve(c.svc.registerEntries(c.xptId, [item], c.who)).then(function (r) {
        saving = false;
        if (r.created && r.created.length) { S.list.push({ code: item.code, size: item.size, reasonId: item.reasonId, located: item.location.kind === 'marcada' }); S.cur = blank(); after(); return; }
        var sk = (r.skipped || [])[0] || {};
        S.err = sk.reason === 'ja_existe' ? 'Este pacote já está registrado no sistema. Confira o código ou chame a equipe.' : sk.reason === 'codigo_invalido' ? 'Código inválido. Leia o código de novo.' : (r.error || sk.message || 'Não foi possível registrar. Tente de novo ou chame a equipe.');
        draw();
      });
    }
    function stepConfirm() {
      var cu = S.cur, located = cu.lat !== null && cu.confirmed;
      var rows = [['Motorista', S.driver], ['Código', cu.code], ['Tamanho', sizeLabel(cu.size)], ['Motivo', reasonLabel(cu.reasonId)]];
      if (cu.note.trim()) rows.push(['Observação', cu.note.trim()]); rows.push(['Localização', located ? '✔ confirmada no mapa' : 'não informada']);
      return frame(5, 'Pacote ' + (S.list.length + 1) + ' pronto', 'Confira os dados.', el('div', null,
        el('dl', { class: 'tt-sum', id: 'tt-sum' }, rows.map(function (r) { return [el('dt', { text: r[0] }), el('dd', { text: r[1] })]; }).reduce(function (a, b) { return a.concat(b); }, [])),
        el('p', { class: 'tt-sub tt-center', text: 'Tem mais pacotes para devolver?' })),
        el('div', { class: 'tt-foot' }, el('button', { type: 'button', class: 'tt-btn tt-sec', id: 'tt-more', onclick: function () { save(function () { S.step = 1; draw(); }); } }, '➕ Adicionar mais pacote'),
          el('button', { type: 'button', class: 'tt-btn tt-pri', id: 'tt-finish', onclick: function () { save(function () { S.step = 'fim'; draw(); }); } }, '✔ Finalizar')));
    }
    function stepDone() {
      var n = 10; clearInterval(countdown);
      var cd = el('b', { id: 'tt-cd', text: String(n) });
      countdown = setInterval(function () { n--; cd.textContent = String(n); if (n <= 0) reset(); }, 1000);
      clearTimeout(doneTimer); doneTimer = setTimeout(reset, DONE_MS + 500);
      return [el('div', { class: 'tt-body tt-center' }, el('div', { class: 'tt-big', 'aria-hidden': 'true', text: '✅' }), el('h2', { class: 'tt-h', id: 'tt-title', text: 'Tudo certo, ' + S.driver.split(' ')[0] + '!' }),
        el('p', { class: 'tt-sub', id: 'tt-donemsg', text: S.list.length + ' pacote(s) registrado(s). Pode deixar os pacotes no balcão.' }),
        el('div', { class: 'tt-recap' }, S.list.map(function (p) { return el('div', null, '📦 ', el('b', { class: 'mono', text: p.code }), ' · ' + sizeLabel(p.size) + ' · ' + reasonLabel(p.reasonId)); })),
        el('p', { class: 'tt-hint' }, 'Voltando ao início em ', cd, 's…')),
        el('div', { class: 'tt-foot' }, el('button', { type: 'button', class: 'tt-btn tt-pri', id: 'tt-new', onclick: reset }, 'Novo atendimento'))];
    }
    function draw() {
      if (destroyed) return; touch();
      var parts = S.step === 0 ? stepDriver() : S.step === 1 ? stepCode() : S.step === 2 ? stepSize() : S.step === 3 ? stepReason() : S.step === 4 ? stepWhere() : S.step === 5 ? stepConfirm() : stepDone();
      box.replaceChildren.apply(box, parts); box.dataset.step = String(S.step);
    }
    reset();
    ['pointerdown', 'keydown'].forEach(function (ev) { box.addEventListener(ev, touch); });
    return { node: box, destroy: function () { destroyed = true; clearTimeout(idle); clearTimeout(doneTimer); clearInterval(countdown); killMap(); } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
