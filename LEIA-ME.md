# COOPMETRO XPT — versão TESTE-FIREBASE (zona poligonal, login real, Firestore)

> **Dois modos, decididos por `firebase-config.js`:**
> - **`apiKey` vazia (como entregue): MODO DEMONSTRAÇÃO** — dados fictícios só em memória, sem login, sem rede (exceto ladrilhos do mapa).
> - **`apiKey` preenchida: MODO TESTE FIREBASE** — login real (e-mail/senha), perfil e bases vindos do Firestore, gravação **somente** em `env/teste/` do projeto `coopmetro-xpt`.
>
> **Nada foi publicado, nenhum deploy foi feito, o Hosting e o plano Firebase não foram tocados, nada foi gravado no Firebase real a partir deste ambiente.**
> **O que depende de você** está em `FIREBASE.md` (seção "Ações suas"): colar a `apiKey`, criar o 1º administrador, publicar/mesclar as regras, abrir por `http(s)`.

## Como abrir (IMPORTANTE para o mapa)
- **Para o mapa aparecer, abra por `http(s)`**, não com duplo clique: o servidor público do OpenStreetMap exige o cabeçalho `Referer`, que o navegador **não envia** para arquivos abertos como `file://`. Nesse caso a tela diz exatamente isso ("mapa indisponível") em vez de desenhar um mapa falso.
  - Local: `python3 -m http.server 8765` nesta pasta e abra `http://127.0.0.1:8765/`.
  - Publicado: GitHub Pages (envie todos os arquivos desta pasta para a raiz do repositório).
- Requer internet para os ladrilhos. Sem internet ou com ladrilhos recusados, o mapa mostra "indisponível" com o motivo, e o pacote pode ser adicionado **sem localização confirmada**.

## Fluxo implementado
Entrada (bipar/digitar → código válido abre o mapa → tocar na casa do cliente → tocar em outro ponto reposiciona → **Confirmar localização** → rascunho → **confirmar entrada**; sem as antigas 4 opções de tipo: sem ponto confirmado o pacote segue **sem localização confirmada**, nunca com coordenada inventada) → pacote com latitude/longitude → **Mapa e Regiões** (pontos reutilizados, sem localização em lista separada, filtro por XPT, seleção manual **ou zona poligonal desenhada**: toque vários pontos, finalize, arraste os vértices para ajustar, apague/cancele; dentro/fora destacados, contador, retirar pacote individual antes de confirmar, pacotes em operação ativa excluídos) → **criar ambulância** (coordenador) → **QR Code** (visualizar/imprimir) → **página de separação** (bipagem, X de Y, lista recolhível, mapa-resumo) → **confirmar saída** (só conferidos) → **encerrar operação** (supervisor/administrador; bloqueia conferências) → histórico. No modo Firebase tudo isso é gravado em transações do Firestore e recuperado após recarregar / em outro aparelho.

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
map-config.js    provedor de mapas (OpenStreetMap) + condições de uso;  map.js: componente (toque, pinça, zona poligonal com vértices arrastáveis)
firebase-config.js  configuração do app web (apiKey VAZIA até você preencher)   firebase-adapter.js  SDK 10.14.1 do Firebase (só carrega com apiKey)
services.js      TODA gravação (demo em memória ou Firestore em transações) · auth.js  login/logout/recuperar senha/sessão · views-setup.js  dados iniciais de teste (admin)
firestore.rules  regras de segurança PROPOSTAS (para você revisar/publicar)   fake-firebase.js  backend SIMULADO só para testes
ui.js  views.js  views-entry.js  views-ops.js  views-map.js  views-amb.js  views-admin.js  app.js    interface
unit.test.js  unit-fluxo.test.js  unit-firebase.test.js  rules-lint.test.js  e2e.js  e2e-fluxo.js  e2e-firebase.js  run-all.js  helpers.js  qr-verificacao.py  tile-simulado.png  tile-simulado-LEIA-ME.txt   testes
ARQUITETURA-FUNCIONAL.md  DECISOES-PENDENTES.md  TESTES.md  STATUS-DO-PROJETO.md  LEIA-ME.md  FIREBASE.md      documentação
make-zip.sh      gera o ZIP de entrega
```
**Todos os arquivos precisam ficar juntos na mesma pasta** (o `index.html` os carrega pelo nome).

## Executar os testes
```
node unit.test.js && node unit-fluxo.test.js && node unit-firebase.test.js && node rules-lint.test.js   # Node, sem dependências
node e2e.js && node e2e-fluxo.js && node e2e-firebase.js                 # navegador (Playwright + Chromium; Python+OpenCV opcional p/ ler o QR)
node run-all.js                                  # tudo
```
## Gerar um ZIP atualizado
`sh make-zip.sh [destino.zip]` → uma única pasta `coopmetro-xpt` com todos os arquivos, sem subpastas.

## Limitações conhecidas
- **Firebase real NÃO foi testado**: o ambiente de desenvolvimento não alcança o Firebase nem o Emulator Suite. Toda a camada Firebase foi testada contra um **backend simulado** (`fake-firebase.js`) e as regras só passaram por **análise estática**. Veja `TESTES.md` ("Simulado × real") e `FIREBASE.md` ("Como validar de verdade").
- **Mapa real NÃO foi validado aqui** (proxy bloqueia o servidor de ladrilhos); testes usam ladrilhos sintéticos. O OSM público é para uso leve; para produção use provedor próprio (`map-config.js`).
- Leitura por **câmera não** implementada. Leitor USB/Bluetooth (modo teclado) por digitação/Enter, sem hardware real. Sem Android real.
- Dados: carga inicial lê todos os pacotes das bases do usuário (adequado para o teste; milhares de pacotes pedem paginação). Atualização entre aparelhos: botão "Atualizar dados" (sem tempo real). Histórico do pacote fica no próprio documento; eventos imutáveis também vão para `env/teste/events`.
- Matriz de perfis, estados e regras de devolução continuam **propostas não aprovadas** (`DECISOES-PENDENTES.md`).
- Sem Cloud Functions (plano Spark): as regras do Firestore + transações são a proteção; um cliente adulterado ainda é contido pelas regras, mas invariantes que as regras não conseguem expressar (ex.: numeração `OP-nnnn` exata) dependem da transação do cliente.
