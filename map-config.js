/* COOPMETRO XPT — configuração do provedor de mapas (integração SEPARADA do módulo map.js).
 * Nenhum provedor foi aprovado (decisão D-10) → tiles:null → o mapa é exibido como INDISPONÍVEL.
 * Para ativar no futuro (após aprovação): defina tiles (ex.: 'https://HOST/{z}/{x}/{y}.png'),
 * a atribuição EXATA exigida pelo provedor e inclua o host em img-src na CSP do index.html.
 * O centro abaixo é só referência de visualização (Anápolis-GO); não confirma endereço nem limite territorial.
 * Coordenadas aproximadas, conferir antes de uso operacional. */
(function (root) {
  'use strict';
  root.CXPT_MAP = {
    tiles: null,
    attribution: '',
    center: { lat: -16.3281, lng: -48.9534 },
    zoom: 13, minZoom: 10, maxZoom: 19,
    cityLabel: 'Anápolis, GO',
  };
})(typeof window !== 'undefined' ? window : globalThis);
