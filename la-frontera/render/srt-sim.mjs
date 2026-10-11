#!/usr/bin/env node
// Subtítulos de la composición "simulación": out/subtitulos-simulacion.srt a partir de las frases de
// sim/voz.json (tiempos exactos de la voz grabada). Líneas de ~40 caracteres, máximo 2 por subtítulo.
// Las mismas frases se dibujan en el video con --subtitulos (src/sim/EscenaSim.jsx).
//
// Uso: node render/srt-sim.mjs   (también lo genera `node render/render.mjs --composicion sim`)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cuesSubtitulos, textoSRT } from '../shared/simulacion-video.js'
import { CARPETA_OUT, RAIZ, rel } from './comun.mjs'

export const RUTA_SRT_SIM = join(CARPETA_OUT, 'subtitulos-simulacion.srt')

export function leerVoz() {
  return JSON.parse(readFileSync(join(RAIZ, 'sim', 'voz.json'), 'utf8'))
}

// Devuelve el texto .srt de las frases de la voz.
export function srtSimulacion(voz = leerVoz()) {
  return textoSRT(cuesSubtitulos(voz.frases, { maxCar: 40, maxLineas: 2 }))
}

export function escribirSrtSimulacion(ruta = RUTA_SRT_SIM) {
  const voz = leerVoz()
  const cues = cuesSubtitulos(voz.frases, { maxCar: 40, maxLineas: 2 })
  mkdirSync(CARPETA_OUT, { recursive: true })
  writeFileSync(ruta, textoSRT(cues))
  return { ruta, cues: cues.length }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = escribirSrtSimulacion()
  console.log(`Listo: ${rel(r.ruta)} (${r.cues} subtítulos).`)
}
