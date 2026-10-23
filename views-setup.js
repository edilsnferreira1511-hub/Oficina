/* COOPMETRO XPT — "Configuração inicial" (somente administrador do sistema, somente ambiente de teste).
 * Cria XPTs, regiões, motoristas e configurações de TESTE em env/teste/ apenas quando ainda não existem.
 * Nunca sobrescreve, nunca apaga. Usuários e perfis NÃO são criados aqui: são criados no Console do Firebase (ver docs). */
(function (root) {
  'use strict';
  var NS = root.CXPT, ui = NS.ui, el = ui.el, H = NS.vh, V = NS.views;
  V.setup = function (c) {
    var g = H.guard(c, 'usuarios'); if (g) return g;
    if (c.svc.mode !== 'remoto') return H.page([ui.callout('info', 'Disponível só com o Firebase configurado.', 'Preencha a apiKey em firebase-config.js e entre com o administrador.')]);
    var msg = el('p', { class: 'form-msg', id: 'seed-msg', role: 'status' });
    var demo = NS.data.createDemoData(Date.now());
    var seed = { xpts: demo.xpts.map(function (x) { return { id: x.id, name: x.name.replace('Demo', 'Teste'), active: x.active, note: 'Base de teste' }; }),
      regions: demo.regions, drivers: demo.drivers, settings: { stayLimitDays: 4, sizes: demo.sizes, reasons: demo.reasons } };
    return H.page([
      ui.callout('info', 'Dados iniciais de TESTE (env/teste).', 'Cria somente o que ainda não existe: ' + seed.xpts.length + ' XPTs, ' + seed.regions.length + ' regiões, ' + seed.drivers.length + ' motoristas e as configurações. Nada é sobrescrito nem apagado.'),
      ui.card('Criar dados iniciais', el('div', null, el('button', { type: 'button', class: 'btn btn--primary', id: 'seed-btn', onclick: function () {
        msg.textContent = 'Gravando…';
        NS.services.seedTest(root.CXPT_FB, c.user, seed).then(function (r) { msg.textContent = r.ok ? r.created + ' documento(s) criado(s); ' + r.existing + ' já existiam e foram mantidos.' : r.message; });
      } }, 'Criar dados iniciais de teste'), msg)),
      H.demoNote(),
    ]);
  };
})(typeof window !== 'undefined' ? window : globalThis);
