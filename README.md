# WKK Oficina — agora ligado ao Firebase de verdade

O app deixou de usar `localStorage`. Hoje ele lê e grava no **Firestore** (dados), no **Storage**
(fotos) e usa o **Firebase Auth** para sessão — tudo sincronizado entre aparelhos em tempo real.

Arquivos: `index.html`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`, `firebase-config.js`
(app/PWA) + `firestore.rules`, `storage.rules`, `index.js`, `package.json`, `firebase.json` (backend).
Tudo na mesma pasta, sem subpastas — é assim que o `firebase.json` já espera.

## Como funciona o login
O teclado de PIN de 6 dígitos continua igual, mas por baixo agora é uma sessão real do Firebase:
o app manda o PIN pra uma Cloud Function (`signInWithPin`), ela confere o **hash** do PIN no
Firestore e devolve um token de acesso. O PIN em si nunca é salvo em texto puro em lugar nenhum —
só o hash. Por isso a tela de "Editar usuário" não mostra mais o PIN atual: só dá pra definir um novo.

Não existe usuário pré-cadastrado. No primeiro acesso, abra o app e toque em
**"Primeiro acesso? Criar administrador"** na tela de login — isso só funciona uma vez (enquanto
não existir nenhum usuário no Firestore). Depois disso, o próprio admin cria os demais logins
(recepção, financeiro, mecânicos, clientes) pela tela **Usuários**.

## Passo a passo do deploy
1. **CLI e projeto** — `npm i -g firebase-tools`, `firebase login`, `firebase use ofina-6119d`
   (o `firebase-config.js` já está preenchido com esse projeto).
2. **Authentication** — abra a aba Authentication no console pelo menos uma vez para ativá-la.
   Não precisa ligar nenhum provedor (nem e-mail/senha, nem Google): o login por PIN usa "token
   customizado", que já funciona por padrão.
3. **Firestore** — crie o banco (região **southamerica-east1**, mesma dos Functions) e rode
   `firebase deploy --only firestore:rules`.
4. **Storage** — ative o Storage (exige plano **Blaze**) e rode `firebase deploy --only storage`.
5. **Functions** — plano Blaze. Na pasta do projeto: `npm install`.
6. **Segredos e parâmetros das Functions**:
   - `firebase functions:secrets:set ANTHROPIC_API_KEY` (sem essa chave, o Assistente WKK responde
     em modo demonstração, mas o resto do app funciona normalmente).
   - Configure `BASE_URL` com a URL final do site (ex.: `https://ofina-6119d.web.app`, ou seu
     domínio próprio) — é o link que vai no WhatsApp do orçamento. Pode definir em
     `functions/.env.ofina-6119d`: `BASE_URL=https://ofina-6119d.web.app`.
   - `AI_MODEL` é opcional (padrão já definido).
7. **Deploy geral** — `firebase deploy` (hosting, regras do Firestore/Storage e Functions juntos).
8. **Primeiro acesso** — abra a URL publicada, crie o administrador (veja acima), e cadastre os
   demais usuários pela tela Usuários.
9. **PWA** — no Chrome do celular, "Instalar WKK Oficina"; no iPhone, Safari > Compartilhar >
   Adicionar à Tela de Início. Quem já tinha instalado antes desta atualização deve abrir o app
   com internet uma vez para baixar a nova versão (o cache foi renovado, `sw.js` v2).

## Como os dados estão organizados
- `users/{uid}`: nome, papel (admin/recepcao/financeiro/mecanico/cliente), hash do PIN, ativo.
- `customers/{id}` e `vehicles/{id}`: cadastro de clientes e veículos (evita duplicar dados a cada OS;
  o autopreenchimento por CPF/placa na Nova Entrada consulta essas coleções).
- `workOrders/{osNumber}`: a OS em si (status, veículo, diagnóstico, fotos, checklist). O número da
  OS é reservado de forma atômica (transação no Firestore), então nunca se repete mesmo criando de
  dois aparelhos ao mesmo tempo.
- `budgets/{osNumber}`: o orçamento daquela OS (mesmo número/ID da OS) — é essa coleção que as
  Functions `sendBudget`, `decideBudget` e `getBudgetByToken` (já prontas) usam para gerar o link
  público de aprovação e processar a decisão do cliente.
- Pagamentos e o histórico de alterações continuam **dentro** do próprio documento da OS (como já
  era), em vez de virar coleções `payments`/`auditLogs` separadas — simplifica bastante e sincroniza
  igual. As regras dessas duas coleções continuam no `firestore.rules` (usadas pelas Functions que já
  gravam auditoria automaticamente), só não são alimentadas pelo app.

## Ajustes feitos nas regras (`firestore.rules`) para bater com o app
- Toda a equipe (não só admin) pode **ler** a lista de usuários — necessário pra recepção montar o
  seletor de mecânico e pro mecânico ver a lista de colegas.
- O mecânico responsável por uma OS pode ler/editar o **orçamento** dela enquanto ainda estiver em
  rascunho ou recusado (pra poder adicionar serviços e peças) — antes só admin/financeiro tinham
  acesso a orçamentos.
- Adicionadas as coleções `counters` (numeração sequencial das OS) e `security` (bloqueio de
  tentativas de PIN, só usada pelas Functions).

## O que mudou de comportamento
- **Excluir OS**: as regras já bloqueavam exclusão de OS por segurança/auditoria — isso agora é
  respeitado de verdade. O botão "Excluir OS" virou "marcar como CANCELADO".
- **PIN**: nunca mais fica visível depois de criado (só o hash é guardado).
- **Assistente WKK**: agora chama a IA de verdade (Cloud Function `askAssistant`), não é mais uma
  resposta fixa de demonstração.
- **Link de aprovação**: o botão de WhatsApp agora manda também um link `/aprovar?t=...` — o cliente
  aprova ou recusa sem precisar instalar nada ou fazer login.

## Ainda falta (se quiser evoluir depois)
Fotos do cliente por URL assinada (hoje o link de Storage já exige estar logado como equipe — o
cliente vê fotos só dentro do app, na própria sessão dele), emissão fiscal, e um limite de tentativas
de PIN mais robusto (hoje já bloqueia 30s após 5 erros, mas é por IP — dá pra evoluir).
