# STATUS DO PROJETO — COOPMETRO XPT TESTE-FIREBASE

**Pasta:** `/home/claude/coopmetro-xpt-flat/` · **ZIP:** `/mnt/attach/outputs/COOPMETRO-XPT-TESTE-FIREBASE-CORRIGIDO.zip` (uma pasta, sem subpastas)

## Implementado
1. **Entrada**: removidas as 4 opções de localização; bipar → mapa → marcar → reposicionar → **Confirmar localização**; só confirmada vira localização; sem ela o pacote segue "sem localização confirmada" (sem coordenadas inventadas); localização salva é mostrada nas consultas.
2. **Zona poligonal** no mapa real (desenhar/finalizar/desfazer/apagar/cancelar, vértices arrastáveis e por teclado, linhas cruzadas recusadas), contagem dentro/fora/disponíveis/bloqueados, seleção automática de pacotes elegíveis (coordenadas reais, base do usuário, fora de operação ativa), sem localização à parte, retirar individualmente, recálculo ao ajustar. Seleção manual mantida.
3. **Ambulância** com resumo (pacotes, data/hora, estado, operador autenticado), id único sequencial, QR único, trava de "um pacote, uma operação ativa" (transação + regras).
4. **Separação/saída/encerramento** como antes, agora **gravados** (modo Firebase).
5. **Firebase**: login real, recuperação de senha, sessão expirada, perfil/bases do Firestore, telas bloqueadas sem login, serviços com transações, isolamento em `env/teste`, `firestore.rules`, dados iniciais de teste (admin), modo demonstração preservado sem `apiKey`.

6. **Estrutura Rota Certa** (design COOPMETRO mantido): seleção por **círculo** e polígono, painel de criação de ambulância abaixo do mapa, **ambulância por motorista** (obrigatório, uma ativa por motorista) com **cor**, tela **Separar** (leitor + resultado colorido) e tela **Bipar pacote** do motorista (verde/vermelho/âmbar). Regras do Firestore **não mudaram** (cor e motorista são campos da operação criada).

## Testado (ver TESTES.md)
52 + 30 + 19 + 10 unitários/estáticos; 598 + 153 + 52 em navegador (Chromium). **Firebase real, Emulator e regras publicadas: não testados.**

## Depende de você (FIREBASE.md)
`apiKey` · habilitar e-mail/senha e domínios · criar o 1º administrador (UID + documento `users`) · rodar "Configuração inicial" · revisar/mesclar/publicar as regras e testar no Simulador · validar mapa real e Firebase no seu navegador · aprovar a matriz de perfis (D-06) e os demais itens de `DECISOES-PENDENTES.md`.

## Não feito (por restrição ou limite)
Deploy, Hosting, plano/cobrança, Cloud Functions, migrações/limpezas, uso do projeto real além de `env/teste` (e nem isso foi gravado daqui) · câmera (leitura por câmera nas telas Separar/Bipar) · trava no servidor de "um motorista, uma ambulância" · paginação para milhares de pacotes · tempo real entre aparelhos.


## Atualização (versão CORRIGIDO)
Criação de ambulância por zona com erros visíveis, diagnóstico de conexão, cadastro de motorista/vínculo de usuário e motorista restrito à própria bipagem (interface + regras). Firebase real: **ainda não conectado** (apiKey vazia). Detalhes em `CORRECOES-AMBULANCIA-FIREBASE-MOTORISTA.md`.
