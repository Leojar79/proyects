// Carga de la corrida y preparación de todo lo que el video necesita, calculado una sola vez.
// Los números salen SIEMPRE de shared/juego.js (simularJuego / calcularEstadisticas).

import datos from '../../data/viajeros.json'
import { JUEGO, PUBLICACION } from '../../shared/config.js'
import { calcularEstadisticas } from '../../shared/juego.js'
import { segmentosGuion } from '../../shared/guion.js'
import { PROVEEDORES } from '../../shared/modelos.js'
import { motivosNoPublicable, textoMarcaAgua } from '../../shared/publicable.js'
import { COLA_RAPIDO, DETALLE, ESCENAS, VIAJEROS_DETALLE } from '../../shared/timeline.js'
import { contar } from './anim.js'
import { sha256Hex } from './sha256.js'

const NOMBRE_VALIDO = /^[A-Za-z0-9_.-]+$/

// Devuelve { run, bytes } (bytes = el JSON tal como se descargó, para su huella sha256) o null.
async function leerCorrida(nombre) {
  if (!NOMBRE_VALIDO.test(nombre)) return null
  try {
    const res = await fetch(`runs/${nombre}.json`, { cache: 'no-store' })
    if (!res.ok) return null
    const tipo = res.headers.get('content-type') ?? ''
    const bytes = new Uint8Array(await res.arrayBuffer())
    const texto = new TextDecoder().decode(bytes)
    // El servidor de desarrollo responde index.html para rutas que no existen.
    if (tipo.includes('html') || texto.trimStart().startsWith('<')) return null
    return { run: JSON.parse(texto), bytes }
  } catch {
    return null
  }
}

// 'latest' cae a 'demo' si no existe. Devuelve { run, nombre, archivo, sha256 } o null.
// `sha256` es la huella de los bytes descargados: cualquiera puede comprobar que el video
// salió de ese archivo exacto del repositorio (sha256sum public/runs/<archivo>).
export async function cargarCorrida(nombre) {
  const intentos = nombre === 'latest' ? ['latest', 'demo'] : [nombre]
  for (const n of intentos) {
    const leida = await leerCorrida(n)
    if (leida) return { run: leida.run, nombre: n, archivo: `${n}.json`, sha256: await sha256Hex(leida.bytes) }
  }
  return null
}

export const ESC = Object.fromEntries(ESCENAS.map((e) => [e.id, e]))

// Tiempos de cada evento del juego (en segundos del video), por proveedor y viajero.
function construirTiempos(run, N, sim) {
  const det = ESC.detalle
  const rap = ESC.rapido
  const slotDet = (det.fin - det.inicio) / VIAJEROS_DETALLE
  // El último tramo (COLA_RAPIDO) no recibe viajeros: así el último sello no cae bajo la cortina.
  const slotRap = (rap.fin - COLA_RAPIDO - rap.inicio) / Math.max(1, N - VIAJEROS_DETALLE)
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
    // Una llamada con error no tiene latencia medida: se resuelve al final de la ventana
    // (nunca antes que una respuesta real) y su cronómetro muestra "—".
    const resuelve = {}
    for (const p of run.proveedores) {
      resuelve[p.id] = lat[p.id] !== undefined ? t0 + (lat[p.id] / 1000) * escala : t0 + DETALLE.ventanaRespuesta
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

// `extra` = { archivo, sha256 } de cargarCorrida (para la línea "Datos: ..." del cierre).
export function prepararModelo(run, extra = {}) {
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
  // Única regla para decidir si el video se puede publicar (la misma que usan el render y el guion).
  const publicable = motivosNoPublicable(run, todos, { juego: JUEGO, publicacion: PUBLICACION, proveedores: PROVEEDORES })
  let segmentos = []
  let errorGuion = null
  try {
    segmentos = segmentosGuion(stats) ?? []
  } catch (e) {
    // Sin subtítulos el video no se ve afectado; con subtítulos la app avisa el error (App.jsx).
    console.error('segmentosGuion falló:', e)
    errorGuion = e?.message ?? String(e)
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
  return {
    run,
    viajeros,
    stats,
    sim,
    N,
    proveedores: run.proveedores,
    tl,
    segmentos,
    errorGuion,
    ultimaLat,
    publicable,
    // Con cualquier bloqueo el video lleva marca de agua (no solo con datos demo).
    esDemo: publicable.bloqueos.length > 0,
    marcaAgua: textoMarcaAgua(publicable),
    // Divulgación de la relación con TypeSafe: se muestra durante todo el video si existe.
    divulgacion: String(PUBLICACION.divulgacion ?? '').trim(),
    archivo: extra.archivo ?? null,
    sha256: extra.sha256 ?? null,
    // Presupuesto y vidas de la corrida (registrados antes de correr), no los de la configuración actual.
    presupuestoUSD: stats.presupuestoUSD,
    vidas: stats.vidas,
  }
}

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
  const BASE = { gastado: 0, vidas: m.vidas, decisiones: 0, aciertos: 0 }
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
    // Decisiones y aciertos cambian juntos (al revelar la respuesta correcta): así el contador
    // nunca muestra por un instante un fallo que no existe ("0/1 aciertos" con el sello correcto).
    decisiones: pV.decisiones,
    aciertos: pV.aciertos,
    vidas: pV.vidas,
    perdioVidaEn: perdioVida ? ve[kV] : null,
    cambioDecisionEn: kV >= 0 && pV.decisiones !== pVprev.decisiones ? ve[kV] : null,
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
