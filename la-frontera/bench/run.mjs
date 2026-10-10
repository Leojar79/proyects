#!/usr/bin/env node
// Benchmark de La Frontera: pasa los viajeros por las tres IAs con llamadas REALES a sus APIs
// y guarda la corrida (contrato en ARQUITECTURA.md) en public/runs/.
//
// Uso:
//   node bench/run.mjs [--probe] [--limit N] [--proveedores gpt,opus,jev]
//                      [--continuar archivo.json] [--reintentar-errores] [--concurrencia N] [--si]
//
//   --probe               Un solo viajero (v02). Imprime petición, respuesta HTTP cruda, decisión,
//                         tokens y costo de cada proveedor. Guarda public/runs/probe-<fecha>.json.
//   --limit N             Solo los primeros N viajeros (corrida parcial: no toca latest.json).
//   --proveedores ...     Subconjunto de proveedores (corrida parcial: no toca latest.json).
//   --continuar archivo   Retoma una corrida guardada (salta los viajeros que ya tienen resultado).
//   --reintentar-errores  Con --continuar: vuelve a llamar a los viajeros que terminaron en error
//                         (el error anterior queda registrado en "reemplazaA").
//   --concurrencia N      Viajeros a la vez (por defecto 2). Los 3 proveedores de un viajero van en paralelo.
//   --si                  No pide confirmación antes de gastar (en una terminal interactiva la pide).

import { spawnSync } from 'node:child_process'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

import { JUEGO, PUBLICACION } from '../shared/config.js'
import { entero, porcentaje, segundos, usd } from '../shared/formato.js'
import { calcularEstadisticas, evaluarDecision } from '../shared/juego.js'
import { calcularCosto, proveedorPorId, PROVEEDORES } from '../shared/modelos.js'
import { preguntasJev, promptSistemaLLM, textoEstado } from '../shared/preguntas.js'
import { motivosNoPublicable } from '../shared/publicable.js'
import { ErrorProveedor, ErrorTiempoAgotado, recortar } from './lib/errores.mjs'
import {
  carpetaRuns,
  cargarViajeros,
  commitActual,
  escribirJSON,
  estimarTokens,
  existe,
  huellaPrompt,
  huellaViajero,
  leerJSON,
  marcaFechaArchivo,
  MARGEN_ESTIMACION,
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
// Tiempo límite por llamada, por proveedor: una respuesta larga de GPT u Opus (razonamiento)
// puede tardar más de un minuto; Jev responde en menos de un segundo.
const TIMEOUT_MS = { gpt: 180_000, opus: 180_000, jev: 30_000 }
// Tiempos agotados que se reintentan: GPT y Opus pueden haber cobrado la llamada que no llegó,
// así que solo 1 reintento; Jev, los reintentos normales.
const REINTENTOS_TIEMPO_AGOTADO = { gpt: 1, opus: 1, jev: MAX_REINTENTOS }
// FRONTERA_TIMEOUT_MS y FRONTERA_ESPERA_BASE_MS existen solo para las pruebas automáticas.
const timeoutDe = (id) => Number(process.env.FRONTERA_TIMEOUT_MS) || TIMEOUT_MS[id]
const ESPERA_BASE_MS = Number(process.env.FRONTERA_ESPERA_BASE_MS ?? 2000)
const ESPERAS_MS = [1, 2, 4].map((f) => f * ESPERA_BASE_MS) // 2 s, 4 s, 8 s
const MAX_RETRY_AFTER_MS = 60_000
const CRUDO_MAX = 4000
// Errores de configuración, de clave o de saldo: si una llamada falla así, fallarán todas.
// Se detiene la corrida en vez de seguir llamando.
const CODIGOS_FATALES = new Set(['configuracion', 'opcion_no_admitida', 'cuota', 'autenticacion'])
// Motivos de "no publicable" que se arreglan DESPUÉS sin repetir la corrida (npm run recalcular,
// shared/config.js). Con ellos la corrida igual se copia a latest.json; el video seguirá con marca
// de agua hasta arreglarlos.
const SE_ARREGLAN_DESPUES = new Set(['precio', 'precio_cambiado', 'divulgacion'])
// Diferencia máxima entre el costo calculado y el que informa la API, antes de avisar.
const TOLERANCIA_COSTO_REPORTADO = 0.05

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
    '  --si                    No pedir confirmación antes de empezar.',
  ].join('\n')
}

