// Carga de la corrida y preparación de todo lo que el video necesita, calculado una sola vez.
// Los números salen SIEMPRE de shared/juego.js (simularJuego / calcularEstadisticas).

import datos from '../../data/viajeros.json'
import { JUEGO } from '../../shared/config.js'
import { calcularEstadisticas } from '../../shared/juego.js'
import { segmentosGuion } from '../../shared/guion.js'
import { DETALLE, ESCENAS, VIAJEROS_DETALLE } from '../../shared/timeline.js'
import { contar } from './anim.js'

const NOMBRE_VALIDO = /^[A-Za-z0-9_.-]+$/

async function leerCorrida(nombre) {
  if (!NOMBRE_VALIDO.test(nombre)) return null
  try {
    const res = await fetch(`runs/${nombre}.json`, { cache: 'no-store' })
    if (!res.ok) return null
    const tipo = res.headers.get('content-type') ?? ''
    const texto = await res.text()
    // El servidor de desarrollo responde index.html para rutas que no existen.
    if (tipo.includes('html') || texto.trimStart().startsWith('<')) return null
    return JSON.parse(texto)
  } catch {
    return null
  }
}

// 'latest' cae a 'demo' si no existe. Devuelve { run, nombre } o null.
export async function cargarCorrida(nombre) {
  const intentos = nombre === 'latest' ? ['latest', 'demo'] : [nombre]
  for (const n of intentos) {
    const run = await leerCorrida(n)
    if (run) return { run, nombre: n }
  }
  return null
}

export const ESC = Object.fromEntries(ESCENAS.map((e) => [e.id, e]))

// Tiempos de cada evento del juego (en segundos del video), por proveedor y viajero.
function construirTiempos(run, N, sim) {
  const det = ESC.detalle
  const rap = ESC.rapido
  const slotDet = (det.fin - det.inicio) / VIAJEROS_DETALLE
  const slotRap = (rap.fin - rap.inicio) / Math.max(1, N - VIAJEROS_DETALLE)
  const inicio = []
  const detalle = [] // por viajero en detalle: { escala, revela, resuelve: {pid: t} }
  for (let i = 0; i < N; i++) {
    if (i < VIAJEROS_DETALLE) inicio.push(det.inicio + i * slotDet)
    else inicio.push(rap.inicio + (i - VIAJEROS_DETALLE) * slotRap)
  }
  for (let i = 0; i < Math.min(N, VIAJEROS_DETALLE); i++) {
    const t0 = inicio[i] + DETALLE.habla
    const lat = {}
    for (const p of run.proveedores) {
      const paso = sim.porProveedor[p.id].pasos[i]
      const r = paso?.activo ? paso.resultado : null
      if (r && Number.isFinite(r.latenciaMs) && r.latenciaMs > 0) lat[p.id] = r.latenciaMs
    }
    const maxMs = Math.max(0, ...Object.values(lat))
    const escala = maxMs > DETALLE.ventanaRespuesta * 1000 ? (DETALLE.ventanaRespuesta * 1000) / maxMs : 1
    const resuelve = {}
    for (const p of run.proveedores) {
      resuelve[p.id] = lat[p.id] !== undefined ? t0 + (lat[p.id] / 1000) * escala : t0 + DETALLE.ventanaRespuesta * 0.92
    }
    const ultimo = Math.max(...Object.values(resuelve)) - t0
    const revela = Math.min(t0 + DETALLE.ventanaRespuesta, t0 + ultimo + 0.45, inicio[i] + slotDet - 0.6)
    detalle.push({ t0, escala, revela, resuelve, maxMs })
  }
  const evento = {}
  const veredicto = {}
  const gameOver = {}
  for (const p of run.proveedores) {
    evento[p.id] = []
    veredicto[p.id] = []
    for (let i = 0; i < N; i++) {
      if (i < VIAJEROS_DETALLE) {
        evento[p.id].push(detalle[i].resuelve[p.id])
        veredicto[p.id].push(detalle[i].revela)
      } else {
        const e = inicio[i] + 0.3 * slotRap
        evento[p.id].push(e)
        veredicto[p.id].push(e + 0.02)
      }
    }
    const juego = sim.porProveedor[p.id]
    if (juego.finIndice !== null && juego.finIndice !== undefined) {
      const fi = juego.finIndice
      let t
      if (juego.motivoFin === 'sin_fondos') {
        t = fi < VIAJEROS_DETALLE ? inicio[fi] + DETALLE.habla + 0.2 : inicio[fi] + 0.05
      } else {
        const k = fi - 1
        t = veredicto[p.id][k] + (k < VIAJEROS_DETALLE ? 0.55 : 0.2)
      }
      gameOver[p.id] = { t, motivo: juego.motivoFin, indice: fi }
    } else gameOver[p.id] = null
  }
  return { inicio, detalle, evento, veredicto, gameOver, slotDet, slotRap }
}

