# WKK Oficina — versão BETA

PIN conferido dentro do próprio app (lista de usuários vem do Firestore). Só usa **Hosting + Firestore** (plano gratuito, sem Functions nem Storage).

## Publicar (Google Cloud Shell, pelo celular)
1. Envie o zip para o Cloud Shell e rode: `unzip -o wkk-oficina-beta.zip -d wkk && cd wkk`
2. `firebase login --no-localhost` → abra o link, autorize e cole o **código longo** que aparecer (não o ID da sessão).
3. `firebase use ofina-6119d`
4. `firebase deploy --only hosting,firestore:rules`

(Alternativa para as regras: Console do Firebase → Firestore → Regras → colar o conteúdo de `firestore.rules` → Publicar.)

## Primeiro acesso
Se ainda não existe nenhum usuário, a tela de login mostra **Criar administrador** (nome + PIN de 6 números). Depois, em **Usuários**, crie os demais logins.

## Atenção (beta)
- As regras do Firestore estão **abertas** e os PINs ficam em texto no banco: quem tiver o link consegue ler/gravar tudo.
- Fotos ficam no Firestore (reduzidas, ~480px).
- Antes de usar com clientes reais: revisar segurança (PIN, regras, login, limites).
