/* COOPMETRO XPT — ambulâncias: lista/detalhe de operações, QR Code, página de separação (bipagem), Saída e Conferência,
 * confirmação de saída e encerramento. Tudo em memória (sem backend); permissões aqui só ocultam/avisam na interface. */
(function (root) {
  'use strict';
  var NS = root.CXPT, ui = NS.ui, el = ui.el, H = NS.vh, A = NS.ambulance, V = NS.views, G = NS.geo;
  var selOp = {}; // operação escolhida por XPT na tela de Saída

  var SCAN_TONE = { ok: 'ok', repetido: 'warn', invalido: 'danger', outra_operacao: 'warn', nao_vinculado: 'warn', inexistente: 'warn', bloqueado: 'danger', sem_permissao: 'danger' };
  var STATE_TONE = { em_separacao: 'info', saida_confirmada: 'ok', encerrada: 'neutral', rascunho_demo: 'neutral', em_conferencia: 'info', aguardando_confirmacao: 'warn' };

  function driverName(D, id) { var d = D.drivers.filter(function (x) { return x.id === id; })[0]; return d ? d.name : 'Não designado'; }
  function opLabel(op) { return op.name || op.groupLabel || op.id; }
  function visibleOps(c) {
    var ops = NS.operations.opsOf(c.D, c.xptId);
    return c.profile === 'motorista' ? ops.filter(function (o) { return o.driverId === c.driverId; }) : ops;
  }
  function profileLabel(c) { var p = NS.permissions.PROFILES.filter(function (x) { return x.id === c.profile; })[0]; return p ? p.label : c.profile; }
    function progressBar(done, total) {
    var b = el('span', { class: 'bar bar--ok' }); b.style.setProperty('--w', (total ? Math.round(done / total * 100) : 0) + '%');
    return el('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done), 'aria-label': 'Progresso da conferência' }, el('span', { class: 'bar-track' }, b));
  }
  function stateBadge(op) { return ui.badge(NS.operations.OP_STATE[op.state] || op.state, STATE_TONE[op.state] || 'neutral'); }
  function dl(rows) {
    return el('dl', { class: 'dl' }, rows.map(function (r) { return [el('dt', { text: r[0] }), el('dd', null, r[1])]; }).reduce(function (a, b) { return a.concat(b); }, []));
  }
  function noPerm(label, c, what) { return ui.blocked(label, 'o perfil "' + profileLabel(c) + '" não pode ' + what + ' (simulação; o servidor validará no futuro).'); }

  // ---------- QR Code (local; identifica só a operação)
  function qrSvg(text, label) {
    var qr = NS.qr.encode(text, 'M'), n = qr.size + 8, SV = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(SV, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + n + ' ' + n); svg.setAttribute('class', 'qr-svg'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label);
    svg.setAttribute('shape-rendering', 'crispEdges'); svg.setAttribute('data-version', String(qr.version)); svg.setAttribute('data-modules', String(qr.size));
    var bg = document.createElementNS(SV, 'rect'); bg.setAttribute('width', n); bg.setAttribute('height', n); bg.setAttribute('fill', '#ffffff'); svg.appendChild(bg);
    var p = document.createElementNS(SV, 'path'); p.setAttribute('d', NS.qr.toPath(qr, 4)); p.setAttribute('fill', '#000000'); svg.appendChild(p);
    return svg;
  }
  H.showQr = function (c, op) {
    var url = A.qrUrl(root.location.href, op.id);
    var warn = [];
    if (root.location.protocol === 'file:') warn.push('Esta página foi aberta como arquivo (file://): o endereço do QR só funciona neste computador. Publique em http(s) (ex.: GitHub Pages) para abrir em outros aparelhos.');
    if (NS.mode !== 'remoto') warn.push('Os dados desta demonstração vivem só na memória desta página: em outro aparelho, ou depois de recarregar, a operação não será encontrada (não há backend).');
    else warn.push('A operação está gravada no servidor: quem tiver login e acesso à base abre a página de separação pelo QR.');
    var body = el('div', { class: 'qr-box', id: 'qr-box' },
      el('div', { class: 'qr-print' }, el('h3', { text: opLabel(op) + ' · ' + op.id }), el('p', { class: 'hint', text: H.xptName(c.D, op.xptId) + ' · Responsável: ' + op.responsible }), qrSvg(url, 'QR Code da operação ' + op.id),
        el('p', { class: 'mono small qr-url', id: 'qr-url', text: url })),
      ui.callout('info', 'O QR identifica apenas a operação.', 'Não contém dados de pacotes ou pessoas e não substitui login nem permissões: quem abrir precisa ter acesso à base e à situação da operação.'),
      warn.map(function (w) { return el('p', { class: 'hint', text: w }); }));
    return ui.modal('QR Code da operação ' + op.id, body, [
      { label: 'Imprimir', cls: 'btn--primary', id: 'qr-print-btn', onClick: function () { root.print(); } },
      { label: 'Abrir página de separação', onClick: function (close) { close(); c.go('separation', [op.id]); } },
      { label: 'Fechar', onClick: function (close) { close(); } },
    ], { id: 'qr-modal' });
  };

  // ---------- confirmar saída / encerrar
  function pendingList(D, op) {
    var s = A.summary(D, op);
    return el('ul', { class: 'plain', id: 'pending-list' }, s.pending.length ? s.pending.map(function (p) { return el('li', { text: p.code + ' · ' + H.sizeLabel(D, p.size) }); }) : el('li', { text: 'Nenhum pacote pendente.' }));
  }
  H.confirmExitFlow = function (c, op, after) {
    var D = c.D, s = A.summary(D, op);
    if (!H.can(c, 'confirmar_saida')) return;
    var body = el('div', null,
      el('p', { id: 'exit-summary', text: 'Esperados: ' + s.total + ' · Conferidos: ' + s.done + ' · Pendentes: ' + s.pending.length }),
      el('p', { class: 'hint', text: 'Somente os pacotes conferidos terão a saída registrada (em separação → em rota). Os pendentes permanecem em separação e NÃO são removidos do estoque.' }),
      el('h3', { text: 'Pacotes que faltam' }), pendingList(D, op));
    ui.modal('Confirmar saída da operação ' + op.id + '?', body, [
      { label: 'Cancelar', onClick: function (close) { close(); } },
      { label: 'Confirmar saída dos conferidos', cls: 'btn--primary', id: 'exit-ok', onClick: function (close) {
        close();
        c.svc.confirmExit(op, c.who).then(function (r) {
          if (r.ok) { c.store.audit.log('saida_confirmada', op.xptId, op.id + ':' + r.departed.length); ui.announce(r.departed.length + ' pacote(s) com saída registrada.'); }
          else ui.announce(r.message);
          if (after) after(r);
          c.store.changed('ops');
        });
      } },
    ], { id: 'exit-modal' });
  };
  H.closeFlow = function (c, op, after) {
    var D = c.D;
    if (!H.can(c, 'encerrar')) return;
    var body = el('div', null,
      el('p', { class: 'hint', text: 'Depois de encerrar, o QR e a página de separação não aceitam novas conferências. O histórico e as pendências são preservados; pacotes que não saíram voltam ao estoque COM evento registrado.' }),
      el('h3', { text: 'Pendentes que serão preservados' }), pendingList(D, op));
    ui.modal('Encerrar a operação ' + op.id + '?', body, [
      { label: 'Cancelar', onClick: function (close) { close(); } },
      { label: 'Encerrar operação', cls: 'btn--danger', id: 'close-ok', onClick: function (close) {
        close();
        c.svc.closeOperation(op, c.who).then(function (r) {
          if (r.ok) { c.store.audit.log('operacao_encerrada', op.xptId, op.id); ui.announce('Operação encerrada. Novas conferências bloqueadas.'); }
          else ui.announce(r.message);
          if (after) after(r);
          c.store.changed('ops');
        });
      } },
    ], { id: 'close-modal' });
  };

  // ---------- painel de conferência por bipagem (usado na Saída e na página do QR)
  H.confPanel = function (c, op, o) {
    o = o || {};
    var D = c.D, conf = c.store.conference(op), destroyed = false;
    var allowed = H.can(c, 'conferir'), active = A.isActive(op), canScan = allowed && active;
    var reason = !active ? 'Operação encerrada: novas conferências estão bloqueadas.' : !allowed ? 'O perfil "' + profileLabel(c) + '" não pode conferir pacotes (simulação).' : '';
    var scanIn = el('input', { type: 'text', id: 'scan-in', name: 'scan', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '80', inputmode: 'text',
      placeholder: 'Leia ou digite o código', disabled: !canScan, 'aria-describedby': 'scan-help' });
    var result = el('div', { class: 'scan-result', id: 'scan-result', role: 'status', 'aria-live': 'polite' });
    var head = el('div', { class: 'conf-head' }), listBox = el('div', { id: 'conf-list' });
    var expanded = true;
    var toggleBtn = el('button', { type: 'button', class: 'btn btn--ghost btn--sm', id: 'toggle-list', 'aria-expanded': 'true', 'aria-controls': 'conf-list', onclick: function () {
      expanded = !expanded; listBox.hidden = !expanded; toggleBtn.setAttribute('aria-expanded', String(expanded)); toggleBtn.textContent = expanded ? 'Recolher lista' : 'Expandir lista';
    } }, 'Recolher lista');
    function draw() {
      var pr = conf.progress(), done = conf.checked();
      head.replaceChildren(
        el('div', { class: 'progress-row' }, el('strong', { id: 'conf-progress', text: pr.done + ' de ' + pr.total + ' conferidos' }), progressBar(pr.done, pr.total)),
        el('ul', { class: 'counts', 'aria-label': 'Contagens' },
          el('li', null, 'Esperados: ', el('strong', { id: 'cnt-total', text: String(pr.total) })), el('li', null, 'Conferidos: ', el('strong', { id: 'cnt-done', text: String(pr.done) })),
          el('li', null, 'Pendentes: ', el('strong', { id: 'cnt-pending', text: String(pr.total - pr.done) }))));
      listBox.replaceChildren(el('ul', { class: 'conf-items', 'aria-label': 'Pacotes vinculados à operação' }, conf.expected().map(function (p) {
        var ok = done.indexOf(p.code) >= 0, left = op.departed && op.departed[p.code];
        return el('li', { class: 'conf-item conf-item--' + (ok ? 'ok' : 'pend'), 'data-code': p.code, 'data-state': ok ? 'conferido' : 'pendente' },
          el('span', { class: 'mono', text: p.code }), el('span', { class: 'conf-tag', text: ok ? (left ? 'Conferido · saiu' : 'Conferido') : 'Pendente' }),
          (ok && canScan && !left) ? el('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'data-act': 'unscan', 'aria-label': 'Remover leitura de ' + p.code, onclick: function () {
            c.svc.unscan(op, p.code, c.who).then(function (done) { result.className = 'scan-result'; result.textContent = done ? 'Leitura de ' + p.code + ' removida.' : 'Não foi possível remover a leitura de ' + p.code + '.'; draw(); if (o.onChange) o.onChange(); scanIn.focus({ preventScroll: true }); });
          } }, 'Remover leitura') : null);
      })));
    }
    function scan() {
      if (!canScan) return;
      var raw = scanIn.value; scanIn.value = '';
      c.svc.scan(op, raw, c.who).then(function (r) {
        result.className = 'scan-result scan-result--' + (SCAN_TONE[r.status] || 'warn'); result.dataset.status = r.status;
        result.textContent = (r.code ? r.code + ': ' : '') + r.message;
        if (destroyed) return;
        draw(); if (o.onChange) o.onChange(r);
        scanIn.focus({ preventScroll: true });
      });
    }
    scanIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); scan(); } });
    // leitura contínua: se o foco se perder para o nada (ex.: após um aviso), volta ao campo
    scanIn.addEventListener('blur', function () {
      setTimeout(function () { if (!destroyed && canScan && scanIn.isConnected && (document.activeElement === document.body || document.activeElement === null) && !document.querySelector('.modal-back')) scanIn.focus({ preventScroll: true }); }, 50);
    });
    draw();
    var node = el('div', { class: 'conf-panel' },
      head,
      el('form', { class: 'scan-form', onsubmit: function (e) { e.preventDefault(); scan(); } },
        ui.field('Campo de bipagem (leitor USB/Bluetooth ou digitação)', scanIn, null, 'Leitores enviam Enter ao final. Leituras repetidas não são contadas. Leitura pela câmera: não disponível nesta versão.'),
        el('button', { type: 'submit', class: 'btn btn--primary', id: 'scan-btn', disabled: !canScan }, 'Conferir código'), result),
      reason ? ui.callout('warn', reason) : null,
      el('div', { class: 'row-actions' }, toggleBtn), listBox);
    setTimeout(function () { if (canScan && scanIn.isConnected) scanIn.focus({ preventScroll: true }); }, 0);
    return { node: node, scanIn: scanIn, destroy: function () { destroyed = true; } };
  };

  function actionButtons(c, op, rerender) {
    var active = A.isActive(op);
    return el('div', { class: 'row-actions', id: 'op-actions' },
      el('button', { type: 'button', class: 'btn btn--ghost', id: 'show-qr', onclick: function () { H.showQr(c, op); } }, 'Ver / imprimir QR Code'),
      el('a', { class: 'btn btn--ghost', id: 'open-sep', href: '#/separation/' + encodeURIComponent(op.id) }, 'Abrir página de separação'),
      !active ? null : (H.can(c, 'confirmar_saida')
        ? el('button', { type: 'button', class: 'btn btn--primary', id: 'confirm-exit', onclick: function () { H.confirmExitFlow(c, op, rerender); } }, 'Confirmar saída dos conferidos')
        : noPerm('Confirmar saída', c, 'confirmar saída')),
      !active ? null : (H.can(c, 'encerrar')
        ? el('button', { type: 'button', class: 'btn btn--danger', id: 'close-op', onclick: function () { H.closeFlow(c, op, rerender); } }, 'Encerrar operação')
        : noPerm('Encerrar operação', c, 'encerrar operações')));
  }

  // ---------- Saída e conferência
  V.exit = function (c) {
    var g = H.guard(c, 'conferir'); if (g) return g;
    var D = c.D, ops = visibleOps(c);
    if (!ops.length) return H.page([ui.empty('Nenhuma operação nesta XPT.', 'Crie uma ambulância na tela Mapa e Regiões.'), H.demoNote()]);
    var cur = ops.filter(function (o) { return o.id === selOp[c.xptId]; })[0] || ops[0];
    selOp[c.xptId] = cur.id;
    var opSel = ui.select('op', ops.map(function (o) { return { id: o.id, label: o.id + ' — ' + opLabel(o) + (A.isActive(o) ? '' : ' (encerrada)') }; }), cur.id);
    opSel.id = 'op-select';
    opSel.addEventListener('change', function () { selOp[c.xptId] = opSel.value; c.rerender(); });
    var panel = H.confPanel(c, cur, { onChange: function () { /* o resumo é do próprio painel */ } });
    return {
      node: H.page([
        NS.mode === 'remoto' ? ui.callout('info', 'Conferência gravada no servidor.', 'A saída só é registrada ao confirmar, por perfil autorizado, e apenas para os pacotes conferidos.') : ui.callout('warn', 'Conferência em memória (demonstração).', 'A saída só é registrada ao confirmar, por perfil autorizado, e apenas para os pacotes conferidos. Nada vai para servidor.'),
        ui.card('Operação (' + c.xpt.name + ')', el('div', { class: 'form-grid' }, ui.field('Operação', opSel),
          dl([['Ambulância', H.ambChip(cur)], ['Estado', stateBadge(cur)], ['Responsável', cur.responsible], ['Motorista', driverName(D, cur.driverId)]]))),
        ui.card('Leitura de códigos', panel.node),
        actionButtons(c, cur, function () { c.rerender(); }), H.demoNote(),
      ]), destroy: function () { panel.destroy(); },
    };
  };

  // ---------- lista de operações
  V.ops = function (c) {
    var g = H.guard(c, ['ver_base', 'minhas_ops']); if (g) return g;
    var D = c.D, ops = visibleOps(c);
    return H.page([
      c.profile === 'motorista' ? ui.callout('info', 'Visão do motorista (simulação): somente operações atribuídas a "Motorista Demo 1".', 'Na versão real isso será imposto pelo backend.') : null,
      ui.card('Operações de ambulância — ' + c.xpt.name, ops.length ? ui.table([
        { label: 'Operação', render: function (o) { return el('a', { href: '#/operation/' + encodeURIComponent(o.id), class: 'code-link', text: o.id }); } },
        { label: 'Ambulância', render: function (o) { return H.ambChip(o); } },
        { label: 'Responsável', key: 'responsible' }, { label: 'Motorista', render: function (o) { return driverName(D, o.driverId); } },
        { label: 'Previstos', render: function (o) { return String(o.packageIds.length); } },
        { label: 'Conferidos', render: function (o) { return String(c.store.conference(o).progress().done); } },
        { label: 'Estado', render: function (o) { return stateBadge(o); } },
        { label: 'Criada em', render: function (o) { return ui.fmtDateTime ? ui.fmtDateTime(o.createdAt) : ui.fmtDate(o.createdAt); } },
      ], ops, { label: 'Operações', rowAttrs: function (o) { return { 'data-op': o.id }; } }) : ui.empty('Nenhuma operação para este perfil/XPT.')),
      el('div', { class: 'row-actions' }, H.can(c, 'operacao')
        ? el('a', { class: 'btn btn--primary', id: 'plan-amb', href: '#/map' }, 'Planejar nova ambulância (Mapa e Regiões)')
        : noPerm('Criar ambulância', c, 'criar operações')),
      NS.mode === 'remoto' ? null : el('p', { class: 'hint', text: 'Operações criadas aqui existem só na memória da demonstração (somem ao recarregar).' }),
      H.demoNote(),
    ]);
  };

  // ---------- detalhe da operação
  V.operation = function (c) {
    var g = H.guard(c, ['ver_base', 'minhas_ops']); if (g) return g;
    var D = c.D, op = visibleOps(c).filter(function (o) { return o.id === c.params[0]; })[0];
    if (!op) return H.page([ui.empty('Operação não encontrada nesta base/perfil.'), el('a', { class: 'btn btn--ghost', href: '#/ops' }, 'Voltar')]);
    var conf = c.store.conference(op), s = A.summary(D, op), done = conf.checked();
    return H.page([
      el('a', { class: 'btn btn--ghost', href: '#/ops' }, '← Voltar às operações'),
      ui.card('Operação ' + op.id + ' — ' + opLabel(op), dl([
        ['Ambulância', H.ambChip(op)], ['XPT', H.xptName(D, op.xptId)], ['Responsável', op.responsible], ['Motorista', driverName(D, op.driverId)],
        ['Estado', stateBadge(op)], ['Criada em', ui.fmtDateTime ? ui.fmtDateTime(op.createdAt) : ui.fmtDate(op.createdAt)],
        ['Pendências preservadas no encerramento', op.pendingAtClose ? (op.pendingAtClose.length ? op.pendingAtClose.join(', ') : 'nenhuma') : '—'],
      ])),
      ui.callout('info', 'O QR Code identifica apenas a operação.', 'Ele não substitui a autenticação do usuário nem as permissões.'),
      ui.card('Pacotes e conferência', el('div', null, el('div', { class: 'progress-row' }, el('strong', { id: 'op-progress', text: s.done + ' de ' + s.total + ' conferidos' }), progressBar(s.done, s.total)),
        ui.table([{ label: 'Código', render: H.link }, { label: 'Tamanho', render: function (p) { return H.sizeLabel(D, p.size); } }, { label: 'Estado', render: function (p) { return H.stateBadge(D, p.state); } },
          { label: 'Conferência', render: function (p) { return done.indexOf(p.code) >= 0 ? ui.badge('Conferido', 'ok') : ui.badge('Pendente', 'warn'); } }], conf.expected(), { label: 'Pacotes da operação' }))),
      actionButtons(c, op, function () { c.rerender(); }),
      ui.card('Histórico da operação', (op.history || []).length ? ui.table([
        { label: 'Quando', render: function (h) { return ui.fmtDateTime ? ui.fmtDateTime(h.at) : ui.fmtDate(h.at); } }, { label: 'Evento', key: 'type' },
        { label: 'Operador', key: 'operator' }, { label: 'Detalhe', render: function (h) { return (h.code ? h.code + ' · ' : '') + h.note; } },
      ], (op.history || []).slice().reverse(), { label: 'Histórico da operação' }) : ui.empty('Sem eventos registrados.', NS.mode === 'remoto' ? null : 'Operações demonstrativas iniciais não têm histórico próprio.')),
      H.demoNote(),
    ]);
  };

  // ---------- página de separação (aberta pelo QR Code)
  V.separation = function (c) {
    if (c.profile === 'motorista') return V.driverOp(c); // motorista nunca vê a página de separação do despacho
    var D = c.D, id = c.params[0];
    var any = D.operations.filter(function (o) { return o.id === id; })[0];
    if (!any) return H.page([ui.empty('Operação não encontrada.', NS.mode === 'remoto' ? 'Ela não existe, não pertence às suas bases ou você não tem permissão para vê-la. Use "Atualizar dados" se ela acabou de ser criada em outro aparelho.' : 'Os dados desta demonstração ficam só na memória: depois de recarregar a página, ou em outro aparelho, a operação não existe. Com backend, o QR abriria a operação gravada.'), el('a', { class: 'btn btn--ghost', href: '#/ops' }, 'Ir para Operações')]);
    var g = H.guard(c, ['ver_base', 'minhas_ops', 'conferir']); if (g) return g;
    if (any.xptId !== c.xptId) return H.page([ui.callout('warn', 'Esta operação pertence a outra base.', 'Selecione no cabeçalho a base à qual você tem acesso. Nenhum dado da operação é exibido.')]);
    var op = any;
    if (c.profile === 'motorista' && op.driverId !== c.driverId) return H.page([ui.callout('warn', 'Operação não atribuída a você.', 'O motorista só enxerga operações atribuídas.')]);
    var s0 = A.summary(D, op), pk = A.opPackages(D, op), withCoords = pk.filter(function (p) { return G.hasCoords(p.location); });
    var av = NS.map.availability(root.CXPT_MAP), ctl = null, mapHost = el('div', { class: 'map-host map-host--mini', id: 'sep-map' });
    var panel;
    function markers() {
      var k = op.checked || {};
      return withCoords.map(function (p) { return { id: p.id, lat: p.location.lat, lng: p.location.lng, kind: p.location.kind, selected: !!k[p.code], label: 'Pacote ' + p.code + (k[p.code] ? ' (conferido)' : ' (pendente)') }; });
    }
    var mapNode;
    if (!withCoords.length) mapNode = el('p', { class: 'hint', id: 'sep-map-none', text: 'Nenhum pacote desta operação tem coordenadas confirmadas; o mapa-resumo não tem pontos para mostrar.' });
    else if (!av.ok) mapNode = el('div', { id: 'sep-map-unavailable' }, ui.callout('warn', 'Mapa real não configurado.', av.message));
    else {
      ctl = NS.map.create(mapHost, { config: root.CXPT_MAP, label: 'Mapa-resumo dos pacotes da operação', mode: 'markers',
        onStatus: function (st) { if (st === 'falhou') { mapHost.replaceChildren(ui.callout('warn', NS.map.MESSAGES.falhou)); ctl = null; } } });
      if (ctl) { ctl.setMarkers(markers()); ctl.fit(withCoords.map(function (p) { return { lat: p.location.lat, lng: p.location.lng }; })); }
      mapNode = el('div', null, mapHost, el('p', { class: 'hint', text: withCoords.length + ' de ' + pk.length + ' pacotes têm coordenadas. Verde = conferido; demais = pendente.' }));
    }
    panel = H.confPanel(c, op, { onChange: function () { if (ctl) ctl.setMarkers(markers()); } });
    var node = H.page([
      ui.card(opLabel(op) + ' · ' + op.id, dl([['Responsável', op.responsible], ['Base XPT', H.xptName(D, op.xptId)], ['Estado', stateBadge(op)], ['Total esperado', String(s0.total)]])),
      !A.isActive(op) ? ui.callout('danger', 'Operação encerrada.', 'Novas conferências estão bloqueadas. O histórico e as pendências foram preservados.') : null,
      ui.card('Conferência por bipagem', panel.node),
      ui.card('Mapa-resumo', mapNode),
      actionButtons(c, op, function () { c.rerender(); }),
      el('p', { class: 'hint', text: 'Esta página foi aberta pelo identificador da operação. O QR não autentica: as permissões do usuário e a situação da operação foram verificadas acima (na versão real, também no servidor).' }),
      H.demoNote(),
    ]);
    return { node: node, destroy: function () { panel.destroy(); if (ctl) ctl.destroy(); } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
