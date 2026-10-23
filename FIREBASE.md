# FIREBASE — configuração, primeiro administrador, regras e validação

Projeto: `coopmetro-xpt` · Firestore `(default)` em `southamerica-east1` · app web "Coopmetro" · Auth por e-mail/senha · Hosting já associado (**não alterado**).
Dados de teste ficam **só** em `env/teste/...` (isolamento por caminho; nada fora dele é lido/escrito pelo app e as regras negam o resto). Não foi feita nenhuma migração, limpeza ou exclusão. Sem Cloud Functions, sem cobrança, sem mudança de plano.

## Ações suas (o que eu não podia fazer)
1. **Colar a `apiKey`** em `firebase-config.js` (Console → Configurações do projeto → Seus apps → "Coopmetro" → Configuração do SDK). Não foi informada e **não foi inventada**. Ela identifica o app e não é segredo; a proteção é Auth + regras. Não coloque senhas, contas de serviço nem tokens no código.
2. **Autenticação**: confirme que *Authentication → Sign-in method → E-mail/senha* está ativo e que o domínio onde você abrir o sistema está em *Authentication → Settings → Authorized domains* (`localhost` e `coopmetro-xpt.firebaseapp.com` já costumam estar).
3. **Criar o 1º administrador** (sem senha embutida no código):
   a. Console → Authentication → Users → *Add user* (e-mail + senha forte escolhidos por você). Copie o **UID**.
   b. Console → Firestore → *Iniciar coleção* `env` → documento `teste` (pode estar vazio) → coleção `users` → documento com **ID = o UID** e campos: `name` (texto), `email` (texto), `role` = `admin_sistema`, `xptIds` = array vazio, `active` = `true` (booleano), `driverId` = null.
   c. Entre no sistema com esse usuário: abre em **Configuração inicial** → botão que cria XPTs/regiões/motoristas/configurações de TESTE (só o que não existe; nunca sobrescreve).
   d. Demais usuários: crie em Authentication e depois o documento `env/teste/users/{uid}` com `role` (`administrador`, `coord_geral`, `supervisor`, `coord_base`, `despacho`, `motorista`), `xptIds` (ex.: `["x1"]`; perfis globais não precisam), `active: true` (`driverId` para motorista). O próprio usuário **não consegue** alterar o seu perfil (regras).
4. **Regras** (`firestore.rules`): revise, **mescle** com as regras que o projeto já tem (as minhas só cobrem `env/teste`; todo o resto fica negado — se algo mais usa o Firestore, não substitua às cegas) e publique em Firestore → Regras. Teste antes no **Simulador de regras** do Console. Não executei estas regras em Emulator (sem acesso); o Console acusa erro de sintaxe ao publicar, se houver.
5. **Abrir por `http(s)`** (GitHub Pages, Firebase Hosting por você, ou `python3 -m http.server`): `file://` não serve para mapa nem para Auth.
6. A CSP do `index.html` já permite `www.gstatic.com` (SDK) e `*.googleapis.com` / `*.firebaseio.com` (Auth e Firestore). Se o console do navegador mostrar bloqueio de outro host, acrescente-o em `index.html`.

## Arquitetura
- `firebase-adapter.js` carrega o SDK modular 10.14.1 (gstatic) **somente** com `apiKey`; expõe `window.CXPT_FB` (auth + db). Sem Analytics, sem popup, sem Functions.
- `services.js` é o único ponto de gravação. Remoto: cada operação roda **dentro de uma transação** (leituras antes das escritas, dados frescos, nova tentativa em conflito), executa as **mesmas funções puras** dos testes unitários e só depois de confirmada atualiza o cache e a tela ("salvo" nunca aparece antes). Falha/sem permissão/sem rede ⇒ nada muda e a mensagem diz isso.
- `auth.js`: login, sair, recuperar senha (resposta genérica), expiração de sessão (volta ao login com aviso), perfil carregado de `env/teste/users/{uid}` (inexistente/inativo ⇒ bloqueio com instrução). Telas internas escondidas sem login.
- Coleções (`env/teste/`): `users`, `xpts`, `regions`, `drivers`, `settings/main`, `packages/pk-{CÓDIGO}`, `codes/{CÓDIGO}` (índice global; garante que um código nunca vira dois pacotes, inclusive entre bases), `operations/OP-nnnn`, `counters/operations`, `events` (trilha imutável: só criar).
- Pacote: documento com localização (lat/lng reais ou `pendente` sem coordenadas), `activeOpId` (trava: um pacote só em uma operação ativa, validada na transação **e** nas regras) e `history` (só cresce; regra compara o prefixo). Operação: `packageIds`/`packageCodes`, `checked`, `departed`, `history`; encerrada ⇒ regras recusam qualquer alteração (bloqueia o QR). Nada é apagado; correções são novos eventos.
- QR: `<url>#/separation/OP-nnnn` (só o identificador; não autentica). Em outro aparelho: login → carrega a operação gravada → se pertence às suas bases, abre a bipagem.

## Perfis × regras (proposta D-06, **não aprovada**; `permissions.js` == `firestore.rules`, conferido por `rules-lint.test.js`)
ver base: administrador, coord_geral, supervisor, coord_base, despacho · entrada: despacho · conferir: supervisor, coord_base, despacho · criar operação/corrigir: administrador, supervisor, coord_base · confirmar saída/devolução: supervisor, coord_base (devolução) · encerrar: administrador, supervisor · usuários: admin_sistema · config: admin_sistema, administrador. Perfis globais (administrador, coord_geral) veem todas as bases; demais só as de `xptIds`. Motorista lê só operações com o seu `driverId` (não lê pacotes). Se mudar a matriz, mude os dois arquivos.

## Como testar o mapa e as zonas
Mapa e Regiões → *Afastar* se quiser → **Desenhar zona** → toque 3+ pontos → **Finalizar desenho** → arraste/setas nos pontos para ajustar (Delete remove um ponto) → o contador mostra dentro/fora/disponíveis/em operação ativa → *Retirar* tira um pacote da revisão → **Cancelar / apagar zona** limpa. Pacotes sem coordenadas ficam à parte; linhas cruzadas são recusadas.

## Como testar ambulâncias e QR
Despacho registra entradas (marcando e **confirmando** a localização) → Coordenador de base seleciona (zona ou manual) → nome/responsável → revisão com data/hora/estado/operador → criar → QR → abra o endereço do QR em outro aparelho/aba com login → bipar (cinza→verde; repetido/desconhecido/de outra operação só avisam) → Coordenador confirma saída (só conferidos) → Supervisor encerra (pendentes voltam ao estoque com evento; QR deixa de aceitar leituras).

## Como validar de verdade (o que eu não pude)
1. Publique as regras no Console e use o **Simulador de regras** com cada perfil (casos em `TESTES.md`).
2. Ou instale o Firebase Emulator Suite (Java + `firebase-tools`) no seu computador, use um projeto como `demo-coopmetro-xpt` e rode contra ele.
3. Faça o roteiro manual acima no navegador com 2 usuários. Se algo falhar, o console do navegador (F12) mostra o código do erro (`permission-denied`, `auth/...`).
