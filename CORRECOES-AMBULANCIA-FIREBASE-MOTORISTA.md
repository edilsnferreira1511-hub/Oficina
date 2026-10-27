# Correções: criação de ambulância por zona, Firebase e acesso do motorista

Versão: `COOPMETRO-XPT-TESTE-FIREBASE-CORRIGIDO`. Tudo abaixo foi testado **contra o backend SIMULADO** (`fake-firebase.js`) e no navegador (Chromium). **Nada foi executado contra o Firebase real**: este ambiente não tem acesso de rede ao projeto Firebase (a `apiKey` foi informada depois, na versão final).

## 1. Causa investigada da falha "desenhei a zona e não consegui criar a ambulância"
Reproduzi o fluxo no navegador com toque real (celular). **Não encontrei um erro funcional** que impedisse a criação quando há pacotes elegíveis, motorista livre e permissão. Encontrei causas de UX e de dados que, somadas, produzem exatamente o sintoma:
- O botão de criar ficava a milhares de pixels abaixo do mapa no celular e **desabilitado sem explicação** (sem zona fechada, sem pacote elegível, com rascunho selecionado ou **sem motorista livre**).
- As mensagens de erro apareciam longe do botão (junto ao mapa); a falha de gravação ficava invisível.
- **Com o Firestore real vazio não existe nenhum motorista** e o motorista é obrigatório → a criação ficava sempre bloqueada, e não havia tela para cadastrar motorista.
- Zona sem pacotes elegíveis (sem coordenadas, ou já em operação ativa) não explicava o motivo.
- Riscos reais do Firestore, tratados: limite de 500 gravações por transação (ambulância = 2 por pacote + operação + contador + histórico → **máximo 200 pacotes por ambulância**, com mensagem clara); limite de 20 acessos a documentos pelas regras (entradas gravadas em lotes de 15); lista de motoristas desatualizada (agora recarregada antes de criar).

## 2. Correções implementadas
- Botões **Desenhar zona** / **Desenhar círculo**; painel **Criar ambulância** com lista `#amb-why` do que falta (nenhum pacote, rascunho, sem motorista, acima de 200).
- Zona sem pacote elegível: explica o motivo (sem coordenadas / já em operação ativa / rascunho) e **nunca cria operação vazia**.
- Criar: mostra "Gravando…" e só mostra QR depois da confirmação do servidor. Em erro (validação, permissão, rede, conflito) a **mensagem real aparece junto ao botão**, com "Nada foi criado", e os pacotes continuam livres (testado com falha injetada).
- Pacotes sem coordenadas ficam fora da seleção geográfica e são contados à parte; pacotes em outra operação ativa são excluídos (travados na transação **e** nas regras).
- **Administração** (admin_sistema): *Diagnóstico da conexão*, *Cadastrar motorista* e *Vincular usuário* (create-only: nunca sobrescreve, nunca altera o próprio perfil).

## 3. Estado da conexão Firebase
| Item | Estado |
|---|---|
| SDK modular 10.14.1, inicialização, Auth e-mail/senha, Firestore em `env/producao/` | **Implementado** (`firebase-adapter.js`) |
| `apiKey` em `firebase-config.js` | **Preenchida** com o valor que você enviou do Console (também `appId` e `measurementId` atualizados). |
| Auth e-mail/senha ativado e domínio autorizado | **Não verificável daqui**. O login mostra mensagem específica se faltar (`operation-not-allowed`, `unauthorized-domain`, `invalid-api-key`…). |
| Regras publicadas | **Não publiquei nada.** Revise e publique `firestore.rules` (mescle com regras existentes). Não executei em Emulator. |
| Primeiro admin_sistema | Criar no Console (ver `FIREBASE.md`). |
| Teste real de leitura/escrita/persistência/outro aparelho | **Não realizado.** Depois de configurar, abra *Administração → Diagnóstico*: ele faz leituras reais e rotula **FIREBASE REAL** × **BACKEND SIMULADO**. |
Rótulos: sem `apiKey` = modo **demonstração** (dados em memória); com `apiKey` = banner "AMBIENTE DE TESTE · FIREBASE REAL"; testes automatizados = "BACKEND SIMULADO (não é o Firebase real)". Nenhum deploy, Hosting, mudança de plano, exclusão ou sobrescrita foi feito.

