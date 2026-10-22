# Testes — resultados reais

## Ambiente
Node v22.22.0 · Playwright 1.56.1 · Chromium (/opt/pw-browsers, headless) · OpenCV 5.0.0 (só para decodificar o QR) · Linux. Somente Chromium; celular **emulado** (390 px, toque), não aparelho real.

## Última execução (após as correções)
| Tipo | Comando | Resultado |
|---|---|---|
| Unitário | `node unit.test.js` | **52 aprovados, 0 reprovados** |
| Unitário (fluxo) | `node unit-fluxo.test.js` | **21 aprovados, 0 reprovados** |
| Navegador | `node e2e.js` (`file://` e `http://`) | **598 aprovados, 0 reprovados** |
| Navegador (fluxo completo, toque) | `node e2e-fluxo.js` | **106 aprovados, 0 reprovados** |
Todos reexecutados também na **cópia extraída do ZIP** (ver STATUS). Testes **manuais**: nenhum foi feito por pessoa; nada foi testado em Android real.

## Cobertura dos 16 itens exigidos
1 mapa na entrada · 2 interação em tela pequena (toque, pinça por CDP, alvos ≥ 44 px, sem rolagem horizontal) · 3 marcar/ajustar/confirmar coordenadas · 4 mapa indisponível (file://, sem rede/ladrilhos recusados) · 5 entrada e consulta (reentrada sem duplicar) · 6 reutilização da localização salva · 7 seleção por região desenhada · 8 criação da ambulância · 9 QR gerado, decodificado por leitor real (OpenCV) e aberto · 10 bipagem correta · 11 repetido sem contar · 12 desconhecido/inválido sem alterar · 13 pacote de outra operação · 14 encerramento bloqueia conferência · 15 pendentes preservados · 16 permissões e base XPT.
Sensibilidade (mutação manual): 5 defeitos nas regras novas (pacote em 2 operações; repetido contando; saída levando não conferidos; conferência após encerrar; pacote de outra base) → todos reprovaram ≥ 1 teste; código restaurado.

## Simulado × real
- **Ladrilhos:** nos testes de navegador as requisições a `tile.openstreetmap.org` são **interceptadas** e respondidas com imagem sintética (`tile-simulado.png`). Isso valida o componente, **não** o mapa real. **Cartografia real: não validada** (sem acesso de rede ao provedor neste ambiente).
- **QR:** a imagem gerada foi lida por um decodificador independente (OpenCV) e devolveu exatamente o endereço da operação.
- **Não testado:** câmera (não implementada), leitor físico, Android real, outros navegadores, GitHub Pages, desempenho com milhares de pacotes.

## Observações
- **Falha intermitente observada:** o teste "4. ladrilhos recusados/sem rede" reprovou 2 vezes em ~14 execuções de `e2e-fluxo.js` e passou nas demais (6 seguidas, e 25 repetições isoladas, sem falha); causa não identificada. O teste agora imprime o estado da tela se voltar a falhar.
- Expectativas alteradas por mudança de requisito (não por conveniência): "Ponto marcado" → "Localização confirmada"; entrada/saída/criação de operação deixam de ser "bloqueadas" e passam a funcionar **em memória** com permissão; tamanho "Grande" → "Grande / volumoso".
