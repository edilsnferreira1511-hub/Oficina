# STATUS DO PROJETO — COOPMETRO XPT V1 (atualizado)

**Pasta:** `/home/claude/coopmetro-xpt-flat/` · **ZIP:** `/mnt/attach/outputs/COOPMETRO-XPT-V1-ATUALIZADO.zip` (uma pasta, sem subpastas)

## Implementado (em memória)
Mapa na Entrada corrigido (causa: nenhum provedor configurado → agora OpenStreetMap + CSP + atribuição + estados de erro; toque, pinça, zoom) · confirmar localização · confirmar entrada local · reentrada sem duplicar · planejamento com pontos reutilizados, região desenhada, revisão · criar ambulância · QR Code · página de separação com bipagem · confirmar saída · encerrar · histórico · permissões por perfil (demonstrativas) · isolamento por XPT.

## Testado
Unitários 52 + 21; navegador 598 + 106 (Chromium; celular emulado). Detalhes e limites em `TESTES.md`.

## Pendente / bloqueado
Validar o **mapa real** em aparelho/hospedagem (sem rede aqui) e aprovar o provedor (D-10) · backend (persistência, QR entre aparelhos, permissões reais, índice global) · câmera · Android real · polígono livre · regras D-03/D-04/D-05/D-20.

## Continuidade
`node run-all.js` deve passar. Gere o ZIP com `sh make-zip.sh` ao fim de cada sessão.