## 4. Matriz de permissões (perfis preservados; proposta D-06, não aprovada)
| Ação | admin_sistema | administrador | coord_geral | supervisor | coord_base | despacho | motorista |
|---|---|---|---|---|---|---|---|
| Ver base/pacotes | – | ✓ | ✓ | ✓ | ✓ | ✓ | **não** |
| Indicadores globais | – | ✓ | ✓ | – | – | – | – |
| Entrada de pacotes | – | – | – | – | – | ✓ | – |
| Criar ambulância/zona | – | ✓ | – | ✓ | ✓ | – | – |
| Conferir (qualquer operação da base) | – | – | – | ✓ | ✓ | ✓ | – |
| **Bipar a PRÓPRIA ambulância** | – | – | – | – | – | – | ✓ |
| Confirmar saída | – | – | – | ✓ | ✓ | – | – |
| Encerrar operação | – | ✓ | – | ✓ | – | – | – |
| Devolução / correção | – | corr. | – | ✓ | ✓ | – | – |
| Usuários/bases (criar, editar, excluir acesso) | ✓ | – | – | – | – | – | – |
| Configurações / motoristas | ✓ | ✓ | – | – | – | – | – |
Ninguém altera o próprio perfil. O motorista **precisa** ter `driverId` e `xptIds` (a base) no seu documento `users/{uid}`.

## 5. Motorista: acesso exclusivo via QR
- O QR (`#/separation/OP-nnnn`) só identifica a operação; **não autentica**. É preciso login; o servidor confere perfil `motorista`, ativo, `driverId` igual ao da operação, base e operação ativa.
- Interface reduzida: sem menus de despacho; qualquer rota (`#/map`, `#/entry`, `#/exit`, `#/packages`…) volta para a bipagem. QR de outra ambulância → "Acesso negado" sem dados.
- Vê: nome/número da ambulância, próprio nome, id da operação, códigos, contadores (previstos/conferidos/pendentes), campo de bip e resultado. O **mapa-resumo não é exibido** ao motorista (requer ler pacotes, que as regras negam) — pendência consciente.
- Bip: próprio → verde; repetido → avisa sem duplicar; desconhecido → aviso sem gravar; de outra operação → conflito sem revelar dados; operação encerrada → bloqueado (interface e regras).
- Regras: motorista **não** lê pacotes, usuários, regiões, outros motoristas nem outras operações; **não** cria/encerra/confirma saída; só acrescenta leituras (`checked`/`history`) de códigos da própria operação. A confirmação administrativa de saída continua com perfis autorizados.
- Limite conhecido (D-27): a trava "um motorista = uma ambulância ativa" é validada no cliente/serviço, não nas regras.

## 6. Testes executados (todos contra backend SIMULADO; nenhum contra o Firebase real)
unit 52 · unit-fluxo 30 · unit-firebase 22 · rules-lint 12 (análise estática, não executa regras) · e2e 598 · e2e-fluxo 173 · e2e-firebase 79 — **0 falhas**.
Cobertura dos 23 itens pedidos: criação (zona desenhada/finalizada, dentro/fora, sem coordenadas, pacotes em operação ativa, criar com motorista+responsável, persistir, QR correto, falha de gravação sem falso sucesso — `e2e-fluxo`, `e2e-firebase`, `unit-fluxo`, `unit-firebase`); motorista (abre a própria, negado em outra, sem painel, sem criar, sem sair/encerrar, sem ler pacotes, encerrada bloqueia, repetido não duplica — `e2e-firebase`, `unit-firebase`, `rules-lint`); Firebase (login+perfil, leitura/escrita, persistência após recarregar, recuperação em outro aparelho, rejeição de escrita não autorizada — **simulados**). Itens "Firebase real" ficam **pendentes** até você configurar a `apiKey`.

## 7. O que depende de você
1. (feito) `apiKey`; 2. conferir Auth e-mail/senha e domínio autorizado; 3. criar o 1º `admin_sistema` e o documento `users/{uid}`; 4. publicar/mesclar `firestore.rules`; 5. usar *Administração* (dados de teste, motoristas, vínculo de usuários); 6. testar com 2 aparelhos e o Simulador de regras do Console. Passo a passo em `FIREBASE.md`.

## 8. Primeiro acesso real (relato do usuário)
Com a `apiKey`, o login real funcionou e o perfil foi lido, mas a carga inicial foi recusada pelas regras ("Não foi possível carregar"). Causa provável: o administrador do sistema tentava ler operações/pacotes por base, o que as regras não permitem a esse perfil. Correção: o `admin_sistema` agora carrega só cadastros (bases, regiões, motoristas, configurações), e a mensagem de erro informa em qual coleção a leitura foi recusada. Se persistir, confira `role`, `active: true` (booleano) e `xptIds` do seu documento `env/producao/users/{UID}` e se as regras foram publicadas.

