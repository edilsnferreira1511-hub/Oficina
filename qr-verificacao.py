#!/usr/bin/env python3
"""Decodifica a imagem de um QR Code com o decodificador do OpenCV e compara com o texto esperado.
Uso: python3 qr-verificacao.py imagem.png "texto esperado"
Saída: OK | FALHA <lido> | INDISPONIVEL (sem OpenCV). Código de saída: 0 = OK, 1 = falha, 2 = indisponível.
Serve para provar que o QR gerado por qr.js é realmente legível (não apenas "parece" um QR)."""
import sys
try:
    import cv2
except Exception:
    print("INDISPONIVEL")
    sys.exit(2)
img = cv2.imread(sys.argv[1])
if img is None:
    print("FALHA imagem ilegível")
    sys.exit(1)
img = cv2.copyMakeBorder(img, 40, 40, 40, 40, cv2.BORDER_CONSTANT, value=(255, 255, 255))
# Dois decodificadores independentes do OpenCV: o detector clássico às vezes falha em QRs válidos pequenos
# (medido: 28 de 720 imagens), enquanto o baseado em ArUco leu 720 de 720. Basta UM decodificar o texto exato.
val = ""
for make in ("QRCodeDetectorAruco", "QRCodeDetector"):
    if hasattr(cv2, make):
        val, _, _ = getattr(cv2, make)().detectAndDecode(img)
        if val == sys.argv[2]:
            break
if val == sys.argv[2]:
    print("OK")
    sys.exit(0)
print("FALHA " + repr(val))
sys.exit(1)
