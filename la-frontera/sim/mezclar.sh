#!/usr/bin/env bash
# Mezcla la voz (audio/voz-clara.wav) con la música (audio/musica.wav) -> audio/mezcla.m4a
# - La música baja sola mientras hay voz (sidechain) y vuelve suave en las pausas.
# - Se le recorta un poco de 2.5 kHz a la música para dejar espacio a la presencia de la voz.
# - Volumen final: -14 LUFS integrados, pico real <= -1 dBTP (estándar de redes), en dos pasadas.
# Uso: bash sim/mezclar.sh   (antes: bash sim/limpiar-voz.sh <grabacion> y python3 sim/musica.py)
set -euo pipefail
cd "$(dirname "$0")/.."
MUSICA_DB="${MUSICA_DB:--7}"
RATIO="${RATIO:-7}"
GRAFO="[0:a]aformat=channel_layouts=mono,asplit=2[v][vsc];\
[1:a]volume=${MUSICA_DB}dB,highpass=f=45,equalizer=f=2500:t=q:w=1.0:g=-3[mus];\
[mus][vsc]sidechaincompress=threshold=0.02:ratio=${RATIO}:attack=20:release=300:makeup=1[md];\
[v]pan=stereo|c0=c0|c1=c0[vs];\
[vs][md]amix=inputs=2:normalize=0[mix]"

# Pasada 1: medir.
MEDIDA=$(ffmpeg -hide_banner -i audio/voz-clara.wav -i audio/musica.wav -filter_complex "$GRAFO;[mix]loudnorm=I=-14:TP=-1:LRA=11:print_format=json[o]" -map "[o]" -f null - 2>&1 | sed -n '/^{/,/^}/p')
leer() { echo "$MEDIDA" | python3 -c "import json,sys;print(json.load(sys.stdin)['$1'])"; }
# Pasada 2: aplicar de forma lineal (sin "bombeo").
ffmpeg -loglevel error -y -i audio/voz-clara.wav -i audio/musica.wav -filter_complex \
  "$GRAFO;[mix]loudnorm=I=-14:TP=-1:LRA=11:measured_I=$(leer input_i):measured_TP=$(leer input_tp):measured_LRA=$(leer input_lra):measured_thresh=$(leer input_thresh):offset=$(leer target_offset):linear=true,alimiter=limit=0.85:attack=3:release=60:level=disabled[o]" \
  -map "[o]" -ar 48000 -c:a aac -b:a 192k -t 93 audio/mezcla.m4a
echo "Listo: audio/mezcla.m4a"
