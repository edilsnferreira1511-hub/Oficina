/* COOPMETRO XPT — componentes de interface. Nunca usa innerHTML: todo conteúdo entra como nó de texto. */
(function (root) {
  'use strict';
  var NS = (root.CXPT = root.CXPT || {});
  var SVGNS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.keys(v).forEach(function (d) { n.dataset[d] = v[d]; });
      else if (k === 'value') n.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') { if (v) n[k] = true; }
      else n.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) append(n, arguments[i]);
    return n;
  }
  function append(n, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(n, x); }); return; }
    n.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  function icon(id, cls) {
    var s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('class', 'icon ' + (cls || '')); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    var u = document.createElementNS(SVGNS, 'use'); u.setAttribute('href', '#i-' + id); s.appendChild(u);
    return s;
  }
  function badge(text, tone) { return el('span', { class: 'badge badge--' + (tone || 'neutral'), text: text }); }

  function fmtDate(ms) {
    if (!NS.packages.validTs(ms)) return 'data indisponível';
    var d = new Date(ms);
    return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
  }
  function fmtDateTime(ms) {
    if (!NS.packages.validTs(ms)) return 'data indisponível';
    var d = new Date(ms);
    return fmtDate(ms) + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' UTC';
  }

  function kpi(label, value, tone, sub) {
    return el('div', { class: 'kpi kpi--' + (tone || 'neutral') },
      el('div', { class: 'kpi-value', text: String(value) }),
      el('div', { class: 'kpi-label', text: label }),
      sub ? el('div', { class: 'kpi-sub', text: sub }) : null);
  }
  function callout(kind, title, body) {
    return el('div', { class: 'callout callout--' + kind, role: kind === 'danger' ? 'alert' : 'note' },
      el('strong', { text: title }), body ? el('span', { text: ' ' + body }) : null);
  }
  function empty(title, body) {
    return el('div', { class: 'empty' }, el('strong', { text: title }), body ? el('p', { text: body }) : null);
  }
  function card(title, body, actions) {
    return el('section', { class: 'card' },
      title || actions ? el('div', { class: 'card-head' }, title ? el('h2', { class: 'card-title', text: title }) : null, actions || null) : null,
      body);
  }
  /** Botão indisponível COM motivo visível. */
  function blocked(label, reason) {
    return el('div', { class: 'blocked' },
      el('button', { type: 'button', class: 'btn btn--blocked', disabled: true, 'aria-describedby': null, title: reason }, icon('lock'), label),
      el('span', { class: 'blocked-why', text: 'Indisponível: ' + reason }));
  }
  var uid = 0;
  function field(label, control, error, hint) {
    var id = control.id || (control.id = 'f' + ++uid);
    var errId = id + '-err', hintId = id + '-hint', desc = [];
    if (error) { desc.push(errId); control.setAttribute('aria-invalid', 'true'); }
    if (hint) desc.push(hintId);
    if (desc.length) control.setAttribute('aria-describedby', desc.join(' '));
    return el('div', { class: 'field' + (error ? ' field--error' : '') },
      el('label', { for: id, text: label }), control,
      hint ? el('small', { id: hintId, class: 'hint', text: hint }) : null,
      error ? el('small', { id: errId, class: 'field-error', role: 'alert', text: error }) : null);
  }
  function select(name, options, value, placeholder) {
    var s = el('select', { name: name });
    if (placeholder !== undefined) s.appendChild(el('option', { value: '', text: placeholder }));
    options.forEach(function (o) { s.appendChild(el('option', { value: o.id, text: o.label })); });
    s.value = value || '';
    return s;
  }
  /** cols: [{key,label,render(row)->Node|string, cls}] — vira lista em cartões quando o contêiner é estreito. */
  function table(cols, rows, opts) {
    opts = opts || {};
    var t = el('table', { class: 'tbl', 'aria-label': opts.label || null });
    t.appendChild(el('thead', null, el('tr', null, cols.map(function (c) { return el('th', { scope: 'col', text: c.label }); }))));
    var tb = el('tbody');
    rows.forEach(function (r) {
      tb.appendChild(el('tr', opts.rowAttrs ? opts.rowAttrs(r) : null, cols.map(function (c) {
        var v = c.render ? c.render(r) : r[c.key];
        return el('td', { 'data-label': c.label, class: c.cls || null }, v === null || v === undefined ? '—' : v);
      })));
    });
    t.appendChild(tb);
    return el('div', { class: 'table-wrap' }, t);
  }
  function pager(p, onGo) {
    return el('nav', { class: 'pager', 'aria-label': 'Paginação' },
      el('button', { type: 'button', class: 'btn btn--ghost', disabled: p.page <= 1, onclick: function () { onGo(p.page - 1); } }, 'Anterior'),
      el('span', { class: 'pager-info', text: 'Página ' + p.page + ' de ' + p.pages + ' · ' + p.total + ' registro(s)' }),
      el('button', { type: 'button', class: 'btn btn--ghost', disabled: p.page >= p.pages, onclick: function () { onGo(p.page + 1); } }, 'Próxima'));
  }
  /** Barras horizontais: items [{label,value,tone}] */
  function bars(items, label) {
    var max = Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1]));
    return el('ul', { class: 'bars', 'aria-label': label || null }, items.map(function (i) {
      var b = el('span', { class: 'bar bar--' + (i.tone || 'ok') });
      b.style.setProperty('--w', Math.round((i.value / max) * 100) + '%');
      return el('li', null, el('span', { class: 'bar-label', text: i.label }), el('span', { class: 'bar-track' }, b), el('span', { class: 'bar-value', text: String(i.value) }));
    }));
  }
  /** Colunas verticais: items [{label,value}] */
  function columns(items, label) {
    var max = Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1]));
    return el('ul', { class: 'cols', 'aria-label': label || null }, items.map(function (i) {
      var b = el('span', { class: 'col-bar' }); b.style.setProperty('--h', Math.round((i.value / max) * 100) + '%');
      return el('li', null, el('span', { class: 'col-value', text: String(i.value) }), el('span', { class: 'col-track' }, b), el('span', { class: 'col-label', text: i.label }));
    }));
  }
  /** Modal de confirmação acessível (foco, Esc). */
  function confirmModal(title, body, okLabel, onOk) {
    var prev = document.activeElement;
    var back = el('div', { class: 'modal-back' });
    function close() { back.remove(); document.removeEventListener('keydown', key); if (prev && prev.focus) prev.focus(); }
    function key(e) { if (e.key === 'Escape') close(); }
    var okBtn = el('button', { type: 'button', class: 'btn btn--primary', onclick: function () { close(); onOk(); } }, okLabel);
    var dlg = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('h2', { text: title }), el('p', { text: body }),
      el('div', { class: 'row-actions' }, el('button', { type: 'button', class: 'btn btn--ghost', onclick: close }, 'Cancelar'), okBtn));
    back.appendChild(dlg); document.body.appendChild(back); document.addEventListener('keydown', key); okBtn.focus();
    return close;
  }
  var liveEl = null;
  function announce(msg) {
    if (!liveEl) liveEl = document.getElementById('live');
    if (liveEl) { liveEl.textContent = ''; setTimeout(function () { liveEl.textContent = msg; }, 20); }
  }
  NS.ui = { el: el, icon: icon, badge: badge, kpi: kpi, callout: callout, empty: empty, card: card, blocked: blocked, field: field, select: select,
    table: table, pager: pager, bars: bars, columns: columns, confirmModal: confirmModal, announce: announce, fmtDate: fmtDate, fmtDateTime: fmtDateTime };
})(typeof window !== 'undefined' ? window : globalThis);
