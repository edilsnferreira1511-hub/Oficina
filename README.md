# WKK Oficina — pacote Firebase

Todos os arquivos ficam na mesma pasta, sem subpastas. App e PWA: `index.html`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`, `firebase-config.js`. Backend: `firestore.rules`, `storage.rules`, `index.js` (Functions de IA, envio e aprovação de orçamento), `package.json`, `firebase.json`.
Para publicar só o app (por exemplo no GitHub Pages), envie `index.html`, `manifest.json`, `sw.js` e os dois ícones.
Estado: o app em `index.html` ainda usa dados locais (demonstração). Regras e Functions estão prontas, mas ainda não foram implantadas nem testadas.

## Passo a passo
1. **Projeto e Firebase config** — crie um projeto em console.firebase.google.com, adicione um app Web e cole a configuração em `firebase-config.js`. Instale a CLI: `npm i -g firebase-tools`, depois `firebase login` e `firebase use --add`.
2. **Authentication** — ative "E-mail/senha". Crie o primeiro usuário no console e, no Firestore, crie o documento `users/{uid}` com `{ name: "Seu nome", role: "admin" }`. Perfis: admin, recepcao, financeiro, mecanico, cliente.
3. **Firestore** — crie o banco (região southamerica-east1) e rode `firebase deploy --only firestore:rules`.
4. **Storage** — ative o Storage (exige plano Blaze) e rode `firebase deploy --only storage`.
5. **Functions** — plano Blaze; `npm install` (na própria pasta dos arquivos).
6. **API da IA** — `firebase functions:secrets:set ANTHROPIC_API_KEY`. Em `functions/.env.SEU-PROJETO` defina `BASE_URL=https://SEU-PROJETO.web.app` e, se quiser, `AI_MODEL`. Sem a chave, o assistente responde em modo demonstração.
7. **Deploy** — `firebase deploy` (hosting, regras e functions).
8. **PWA** — abra a URL no Chrome do celular e toque em "Instalar WKK Oficina". No iPhone: Safari > Compartilhar > Adicionar à Tela de Início. Os ícones `icon-192.png` e `icon-512.png` são provisórios; troque pelos com o logo oficial.

## Campos que as regras e as Functions esperam
- `workOrders`: `mechanicUid`, `customerUid`, `status`, `complaint`, `diagnosis`, `vehicleLabel`, `year`, `km`
- `budgets`: `workOrderId`, `customerUid`, `osNumber`, `items[{type,desc,qty,unitCents}]`, `discountCents`, `status` (rascunho/enviado/aprovado/recusado)
- Coleções ligadas à OS (`workOrderServices`, `checklists`, `vehiclePhotos`, `servicePhotos`): `workOrderId` (e `customerUid` nas fotos que o cliente pode ver)
- Valores sempre em centavos; o total é recalculado no servidor.

## Ainda falta
Ligar o app ao Firestore/Storage/Auth (hoje usa localStorage), tela pública `/aprovar?t=...`, fotos para o cliente via URL assinada, emissão fiscal.
