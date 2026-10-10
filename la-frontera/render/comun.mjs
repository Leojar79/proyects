// Utilidades compartidas por render/guion.mjs y render/render.mjs: rutas, lectura de la
// corrida (con la misma regla que la app: "latest" cae a "demo"), estadísticas y formato de tiempos.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { JUEGO, PUBLICACION } from '../shared/config.js'
import { calcularEstadisticas } from '../shared/juego.js'
import { PROVEEDORES } from '../shared/modelos.js'
import { motivosNoPublicable } from '../shared/publicable.js'

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

// ¿Se puede publicar? La MISMA regla que usan la app (marca de agua) y el render (nombre del archivo):
// shared/publicable.js. Devuelve { bloqueos: [{codigo, texto}], avisos: [{codigo, texto}] }.
export function publicableDe(run, viajeros = cargarViajeros()) {
  return motivosNoPublicable(run, viajeros, { juego: JUEGO, publicacion: PUBLICACION, proveedores: PROVEEDORES })
}

// Sufijo del nombre de los archivos del render: '-demo' con datos simulados, '-NO-PUBLICAR' con
// cualquier otro bloqueo, '' si se puede publicar.
export function sufijoPublicable(publicable) {
  const bloqueos = publicable?.bloqueos ?? []
  if (!bloqueos.length) return ''
  return bloqueos.some((b) => b.codigo === 'demo') ? '-demo' : '-NO-PUBLICAR'
}

// Qué hacer con cada motivo de shared/publicable.js (para GUION.md y la consola del render).
// `run` y `proveedores` (de la corrida) sirven para nombrar archivos, valores y páginas de precios.
export function comoResolver(motivo, run, esAviso = false) {
  if (esAviso) {
    if (motivo.codigo === 'errores') return 'No bloquea: las llamadas con error cuentan como fallo (y su costo, si la API lo cobró). La pantalla lo avisa y el texto de LinkedIn lo dice.'
    return 'No bloquea: la pantalla lo avisa y el texto de LinkedIn lo dice.'
  }
  const archivo = '<archivo con fecha de public/runs/>'
  const prov = (run?.proveedores ?? []).find((p) => motivo.texto.includes(p.nombre))
  const url = /https?:\/\/\S+/.exec(String(prov?.precio?.fuente ?? ''))?.[0]?.replace(/[.)]+$/, '')
  const reglas = run?.juego ? `US$ ${run.juego.presupuestoUSD} y ${run.juego.vidas} vidas` : 'los de la corrida'
  switch (motivo.codigo) {
    case 'sin_corrida':
      return 'Genera una corrida con `npm run benchmark`.'
    case 'demo':
      return 'Son datos simulados. Corre el benchmark real (`npm run benchmark`, necesita las tres claves) y vuelve a generar el guion (`npm run guion`) y el video (`npm run video`).'
    case 'probe':
      return 'Es la prueba de un solo viajero (`--probe`). Corre el benchmark completo: `npm run benchmark`.'
    case 'parcial':
      return 'La corrida se hizo con `--limit` o `--proveedores`. Corre el benchmark completo, sin esas opciones.'
    case 'faltan':
      return `Completa la corrida: \`node bench/run.mjs --continuar ${archivo}\` (salta los viajeros que ya tienen resultado).`
    case 'errores':
      return (
        'Más de 10 % de errores de API. Busca la causa en el campo `error` de los resultados (clave, saldo, red, formato) y repite esas llamadas con ' +
        `\`node bench/run.mjs --continuar ${archivo} --reintentar-errores\` (el error anterior queda registrado en \`reemplazaA\`).`
      )
    case 'config':
      return (
        'Algunas llamadas no usaron la configuración declarada en `shared/modelos.js` (por ejemplo, `reasoning_effort`). Con `npm run probar-apis` ' +
        'confirma qué valores acepta el modelo, corrige `shared/modelos.js` y repite la corrida: publicarla así cambiaría el costo de ese modelo.'
      )
    case 'precio':
      return (
        `Verifica el precio en la página oficial${url ? ` (${url})` : ''}, corrígelo en \`shared/modelos.js\` con \`verificado: true\`, la fuente y la fecha, ` +
        'y corre `npm run recalcular` (recalcula el costo con los tokens guardados, sin llamar a las APIs). Después vuelve a generar el guion y el video.'
      )
    case 'precio_cambiado':
      return 'Los precios de la corrida no son los de `shared/modelos.js`: corre `npm run recalcular` y vuelve a generar el guion y el video.'
    case 'fallback':
      return 'En algunas llamadas respondió otro modelo: esas respuestas no se pueden contar como del modelo nombrado. Repite la corrida sin respaldo.'
    case 'reglas':
      return 'La corrida no guardó el presupuesto y las vidas antes de correr (corrida vieja). Corre el benchmark de nuevo: ahora se guardan en `juego` al empezar.'
    case 'reglas_cambiadas':
      return `Vuelve a poner en \`JUEGO\` de \`shared/config.js\` los valores registrados en la corrida (${reglas}): se fijan antes de correr y no se cambian después de ver los resultados.`
    case 'divulgacion':
      return (
        'Escribe tu relación con TypeSafe en `PUBLICACION.divulgacion` de `shared/config.js` (por ejemplo «Sin relación comercial con TypeSafe» o ' +
        '«Colaboración pagada con TypeSafe») y vuelve a generar el guion y el video. Va en la primera línea del texto de LinkedIn, en la voz del cierre y en pantalla.'
      )
    default:
      return 'Revisa `shared/publicable.js`.'
  }
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
