# Decisões pendentes (nada abaixo foi aprovado)

| Id | Tema | Situação no protótipo |
|---|---|---|
| D-03 | Reentrada de código já existente na própria base (evento/ciclo) | Apenas barrada com mensagem; sem regra implementada |
| D-04 | Estados oficiais e transições permitidas | Proposta demonstrativa em `packages.js` |
| D-05 | Fluxo de devolução ao remetente e critérios | Apenas sinalização (3º/4º retorno); nada automático |
| D-06 | Matriz de permissões detalhada; Administrador × Administrador do sistema | Matriz proposta em `permissions.js`, só visual |
| D-07 | Confirmação real de entrada e saída; prevenção de saída duplicada | Confirmação **local em memória** com permissão (sem backend); a real depende de D-07 |
| D-08 | Origem diferente da base do usuário; transferência entre XPTs | Origem permanente; sem transferência |
| D-09 | Limites por XPT (alerta × bloqueio) | Não implementado |
| D-10 | Provedor de mapas, atribuição, política de segurança (CSP `img-src`) | **OpenStreetMap configurado provisoriamente** (uso leve; exige Referer → http(s); atribuição exibida; CSP libera só `tile.openstreetmap.org`). **Não aprovado para produção**: política de uso em https://operations.osmfoundation.org/policies/tiles/ ; avaliar provedor próprio/pago |
| D-11 | Geocodificação e roteamento (otimização de rotas) | Não implementado; nada prometido |
| D-12 | Formato oficial das etiquetas/códigos | Regra provisória (A–Z, 0–9, `.`, `_`, `-`, ≤ 64) |
| D-13 | Leitura por câmera (biblioteca) e leitores físicos | Câmera não implementada; leitor só por teclado, sem teste com hardware |
| D-14 | Definição de motorista/agregado e autenticação | Lista demonstrativa; sem login |
| D-15 | Relatórios e seção financeira | Relatórios demonstrativos; financeiro não habilitado |
| D-16 | LGPD: retenção e acesso a dados pessoais | Sem dados pessoais reais |
| D-17 | Alertas automáticos/operações privilegiadas no plano Spark | Alertas só ao abrir a tela |
| D-18 | Motivos e tamanhos oficiais | Valores provisórios em `data.js` |
| D-19 | Semântica de "sem localização" (desconhecida × pendente) | Ambas contam no alerta "sem localização" |
| — | Nomes de tamanho ("Grande" × "volumoso") | Mantido "Pequeno/Médio/Grande" |
| — | Identidade visual oficial | Logotipo enviado usado; paleta aproximada |
| D-20 | Pacote não conferido ao confirmar a saída | Volta ao estoque com evento, listado nas pendências da operação (hipótese a aprovar) |
| D-21 | Pacote sem coordenadas em ambulância | Só por inclusão manual explícita; nunca automático |
| D-22 | QR Code entre aparelhos | Só funciona no mesmo navegador (memória); exige backend |
| D-23 | Reentrada de código existente (evento/ciclo por estado) | Evento registrado sem duplicar; retorno de rota inicia novo ciclo (proposta) |

- **D-24 (novo, proposta)** Zona de ambulância = polígono livre desenhado sobre o mapa; só pacotes com coordenadas confirmadas e elegíveis entram. Aprovar/ajustar.
- **D-25 (novo, proposta)** Firebase: dados de teste em `env/teste` do projeto `coopmetro-xpt` (sem projeto separado); histórico embutido no pacote + trilha `events` imutável; id do pacote = `pk-CÓDIGO`; sem Cloud Functions. Aprovar ou criar projeto de teste separado.
- **D-26 (novo)** Regras do Firestore propostas (`firestore.rules`) espelham a matriz D-06; precisam de revisão e teste no Simulador/Emulator antes de publicar.
- **D-27 (novo)** "Uma ambulância por motorista": hoje verificada nos dados carregados no aparelho (demo e Firebase). Para garantir no servidor contra criações simultâneas seria preciso um documento-trava por motorista com regras próprias (não feito; exige revisão das regras).
- **D-28 (novo)** Leitura por câmera nas telas Separar e Bipar pacote (o modelo Rota Certa usa biblioteca externa); depende de aprovar a biblioteca e a política de segurança (CSP).
- **D-29 (novo)** Paleta de 8 cores de ambulância e o limite de 8 ambulâncias ativas distintas por base antes de repetir cor (a repetição é permitida; nome da ambulância sempre aparece).
