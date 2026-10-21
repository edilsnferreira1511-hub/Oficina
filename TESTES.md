# Testes — resultados reais

## Ambiente
Node v22.22.0 · Playwright 1.56.1 · Chromium (/opt/pw-browsers/chromium-1194, headless) · Linux. Somente Chromium foi usado.

## Comandos executados e resultados (última execução, após as correções)
| Comando | Resultado |
|---|---|
| `node unit.test.js` | **52 aprovados, 0 reprovados** |
| `node e2e.js` | **594 aprovados, 0 reprovados** (executa em `file://` e em `http://127.0.0.1`) |
| `node run-all.js` na **cópia extraída do ZIP** | unitários 52/0 e e2e 594/0 — todas passaram |

## O que é coberto
- **Unitários:** dados determinísticos; estados/transições; ciclo e retorno; histórico; correção com motivo (XPT de origem imutável); limite de 4 dias (exatamente 4 não alerta); datas inválidas; saída encerra alerta; 3º/4º retorno; códigos (normalização, validação, índice global sem vazar outra base); coordenadas e localização por classificação; Web Mercator; seleção por área; rascunho de entrada (duplicidade, leitura repetida, localização por item, remoção/correção, isolamento por XPT, sem alterar dados); conferência (esperado, outra operação, inexistente, repetido, remoção, sem saída real); grupo geográfico (só com coordenadas, consistente após remoção, isolado por XPT, não persiste); filtros e paginação; permissões; auditoria.
- **Navegador:** navegação das 11 telas em 320/360/390/768/1024/1280 px (título, sem rolagem horizontal, sem erro de montagem); nomes acessíveis em campos e botões; botões bloqueados com motivo visível; entrada (fluxo, bloqueios, duplicidade sem nomear outra XPT, trocar XPT separa rascunho, recarregar descarta, nenhum armazenamento do navegador); mapa indisponível sem desenhar mapa; Mapa/Regiões (somente pontos da XPT, ponto ↔ código correto, seleção múltipla/desfazer, sem coordenadas não selecionável, atualização após mudar o rascunho, seleção consistente após remoção, nenhuma carga de outra XPT, dados demonstrativos intactos, nada persistido); conferência; pacotes/detalhe; limite configurável; tema escuro; relatórios; ajuda; perfil motorista; ausência de requisições externas, de erros JS e de requisições falhas.
- **Sensibilidade (mutação manual, só unitários):** 4 defeitos introduzidos de propósito (`geoPoints` incluindo itens sem coordenadas; limite `>=` em vez de `>`; retorno sem incrementar ciclo; "desconhecida" aceitando coordenadas) → cada um reprovou 1 teste; código restaurado e suítes verdes novamente.

## Simulado × real
- Testes marcados **[simulado]** usam `tile-simulado.png`, imagem **sintética** (não é cartografia), injetada em `CXPT_MAP.tiles` só nos testes. Validam o **componente** (marcar, zoom, arrastar, marcadores).
- **Nenhuma validação com cartografia real foi feita**: não há provedor aprovado (D-10) nem acesso de rede.
- **Não testado:** leitor USB/Bluetooth físico, câmera, outros navegadores, aparelhos Android reais, desempenho com milhares de linhas.

## Correções feitas nesta rodada (e por quê)
- Marcadores próximos se sobrepunham e o clique no primeiro era interceptado: o mapa agora **se ajusta aos pontos depois de medido/redimensionado** e os marcadores são menores; adicionado teste de não sobreposição.
- Botões do mapa (zoom/marcadores) não recebiam clique por causa da captura de ponteiro no contêiner: a captura agora ignora cliques em botões.
- Troca de tela com o campo de código focado gerava erro JS (`blur` reconstruía o DOM): tratamento adiado e protegido por `isConnected`.
- Lista de itens sem coordenadas não expunha `data-code`; detalhe de pacote não aceitava o código na URL (só o id).
- Teste "dados demonstrativos intactos" comparava com um instantâneo de outra carga da página (relógio diferente): a referência agora é o mesmo gerador determinístico ancorado no relógio da página. A expectativa anterior estava errada; o comportamento verificado (nada é alterado) é o mesmo.