export function parsearArgs(argv) {
  const a = { probe: false, limit: null, proveedores: null, continuar: null, reintentarErrores: false, concurrencia: 2, si: false }
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
      case '--si':
        a.si = true
        break
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
  const SALIDA_TIPICA = 400
  const SALIDA_MAX = 2000
  console.log(`\nCosto estimado ANTES de empezar (aproximado; entrada = caracteres / 4 x ${MARGEN_ESTIMACION.toLocaleString('es-419')} de margen):`)
  let totalTipico = 0
  let totalMax = 0
  for (const p of proveedores) {
    let tipico = 0
    let maximo = 0
    for (const v of viajeros) {
      const caracteres = p.id === 'jev' ? textoEstado(v).length + jevPreguntas.length : sistema.length + textoEstado(v).length
      const entrada = estimarTokens(caracteres)
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

// En una terminal interactiva, nada se gasta sin un "s" explícito (salvo con --si).
async function confirmar(args) {
  if (args.si || !process.stdin.isTTY || !process.stdout.isTTY) return true
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const r = await rl.question('¿Continuar y hacer las llamadas (se cobran)? (s/N) ')
    return /^(s|si|sí)$/i.test(r.trim())
  } finally {
    rl.close()
  }
}

// ---------------------------------------------------------------------------
// Una llamada con reintentos y tiempo límite

function normalizarError(e, signal, proveedor) {
  if (signal.aborted && signal.reason instanceof ErrorTiempoAgotado) {
    const err = new ErrorProveedor(`${proveedor.nombre}: ${signal.reason.message}`, { reintentable: true, codigo: 'tiempo_agotado' })
    err.tiempoAgotado = true
    if (e instanceof ErrorProveedor) Object.assign(err, { traza: e.traza, opcionesUsadas: e.opcionesUsadas })
    return err
  }
  if (e instanceof ErrorProveedor) return e
  return new ErrorProveedor(`${proveedor.nombre}: error inesperado: ${e?.message ?? String(e)}`, { causa: e })
}

async function llamarConReintentos(proveedor, viajero) {
  const adaptador = ADAPTADORES[proveedor.id]
  const trazas = []
  const erroresPrevios = []
  const ms = timeoutDe(proveedor.id)
  let tiemposAgotados = 0
  for (let intento = 1; ; intento++) {
    const ctrl = new AbortController()
    const temporizador = setTimeout(() => ctrl.abort(new ErrorTiempoAgotado(ms)), ms)
    const t0 = performance.now()
    try {
      const r = await adaptador.decidir(viajero, proveedor, { signal: ctrl.signal })
      const medido = performance.now() - t0
      trazas.push(...(r.traza ?? []))
      return { ok: true, r, latenciaMs: r.latenciaMs ?? medido, intentos: intento, trazas, erroresPrevios }
    } catch (e) {
      const err = normalizarError(e, ctrl.signal, proveedor)
      trazas.push(...(err.traza ?? []))
      if (err.tiempoAgotado) tiemposAgotados++
      const agotoTiempos = err.tiempoAgotado && tiemposAgotados > REINTENTOS_TIEMPO_AGOTADO[proveedor.id]
      if (!err.reintentable || intento > MAX_REINTENTOS || agotoTiempos) return { ok: false, err, intentos: intento, trazas, erroresPrevios }
      // Cada intento fallido queda declarado en el resultado (no se esconden reintentos).
      erroresPrevios.push(recortar(err.message, 300))
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
  const adaptador = ADAPTADORES[proveedor.id]
  const comun = {
    huellaEstado: huellaViajero(viajero),
    intentos: llamada.intentos,
    ...(llamada.erroresPrevios?.length ? { erroresPrevios: llamada.erroresPrevios } : {}),
    registradoAt: new Date().toISOString(),
  }
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
      costoReportadoUSD: r.costoReportadoUSD ?? null,
      latenciaMs: Math.max(1, Math.round(llamada.latenciaMs)),
      modeloServido: r.modeloServido ?? null,
      fallback: Boolean(r.fallback),
      idRespuesta: r.idRespuesta ?? null,
      requestId: r.requestId ?? null,
      ...comun,
      opcionesUsadas: r.opcionesUsadas ?? adaptador.opcionesPedidas(proveedor),
    }
  }
  const { err } = llamada
  return {
    viajeroId: viajero.id,
    ok: false,
    error: err.message,
    codigoError: err.codigo ?? null,
    decision: null,
    confianza: null,
    salidaTexto: err.salidaTexto ?? null,
    crudo: recortar(err.crudo, CRUDO_MAX),
    // Tokens que la API sí cobró aunque la respuesta no sirviera (negativa, JSON inválido...).
    tokens: err.tokens ?? null,
    costoUSD: 0,
    // Lo que la API cobró por esta llamada fallida (cuenta en el presupuesto del juego).
    // null = no se sabe (sin respuesta: red, tiempo agotado, HTTP de error).
    costoFacturadoUSD: err.tokens ? redondearCosto(calcularCosto(proveedor.precio, err.tokens)) : null,
    costoReportadoUSD: err.costoReportadoUSD ?? null,
    latenciaMs: null,
    modeloServido: err.modeloServido ?? null,
    fallback: Boolean(err.fallback),
    idRespuesta: err.idRespuesta ?? null,
    requestId: err.requestId ?? null,
    ...comun,
    opcionesUsadas: err.opcionesUsadas ?? adaptador.opcionesPedidas(proveedor),
  }
}

// ---------------------------------------------------------------------------
// Corrida

// ¿La corrida cubre todos los proveedores y todos los viajeros del conjunto?
function esParcial(run, dataset) {
  return !IDS.every((id) => run.proveedores.some((p) => p.id === id)) || run.viajeros.length !== dataset.length
}

function nuevaCorrida(proveedores, viajeros, dataset, { nota = null, probe = false } = {}) {
  const { commit, cambiosSinCommit } = commitActual()
  const run = {
    version: 1,
    source: 'live',
    createdAt: new Date().toISOString(),
    ...(nota ? { nota } : {}),
    // Reglas del juego fijadas ANTES de correr: cambiarlas después no cambia esta corrida.
    juego: { presupuestoUSD: JUEGO.presupuestoUSD, vidas: JUEGO.vidas },
    commit,
    cambiosSinCommit,
    huellaPrompt: huellaPrompt(),
    basePeligroJev: typesafe.basePeligroConfigurada(),
    parcial: false,
    probe,
    viajeros: viajeros.map((v) => v.id),
    proveedores,
    resultados: Object.fromEntries(proveedores.map((p) => [p.id, []])),
  }
  run.parcial = probe || esParcial(run, dataset)
  return run
}

function ordenarResultados(run) {
  const indice = new Map(run.viajeros.map((id, i) => [id, i]))
  for (const lista of Object.values(run.resultados)) lista.sort((a, b) => indice.get(a.viajeroId) - indice.get(b.viajeroId))
}

// Si se repite un viajero que había fallado (--reintentar-errores), el error anterior NO se borra:
// queda en `reemplazaA`, como prueba de que no se eligieron resultados a conveniencia.
function ponerRegistro(run, proveedorId, registro) {
  const lista = run.resultados[proveedorId]
  const i = lista.findIndex((r) => r.viajeroId === registro.viajeroId)
  if (i < 0) {
    lista.push(registro)
    return
  }
  const previo = lista[i]
  const { reemplazaA = [], ...resto } = previo
  registro.reemplazaA = [
    ...reemplazaA,
    {
      ok: resto.ok,
      error: resto.error,
      codigoError: resto.codigoError ?? null,
      intentos: resto.intentos ?? null,
      tokens: resto.tokens ?? null,
      costoFacturadoUSD: resto.costoFacturadoUSD ?? null,
      idRespuesta: resto.idRespuesta ?? null,
      requestId: resto.requestId ?? null,
      registradoAt: resto.registradoAt ?? null,
    },
  ]
  lista[i] = registro
}

function resolverArchivo(arg) {
  const candidatos = isAbsolute(arg) ? [arg] : [resolve(arg), join(carpetaRuns(), arg), join(carpetaRuns(), `${arg}.json`)]
  const ruta = candidatos.find((c) => existe(c))
  if (!ruta) salirConError(`No encuentro la corrida para continuar: ${arg}`)
  return ruta
}

function prepararContinuacion(args, dataset) {
  const ruta = resolverArchivo(args.continuar)
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

  // Lo que reciben las IAs debe ser idéntico al del comienzo de la corrida.
  const huella = huellaPrompt()
  if (!run.huellaPrompt) {
    salirConError(
      `${rel(ruta)} no tiene huella del prompt (es de una versión anterior del benchmark): no se puede verificar que ` +
        'el prompt de sistema, el esquema y las preguntas de Jev sean los mismos. Empieza una corrida nueva.',
    )
  }
  if (run.huellaPrompt !== huella) {
    salirConError(
      `El prompt de sistema, el esquema JSON o las preguntas de Jev cambiaron desde que empezó esta corrida ` +
        `(huella ${run.huellaPrompt}, ahora ${huella}). Una corrida no puede mezclar resultados de dos prompts: empieza una nueva.`,
    )
  }
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
    if (JSON.stringify(actual.opciones ?? {}) !== JSON.stringify(p.opciones ?? {})) {
      salirConError(
        `Las opciones de ${p.nombre} cambiaron en shared/modelos.js (la corrida usó ${JSON.stringify(p.opciones)}, ahora ` +
          `${JSON.stringify(actual.opciones)}). No se mezclan configuraciones: empieza una corrida nueva.`,
      )
    }
    if (JSON.stringify(actual.precio) !== JSON.stringify(p.precio)) {
      console.warn(`Aviso: el precio de ${p.nombre} cambió en shared/modelos.js; se mantiene el de la corrida. Al terminar: npm run recalcular -- ${rel(ruta)}`)
    }
  }
  if (ids.includes('jev') && (run.basePeligroJev ?? null) !== typesafe.basePeligroConfigurada()) {
    salirConError(
      `La corrida interpretó el peligro de Jev con TYPESAFE_SCORE_BASE=${run.basePeligroJev ?? '(sin definir)'} y ahora es ` +
        `${typesafe.basePeligroConfigurada() ?? '(sin definir)'}. Usa el mismo valor o empieza una corrida nueva.`,
    )
  }
  if (run.juego && (run.juego.presupuestoUSD !== JUEGO.presupuestoUSD || run.juego.vidas !== JUEGO.vidas)) {
    console.warn(
      `Aviso: shared/config.js tiene presupuesto ${usd(JUEGO.presupuestoUSD)} y ${JUEGO.vidas} vidas, pero esta corrida registró ` +
        `${usd(run.juego.presupuestoUSD)} y ${run.juego.vidas} vidas antes de correr. Se mantienen los de la corrida.`,
    )
  }
  run.proveedores = [...run.proveedores, ...efectivos].sort((a, b) => IDS.indexOf(a.id) - IDS.indexOf(b.id))
  for (const p of run.proveedores) run.resultados[p.id] ??= []

  // Viajeros: los del archivo (si siguen en el conjunto) más los pedidos ahora.
  const quitados = run.viajeros.filter((id) => !porId.has(id))
  if (quitados.length) console.warn(`Aviso: estos viajeros ya no están en data/viajeros.json y se quitan: ${quitados.join(', ')}`)
  const pedidos = new Set([...run.viajeros.filter((id) => porId.has(id)), ...(args.limit ? dataset.slice(0, args.limit) : dataset).map((v) => v.id)])
  run.viajeros = dataset.map((v) => v.id).filter((id) => pedidos.has(id))
  run.parcial = esParcial(run, dataset)

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

async function enParalelo(items, n, fn, detener = () => false) {
  let siguiente = 0
  const trabajador = async () => {
    while (siguiente < items.length && !detener()) {
      const i = siguiente++
      await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, trabajador))
}

function lineaResultado(proveedor, registro, viajero) {
  const corto = proveedor.id === 'opus' ? 'Opus' : proveedor.id === 'gpt' ? 'GPT' : 'Jev'
  if (!registro.ok) return `${corto}: ERROR${registro.costoFacturadoUSD ? ` (facturado ${usd(registro.costoFacturadoUSD)})` : ''}`
  const ev = evaluarDecision(registro.decision, viajero.verdad)
  return `${corto}: ${registro.decision.accion} (${ev.aciertoAccion ? 'acierta' : 'falla'}) ${segundos(registro.latenciaMs)} ${usd(registro.costoUSD)}`
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
  const fin = (p) => {
    if (!(p.respondidas > 0)) return 'No (sin respuestas)'
    if (p.llegoAlFinal) return 'Sí'
    return `No (${p.motivoFin === 'sin_fondos' ? 'sin fondos' : 'sin vidas'} en el viajero ${p.finIndice + 1})`
  }
  const filas = [
    ['', ...ps.map((p) => p.nombre)],
    ['Modelo', ...ps.map((p) => p.modelo)],
    ['Respondidas', ...ps.map((p) => `${p.respondidas}/${p.casos}`)],
    ['Errores de API', ...ps.map((p) => p.erroresApi)],
    ['Aciertos (acción)', ...ps.map((p) => `${porcentaje(p.precisionAccion)} (${p.aciertosAccion}/${p.casos})`)],
    ['Errores graves', ...ps.map((p) => p.erroresGraves)],
    ['Costo promedio por decisión', ...ps.map((p) => usd(p.costoPromedioUSD))],
    ['Costo por 1000 decisiones', ...ps.map((p) => usd(p.costoPor1000USD))],
    ['Costo total (con lo facturado de errores)', ...ps.map((p) => usd(p.costoTotalUSD))],
    ['Latencia promedio', ...ps.map((p) => segundos(p.latenciaPromedioMs))],
    ['Latencia mediana', ...ps.map((p) => segundos(p.latenciaMedianaMs))],
    [`Decisiones con ${usd(est.presupuestoUSD)}`, ...ps.map((p) => p.decisionesEnJuego)],
    ['¿Llegó al final?', ...ps.map(fin)],
  ]
  console.log(
    `\nRESUMEN (${est.totalViajeros} viajeros, presupuesto ${usd(est.presupuestoUSD)}, ${est.vidas} vidas` +
      `${est.reglasRegistradas ? ', fijados antes de correr' : ''})\n`,
  )
  console.log(tabla(filas))

  const avisos = []
  for (const p of ps) {
    const regs = run.resultados[p.id] ?? []
    if (p.tokensEstimados) avisos.push(`${p.nombre}: hay tokens ESTIMADOS (la API no los reportó); el costo es aproximado.`)
    const sinSalida = regs.filter((r) => r.ok && r.tokens && r.tokens.salida === null).length
    if (sinSalida) avisos.push(`${p.nombre}: ${sinSalida} respuesta(s) sin tokens de salida informados (quedan como "no informado", no como 0).`)
    if (!p.precio.verificado) avisos.push(`${p.nombre}: precio NO verificado (${p.precio.fuente}). Verifícalo y corre npm run recalcular.`)
    const conFacturado = regs.filter((r) => !r.ok && r.costoFacturadoUSD)
    if (conFacturado.length) {
      const facturado = conFacturado.reduce((a, r) => a + r.costoFacturadoUSD, 0)
      avisos.push(
        `${p.nombre}: ${conFacturado.length} error(es) con respuesta (negativa, JSON inválido...) se facturaron ${usd(facturado)}; ` +
          'cuentan en el presupuesto del juego y en el costo total.',
      )
    }
    const distintos = regs.filter((r) => r.costoReportadoUSD !== null && r.costoReportadoUSD !== undefined).filter((r) => {
      const calculado = r.ok ? r.costoUSD : r.costoFacturadoUSD ?? 0
      const ref = Math.max(Math.abs(calculado), Math.abs(r.costoReportadoUSD))
      return ref > 0 && Math.abs(calculado - r.costoReportadoUSD) / ref > TOLERANCIA_COSTO_REPORTADO
    })
    if (distintos.length) {
      const r = distintos[0]
      avisos.push(
        `${p.nombre}: en ${distintos.length} llamada(s) el costo que informa la API difiere más de ${porcentaje(TOLERANCIA_COSTO_REPORTADO)} del calculado ` +
          `(p. ej. ${r.viajeroId}: API ${r.costoReportadoUSD}, calculado ${r.ok ? r.costoUSD : r.costoFacturadoUSD}). Revisa el precio en shared/modelos.js.`,
      )
    }
    const opciones = new Set(regs.filter((r) => r.opcionesUsadas).map((r) => JSON.stringify(r.opcionesUsadas)))
    if (opciones.size > 1) avisos.push(`${p.nombre}: no todas las llamadas usaron las mismas opciones: ${[...opciones].join(' | ')}`)
    const reintentados = regs.filter((r) => r.intentos > 1).length
    if (reintentados) avisos.push(`${p.nombre}: ${reintentados} llamada(s) necesitaron reintentos (quedan declarados en "erroresPrevios").`)
    const reemplazos = regs.filter((r) => r.reemplazaA?.length).length
    if (reemplazos) avisos.push(`${p.nombre}: ${reemplazos} viajero(s) se repitieron con --reintentar-errores (el error anterior queda en "reemplazaA").`)
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
      `Tokens: entrada ${t.entrada} (cacheados ${t.entradaCacheada}), salida ${t.salida ?? 'NO INFORMADA'}` +
        ` (razonamiento ${t.razonamiento ?? 'no desglosado'})${t.estimado ? ' [ESTIMADOS: la API no los reportó]' : ''}`,
    )
  }
  const p = proveedor.precio
  console.log(
    `Costo: ${registro.ok ? usd(registro.costoUSD) : `${usd(0)} como decisión (facturado: ${usd(registro.costoFacturadoUSD)})`}` +
      `${registro.costoReportadoUSD !== null ? ` · la API informa: ${registro.costoReportadoUSD}` : ''}` +
      `  [precio por millón de tokens: entrada ${p.entradaPorMTok}, cacheada ${p.entradaCacheadaPorMTok}, salida ${p.salidaPorMTok} USD;` +
      ` ${p.verificado ? 'verificado' : 'NO verificado'}]`,
  )
  console.log(
    `Latencia: ${registro.ok ? segundos(registro.latenciaMs) : '—'} · intentos: ${registro.intentos}` +
      ` · modelo servido: ${registro.modeloServido ?? '(no lo informa)'}` +
      ` · id de respuesta: ${registro.idRespuesta ?? '(no lo informa)'} · request-id: ${registro.requestId ?? '(no lo informa)'}` +
      `${registro.opcionesUsadas ? ` · opciones usadas: ${JSON.stringify(registro.opcionesUsadas)}` : ''}`,
  )
  if (proveedor.id === 'jev') {
    console.log(
      `Escala del peligro numérico (TYPESAFE_SCORE_BASE): ${typesafe.basePeligroConfigurada() ?? 'sin definir'}. ` +
        'Si Jev devuelve el peligro como número, mira la respuesta cruda y define 0 (escala 0-4) o 1 (escala 1-5).',
    )
  }
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
  const run = nuevaCorrida(proveedores, [viajero], dataset, {
    nota: 'Prueba de conexión (--probe): un solo viajero. No es una corrida completa.',
    probe: true,
  })
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

// ¿Se puede copiar a latest.json? Usa la MISMA regla que la app, el render y el guion
// (shared/publicable.js); solo deja pasar lo que se arregla después sin repetir la corrida.
function decidirLatest(run, dataset) {
  const { bloqueos, avisos } = motivosNoPublicable(run, dataset, { juego: JUEGO, publicacion: PUBLICACION, proveedores: PROVEEDORES })
  const impiden = bloqueos.filter((b) => !SE_ARREGLAN_DESPUES.has(b.codigo))
  // Una respuesta de Jev que el parser no entendió es un fallo del arnés, no de Jev.
  const formatoJev = (run.resultados.jev ?? []).filter((r) => !r.ok && r.codigoError === 'formato').length
  if (formatoJev) {
    impiden.push({
      codigo: 'formato_jev',
      texto: `${formatoJev} respuesta(s) de Jev con formato no reconocido: es un fallo del parser (bench/providers/typesafe.mjs), no de Jev`,
    })
  }
  return { bloqueos, avisos, impiden, despues: bloqueos.filter((b) => SE_ARREGLAN_DESPUES.has(b.codigo)) }
}

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
    run = nuevaCorrida(proveedoresEfectivos(ids), viajeros, dataset)
    activos = run.proveedores
    // Las corridas parciales llevan el prefijo "prueba-" (están en .gitignore).
    ruta = join(carpetaRuns(), `${run.parcial ? 'prueba-' : ''}${marcaFechaArchivo(new Date(run.createdAt))}.json`)
    if (run.cambiosSinCommit) {
      console.warn('Aviso: hay cambios sin commit en la-frontera/: haz commit antes de la corrida real, así el código queda verificable.')
    }
  }
  const porId = new Map(dataset.map((v) => [v.id, v]))
  const viajerosRun = run.viajeros.map((id) => porId.get(id))
  const tareas = pendientes(run, activos, viajerosRun, args.reintentarErrores)
  verificarClaves([...new Set(tareas.flatMap((t) => t.proveedores.map((p) => p.id)))])

  console.log(
    `Benchmark: ${viajerosRun.length} viajeros x ${activos.map((p) => p.nombre).join(', ')}. ` +
      `Pendientes: ${tareas.length} viajeros. Concurrencia: ${args.concurrencia} viajeros a la vez.`,
  )
  console.log(
    `Reglas del juego registradas en la corrida: presupuesto ${usd(run.juego?.presupuestoUSD)}, ${run.juego?.vidas ?? '—'} vidas` +
      ` · commit ${run.commit ? run.commit.slice(0, 12) : '(desconocido)'} · huella del prompt ${run.huellaPrompt}`,
  )
  if (tareas.length) {
    estimarCosto(
      activos,
      tareas.map((t) => t.viajero),
    )
    if (!(await confirmar(args))) {
      console.log('Cancelado: no se hizo ninguna llamada.')
      return
    }
  }
  escribirJSON(ruta, run)
  console.log(`Progreso en: ${rel(ruta)}\n`)

  process.once('SIGINT', () => {
    console.log(`\n\nInterrumpido. El progreso está guardado en ${rel(ruta)}.\nPara seguir: node bench/run.mjs --continuar ${rel(ruta)}`)
    process.exit(130)
  })

  let hechos = 0
  let fatal = null
  const ancho = String(tareas.length).length
  await enParalelo(
    tareas,
    args.concurrencia,
    async ({ viajero, proveedores }) => {
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
      for (const [p, r] of registros) {
        if (r.ok) continue
        console.log(`      ${p.nombre}: ${recortar(r.error, 400)}`)
        if (CODIGOS_FATALES.has(r.codigoError)) fatal ??= `${p.nombre}: ${r.error}`
      }
    },
    () => fatal !== null,
  )

  ordenarResultados(run)
  escribirJSON(ruta, run)
  console.log(`\nCorrida guardada: ${rel(ruta)}`)
  if (fatal) {
    salirConError(
      `Corrida detenida por un error de configuración, clave o saldo (fallaría con todos los viajeros):\n  ${fatal}\n` +
        `Corrígelo, prueba con npm run probar-apis y sigue con: node bench/run.mjs --continuar ${rel(ruta)} --reintentar-errores`,
    )
  }
  imprimirResumen(run, dataset)

  const { avisos, impiden, despues } = decidirLatest(run, dataset)
  if (avisos.length) {
    console.log('\nPara el video (avisos que se muestran pero no impiden publicar):')
    for (const a of avisos) console.log(`  - ${a.texto}`)
  }
  if (!impiden.length) {
    const rutaLatest = join(carpetaRuns(), 'latest.json')
    escribirJSON(rutaLatest, run)
    console.log(`\nCopiada a ${rel(rutaLatest)}: el video usará esta corrida real.`)
    if (despues.length) {
      console.log('Antes de publicar el video falta (se arregla sin repetir la corrida; mientras tanto el video lleva marca de agua):')
      for (const b of despues) console.log(`  - ${b.texto}`)
      console.log('  Precios: verifícalos en la página oficial, pon verificado: true en shared/modelos.js y corre npm run recalcular.')
      console.log('  Divulgación: escribe tu relación con TypeSafe en PUBLICACION.divulgacion (shared/config.js).')
    }
  } else {
    console.log('\nNo se tocó latest.json. Motivos:')
    for (const b of impiden) console.log(`  - ${b.texto}`)
    if (impiden.some((b) => b.codigo === 'errores' || b.codigo === 'formato_jev')) {
      console.log(`Corrige la causa y repite esos viajeros con:\n  node bench/run.mjs --continuar ${rel(ruta)} --reintentar-errores`)
    }
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
    typesafe.basePeligroConfigurada()
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
