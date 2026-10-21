# STATUS DO PROJETO — COOPMETRO XPT V1 (protótipo local)

**Pasta do projeto:** `/home/claude/coopmetro-xpt-flat/`
**ZIP mais recente:** `/mnt/attach/outputs/COOPMETRO-XPT-V1.zip` (uma pasta única com todos os arquivos, sem subpastas)

## Implementado (todas as telas navegáveis, dados fictícios em memória)
Visão Geral · Mapa e Regiões (consome o rascunho de Entrada; seleção múltipla, desfazer, seleção por área, grupo preliminar visual) · Operações + detalhe · Pacotes + detalhe/histórico/transição demonstrativa · Entrada (rascunho, localização por item) · Saída e Conferência · Alertas e Devoluções · Relatórios (CSV demonstrativo) · Motoristas · XPT/Galpões · Ajuda/configurações. Tema claro/escuro, responsivo (320–1280 px).

## Testado (resultados reais em `TESTES.md`)
Unitários 52/52; navegador 594/594 (Chromium, `file://` e `http://`). Mapa: só com ladrilhos **simulados**.

## Bloqueado / não feito
Confirmação real de entrada/saída e criação de operações (backend + D-07); mapa real (D-10, sem provedor); câmera; geocodificação/rotas; autenticação e permissões reais; persistência; Firebase (não tocado); financeiro. Ver `DECISOES-PENDENTES.md`.

## Próximas etapas sugeridas
1. Decidir o provedor de mapas (D-10) e validar com cartografia real. 2. Aprovar estados/transições e devolução (D-04/D-05). 3. Backend com autenticação, regras de acesso por base, índice global e auditoria. 4. Testar leitor físico e aparelhos Android reais.

## Continuidade
Para retomar: abrir `index.html`, ler `LEIA-ME.md` e ``; `node run-all.js` deve passar. **Preserve os arquivos:** gere o ZIP com `sh make-zip.sh` ao fim de cada sessão.
