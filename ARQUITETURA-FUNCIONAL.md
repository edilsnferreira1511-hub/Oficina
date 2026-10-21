# Arquitetura funcional (protótipo V1)

## Camadas
- **Lógica pura** (`data`, `packages`, `alerts`, `codes`, `geo`, `operations`, `permissions`, `audit`, `reports`, `store`): sem DOM, testável em Node, funções não alteram os argumentos.
- **Interface** (`ui`, `views*`, `map`, `app`): constrói o DOM com `ui.el()` (nós de texto, sem `innerHTML`); CSP estrita sem inline e `connect-src 'none'`.
- Namespace global `window.CXPT`; cada módulo também exporta via `module.exports` para os testes em Node.

## Modelo de dados
- **Pacote:** `id, code, xptId (origem permanente), size, reasonId, entryAt (entrada do ciclo atual), firstEntryAt, state, cycle, returns, location, note, history[]`.
- **Localização:** `kind ∈ {marcada, aproximada, desconhecida, pendente}`, `lat/lng` (6 casas, validados −90..90/−180..180), `regionId` (só se escolhido), `markedAt`. "desconhecida"/"pendente" nunca têm coordenadas; região nunca é deduzida das coordenadas.
- **Evento:** `id, code, xptId, type (entrada|mudanca_estado|retorno|correcao), at, from, to, operator, note`. Estado atual fica no pacote; histórico é só-anexar.
- **Operação:** `id, xptId, responsible, driverId, packageIds, state, createdAt, groupLabel, regionId`.
- **Índice global de códigos:** `check(code, xptId) → livre | nesta_xpt | outra_xpt` (só um rótulo; mensagem genérica, sem nomear base/localização). Na versão real ficará só no backend.

## Estados e transições (propostas, pendentes D-04; apenas demonstrativas)
`em_estoque→{em_separacao, divergente, aguardando_devolucao}` · `em_separacao→{em_estoque, em_rota, divergente}` · `em_rota→{entregue, em_estoque (RETORNO), divergente}` · `aguardando_devolucao→{devolvido, em_estoque}` · `divergente→{em_estoque, aguardando_devolucao}` · `entregue` e `devolvido` são finais. Retorno de rota: `cycle+1`, `returns+1`, `entryAt` reinicia (novo ciclo de permanência). Correção exige motivo e gera evento; `xptId` e `code` não mudam.

## Alertas (calculados ao abrir a tela)
Permanência = `agora − entryAt > limite` (padrão 4 dias, configurável 1–60) só para pacotes no galpão; data inválida/futura não alerta (listada à parte). 3º retorno = atenção; 4º+ = avaliar devolução (só exibição, nunca automática).

## Fluxos
- **Entrada:** código → normaliza/valida → tamanho → motivo → (observação) → localização (mapa só se houver provedor; senão aproximada/desconhecida/pendente) → rascunho local. Cada item tem a própria localização. Leitura repetida e duplicidade (própria base, outra base) são barradas sem revelar dados de outra base. Confirmar entrada real: bloqueado.
- **Conferência:** por operação e XPT; "X de Y"; repetida não conta; código de outra operação/inexistente/inválido é rejeitado; remover leitura; não altera pacotes; confirmar saída: bloqueado.
- **Mapa/Regiões:** consome `draft.geoPoints()` da XPT escolhida; marcadores diferenciados (marcado × aproximado); sem coordenadas ficam em lista separada e **não são selecionáveis**; seleção múltipla + contagem + desfazer + seleção por área (retângulo); a seleção é reconciliada com o rascunho (pacote removido sai da seleção). Grupo = **rascunho visual**; criar operação bloqueado.

## Isolamento por XPT
Rascunhos, grupos e conferências ficam em mapas por `xptId`; listas filtram por XPT; detalhe de pacote de outra base não é revelado; trocar de XPT não mistura pontos nem seleções.

## Preparação para o backend
Funções puras mapeiam 1:1 para regras de servidor (validação de código/coordenadas, transições, índice global, alertas). Autorização real, índice global, confirmações de entrada/saída, auditoria e provedor de mapas dependem do backend e de decisões pendentes.
