#!/usr/bin/env bash
# Mejora una grabación de voz para el video: recorta, ecualiza y normaliza.
# Uso: bash sim/limpiar-voz.sh <grabacion.m4a> [inicio_s] [duracion_s]
# Sin reducción de ruido: la grabación tiene un piso de ruido muy bajo (~ -73 dB) y el filtro
# de ruido la dejaba "ahogada". La ecualización quita barro (~320 Hz), da presencia (2.6–4.8 kHz)
# y devuelve el brillo que la grabación no tenía (>7 kHz).
set -euo pipefail
ENTRADA="$1"; INICIO="${2:-3.0}"; DURACION="${3:-91.4}"
cd "$(dirname "$0")/.."
mkdir -p audio
CADENA="highpass=f=90:poles=2,equalizer=f=170:t=q:w=1.0:g=-1.5,equalizer=f=320:t=q:w=1.1:g=-4,equalizer=f=650:t=q:w=1.2:g=-1,equalizer=f=2600:t=q:w=1.0:g=2,equalizer=f=4800:t=q:w=0.9:g=5,highshelf=f=7500:g=4,aexciter=amount=1:drive=4:blend=0:freq=4000:ceil=14000,deesser=i=0.4:m=0.5:f=0.5,acompressor=threshold=-22dB:ratio=3:attack=6:release=90:makeup=2,loudnorm=I=-16:TP=-1.5:LRA=9,apad=pad_dur=1.6,afade=t=in:d=0.12"
ffmpeg -loglevel error -y -ss "$INICIO" -t "$DURACION" -i "$ENTRADA" -ac 1 -ar 48000 -af "$CADENA" audio/voz-clara.wav
echo "Listo: audio/voz-clara.wav"
