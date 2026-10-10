#!/usr/bin/env node
// Benchmark de La Frontera: pasa los viajeros por las tres IAs con llamadas REALES a sus APIs
// y guarda la corrida (contrato en ARQUITECTURA.md) en public/runs/.
//
// Uso:
//   node bench/run.mjs [--probe] [--limit N] [--proveedores gpt,opus,jev]
//                      [--continuar archivo.json] [--reintentar-errores] [--concurrencia N]
//
//   --probe               Un solo viajero (v02). Imprime petición, respuesta HTTP cruda, decisión,
//                         tokens y costo de cada proveedor. Guarda public/runs/probe-<fecha>.json.
//   --limit N             Solo los primeros N viajeros (no toca latest.json).
//   --proveedores ...     Subconjunto de proveedores (no toca latest.json).
//   --continuar archivo   Retoma una corrida guardada (salta los viajeros que ya tienen resultado).
//   --reintentar-errores  Con --continuar: vuelve a llamar a los viajeros que terminaron en error.
//   --concurrencia N      Viajeros a la vez (por defecto 2). Los 3 proveedores de un viajero van en paralelo.

import { spawnSync } from 'node:child_process'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { JUEGO } from '../shared/config.js'
import { entero, porcentaje, segundos, usd } from '../shared/formato.js'
import { calcularEstadisticas, evaluarDecision } from '../shared/juego.js'
import { calcularCosto, proveedorPorId, PROVEEDORES } from '../shared/modelos.js'
import { preguntasJev, promptSistemaLLM, textoEstado } from '../shared/preguntas.js'
import { ErrorProveedor, ErrorTiempoAgotado, recortar } from './lib/errores.mjs'
import {
  carpetaRuns,
  cargarViajeros,
  escribirJSON,
  existe,
  huellaViajero,
  leerJSON,
  marcaFechaArchivo,
  RAIZ,
  redondearCosto,
} from './lib/datos.mjs'
import * as anthropic from './providers/anthropic.mjs'
import * as openai from './providers/openai.mjs'
import * as typesafe from './providers/typesafe.mjs'

// ---------------------------------------------------------------------------
// Constantes

const ADAPTADORES = { gpt: openai, opus: anthropic, jev: typesafe }
const VARIABLE_CLAVE = { gpt: 'OPENAI_API_KEY', opus: 'ANTHROPIC_API_KEY', jev: 'TYPESAFE_API_KEY' }
const DOMINIOS = { gpt: 'api.openai.com', opus: 'api.anthropic.com', jev: 'api.typesafe.ai' }
const IDS = PROVEEDORES.map((p) => p.id)
const VIAJERO_PROBE = 'v02'
const MAX_REINTENTOS = 3
// FRONTERA_TIMEOUT_MS y FRONTERA_ESPERA_BASE_MS existen solo para las pruebas automáticas.
const TIMEOUT_MS = Number(process.env.FRONTERA_TIMEOUT_MS) || 90_000
const ESPERA_BASE_MS = Number(process.env.FRONTERA_ESPERA_BASE_MS ?? 2000)
const ESPERAS_MS = [1, 2, 4].map((f) => f * ESPERA_BASE_MS) // 2 s, 4 s, 8 s
const MAX_RETRY_AFTER_MS = 60_000
const CRUDO_MAX = 4000
// Fracción máxima de errores de API por proveedor para copiar la corrida a latest.json.
const MAX_FRACCION_ERRORES_LATEST = 0.1

const rel = (ruta) => relative(process.cwd(), ruta) || ruta
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

