#!/usr/bin/env node
// Genera public/runs/demo.json: una corrida SIMULADA (source: "demo") para diseñar y probar el
// video sin llamar a las APIs. Mismo esquema que una corrida real, para TODOS los viajeros de
// data/viajeros.json. Determinista: la misma entrada produce los mismos números.
//
// NADA de esto es un resultado real: la app dibuja la marca de agua "DEMO" siempre que source !== "live".
//
// Uso: node bench/demo.mjs

import { join, relative } from 'node:path'
import { calcularCosto, PROVEEDORES } from '../shared/modelos.js'
import { ACCIONES, NIVELES_PELIGRO, preguntasJev, promptSistemaLLM, textoEstado } from '../shared/preguntas.js'
import { problemasCorrida, NOTA_DEMO } from './lib/contrato.mjs'
import { carpetaRuns, cargarViajeros, escribirJSON, huellaViajero, redondearCosto } from './lib/datos.mjs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const SEMILLA = 20261010

// Simulación por proveedor (rangos pedidos para la demo).
const SIMULACION = {
  gpt: { latenciaMs: [1500, 4500], tasaAcierto: 0.9, razonamiento: [60, 400] },
  opus: { latenciaMs: [1200, 3600], tasaAcierto: 0.92, razonamiento: [60, 400] },
  jev: { latenciaMs: [150, 600], tasaAcierto: 0.9, razonamiento: null },
}
// Probabilidad de que un error sea grave (dejar pasar una amenaza o arrestar a un inocente).
const PROB_ERROR_GRAVE = 0.3

