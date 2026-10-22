# COOPMETRO XPT — protótipo local V1 (atualizado: fluxo operacional completo)

> **AMBIENTE DE DEMONSTRAÇÃO — dados fictícios, sem gravação no sistema real.**
> Não há backend, login real, Firebase nem Mercado Livre. Tudo vive na memória da página e é perdido ao recarregar.
> A única rede usada é a de **imagens de ladrilhos do mapa** (OpenStreetMap), quando há internet.

## Como abrir (IMPORTANTE para o mapa)
- **Para o mapa aparecer, abra por `http(s)`**, não com duplo clique: o servidor público do OpenStreetMap exige o cabeçalho `Referer`, que o navegador **não envia** para arquivos abertos como `file://`. Nesse caso a tela diz exatamente isso ("mapa indisponível") em vez de desenhar um mapa falso.
  - Local: `python3 -m http.server 8765` nesta pasta e abra `http://127.0.0.1:8765/`.
  - Publicado: GitHub Pages (envie todos os arquivos desta pasta para a raiz do repositório).
- Requer internet para os ladrilhos. Sem internet ou com ladrilhos recusados, o mapa mostra "indisponível" com o motivo, e dá para registrar o pacote como **pendente de localização**.

## Fluxo implementado (em memória)
Entrada (bipar/digitar → validar → tamanho/motivo/observação → mapa: tocar, ajustar, **confirmar localização** → rascunho → **confirmar entrada local**) → pacote com latitude/longitude salvos → **Mapa e Regiões** (planejamento: pontos reutilizados, aproximados diferenciados, sem localização em lista separada, filtro por XPT, seleção individual/múltipla/**região desenhada**, revisão) → **criar ambulância** (coordenador) → **QR Code** (visualizar/imprimir) → **página de separação** (bipagem, X de Y, lista recolhível, mapa-resumo) → **confirmar saída** (só conferidos) → **encerrar operação** (supervisor/administrador; bloqueia conferências) → histórico.

## Estrutura (pasta única, sem subpastas — pronta para enviar ao GitHub)
```
index.html  styles.css  logo-coopmetro.jpg     casca (CSP estrita), tema claro/escuro, logotipo enviado pelo proprietário
data.js          dados demonstrativos determinísticos + configuração (tamanhos, motivos, estados)
packages.js      estados, transições, correção com motivo, filtros, paginação (puro)
alerts.js        permanência > limite, retornos, divergências (puro)
codes.js         validação/normalização de códigos, índice global, rascunho de entrada (puro)
geo.js           validação de coordenadas/localização, Web Mercator, seleção por área (puro)
registry.js      confirmação de entrada/reentrada em memória, sem duplicar, preservando localização e histórico
ambulance.js     criar ambulância, bipagem, confirmar saída, encerrar (regras puras; autorização como parâmetro)
qr.js            gerador de QR Code local (sem bibliotecas, sem rede); o QR leva só o endereço da operação
operations.js    operações demonstrativas, conferência e rascunho de grupo
permissions.js   perfis e matriz PROPOSTA (não é segurança)
audit.js  reports.js  store.js                 auditoria em memória, relatórios/CSV, estado por XPT
map-config.js    provedor de mapas (OpenStreetMap) + condições de uso;  map.js: componente (toque, pinça, região desenhada)
ui.js  views.js  views-entry.js  views-ops.js  views-map.js  views-amb.js  views-admin.js  app.js    interface
unit.test.js  unit-fluxo.test.js  e2e.js  e2e-fluxo.js  run-all.js  helpers.js  qr-verificacao.py  tile-simulado.png  tile-simulado-LEIA-ME.txt   testes
ARQUITETURA-FUNCIONAL.md  DECISOES-PENDENTES.md  TESTES.md  STATUS-DO-PROJETO.md  LEIA-ME.md      documentação
make-zip.sh      gera o ZIP de entrega
```
**Todos os arquivos precisam ficar juntos na mesma pasta** (o `index.html` os carrega pelo nome).

## Executar os testes
```
node unit.test.js && node unit-fluxo.test.js     # unitários (Node, sem dependências)
node e2e.js && node e2e-fluxo.js                 # navegador (Playwright + Chromium; Python+OpenCV opcional p/ ler o QR)
node run-all.js                                  # tudo
```
## Gerar um ZIP atualizado
`sh make-zip.sh [destino.zip]` → uma única pasta `coopmetro-xpt` com todos os arquivos, sem subpastas.

## Limitações conhecidas
- **Nada persiste**: recarregar volta aos dados fictícios. O **QR só abre a operação no mesmo navegador/sessão** (a operação existe apenas na memória); em outro aparelho mostra "operação não encontrada" até existir backend.
- **Mapa real NÃO foi validado aqui**: o ambiente de desenvolvimento não tem acesso ao servidor de ladrilhos (conexão recusada pelo proxy). Os testes de mapa usam ladrilhos **sintéticos interceptados** e provam o componente, não a cartografia. Valide no seu aparelho/hospedagem. O servidor público do OSM é para uso leve; para produção contrate/hospede um provedor (ver `map-config.js`).
- Leitura por **câmera não** implementada (não aparece como disponível). Leitor USB/Bluetooth (modo teclado) suportado por digitação/Enter, **sem teste com hardware real**. Sem testes em Android real; só Chromium emulando celular com toque.
- Autorização é só da interface (seletor de perfil demonstrativo); a real virá do backend. Sem Firebase, sem deploy.
- Região desenhada = **retângulo** (não polígono livre). Tamanhos/motivos/estados e regras de reentrada/devolução são provisórios (ver `DECISOES-PENDENTES.md`).