function salirConError(mensaje) {
  console.error(`\nERROR: ${mensaje}\n`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Argumentos

function ayuda() {
  return [
    'Uso: node bench/run.mjs [opciones]',
    '  --probe                 Prueba de conexión con un viajero (v02); imprime todo lo enviado y recibido.',
    '  --limit N               Solo los primeros N viajeros.',
    '  --proveedores LISTA     Subconjunto, separado por comas: gpt,opus,jev',
    '  --continuar ARCHIVO     Retoma una corrida guardada en public/runs/.',
    '  --reintentar-errores    Con --continuar, repite los viajeros que terminaron en error.',
    '  --concurrencia N        Viajeros en paralelo (por defecto 2).',
  ].join('\n')
}

export function parsearArgs(argv) {
  const a = { probe: false, limit: null, proveedores: null, continuar: null, reintentarErrores: false, concurrencia: 2 }
  const valor = (i, nombre) => {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new Error(`Falta el valor de ${nombre}.`)
    return v
  }
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i]
    let enLinea = null
    if (arg.includes('=')) [arg, enLinea] = [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
    const tomar = (nombre) => {
      if (enLinea !== null) return enLinea
      const v = valor(i, nombre)
      i++
      return v
    }
    switch (arg) {
      case '--probe':
        a.probe = true
        break
      case '--limit': {
        const n = Number(tomar('--limit'))
        if (!Number.isInteger(n) || n < 1) throw new Error('--limit debe ser un entero mayor que 0.')
        a.limit = n
        break
      }
      case '--proveedores': {
        const lista = tomar('--proveedores').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
        const malos = lista.filter((id) => !IDS.includes(id))
        if (malos.length || !lista.length) throw new Error(`Proveedores no válidos: ${malos.join(', ') || '(vacío)'}. Usa: ${IDS.join(',')}`)
        a.proveedores = IDS.filter((id) => lista.includes(id))
        break
      }
      case '--continuar':
        a.continuar = tomar('--continuar')
        break
      case '--reintentar-errores':
        a.reintentarErrores = true
        break
      case '--concurrencia': {
        const n = Number(tomar('--concurrencia'))
        if (!Number.isInteger(n) || n < 1 || n > 20) throw new Error('--concurrencia debe ser un entero entre 1 y 20.')
        a.concurrencia = n
        break
      }
      case '--ayuda':
      case '--help':
      case '-h':
        a.ayuda = true
        break
      default:
        throw new Error(`Opción desconocida: ${argv[i]}\n\n${ayuda()}`)
    }
  }
  if (a.probe && a.continuar) throw new Error('--probe y --continuar no se pueden usar juntos.')
  if (a.reintentarErrores && !a.continuar) throw new Error('--reintentar-errores solo tiene sentido con --continuar.')
  return a
}

// ---------------------------------------------------------------------------
// Entorno: claves y modelos

function cargarArchivoEnv() {
  const ruta = process.env.FRONTERA_ENV_FILE ?? join(RAIZ, '.env')
  if (!existe(ruta)) return
  try {
    process.loadEnvFile(ruta)
    console.log(`Variables de entorno cargadas desde ${rel(ruta)}.`)
  } catch (e) {
    console.warn(`Aviso: no pude leer ${rel(ruta)}: ${e.message}`)
  }
}

function verificarClaves(ids) {
  const faltan = ids.filter((id) => !process.env[VARIABLE_CLAVE[id]]?.trim())
  if (!faltan.length) return
  const lineas = [
    'Faltan claves de API para correr el benchmark:',
    ...faltan.map((id) => `  - ${VARIABLE_CLAVE[id]}  (${proveedorPorId(id).nombre}, ${proveedorPorId(id).empresa})`),
    '',
    'Cómo configurarlas (NUNCA pegues una clave en un chat, tampoco en este):',
    '  - Claude Code en la nube: en la configuración del entorno, sección de variables de entorno,',
    '    agrega una línea por clave, por ejemplo:',
    ...faltan.map((id) => `        ${VARIABLE_CLAVE[id]}=tu_clave`),
    '    y abre una sesión nueva para que se carguen.',
    '  - En tu computadora: expórtalas en la terminal (export NOMBRE=valor) o escríbelas en',
    '    la-frontera/.env (ese archivo está en .gitignore y este script lo lee solo).',
    '',
    'La red del entorno debe permitir estos dominios:',
    `  ${Object.values(DOMINIOS).join(', ')}`,
    '',
    ids.length > faltan.length
      ? `Para correr solo los proveedores que ya tienen clave: --proveedores ${ids.filter((id) => !faltan.includes(id)).join(',')}`
      : 'También puedes correr un solo proveedor cuando tengas su clave, por ejemplo: --proveedores jev',
  ]
  salirConError(lineas.join('\n'))
}

// Copia completa de shared/modelos.js con el modelo efectivo de las variables de entorno.
function proveedoresEfectivos(ids, { silencioso = false } = {}) {
  return ids.map((id) => {
    const p = structuredClone(proveedorPorId(id))
    const original = p.modelo
    if (id === 'gpt') p.modelo = openai.modeloEfectivo(p)
    if (id === 'jev') p.modelo = typesafe.modeloEfectivo(p)
    if (p.modelo !== original && !silencioso) {
      console.warn(
        `Aviso: ${p.nombre} usará el modelo "${p.modelo}" (variable de entorno) en vez de "${original}". ` +
          `El costo se calcula con el precio registrado para "${original}"; si cambia, actualiza shared/modelos.js.`,
      )
    }
    return p
  })
}

// ---------------------------------------------------------------------------
// Estimación previa de costo

function estimarCosto(proveedores, viajeros) {
  const jevPreguntas = JSON.stringify(preguntasJev())
  const sistema = promptSistemaLLM()
  const MARGEN = 1.5 // esquema JSON inyectado y tokenización del español
  const SALIDA_TIPICA = 400
  const SALIDA_MAX = 2000
  console.log('\nCosto estimado ANTES de empezar (aproximado; entrada = caracteres / 4 x 1,5 de margen):')
  let totalTipico = 0
  let totalMax = 0
  for (const p of proveedores) {
    let tipico = 0
    let maximo = 0
    for (const v of viajeros) {
      const caracteres = p.id === 'jev' ? textoEstado(v).length + jevPreguntas.length : sistema.length + textoEstado(v).length
      const entrada = Math.ceil((caracteres / 4) * MARGEN)
      const esLLM = p.id !== 'jev'
      tipico += calcularCosto(p.precio, { entrada, entradaCacheada: 0, salida: esLLM ? SALIDA_TIPICA : 0 })
      maximo += calcularCosto(p.precio, { entrada, entradaCacheada: 0, salida: esLLM ? SALIDA_MAX : 0 })
    }
    totalTipico += tipico
    totalMax += maximo
    console.log(
      `  ${p.nombre.padEnd(16)} típico ${usd(tipico).padEnd(12)} máximo aprox. ${usd(maximo).padEnd(12)}` +
        `${p.precio.verificado ? '' : '  (precio NO verificado)'}`,
    )
  }
  console.log(`  ${'TOTAL'.padEnd(16)} típico ${usd(totalTipico).padEnd(12)} máximo aprox. ${usd(totalMax)}`)
  console.log(
    `  (${viajeros.length} ${viajeros.length === 1 ? 'viajero' : 'viajeros'}. Salida de GPT y Opus: ${SALIDA_TIPICA} tokens típicos, ${entero(SALIDA_MAX)} como máximo` +
      ' aproximado; los reintentos pueden sumar algo más.)\n',
  )
}

// ---------------------------------------------------------------------------
// Una llamada con reintentos y tiempo límite

function normalizarError(e, signal, proveedor) {
  if (signal.aborted && signal.reason instanceof ErrorTiempoAgotado) {
    return new ErrorProveedor(`${proveedor.nombre}: ${signal.reason.message}`, { reintentable: true })
  }
  if (e instanceof ErrorProveedor) return e
  return new ErrorProveedor(`${proveedor.nombre}: error inesperado: ${e?.message ?? String(e)}`, { causa: e })
}

async function llamarConReintentos(proveedor, viajero) {
  const adaptador = ADAPTADORES[proveedor.id]
  const trazas = []
  for (let intento = 1; ; intento++) {
    const ctrl = new AbortController()
    const temporizador = setTimeout(() => ctrl.abort(new ErrorTiempoAgotado(TIMEOUT_MS)), TIMEOUT_MS)
    const t0 = performance.now()
    try {
      const r = await adaptador.decidir(viajero, proveedor, { signal: ctrl.signal })
      const medido = performance.now() - t0
      trazas.push(...(r.traza ?? []))
      return { ok: true, r, latenciaMs: r.latenciaMs ?? medido, intentos: intento, trazas }
    } catch (e) {
      const err = normalizarError(e, ctrl.signal, proveedor)
      trazas.push(...(err.traza ?? []))
      if (!err.reintentable || intento > MAX_REINTENTOS) return { ok: false, err, intentos: intento, trazas }
      const espera = Math.min(MAX_RETRY_AFTER_MS, Math.max(ESPERAS_MS[intento - 1], err.retryAfterMs ?? 0))
      console.warn(
        `  [${proveedor.nombre} · ${viajero.id}] intento ${intento} falló (${recortar(err.message, 200)}). ` +
          `Reintento en ${(espera / 1000).toLocaleString('es-419')} s...`,
      )
      await dormir(espera)
    } finally {
      clearTimeout(temporizador)
    }
  }
}

function construirRegistro(proveedor, viajero, llamada) {
  const base = { viajeroId: viajero.id, huellaEstado: huellaViajero(viajero), intentos: llamada.intentos }
  if (llamada.ok) {
    const { r } = llamada
    return {
      viajeroId: viajero.id,
      ok: true,
      error: null,
      decision: r.decision,
      confianza: r.confianza ?? null,
      salidaTexto: r.salidaTexto,
      crudo: recortar(r.crudo, CRUDO_MAX),
      tokens: r.tokens,
      costoUSD: redondearCosto(calcularCosto(proveedor.precio, r.tokens)),
      latenciaMs: Math.max(1, Math.round(llamada.latenciaMs)),
      modeloServido: r.modeloServido ?? null,
      fallback: Boolean(r.fallback),
      ...base,
      opcionesUsadas: r.opcionesUsadas ?? null,
    }
  }
  const { err } = llamada
  return {
    viajeroId: viajero.id,
    ok: false,
    error: err.message,
    decision: null,
    confianza: null,
    salidaTexto: err.salidaTexto ?? null,
    crudo: recortar(err.crudo, CRUDO_MAX),
    // Tokens que la API sí cobró aunque la respuesta no sirviera (negativa, JSON inválido...).
    tokens: err.tokens ?? null,
    costoUSD: 0,
    costoFacturadoUSD: err.tokens ? redondearCosto(calcularCosto(proveedor.precio, err.tokens)) : null,
    latenciaMs: null,
    modeloServido: err.modeloServido ?? null,
    fallback: Boolean(err.fallback),
    ...base,
    opcionesUsadas: err.opcionesUsadas ?? null,
  }
}

// ---------------------------------------------------------------------------
// Corrida

function nuevaCorrida(proveedores, viajeros, nota) {
  return {
    version: 1,
    source: 'live',
    createdAt: new Date().toISOString(),
    ...(nota ? { nota } : {}),
    viajeros: viajeros.map((v) => v.id),
    proveedores,
    resultados: Object.fromEntries(proveedores.map((p) => [p.id, []])),
  }
}

function ordenarResultados(run) {
  const indice = new Map(run.viajeros.map((id, i) => [id, i]))
  for (const lista of Object.values(run.resultados)) lista.sort((a, b) => indice.get(a.viajeroId) - indice.get(b.viajeroId))
}

function ponerRegistro(run, proveedorId, registro) {
  const lista = run.resultados[proveedorId]
  const i = lista.findIndex((r) => r.viajeroId === registro.viajeroId)
  if (i >= 0) lista[i] = registro
  else lista.push(registro)
}

function resolverArchivoContinuar(arg) {
  const candidatos = isAbsolute(arg) ? [arg] : [resolve(arg), join(carpetaRuns(), arg), join(carpetaRuns(), `${arg}.json`)]
  const ruta = candidatos.find((c) => existe(c))
  if (!ruta) salirConError(`No encuentro la corrida para continuar: ${arg}`)
  return ruta
}

function prepararContinuacion(args, dataset) {
  const ruta = resolverArchivoContinuar(args.continuar)
  let run
  try {
    run = leerJSON(ruta)
  } catch (e) {
    salirConError(`No pude leer ${rel(ruta)}: ${e.message}`)
  }
  if (run?.version !== 1 || run.source !== 'live' || run.probe) {
    salirConError(`${rel(ruta)} no es una corrida real (source "live") que se pueda continuar.`)
  }
  if (basename(ruta) === 'latest.json') salirConError('No continúes latest.json; continúa el archivo con fecha del que es copia.')
  const porId = new Map(dataset.map((v) => [v.id, v]))

  // Proveedores: los del archivo, más los pedidos con --proveedores.
  const idsArchivo = run.proveedores.map((p) => p.id)
  const ids = IDS.filter((id) => idsArchivo.includes(id) || args.proveedores?.includes(id))
  const efectivos = proveedoresEfectivos(ids.filter((id) => !idsArchivo.includes(id)))
  for (const p of run.proveedores) {
    const actual = proveedoresEfectivos([p.id], { silencioso: true })[0]
    if (actual.modelo !== p.modelo) {
      salirConError(
        `La corrida usó el modelo "${p.modelo}" para ${p.nombre} y ahora el modelo efectivo es "${actual.modelo}". ` +
          'Usa el mismo modelo (variables OPENAI_MODEL / TYPESAFE_MODEL) o empieza una corrida nueva.',
      )
    }
    if (JSON.stringify(actual.precio) !== JSON.stringify(p.precio)) {
      console.warn(`Aviso: el precio de ${p.nombre} cambió en shared/modelos.js; se mantiene el de la corrida para no mezclar.`)
    }
  }
  run.proveedores = [...run.proveedores, ...efectivos].sort((a, b) => IDS.indexOf(a.id) - IDS.indexOf(b.id))
  for (const p of run.proveedores) run.resultados[p.id] ??= []

  // Viajeros: los del archivo (si siguen en el conjunto) más los pedidos ahora.
  const quitados = run.viajeros.filter((id) => !porId.has(id))
  if (quitados.length) console.warn(`Aviso: estos viajeros ya no están en data/viajeros.json y se quitan: ${quitados.join(', ')}`)
  const pedidos = new Set([...run.viajeros.filter((id) => porId.has(id)), ...(args.limit ? dataset.slice(0, args.limit) : dataset).map((v) => v.id)])
  run.viajeros = dataset.map((v) => v.id).filter((id) => pedidos.has(id))

  // Resultados que ya no sirven: viajero quitado o cuyo texto cambió.
  for (const p of run.proveedores) {
    run.resultados[p.id] = run.resultados[p.id].filter((r) => {
      const v = porId.get(r.viajeroId)
      if (!v || !pedidos.has(r.viajeroId)) return false
      if (r.huellaEstado && r.huellaEstado !== huellaViajero(v)) {
        console.warn(`Aviso: el viajero ${r.viajeroId} cambió en data/viajeros.json; se repite su llamada a ${p.nombre}.`)
        return false
      }
      return true
    })
  }
  run.actualizadoAt = new Date().toISOString()
  return { run, ruta }
}

function pendientes(run, proveedoresActivos, viajeros, reintentarErrores) {
  const tareas = []
  for (const v of viajeros) {
    const ids = proveedoresActivos.filter((p) => {
      const r = run.resultados[p.id].find((x) => x.viajeroId === v.id)
      return !r || (reintentarErrores && !r.ok)
    })
    if (ids.length) tareas.push({ viajero: v, proveedores: ids })
  }
  return tareas
}

async function enParalelo(items, n, fn) {
  let siguiente = 0
  const trabajador = async () => {
    while (siguiente < items.length) {
      const i = siguiente++
      await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, trabajador))
}

function lineaResultado(proveedor, registro, viajero) {
  const corto = proveedor.id === 'opus' ? 'Opus' : proveedor.id === 'gpt' ? 'GPT' : 'Jev'
  if (!registro.ok) return `${corto}: ERROR`
  const ev = evaluarDecision(registro.decision, viajero.verdad)
  return `${corto}: ${registro.decision.accion} (${ev.aciertoAccion ? 'acierta' : 'falla'}) ${segundos(registro.latenciaMs)} ${usd(registro.costoUSD)}${registro.fallback ? ' [FALLBACK]' : ''}`
}

// ---------------------------------------------------------------------------
// Resumen

function tabla(filas) {
  const anchos = filas[0].map((_, c) => Math.max(...filas.map((f) => String(f[c]).length)))
  return filas.map((f) => f.map((x, c) => String(x).padEnd(anchos[c])).join('  ')).join('\n')
}

function imprimirResumen(run, dataset) {
  const est = calcularEstadisticas(run, dataset, JUEGO)
  const ps = est.proveedores
  const fin = (p) =>
    p.llegoAlFinal
      ? 'Sí'
      : `No (${p.motivoFin === 'sin_fondos' ? 'sin fondos' : 'sin vidas'} en el viajero ${p.finIndice + 1})`
  const filas = [
    ['', ...ps.map((p) => p.nombre)],
    ['Modelo', ...ps.map((p) => p.modelo)],
    ['Respondidas', ...ps.map((p) => `${p.respondidas}/${p.casos}`)],
    ['Errores de API', ...ps.map((p) => p.erroresApi)],
    ['Aciertos (acción)', ...ps.map((p) => `${porcentaje(p.precisionAccion)} (${p.aciertosAccion}/${p.casos})`)],
    ['Errores graves', ...ps.map((p) => p.erroresGraves)],
    ['Costo promedio por decisión', ...ps.map((p) => usd(p.costoPromedioUSD))],
    ['Costo por 1000 decisiones', ...ps.map((p) => usd(p.costoPor1000USD))],
    ['Costo total', ...ps.map((p) => usd(p.costoTotalUSD))],
    ['Latencia promedio', ...ps.map((p) => segundos(p.latenciaPromedioMs))],
    ['Latencia mediana', ...ps.map((p) => segundos(p.latenciaMedianaMs))],
    [`Decisiones con ${usd(JUEGO.presupuestoUSD)}`, ...ps.map((p) => p.decisionesEnJuego)],
    ['¿Llegó al final?', ...ps.map(fin)],
  ]
  console.log(`\nRESUMEN (${est.totalViajeros} viajeros, presupuesto ${usd(JUEGO.presupuestoUSD)}, ${JUEGO.vidas} vidas)\n`)
  console.log(tabla(filas))

  const avisos = []
  for (const p of ps) {
    const regs = run.resultados[p.id] ?? []
    if (p.tokensEstimados) avisos.push(`${p.nombre}: hay tokens ESTIMADOS (la API no los reportó); el costo es aproximado.`)
    if (p.usoFallback) {
      const n = regs.filter((r) => r.ok && r.fallback).length
      avisos.push(`${p.nombre}: ${n} respuesta(s) las sirvió un modelo de respaldo (fallback). La app lo avisa.`)
    }
    if (!p.precio.verificado) avisos.push(`${p.nombre}: precio NO verificado (${p.precio.fuente}).`)
    const facturado = regs.filter((r) => !r.ok && r.costoFacturadoUSD).reduce((a, r) => a + r.costoFacturadoUSD, 0)
    if (facturado > 0) {
      avisos.push(`${p.nombre}: los errores con respuesta (negativas, JSON inválido) se facturaron ${usd(facturado)} que NO entran en costoUSD.`)
    }
    const opciones = new Set(regs.filter((r) => r.opcionesUsadas).map((r) => JSON.stringify(r.opcionesUsadas)))
    if (opciones.size > 1) avisos.push(`${p.nombre}: no todas las llamadas usaron las mismas opciones: ${[...opciones].join(' | ')}`)
    const sinEsfuerzo = regs.some((r) => r.opcionesUsadas && 'reasoningEffort' in r.opcionesUsadas && r.opcionesUsadas.reasoningEffort === null)
    if (sinEsfuerzo) avisos.push(`${p.nombre}: algunas llamadas se hicieron SIN reasoning_effort (el modelo no lo admitió).`)
    const errores = regs.filter((r) => !r.ok)
    if (errores.length) avisos.push(`${p.nombre}: ${errores.length} error(es). Primero: ${recortar(errores[0].error, 300)}`)
  }
  if (avisos.length) {
    console.log('\nAvisos:')
    for (const a of avisos) console.log(`  - ${a}`)
  }
  return est
}

// ---------------------------------------------------------------------------
// --probe

function bonito(texto) {
  try {
    return JSON.stringify(JSON.parse(texto), null, 2)
  } catch {
    return texto
  }
}

function imprimirProbe(proveedor, viajero, llamada, registro) {
  const titulo = ` ${proveedor.nombre} (${proveedor.empresa}) · modelo pedido: ${proveedor.modelo} `
  console.log(`\n${'='.repeat(8)}${titulo}${'='.repeat(Math.max(8, 80 - titulo.length))}`)
  llamada.trazas.forEach((t, i) => {
    console.log(`\n--- Petición HTTP #${i + 1} (sin la clave) ---`)
    console.log(`${t.peticion.metodo} ${t.peticion.url}`)
    console.log(`Cabeceras: ${JSON.stringify(t.peticion.cabeceras)}`)
    console.log(JSON.stringify(t.peticion.cuerpo, null, 2))
    console.log(`\n--- Respuesta HTTP #${i + 1} cruda (status ${t.status ?? 'sin respuesta'}) ---`)
    console.log(t.crudo === null ? '(sin cuerpo)' : bonito(t.crudo))
  })
  console.log('\n--- Resultado ---')
  if (registro.ok) {
    const ev = evaluarDecision(registro.decision, viajero.verdad)
    console.log(`Decisión interpretada: ${JSON.stringify(registro.decision)}`)
    console.log(`Respuesta correcta:    ${JSON.stringify(viajero.verdad)}  -> ${ev.aciertoAccion ? 'ACIERTA la acción' : 'FALLA la acción'}`)
    console.log(`Confianza: ${registro.confianza ? JSON.stringify(registro.confianza) : 'no la entrega'}`)
  } else {
    console.log(`ERROR: ${registro.error}`)
  }
  const t = registro.tokens
  if (t) {
    console.log(
      `Tokens: entrada ${t.entrada} (cacheados ${t.entradaCacheada}), salida ${t.salida}` +
        ` (razonamiento ${t.razonamiento ?? 'no desglosado'})${t.estimado ? ' [ESTIMADOS: la API no los reportó]' : ''}`,
    )
  }
  const p = proveedor.precio
  console.log(
    `Costo: ${registro.ok ? usd(registro.costoUSD) : `${usd(0)} en la corrida (facturado: ${usd(registro.costoFacturadoUSD)})`}` +
      `  [precio por millón de tokens: entrada ${p.entradaPorMTok}, cacheada ${p.entradaCacheadaPorMTok}, salida ${p.salidaPorMTok} USD;` +
      ` ${p.verificado ? 'verificado' : 'NO verificado'}]`,
  )
  console.log(
    `Latencia: ${registro.ok ? segundos(registro.latenciaMs) : '—'} · intentos: ${registro.intentos}` +
      ` · modelo servido: ${registro.modeloServido ?? '(no lo informa)'} · fallback: ${registro.fallback ? 'SÍ' : 'no'}` +
      `${registro.opcionesUsadas ? ` · opciones: ${JSON.stringify(registro.opcionesUsadas)}` : ''}`,
  )
}

async function correrProbe(args, dataset) {
  let viajero = dataset.find((v) => v.id === VIAJERO_PROBE)
  if (!viajero) {
    viajero = dataset[0]
    console.warn(`Aviso: no existe el viajero ${VIAJERO_PROBE}; uso ${viajero.id}.`)
  }
  const ids = args.proveedores ?? IDS
  verificarClaves(ids)
  const proveedores = proveedoresEfectivos(ids)
  console.log(`PRUEBA DE CONEXIÓN (--probe) con el viajero ${viajero.id} (${viajero.nombre}).`)
  estimarCosto(proveedores, [viajero])
  const run = nuevaCorrida(proveedores, [viajero], 'Prueba de conexión (--probe): un solo viajero. No es una corrida completa.')
  run.probe = true
  run.trazas = {}
  for (const p of proveedores) {
    const llamada = await llamarConReintentos(p, viajero)
    const registro = construirRegistro(p, viajero, llamada)
    run.resultados[p.id].push(registro)
    run.trazas[p.id] = llamada.trazas
    imprimirProbe(p, viajero, llamada, registro)
  }
  const ruta = join(carpetaRuns(), `probe-${marcaFechaArchivo()}.json`)
  escribirJSON(ruta, run)
  console.log(`\nGuardado: ${rel(ruta)} (incluye las peticiones y respuestas completas, sin claves).`)
  const fallidos = proveedores.filter((p) => !run.resultados[p.id][0].ok)
  if (fallidos.length) {
    console.log(`\nRevisa antes del benchmark completo: ${fallidos.map((p) => p.nombre).join(', ')} terminaron en error.`)
  } else {
    console.log('\nLos tres formatos se interpretaron bien. Siguiente paso: npm run benchmark')
  }
}

// ---------------------------------------------------------------------------
// Benchmark completo

async function correrBenchmark(args, dataset) {
  let run
  let ruta
  let activos
  if (args.continuar) {
    ;({ run, ruta } = prepararContinuacion(args, dataset))
    activos = run.proveedores.filter((p) => !args.proveedores || args.proveedores.includes(p.id))
    console.log(`Continuando ${rel(ruta)} (creada ${run.createdAt}).`)
  } else {
    const ids = args.proveedores ?? IDS
    const viajeros = args.limit ? dataset.slice(0, args.limit) : dataset
    run = nuevaCorrida(proveedoresEfectivos(ids), viajeros)
    activos = run.proveedores
    const parcial = Boolean(args.limit) || ids.length < IDS.length
    // Las corridas parciales llevan el prefijo "prueba-" (están en .gitignore).
    ruta = join(carpetaRuns(), `${parcial ? 'prueba-' : ''}${marcaFechaArchivo(new Date(run.createdAt))}.json`)
  }
  const porId = new Map(dataset.map((v) => [v.id, v]))
  const viajerosRun = run.viajeros.map((id) => porId.get(id))
  const tareas = pendientes(run, activos, viajerosRun, args.reintentarErrores)
  verificarClaves([...new Set(tareas.flatMap((t) => t.proveedores.map((p) => p.id)))])

  console.log(
    `Benchmark: ${viajerosRun.length} viajeros x ${activos.map((p) => p.nombre).join(', ')}. ` +
      `Pendientes: ${tareas.length} viajeros. Concurrencia: ${args.concurrencia} viajeros a la vez.`,
  )
  if (tareas.length) {
    estimarCosto(
      activos,
      tareas.map((t) => t.viajero),
    )
  }
  escribirJSON(ruta, run)
  console.log(`Progreso en: ${rel(ruta)}\n`)

  process.once('SIGINT', () => {
    console.log(`\n\nInterrumpido. El progreso está guardado en ${rel(ruta)}.\nPara seguir: node bench/run.mjs --continuar ${rel(ruta)}`)
    process.exit(130)
  })

  let hechos = 0
  const ancho = String(tareas.length).length
  await enParalelo(tareas, args.concurrencia, async ({ viajero, proveedores }) => {
    const registros = await Promise.all(
      proveedores.map(async (p) => [p, construirRegistro(p, viajero, await llamarConReintentos(p, viajero))]),
    )
    for (const [p, registro] of registros) ponerRegistro(run, p.id, registro)
    ordenarResultados(run)
    run.actualizadoAt = new Date().toISOString()
    escribirJSON(ruta, run)
    hechos++
    const partes = registros.map(([p, r]) => lineaResultado(p, r, viajero))
    console.log(`[${String(hechos).padStart(ancho)}/${tareas.length}] ${viajero.id} ${viajero.nombre.padEnd(18)} | ${partes.join(' | ')}`)
    for (const [p, r] of registros) if (!r.ok) console.log(`      ${p.nombre}: ${recortar(r.error, 400)}`)
  })

  ordenarResultados(run)
  escribirJSON(ruta, run)
  console.log(`\nCorrida guardada: ${rel(ruta)}`)
  imprimirResumen(run, dataset)

  const completa =
    !args.limit &&
    IDS.every((id) => run.proveedores.some((p) => p.id === id)) &&
    run.viajeros.length === dataset.length &&
    IDS.every((id) => run.viajeros.every((v) => run.resultados[id].some((r) => r.viajeroId === v)))
  // Con demasiados errores de API la corrida no representa a los modelos (suele ser un problema
  // de configuración o de formato): no se publica en latest.json hasta repetir esos viajeros.
  const conMuchosErrores = run.proveedores.filter((p) => {
    const errores = run.resultados[p.id].filter((r) => !r.ok).length
    return errores > MAX_FRACCION_ERRORES_LATEST * run.viajeros.length
  })
  if (completa && !conMuchosErrores.length) {
    const rutaLatest = join(carpetaRuns(), 'latest.json')
    escribirJSON(rutaLatest, run)
    console.log(`\nCopiada a ${rel(rutaLatest)}: el video usará esta corrida real.`)
  } else if (completa) {
    console.log(
      `\nNo se tocó latest.json: ${conMuchosErrores.map((p) => p.nombre).join(', ')} tuvo más de ` +
        `${porcentaje(MAX_FRACCION_ERRORES_LATEST)} de errores. Corrige la causa y repite esos viajeros con:\n` +
        `  node bench/run.mjs --continuar ${rel(ruta)} --reintentar-errores`,
    )
  } else {
    console.log('\nNo se tocó latest.json (corrida parcial: --limit, subconjunto de proveedores o viajeros pendientes).')
  }
}

// ---------------------------------------------------------------------------

async function main() {
  let args
  try {
    args = parsearArgs(process.argv.slice(2))
  } catch (e) {
    salirConError(e.message)
  }
  if (args.ayuda) {
    console.log(ayuda())
    return
  }
  cargarArchivoEnv()
  try {
    openai.estiloConfigurado()
  } catch (e) {
    salirConError(e.message)
  }
  let dataset
  try {
    dataset = cargarViajeros()
  } catch (e) {
    salirConError(e.message)
  }
  if (args.probe) await correrProbe(args, dataset)
  else await correrBenchmark(args, dataset)
}

// Proxy HTTPS: el fetch de Node solo usa HTTPS_PROXY si NODE_USE_ENV_PROXY=1. En entornos con
// proxy de salida (como Claude Code en la nube) se vuelve a lanzar este mismo proceso con esa variable.
// (NO_PROXY se respeta: lo que esté excluido sigue saliendo directo.)
function relanzarConProxySiHaceFalta() {
  const hayProxy = process.env.HTTPS_PROXY || process.env.https_proxy
  if (!hayProxy || process.env.NODE_USE_ENV_PROXY === '1' || process.env.FRONTERA_SIN_PROXY_AUTOMATICO) return
  process.on('SIGINT', () => {}) // el proceso hijo se encarga de Ctrl+C
  // --disable-warning: oculta el aviso "EnvHttpProxyAgent is experimental" de Node 22.
  const opcionesNode = [...process.execArgv, '--disable-warning=UNDICI-EHPA']
  const r = spawnSync(process.execPath, [...opcionesNode, fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  })
  process.exit(r.status ?? (r.signal ? 130 : 1))
}

const esPrincipal = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (esPrincipal) {
  relanzarConProxySiHaceFalta()
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
