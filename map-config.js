/* COOPMETRO XPT — configuração do provedor de mapas (integração SEPARADA do componente map.js).
 *
 * PROVEDOR ATUAL: OpenStreetMap (servidor público de ladrilhos). Antes de usar em produção LEIA as condições:
 *   https://operations.osmfoundation.org/policies/tiles/
 *   - Atribuição obrigatória e visível: "© OpenStreetMap contributors" (link para a página de direitos).
 *   - Uso leve e interativo por pessoas; proibidos download em massa, pré-carga de áreas e uso offline.
 *   - O navegador DEVE enviar o cabeçalho Referer: abrir o arquivo direto (file://) não envia → ladrilhos recusados.
 *     Use http(s) (GitHub Pages, servidor local). Sem Referer, o componente mostra "mapa indisponível" explicando o motivo.
 *   - Sem SLA nem garantia; o acesso pode ser bloqueado sem aviso. NÃO é adequado para uso intensivo/produção:
 *     para isso contrate um provedor de ladrilhos (ou hospede os seus) e troque apenas `tiles`, `attribution` e `attributionUrl`.
 * Ao trocar de provedor, acrescente o host dos ladrilhos em img-src na CSP do index.html.
 * O centro abaixo é só referência de visualização (Anápolis-GO): não confirma endereço nem limite territorial.
 * Coordenadas aproximadas, conferir antes de uso operacional.
 */
(function (root) {
  'use strict';
  root.CXPT_MAP = {
    provider: 'OpenStreetMap (servidor público)',
    tiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    attributionUrl: 'https://www.openstreetmap.org/copyright',
    usagePolicyUrl: 'https://operations.osmfoundation.org/policies/tiles/',
    requiresReferer: true,
    center: { lat: -16.3281, lng: -48.9534 },
    zoom: 13, minZoom: 10, maxZoom: 19,
    cityLabel: 'Anápolis, GO',
  };
})(typeof window !== 'undefined' ? window : globalThis);
