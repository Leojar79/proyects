// Utilidades compartidas por render/guion.mjs y render/render.mjs: rutas, lectura de la
// corrida (con la misma regla que la app: "latest" cae a "demo"), estadísticas y formato de tiempos.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { JUEGO } from '../shared/config.js'
import { calcularEstadisticas } from '../shared/juego.js'

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const CARPETA_RUNS = join(RAIZ, 'public', 'runs')
export const CARPETA_OUT = join(RAIZ, 'out')

const NOMBRE_VALIDO = /^[A-Za-z0-9_.-]+$/

export const rel = (ruta) => relative(process.cwd(), ruta) || ruta

export function salirConError(mensaje) {
  console.error(`\nERROR: ${mensaje}\n`)
  process.exit(1)
}

// Lee public/runs/<nombre>.json. 'latest' usa demo.json si todavía no hay corrida real.
// Devuelve { nombre, pedido, ruta, run, cayoADemo }.
export function cargarCorrida(pedido = 'latest') {
  const limpio = String(pedido).replace(/\.json$/i, '')
  if (!NOMBRE_VALIDO.test(limpio)) {
    throw new Error(`Nombre de corrida no válido: "${pedido}". Usa latest, demo o el nombre de un archivo de public/runs/ (sin .json).`)
  }
  const intentos = limpio === 'latest' ? ['latest', 'demo'] : [limpio]
  for (const nombre of intentos) {
    const ruta = join(CARPETA_RUNS, `${nombre}.json`)
    if (!existsSync(ruta)) continue
    let run
    try {
      run = JSON.parse(readFileSync(ruta, 'utf8'))
    } catch (e) {
      throw new Error(`No pude leer ${rel(ruta)}: ${e.message}`)
    }
    if (!Array.isArray(run?.viajeros) || !Array.isArray(run?.proveedores) || !run?.resultados) {
      throw new Error(`${rel(ruta)} no tiene "viajeros", "proveedores" y "resultados" (ver ARQUITECTURA.md).`)
    }
    return { nombre, pedido: limpio, ruta, run, cayoADemo: limpio === 'latest' && nombre !== 'latest' }
  }
  const buscados = intentos.map((n) => `public/runs/${n}.json`).join(' ni ')
  throw new Error(`No encontré ${buscados}. Genera una corrida con "npm run benchmark" (real) o "npm run demo" (demostración).`)
}

export function cargarViajeros() {
  const ruta = join(RAIZ, 'data', 'viajeros.json')
  return JSON.parse(readFileSync(ruta, 'utf8')).viajeros
}

export function estadisticasDe(run, viajeros = cargarViajeros()) {
  const porId = new Set(viajeros.map((v) => v.id))
  const faltan = run.viajeros.filter((id) => !porId.has(id))
  if (faltan.length) throw new Error(`La corrida usa viajeros que no están en data/viajeros.json: ${faltan.slice(0, 5).join(', ')}`)
  return calcularEstadisticas(run, viajeros, JUEGO)
}

// 14 -> "0:14", 19.7 -> "0:19.7", 75 -> "1:15"
export function tiempoCorto(s) {
  const t = Math.round(s * 10) / 10
  const min = Math.floor(t / 60)
  const seg = t - min * 60
  const entero = Math.floor(seg + 1e-9)
  const dec = Math.round((seg - entero) * 10)
  return `${min}:${String(entero).padStart(2, '0')}${dec ? `.${dec}` : ''}`
}

// 19.7 -> "00:00:19,700" (formato SRT)
export function tiempoSRT(s) {
  const ms = Math.max(0, Math.round(s * 1000))
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const seg = Math.floor((ms % 60000) / 1000)
  const mil = ms % 1000
  const dos = (x) => String(x).padStart(2, '0')
  return `${dos(h)}:${dos(m)}:${dos(seg)},${String(mil).padStart(3, '0')}`
}

// "2026-10-10T18:00:00.000Z" -> "10/10/2026"; "2026-10-06" -> "06/10/2026"
export function fechaCorta(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso ?? '—')
}

// Lectura simple de argumentos "--clave valor", "--clave=valor" y banderas.
// `spec`: { nombre: 'texto' | 'numero' | 'bandera' }.
export function parsearArgs(argv, spec) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i]
    let valor = null
    if (arg.startsWith('--') && arg.includes('=')) [arg, valor] = [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
    const clave = arg.replace(/^--/, '')
    if (!arg.startsWith('--') || !(clave in spec)) throw new Error(`Opción desconocida: ${argv[i]}`)
    const tipo = spec[clave]
    if (tipo === 'bandera') {
      out[clave] = true
      continue
    }
    if (valor === null) {
      valor = argv[i + 1]
      if (valor === undefined || valor.startsWith('--')) throw new Error(`Falta el valor de --${clave}.`)
      i++
    }
    if (tipo === 'numero') {
      const n = Number(valor)
      if (!Number.isFinite(n)) throw new Error(`--${clave} debe ser un número (llegó "${valor}").`)
      out[clave] = n
    } else out[clave] = valor
  }
  return out
}
