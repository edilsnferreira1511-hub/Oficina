# Testes — resultados reais

## Ambiente
Node v22.22.0 · Playwright 1.56.1 · Chromium (/opt/pw-browsers, headless) · OpenCV 5.0.0 (só para decodificar o QR) · Linux. Somente Chromium; celular **emulado** (390 px, toque), não aparelho real.

## Última execução
| Tipo | Arquivo | Resultado |
|---|---|---|
| Unitário | `unit.test.js` | **52 aprovados** |
| Unitário (entrada, ambulância, QR, **zona**) | `unit-fluxo.test.js` | **30 aprovados** |
| **Integração com backend SIMULADO** (serviços + transações + modelo das regras) | `unit-firebase.test.js` | **19 aprovados** |
| **Análise estática** das regras (texto) | `rules-lint.test.js` | **10 aprovados** |
| Navegador (`file://` e `http://`) | `e2e.js` | **598 aprovados** |
| Navegador, celular com toque (entrada nova, **zona**, ambulância, QR, saída) | `e2e-fluxo.js` | **153 aprovados** |
| Navegador, **modo Firebase com backend SIMULADO** | `e2e-firebase.js` | **52 aprovados** |
`node run-all.js` executa tudo. Nenhum teste foi feito por pessoa; nada em Android real.

Novos nesta versão: círculo (geo/summary/pixel), motorista obrigatório e livre, cores, Separar (cores, falhas, não grava), motorista (verde/vermelho/âmbar, servidor sem ler pacotes).

## Os 20 itens do pedido × onde são cobertos (e o que é simulado)
| # | Item | Teste | Natureza |
|---|---|---|---|
|1| Entrada sem as 4 opções antigas | e2e.js (sem `[id^=kind-]`), e2e-fluxo | navegador |
|2| Marcar e ajustar ponto | e2e-fluxo §3 | navegador (ladrilhos sintéticos) |
|3| Confirmação explícita (barrada sem confirmar) | e2e-fluxo §3 | navegador |
|4| Pacote sem localização confirmada | e2e-fluxo §3/§5, unit-firebase | navegador + simulado |
|5| Persistência/consulta das coordenadas | e2e-firebase (recarregar → consulta mostra localização), unit-firebase | **simulado** |
|6| Polígono: desenhar, editar (arrastar/teclado/Delete/desfazer), apagar, cruzado recusado | e2e-fluxo §7, unit-fluxo (geometria) | navegador + unitário |
|7| Pontos dentro/fora corretos | e2e-fluxo (conferido por geometria independente em pixels) + unit-fluxo (L côncavo) | navegador/unitário |
|8| Exclusão de pacotes em operação ativa | e2e-fluxo (após saída), unit-fluxo, unit-firebase | todos |
|9| Permissões e base XPT | unit-firebase (modelo das regras), e2e-firebase | **simulado** |
|10| Criar ambulância + QR | e2e-fluxo, e2e-firebase, unit-firebase | navegador + simulado; QR lido por OpenCV |
|11| Abrir operação pelo QR | e2e-firebase (nova aba, operação vinda do "servidor") | **simulado** |
|12| Bipagem cinza→verde | e2e-fluxo, e2e-firebase | idem |
|13| Código repetido | idem | idem |
|14| Desconhecido / de outra operação | e2e-fluxo, unit-firebase | idem |
|15| Encerramento + bloqueio | e2e-fluxo, e2e-firebase, unit-firebase (escrita direta recusada) | idem |
|16| Pendentes preservados | unit-fluxo, unit-firebase, e2e-fluxo | idem |
|17| Login/logout/recuperar senha/sessão expirada/telas bloqueadas | e2e-firebase, unit-firebase | **simulado** |
|18| Leitura e gravação no Firestore | unit-firebase, e2e-firebase | **simulado** (não é o Firestore real) |
|19| Regras por perfil | unit-firebase (modelo) + rules-lint (texto) | **não executadas no Emulator** |
|20| Recuperação após recarregar / outro aparelho / conflito | e2e-firebase, unit-firebase (2 aparelhos bipando juntos) | **simulado** |

Sensibilidade (mutação manual, revertida): no backend simulado — sem gravar `activeOpId`, sem checar prefixo do histórico, contador sem regra → testes reprovaram; nas regras novas anteriores: 5 defeitos detectados (ver histórico).

## Simulado × real
- **Firebase (Auth/Firestore): NÃO testado de verdade.** Sem acesso de rede ao Firebase nem ao Emulator Suite. `fake-firebase.js` simula login, Firestore em memória, transações (leituras antes das escritas, conflito com repetição) e um **modelo** das regras. Isso prova a lógica do cliente, não o servidor. **`firestore.rules` nunca foi executado** (só análise estática de texto + coerência com `permissions.js` e com o modelo); a sintaxe de recursos como o fatiamento `history[0:n]` e `existsAfter` deve ser confirmada ao publicar/simular no Console.
- **Adaptador real** (`firebase-adapter.js`): só testado o caminho de falha (SDK inacessível ⇒ tela de erro clara) e o modo sem apiKey (nenhuma requisição ao Google). O caminho com SDK de verdade **não foi exercitado**.
- **Ladrilhos:** nos testes de navegador as requisições a `tile.openstreetmap.org` são **interceptadas** e respondidas com imagem sintética (`tile-simulado.png`). Isso valida o componente, **não** o mapa real. **Cartografia real: não validada** (sem acesso de rede ao provedor neste ambiente).
- **QR:** a imagem gerada foi lida por um decodificador independente (OpenCV) e devolveu exatamente o endereço da operação.
- **Não testado:** câmera (não implementada), leitor físico, Android real, outros navegadores, GitHub Pages, desempenho com milhares de pacotes.

## Observações
- **Falhas intermitentes investigadas e corrigidas nesta versão:** (a) o aviso "mapa indisponível" podia ser substituído por um mapa novo quando um foco/blur recriava o mapa após a falha dos ladrilhos → agora a falha é lembrada (`mapFailed`); 6 execuções seguidas sem falha (antes ~2 em 14). (b) a pré-validação do código reconstruía os campos a cada blur, podendo reverter o valor digitado → agora só reconstrói quando os erros mudam; 8 execuções seguidas de `e2e.js` sem falha (antes 2 falhas em 6). Se voltarem, o teste imprime o estado da tela.
- Expectativas alteradas por mudança de requisito (não por conveniência): "Ponto marcado" → "Localização confirmada"; as 4 opções de tipo de localização foram removidas da Entrada (testes antigos que as marcavam agora só confirmam ou não o ponto); o seletor de região retangular foi substituído por zona poligonal; entrada/saída/criação de operação deixam de ser "bloqueadas" e passam a funcionar **em memória** com permissão; tamanho "Grande" → "Grande / volumoso".