// PRNG mulberry32: determinista y suficiente para simular.
export function mulberry32(semilla) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Hash FNV-1a de 32 bits: cada (proveedor, viajero) tiene su propio generador, así agregar
// o quitar viajeros no cambia los números de los demás.
function hash32(texto) {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const generador = (...partes) => mulberry32((SEMILLA ^ hash32(partes.join(':'))) >>> 0)
const entre = (rnd, [min, max]) => min + rnd() * (max - min)
const enteroEntre = (rnd, min, max) => Math.floor(min + rnd() * (max - min + 1))

// Elige exactamente round(N x (1 - tasa)) viajeros con error, de forma determinista.
function viajerosConError(proveedorId, viajeros, tasaAcierto) {
  const n = Math.round(viajeros.length * (1 - tasaAcierto))
  const orden = viajeros
    .map((v) => ({ id: v.id, clave: generador('error', proveedorId, v.id)() }))
    .sort((a, b) => a.clave - b.clave)
  return new Set(orden.slice(0, n).map((x) => x.id))
}

function decisionSimulada(rnd, verdad, conError) {
  const max = NIVELES_PELIGRO.length - 1
  if (!conError) {
    // Acción correcta; a veces se equivoca un nivel de peligro o en "miente".
    const desvio = rnd() < 0.2 ? (rnd() < 0.5 ? -1 : 1) : 0
    return {
      pasa: verdad.pasa,
      miente: rnd() < 0.05 ? !verdad.miente : verdad.miente,
      peligro: Math.min(max, Math.max(0, verdad.peligro + desvio)),
      accion: verdad.accion,
    }
  }
  let accion
  const graveDisponible = verdad.accion === 'arrestar' || verdad.accion === 'aprobar'
  if (graveDisponible && rnd() < PROB_ERROR_GRAVE) {
    accion = verdad.accion === 'arrestar' ? 'aprobar' : 'arrestar'
  } else {
    // Otra acción que no sea un error grave.
    const opciones = ACCIONES.filter(
      (a) =>
        a !== verdad.accion &&
        !(verdad.accion === 'arrestar' && a === 'aprobar') &&
        !(verdad.accion === 'aprobar' && a === 'arrestar'),
    )
    accion = opciones[Math.floor(rnd() * opciones.length)]
  }
  const peligroError = accion === 'aprobar' ? 0 : accion === 'arrestar' ? Math.max(3, verdad.peligro) : verdad.peligro
  return {
    pasa: accion === 'aprobar',
    miente: rnd() < 0.3 ? !verdad.miente : verdad.miente,
    peligro: Math.min(max, Math.max(0, peligroError + (rnd() < 0.3 ? (rnd() < 0.5 ? -1 : 1) : 0))),
    accion,
  }
}

function confianzaSimulada(rnd, conError) {
  const rango = conError ? [0.45, 0.75] : [0.75, 0.99]
  const p = () => Math.round(entre(rnd, rango) * 100) / 100
  return { pasa: p(), miente: p(), peligro: p(), accion: p() }
}

export function generarDemo(viajeros, createdAt = new Date().toISOString()) {
  const proveedores = structuredClone(PROVEEDORES)
  const sistema = promptSistemaLLM()
  const preguntas = JSON.stringify(preguntasJev())
  const resultados = {}

  for (const p of proveedores) {
    const sim = SIMULACION[p.id]
    const errores = viajerosConError(p.id, viajeros, sim.tasaAcierto)
    resultados[p.id] = viajeros.map((v) => {
      const rnd = generador('resultado', p.id, v.id)
      const conError = errores.has(v.id)
      const decision = decisionSimulada(rnd, v.verdad, conError)
      const esJev = p.id === 'jev'
      const estado = textoEstado(v)
      const entrada = Math.ceil((esJev ? estado + preguntas : sistema + estado).length / 4)
      const razonamiento = sim.razonamiento ? enteroEntre(rnd, ...sim.razonamiento) : null
      const salida = esJev ? 0 : enteroEntre(rnd, 22, 28) + razonamiento
      const tokens = { entrada, entradaCacheada: 0, salida, razonamiento, estimado: false }
      const confianza = esJev ? confianzaSimulada(rnd, conError) : null
      return {
        viajeroId: v.id,
        ok: true,
        error: null,
        decision,
        confianza,
        salidaTexto: JSON.stringify(decision),
        crudo: '(demo: no hubo respuesta HTTP; datos simulados)',
        tokens,
        costoUSD: redondearCosto(calcularCosto(p.precio, tokens)),
        latenciaMs: Math.round(entre(rnd, sim.latenciaMs)),
        modeloServido: p.modelo,
        fallback: false,
        huellaEstado: huellaViajero(v),
        intentos: 1,
        opcionesUsadas: p.opciones,
      }
    })
  }

  return {
    version: 1,
    source: 'demo',
    createdAt,
    nota: NOTA_DEMO,
    viajeros: viajeros.map((v) => v.id),
    proveedores,
    resultados,
  }
}

function main() {
  const viajeros = cargarViajeros()
  const run = generarDemo(viajeros)
  const problemas = problemasCorrida(run, viajeros, { exigirCompleta: true })
  if (problemas.length) {
    console.error(`La corrida demo NO cumple el contrato:\n  - ${problemas.join('\n  - ')}`)
    process.exit(1)
  }
  const ruta = join(carpetaRuns(), 'demo.json')
  escribirJSON(ruta, run)
  console.log(`Corrida DEMO (datos simulados) guardada en ${relative(process.cwd(), ruta) || ruta}: ${viajeros.length} viajeros x ${run.proveedores.length} proveedores.`)
  for (const p of run.proveedores) {
    const rs = run.resultados[p.id]
    const aciertos = rs.filter((r, i) => r.decision.accion === viajeros[i].verdad.accion).length
    const costo = rs.reduce((a, r) => a + r.costoUSD, 0) / rs.length
    const lat = rs.reduce((a, r) => a + r.latenciaMs, 0) / rs.length
    console.log(
      `  ${p.nombre.padEnd(16)} aciertos ${aciertos}/${rs.length}  costo prom. US$ ${costo.toPrecision(3)}  latencia prom. ${Math.round(lat)} ms`,
    )
  }
  console.log('Chequeo del contrato: OK.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
