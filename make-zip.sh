#!/bin/sh
# Gera o ZIP de entrega: UMA pasta (coopmetro-xpt) com todos os arquivos dentro, sem subpastas.
# Uso: sh make-zip.sh [destino.zip]   (padrão: ../COOPMETRO-XPT-TESTE-FIREBASE-CORRIGIDO.zip)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$HERE/../COOPMETRO-XPT-TESTE-FIREBASE-CORRIGIDO.zip}"
case "$OUT" in /*) ;; *) OUT="$(pwd)/$OUT" ;; esac
TMP="$(mktemp -d)"; mkdir "$TMP/coopmetro-xpt"
for f in "$HERE"/*; do [ -f "$f" ] && case "$f" in *.zip|*.log) ;; *) cp "$f" "$TMP/coopmetro-xpt/";; esac; done
rm -f "$OUT"; (cd "$TMP" && zip -r "$OUT" coopmetro-xpt >/dev/null); rm -rf "$TMP"
echo "ZIP criado: $OUT"
