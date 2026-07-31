#!/bin/bash
# Banco di prova affidabile: apre un .shortcut e dice se Comandi Rapidi lo legge.
#
# Il crash avviene alla LETTURA del plist, prima di qualunque clic, quindi
# "nessun crash report nuovo" = plist accettato.
#
# NB: i crash report vengono scritti con ritardo. Contarli e basta produce un
# off-by-one (il crash del test N finisce nel conteggio del test N+1). Qui si
# usa un marcatore temporale e si attende abbastanza.
FILE="$1"
CARTELLA=~/Library/Logs/DiagnosticReports

killall Shortcuts 2>/dev/null
sleep 1
MARCATORE=/tmp/.marcatore_prova
touch "$MARCATORE"
sleep 1

open "$FILE" 2>/dev/null
sleep 9
killall Shortcuts 2>/dev/null
sleep 2

NUOVI=$(find "$CARTELLA" -name "Shortcuts*.ips" -newer "$MARCATORE" 2>/dev/null | wc -l | tr -d ' ')
if [ "$NUOVI" -gt 0 ]; then
  echo "✗ CRASH  $(basename "$FILE")"
  exit 1
else
  echo "✓ ok     $(basename "$FILE")"
  exit 0
fi