export function prepararModelo(run) {
  const todos = datos.viajeros
  const porId = new Map(todos.map((v) => [v.id, v]))
  if (!Array.isArray(run?.viajeros) || !Array.isArray(run?.proveedores)) {
    throw new Error('El archivo de corrida no tiene "viajeros" y "proveedores".')
  }
  const faltan = run.viajeros.filter((id) => !porId.has(id))
  if (faltan.length) {
    throw new Error(`La corrida usa viajeros que no están en data/viajeros.json: ${faltan.slice(0, 5).join(', ')}`)
  }
  const viajeros = run.viajeros.map((id) => porId.get(id))
  const stats = calcularEstadisticas(run, todos, JUEGO)
  const sim = stats.sim
  const N = viajeros.length
  const tl = construirTiempos(run, N, sim)
  let segmentos = []
  try {
    segmentos = segmentosGuion(stats) ?? []
  } catch (e) {
    console.error('segmentosGuion falló:', e)
  }
  // Última latencia conocida (para el contador "último") por proveedor y viajero.
  const ultimaLat = {}
  for (const p of run.proveedores) {
    let ultima = null
    ultimaLat[p.id] = sim.porProveedor[p.id].pasos.map((paso) => {
      if (paso.activo && paso.resultado?.ok && paso.resultado.latenciaMs > 0) ultima = paso.resultado.latenciaMs
      return ultima
    })
  }
  return { run, viajeros, stats, sim, N, proveedores: run.proveedores, tl, segmentos, ultimaLat, esDemo: run.source !== 'live' }
}

const BASE = { gastado: 0, vidas: JUEGO.vidas, decisiones: 0, aciertos: 0 }

// Estado visible de los contadores de un proveedor en el segundo t (con animaciones de conteo).
export function estadoProveedor(m, pid, t) {
  const pasos = m.sim.porProveedor[pid].pasos
  const ev = m.tl.evento[pid]
  const ve = m.tl.veredicto[pid]
  let kE = -1
  let kV = -1
  for (let i = 0; i < pasos.length; i++) {
    if (ev[i] <= t) kE = i
    if (ve[i] <= t) kV = i
  }
  const durConteo = Math.min(0.45, m.tl.slotRap * 0.85)
  const pE = kE >= 0 ? pasos[kE] : BASE
  const pEprev = kE >= 1 ? pasos[kE - 1] : BASE
  const pV = kV >= 0 ? pasos[kV] : BASE
  const pVprev = kV >= 1 ? pasos[kV - 1] : BASE
  const gastado = kE >= 0 ? contar(t, ev[kE], durConteo, pEprev.gastado, pE.gastado) : 0
  const perdioVida = kV >= 0 && pV.vidas < pVprev.vidas
  const go = m.tl.gameOver[pid]
  return {
    gastado,
    gastadoFinal: pE.gastado,
    decisiones: pE.decisiones,
    aciertos: pV.aciertos,
    vidas: pV.vidas,
    perdioVidaEn: perdioVida ? ve[kV] : null,
    cambioDecisionEn: kE >= 0 && pE.decisiones !== pEprev.decisiones ? ev[kE] : null,
    cambioAciertoEn: kV >= 0 && pV.aciertos !== pVprev.aciertos ? ve[kV] : null,
    ultimaLatMs: kE >= 0 ? m.ultimaLat[pid][kE] : null,
    gameOver: go && t >= go.t ? go : null,
  }
}

// Estado de la casilla del viajero i en el tablero de un proveedor.
export function casilla(m, pid, i, t) {
  const paso = m.sim.porProveedor[pid].pasos[i]
  const tEv = m.tl.evento[pid][i]
  const go = m.tl.gameOver[pid]
  if (!paso.activo) {
    return { estado: go && t >= go.t ? 'perdido' : 'pendiente', t0: go?.t ?? tEv }
  }
  if (t < tEv) return { estado: 'pendiente', t0: tEv }
  const e = paso.evaluacion
  let estado = 'mal'
  if (!e.respondio) estado = 'error'
  else if (e.aciertoAccion) estado = 'bien'
  else if (e.errorGrave) estado = 'grave'
  return { estado, t0: tEv }
}