## 9. Administrador do sistema (atualização)
- `admin_sistema` agora tem **acesso a todas as telas** (entrada, mapa, ambulâncias, separar, saída, encerrar, motoristas, bases, relatórios), vê todas as bases e é a única conta que administra usuários e bases. Linha fixa: não pode ser editada nem tirar acesso dele mesmo.
- **Administração** (só admin_sistema): *Bases* (criar/editar nome e ativa), *Usuários* (listar, **editar** nome/perfil/bases/ativo/driverId, **excluir o acesso**), *Vincular usuário*, *Cadastrar motorista*, *Diagnóstico*, *Dados iniciais* e **Permissões por perfil** (matriz editável).
- Excluir usuário remove o **perfil** (`env/producao/users/{uid}`): a pessoa perde o acesso. O login em Authentication permanece (apague no Console se quiser). Ninguém exclui/edita o próprio perfil. Registros históricos nunca são apagados.
- **Matriz editável**: salva em `env/producao/settings/permissions` e **aplicada pelas regras do Firestore** (não só na tela). Só admin_sistema grava. Editáveis: ver base, entrada, conferir, criar ambulância, corrigir, confirmar saída, encerrar, devolução, configurações — para administrador, coord_geral, supervisor, coord_base e despacho. Fixos: motorista (só a própria bipagem), visão global e administração de usuários. Sem o documento valem os padrões.
- **Regras mudaram: publique de novo o `firestore.rules`.** Testado só no backend simulado + análise estática (rules-lint); não executado no Emulator nem no Firebase real.

## 10. Mapa: informações do pacote e filtro (atualização)
Abaixo do mapa (Mapa e Regiões): caixinha **"Ver informações do pacote ao tocar nele"** — ao tocar num pacote mostra ID (código), tamanho e data de entrada (com dias no galpão); nesse modo o toque não seleciona. **"Mostrar no mapa"**: Todos / Só Pequeno / Só Médio / Só Grande-volumoso / Só os mais antigos (com mínimo de dias, padrão = limite de permanência). Os pacotes fora do filtro somem do mapa e da lista, saem da seleção e não entram em "Selecionar todos" nem em zona/círculo. Testes: `e2e-fluxo` (bloco 7a). Rascunhos de entrada ainda não têm data de entrada (aparecem como "ainda não confirmada" e não passam no filtro de antigos).

## 11. Versão para uso real (atualização)
- Dados em **`env/producao`** (`dataPath` em `firebase-config.js`); os dados de teste em `env/teste` ficam intactos e sem uso. As regras novas cobrem só `env/producao`.
- Sem faixa "ambiente de teste/demonstração", sem textos "fictício", "protótipo", "em memória" nas telas do uso real. O **modo demonstração** (sem `apiKey`) continua existindo só quando a chave está vazia.
- Começa **zerado**: a tela *Administração* oferece "Criar base inicial" — cria **uma** base ("XPT Principal", renomeável) e as configurações padrão. Nenhum motorista, região, pacote ou ambulância fictícios.
- Motoristas, limite de dias e motivos agora gravam no Firestore (antes eram só em memória); a tela *Motoristas* tem cadastro real.
- **Primeiro acesso:** criar o seu usuário no Authentication (pode ser o mesmo) e o documento `env/producao/users/{UID}` (`role: admin_sistema`, `active: true`, `xptIds: []`, `name`, `email`, `driverId: null`) e publicar as regras novas.

## 12. Motorista entra direto pelo QR, sem login (atualização)
- **Como funciona:** cada ambulância criada recebe um **código secreto** aleatório de 128 bits (`token` na operação). O QR passa a ser `#/separation/{OP}/{código}`. O celular do motorista abre o endereço, entra com **login anônimo** do Firebase (sem e-mail/senha), grava o próprio `claims/{uid}` = `{opId, token}` e o servidor só libera a operação cujo código confere.
- **O que o QR permite (regras):** ler **aquela** operação (`get`, nunca lista) e acrescentar leituras (`checked`/`history`) de códigos que pertencem a ela, com eventos de auditoria. **Não** permite: pacotes, usuários, configurações, motoristas, outras operações, confirmar saída, encerrar, trocar o código. Operação encerrada bloqueia a bipagem (a leitura continua).
- **Tela:** menu só com "Minha ambulância"; qualquer outra rota volta para ela; recarregar o link do QR mantém a ambulância; abrir o site SEM o QR encerra a sessão anônima e mostra o login normal (equipe nunca é jogada na ambulância). Nome do motorista vem gravado na operação (`driverName`).
- **Você precisa:** (1) Console → Authentication → Sign-in method → **ativar "Anônimo"**; (2) **publicar as regras novas** (`firestore.rules.txt`); (3) subir o ZIP novo. Ambulâncias criadas **antes** desta versão não têm código: crie de novo (ou use o motorista com login).
- **Cuidados:** quem tem o QR consegue bipar naquela ambulância; mostre-o só ao motorista. Para invalidar, encerre a operação. Os logins anônimos ficam na lista do Authentication (podem ser apagados depois).
- **Correção pós-teste real:** o Firebase real exige que a função da transação devolva uma Promise (o simulador agora também exige). Corrigido em `claimAccess`.
- **Testes:** 29 unit-firebase (3 novos: acesso, recusas, encerrada), 14 lint de regras (1 novo), e2e-firebase 122 (celular novo sem sessão: abre o QR, bipa, outras rotas, recarga, código errado). Nada foi testado contra o Firebase real nem o Emulator das regras.
