#!/usr/bin/env node
// Recalcula el costo de una corrida guardada con los precios ACTUALES de shared/modelos.js,
// a partir de los tokens guardados. NO llama a ninguna API.
//
// Para qué: verificas un precio en la página oficial, lo corriges en shared/modelos.js (con
// verificado: true, fuente y fecha) y recalculas sin repetir el benchmark.
//
// Uso:
//   npm run recalcular                         -> public/runs/latest.json (y su archivo con fecha)
//   npm run recalcular -- <archivo.json> ...   -> esos archivos
//   npm run recalcular -- <archivo> --simular  -> muestra antes/después sin escribir
//
// Qué cambia en la corrida:
//   - proveedores[].precio <- el de shared/modelos.js (precios, fuente, verificado y fecha).
//   - resultados: costoUSD (respuestas válidas) y costoFacturadoUSD (errores con tokens) se
//     recalculan con calcularCosto(precio, tokens). También los de reemplazaA.
//   - recalculos: se agrega una entrada con la fecha y los precios de antes y de después.
// Nada más se toca: tokens, decisiones, latencias y reglas del juego quedan como se registraron.

import { readdirSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { JUEGO, PUBLICACION } from '../shared/config.js'
import { usd } from '../shared/formato.js'
import { calcularCosto, PROVEEDORES } from '../shared/modelos.js'
import { motivosNoPublicable } from '../shared/publicable.js'
import { problemasCorrida } from './lib/contrato.mjs'
import { carpetaRuns, cargarViajeros, escribirJSON, existe, leerJSON, redondearCosto } from './lib/datos.mjs'

const rel = (ruta) => relative(process.cwd(), ruta) || ruta
const iguales = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Costo de una llamada tal como lo cuenta el juego (válida: costoUSD; fallida: lo facturado).
const costoDe = (r) => (r.ok ? r.costoUSD ?? 0 : r.costoFacturadoUSD ?? 0)
const totales = (lista) => ({
  total: lista.reduce((a, r) => a + costoDe(r), 0),
  validas: lista.filter((r) => r.ok).length,
  promedio: lista.filter((r) => r.ok).length ? lista.filter((r) => r.ok).reduce((a, r) => a + r.costoUSD, 0) / lista.filter((r) => r.ok).length : 0,
})

function recalcularRegistro(r, precio) {
  if (!r.tokens) return r
  const costo = redondearCosto(calcularCosto(precio, r.tokens))
  if (r.ok) return { ...r, costoUSD: costo }
  return { ...r, costoUSD: 0, costoFacturadoUSD: costo }
}

// Devuelve { run, cambios } sin modificar la corrida original.
// Lanza Error si un proveedor de la corrida no está en `proveedores` o usó otro modelo.
export function recalcularCorrida(runOriginal, { proveedores = PROVEEDORES, fecha = new Date().toISOString() } = {}) {
  const run = structuredClone(runOriginal)
  const cambios = []
  for (const p of run.proveedores) {
    const actual = proveedores.find((x) => x.id === p.id)
    if (!actual) throw new Error(`El proveedor "${p.id}" de la corrida no está en shared/modelos.js.`)
    if (actual.modelo !== p.modelo) {
      throw new Error(
        `${p.nombre}: la corrida usó el modelo "${p.modelo}" y shared/modelos.js tiene "${actual.modelo}". ` +
          'El precio actual no es necesariamente el de ese modelo: pon en shared/modelos.js el modelo que se usó y su precio.',
      )
    }
    const lista = run.resultados[p.id] ?? []
    const antes = totales(lista)
    const precioAntes = p.precio
    p.precio = structuredClone(actual.precio)
    run.resultados[p.id] = lista.map((r) => {
      const nuevo = recalcularRegistro(r, p.precio)
      if (Array.isArray(nuevo.reemplazaA)) nuevo.reemplazaA = nuevo.reemplazaA.map((x) => recalcularRegistro(x, p.precio))
      return nuevo
    })
    const despues = totales(run.resultados[p.id])
    cambios.push({
      id: p.id,
      nombre: p.nombre,
      precioAntes,
      precioDespues: p.precio,
      cambioPrecio: !iguales(precioAntes, p.precio),
      antes,
      despues,
    })
  }
  const huboCambio = cambios.some((c) => c.cambioPrecio || Math.abs(c.antes.total - c.despues.total) > 1e-12)
  if (huboCambio) {
    run.recalculos = [
      ...(run.recalculos ?? []),
      {
        fecha,
        motivo: 'Precios actualizados desde shared/modelos.js (npm run recalcular); costos recalculados desde los tokens guardados.',
        precios: Object.fromEntries(cambios.filter((c) => c.cambioPrecio).map((c) => [c.id, { antes: c.precioAntes, despues: c.precioDespues }])),
      },
    ]
  }
  return { run, cambios, huboCambio }
}

function textoPrecio(pr) {
  return `${pr.entradaPorMTok} / ${pr.entradaCacheadaPorMTok} / ${pr.salidaPorMTok} US$ por millón (entrada / cacheada / salida) · ${pr.verificado ? 'verificado' : 'NO verificado'} · ${pr.fecha}`
}

function imprimirCambios(cambios) {
  for (const c of cambios) {
    console.log(`  ${c.nombre}`)
    if (c.cambioPrecio) {
      console.log(`    precio antes:   ${textoPrecio(c.precioAntes)}`)
      console.log(`    precio después: ${textoPrecio(c.precioDespues)}`)
      if (c.precioAntes.fuente !== c.precioDespues.fuente) console.log(`    fuente: ${c.precioDespues.fuente}`)
    } else {
      console.log(`    precio sin cambios: ${textoPrecio(c.precioDespues)}`)
    }
    console.log(`    costo promedio por decisión: ${usd(c.antes.promedio)} -> ${usd(c.despues.promedio)}`)
    console.log(`    costo total de la corrida:   ${usd(c.antes.total)} -> ${usd(c.despues.total)}`)
  }
}

function resolverArchivo(arg) {
  const candidatos = isAbsolute(arg) ? [arg] : [resolve(arg), join(carpetaRuns(), arg), join(carpetaRuns(), `${arg}.json`)]
  return candidatos.find((c) => existe(c)) ?? null
}

// latest.json es una copia de un archivo con fecha (o prueba-<fecha>.json): se recalculan los dos
// para que no queden con precios distintos.
function gemeloDeLatest(rutaLatest, run) {
  const carpeta = resolve(rutaLatest, '..')
  for (const f of readdirSync(carpeta)) {
    if (f === 'latest.json' || !f.endsWith('.json') || /^(demo|probe-)/.test(f)) continue
    try {
      const otro = leerJSON(join(carpeta, f))
      if (otro.createdAt === run.createdAt && otro.source === run.source) return join(carpeta, f)
    } catch {}
  }
  return null
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--ayuda') || args.includes('-h') || args.includes('--help')) {
    console.log('Uso: npm run recalcular -- [archivo.json ...] [--simular]   (por defecto public/runs/latest.json)')
    return
  }
  const simular = args.includes('--simular')
  const desconocidas = args.filter((a) => a.startsWith('--') && a !== '--simular')
  if (desconocidas.length) {
    console.error(`Opción desconocida: ${desconocidas.join(', ')}`)
    process.exit(1)
  }
  const pedidos = args.filter((a) => !a.startsWith('--'))
  const rutas = []
  for (const a of pedidos.length ? pedidos : ['latest.json']) {
    const ruta = resolverArchivo(a)
    if (!ruta) {
      console.error(`ERROR: no encuentro la corrida ${a}${pedidos.length ? '' : ' (todavía no hay corrida real: npm run benchmark)'}.`)
      process.exit(1)
    }
    rutas.push(ruta)
  }
  for (const ruta of [...rutas]) {
    if (basename(ruta) !== 'latest.json') continue
    const gemelo = gemeloDeLatest(ruta, leerJSON(ruta))
    if (gemelo && !rutas.includes(gemelo)) rutas.push(gemelo)
  }

  const viajeros = cargarViajeros()
  // Una sola fecha para todos los archivos: latest.json y su gemelo con fecha quedan idénticos byte a
  // byte (el sha256 que muestra el video sirve para los dos).
  const fecha = new Date().toISOString()
  let fallas = 0
  for (const ruta of rutas) {
    console.log(`\n${rel(ruta)}${simular ? ' (simulación: no se escribe)' : ''}`)
    let resultado
    try {
      const run = leerJSON(ruta)
      resultado = recalcularCorrida(run, { fecha })
    } catch (e) {
      console.error(`  ERROR: ${e.message}`)
      fallas++
      continue
    }
    imprimirCambios(resultado.cambios)
    const problemas = problemasCorrida(resultado.run, viajeros)
    if (problemas.length) {
      console.error(`  ERROR: la corrida recalculada no cumple el contrato:\n    - ${problemas.slice(0, 20).join('\n    - ')}`)
      fallas++
      continue
    }
    if (!resultado.huboCambio) {
      console.log('  Sin cambios: los precios y costos ya coinciden con shared/modelos.js.')
    } else if (!simular) {
      escribirJSON(ruta, resultado.run)
      console.log('  Guardado (el cambio queda registrado en "recalculos").')
    }
    const { bloqueos } = motivosNoPublicable(resultado.run, viajeros, { juego: JUEGO, publicacion: PUBLICACION, proveedores: PROVEEDORES })
    console.log(bloqueos.length ? `  Todavía no publicable: ${bloqueos.map((b) => b.texto).join(' · ')}` : '  Publicable: sin bloqueos.')
  }
  process.exit(fallas ? 1 : 0)
}

const esPrincipal = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (esPrincipal) main()
