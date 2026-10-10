// Rutas, lectura del conjunto de viajeros y escritura de corridas.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { esquemaJSON, preguntasJev, promptSistemaLLM, textoEstado } from '../../shared/preguntas.js'

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

// Las variables FRONTERA_* existen para las pruebas automáticas (carpeta temporal y
// conjunto de viajeros fijo). En uso normal no hace falta tocarlas.
export function rutaViajeros() {
  return process.env.FRONTERA_VIAJEROS ? resolve(process.env.FRONTERA_VIAJEROS) : join(RAIZ, 'data', 'viajeros.json')
}

export function carpetaRuns() {
  return process.env.FRONTERA_RUNS_DIR ? resolve(process.env.FRONTERA_RUNS_DIR) : join(RAIZ, 'public', 'runs')
}

// Se lee del disco en cada ejecución (el conjunto puede cambiar entre corridas).
export function cargarViajeros(ruta = rutaViajeros()) {
  let datos
  try {
    datos = JSON.parse(readFileSync(ruta, 'utf8'))
  } catch (e) {
    throw new Error(`No pude leer el conjunto de viajeros (${ruta}): ${e.message}`)
  }
  const viajeros = datos?.viajeros
  if (!Array.isArray(viajeros) || viajeros.length === 0) {
    throw new Error(`El archivo ${ruta} no tiene una lista "viajeros" con datos.`)
  }
  const ids = new Set()
  for (const v of viajeros) {
    if (!v?.id || !v.documento || !v.verdad) throw new Error(`Viajero sin id, documento o verdad en ${ruta}: ${JSON.stringify(v).slice(0, 200)}`)
    if (ids.has(v.id)) throw new Error(`Id de viajero repetido en ${ruta}: ${v.id}`)
    ids.add(v.id)
  }
  return viajeros
}

// Huella corta del texto que recibe la IA. Sirve para no mezclar, al continuar una corrida,
// resultados de un viajero cuyo contenido cambió en data/viajeros.json.
export function huellaViajero(viajero) {
  return createHash('sha256').update(textoEstado(viajero)).digest('hex').slice(0, 12)
}

// Huella de todo lo demás que reciben las IAs: prompt de sistema y esquema (GPT y Opus) y
// preguntas (Jev). --continuar se niega a mezclar resultados si cambió.
export function huellaPrompt() {
  const texto = JSON.stringify([promptSistemaLLM(), esquemaJSON(), preguntasJev()])
  return createHash('sha256').update(texto).digest('hex').slice(0, 12)
}

// Commit del código con el que se corre (para que cualquiera pueda reproducir la corrida).
// cambiosSinCommit: true si hay archivos versionados modificados en la-frontera/.
export function commitActual() {
  const git = (...args) => spawnSync('git', args, { cwd: RAIZ, encoding: 'utf8' })
  const head = git('rev-parse', 'HEAD')
  if (head.error || head.status !== 0) return { commit: null, cambiosSinCommit: null }
  const estado = git('status', '--porcelain', '--untracked-files=no', '--', '.')
  return {
    commit: head.stdout.trim(),
    cambiosSinCommit: estado.status === 0 ? estado.stdout.trim().length > 0 : null,
  }
}

// Estimación de tokens cuando la API no los informa: caracteres / 4, con 1,5 de margen por la
// tokenización del español (la misma que usa la estimación previa de costo de bench/run.mjs).
// Se prefiere sobreestimar: subestimar el costo de un proveedor sería un sesgo a su favor.
export const MARGEN_ESTIMACION = 1.5
export function estimarTokens(caracteres) {
  return Math.ceil((caracteres / 4) * MARGEN_ESTIMACION)
}

// 2026-10-10_18-05-09 (UTC), apto para nombre de archivo y para el parámetro ?run= de la app.
export function marcaFechaArchivo(fecha = new Date()) {
  return fecha.toISOString().slice(0, 19).replace('T', '_').replaceAll(':', '-')
}

export function leerJSON(ruta) {
  return JSON.parse(readFileSync(ruta, 'utf8'))
}

// Escritura atómica: primero un temporal y luego rename (la app nunca lee un archivo a medias).
export function escribirJSON(ruta, datos) {
  mkdirSync(dirname(ruta), { recursive: true })
  const tmp = `${ruta}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(datos, null, 2)}\n`)
  renameSync(tmp, ruta)
}

export function existe(ruta) {
  return existsSync(ruta)
}

// Costo redondeado a 1e-10 USD para evitar ruido de coma flotante en el JSON.
export function redondearCosto(x) {
  return Math.round(x * 1e10) / 1e10
}
