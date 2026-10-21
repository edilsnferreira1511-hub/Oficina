# COOPMETRO XPT — protótipo local V1 (demonstração)

> **AMBIENTE DE DEMONSTRAÇÃO — dados fictícios, sem gravação no sistema real.**
> Não há backend, login real, Firebase, Mercado Livre nem serviços externos. Tudo vive na memória da página e é perdido ao recarregar.

## Como abrir
- **Mais simples:** abra `index.html` no navegador (duplo clique). Funciona via `file://`.
- **Servidor local (opcional):** `python3 -m http.server 8765` dentro desta pasta e abra `http://127.0.0.1:8765/`.
- Requisitos: um navegador atual com JavaScript. Nenhuma instalação, nenhuma internet.

## Telas (menu)
Visão Geral · Mapa e Regiões · Operações (+ detalhe) · Pacotes (+ detalhe) · Entrada de Pacotes · Saída e Conferência · Alertas e Devoluções · Relatórios · Motoristas · XPT/Galpões · Ajuda e configurações.

## Estrutura (pasta única, sem subpastas — pronta para enviar ao GitHub)
```
index.html  styles.css  logo-coopmetro.jpg      casca (CSP estrita), tema claro/escuro, logotipo enviado pelo proprietário
data.js          dados demonstrativos determinísticos + configuração (tamanhos, motivos, estados)
packages.js      estados, transições demonstrativas, correção com motivo, filtros, paginação (puro)
alerts.js        permanência > limite, retornos, divergências (puro, calculado ao abrir)
codes.js         normalização/validação de códigos, índice global, rascunho de entrada (puro)
geo.js           validação de coordenadas/localização, Web Mercator, seleção por área (puro)
operations.js    operações, conferência (X de Y) e rascunho de grupo geográfico (puro)
permissions.js   perfis e matriz PROPOSTA (não é segurança)
audit.js         registro de auditoria em memória (somente anexar)
reports.js       agregações e CSV demonstrativo
store.js         estado em memória por XPT (rascunhos, grupos, conferências)
map-config.js    configuração do provedor de mapas (hoje: nenhum → mapa indisponível)
map.js           componente de mapa por ladrilhos (só funciona com provedor configurado)
ui.js, views.js, views-entry.js, views-ops.js, views-map.js, views-admin.js, app.js   componentes, telas, roteador
unit.test.js, e2e.js, run-all.js, helpers.js, tile-simulado.png, tile-simulado-LEIA-ME.txt   testes e fixture simulada
ARQUITETURA-FUNCIONAL.md  DECISOES-PENDENTES.md  TESTES.md  STATUS-DO-PROJETO.md  LEIA-ME.md   documentação
make-zip.sh      gera o ZIP de entrega
```
**Importante:** todos os arquivos precisam ficar juntos na mesma pasta (o `index.html` os carrega pelo nome).

## Executar os testes
```
node unit.test.js        # unitários (Node, sem dependências)
node e2e.js              # navegador (requer Playwright + Chromium; ver TESTES.md)
node run-all.js          # tudo
```
O e2e procura o Playwright em `/opt/node22/lib/node_modules/playwright` ou no módulo `playwright` instalado.

## Gerar um ZIP atualizado
`sh make-zip.sh` (cria `COOPMETRO-XPT-V1.zip` ao lado da pasta; o ZIP contém uma única pasta com todos os arquivos, sem subpastas; exclui capturas, caches e dependências).

## Limitações conhecidas
- **Sem persistência** (nem localStorage/cookies): recarregar volta aos dados demonstrativos.
- **Mapa:** nenhum provedor foi aprovado (D-10) → a tela mostra "mapa indisponível" e **não desenha grade/imagem**. Seleção, detalhes e grupo preliminar funcionam pela lista. Os testes do mapa usam ladrilhos **simulados** (imagem sintética) — **nenhuma validação com cartografia real foi feita**.
- Leitura por câmera **não** implementada (sem biblioteca local aprovada). Leitores USB/Bluetooth em modo teclado são suportados na digitação (Enter/Tab), mas **não foram testados com hardware real**.
- Confirmação real de entrada, saída e criação de operações está **bloqueada** (exige backend e decisões de negócio).
- Seletor de perfil é só demonstração, **não oferece segurança**.
- Formato oficial dos códigos de etiqueta é desconhecido: a regra (A–Z, 0–9, ponto, sublinhado, hífen, até 64) é **provisória**.
- Testado apenas no Chromium.
