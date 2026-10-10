// Reglas del juego aplicadas a una corrida del benchmark. Funciones puras: el juego,
// el guion y el render llegan siempre a los mismos números.

// Compara la decisión de una IA con la respuesta correcta del viajero.
export function evaluarDecision(decision, verdad) {
  if (!decision) {
    return {
      respondio: false,
      aciertoAccion: false,
      aciertoPasa: false,
      aciertoMiente: false,
      errorPeligro: null,
      errorGrave: false,
      tipoError: 'sin_respuesta',
    }
  }
  const aciertoAccion = decision.accion === verdad.accion
  const seColoAmenaza = verdad.accion === 'arrestar' && decision.accion === 'aprobar'
  const arrestoInocente = verdad.accion === 'aprobar' && decision.accion === 'arrestar'
  const errorGrave = seColoAmenaza || arrestoInocente
  let tipoError = null
  if (!aciertoAccion) {
    tipoError = seColoAmenaza ? 'se_colo_amenaza' : arrestoInocente ? 'arresto_inocente' : 'decision_distinta'
  }
  return {
    respondio: true,
    aciertoAccion,
    aciertoPasa: decision.pasa === verdad.pasa,
    aciertoMiente: decision.miente === verdad.miente,
    errorPeligro: Math.abs(decision.peligro - verdad.peligro),
    errorGrave,
    tipoError,
  }
}

function promedio(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

function mediana(xs) {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Recorre los viajeros en orden para cada proveedor aplicando presupuesto y vidas.
// `pasos[i]` es el estado DESPUÉS de procesar al viajero i (o el estado congelado si ya perdió).
// `finIndice` = primer viajero que ya no pudo atender (null si llegó al final).
export function simularJuego(run, viajeros, { presupuestoUSD, vidas }) {
  const porId = new Map(viajeros.map((v) => [v.id, v]))
  const orden = run.viajeros
  const porProveedor = {}

  for (const p of run.proveedores) {
    const resultados = new Map((run.resultados[p.id] ?? []).map((r) => [r.viajeroId, r]))
    let gastado = 0
    let vidasRestantes = vidas
    let decisiones = 0
    let aciertos = 0
    let finIndice = null
    let motivoFin = null
    const pasos = []

    orden.forEach((id, i) => {
      const congelado = { indice: i, viajeroId: id, gastado, vidas: vidasRestantes, decisiones, aciertos }
      if (finIndice !== null) {
        pasos.push({ ...congelado, activo: false, estado: motivoFin })
        return
      }
      const r = resultados.get(id)
      const costo = r?.costoUSD ?? 0
      if (gastado + costo > presupuestoUSD + 1e-12) {
        finIndice = i
        motivoFin = 'sin_fondos'
        pasos.push({ ...congelado, activo: false, estado: 'sin_fondos', costoNecesario: costo })
        return
      }
      gastado += costo
      const evaluacion = evaluarDecision(r?.ok ? r.decision : null, porId.get(id).verdad)
      if (evaluacion.respondio) decisiones++
      if (evaluacion.aciertoAccion) aciertos++
      if (evaluacion.errorGrave) vidasRestantes--
      const estado = vidasRestantes <= 0 ? 'sin_vidas' : 'jugando'
      pasos.push({
        indice: i,
        viajeroId: id,
        activo: true,
        resultado: r ?? null,
        evaluacion,
        costoUSD: costo,
        gastado,
        vidas: vidasRestantes,
        decisiones,
        aciertos,
        estado,
      })
      if (vidasRestantes <= 0) {
        finIndice = i + 1
        motivoFin = 'sin_vidas'
      }
    })

    porProveedor[p.id] = {
      pasos,
      finIndice,
      motivoFin,
      llegoAlFinal: motivoFin === null,
      decisionesEnJuego: decisiones,
      gastadoFinal: gastado,
    }
  }
  return { porProveedor, presupuestoUSD, vidas, totalViajeros: orden.length }
}

// Métricas sobre TODOS los viajeros de la corrida (no solo los que alcanzó el presupuesto),
// para que la comparación de aciertos y costo sea completa.
export function resumirProveedor(run, viajeros, proveedorId) {
  const porId = new Map(viajeros.map((v) => [v.id, v]))
  const res = run.resultados[proveedorId] ?? []
  const ok = res.filter((r) => r.ok)
  const evals = res.map((r) => evaluarDecision(r.ok ? r.decision : null, porId.get(r.viajeroId).verdad))
  const costoPromedioUSD = promedio(ok.map((r) => r.costoUSD))
  return {
    casos: res.length,
    respondidas: ok.length,
    erroresApi: res.length - ok.length,
    aciertosAccion: evals.filter((e) => e.aciertoAccion).length,
    precisionAccion: res.length ? evals.filter((e) => e.aciertoAccion).length / res.length : 0,
    precisionMiente: res.length ? evals.filter((e) => e.aciertoMiente).length / res.length : 0,
    erroresGraves: evals.filter((e) => e.errorGrave).length,
    costoPromedioUSD,
    costoPor1000USD: costoPromedioUSD * 1000,
    costoTotalUSD: ok.reduce((a, r) => a + r.costoUSD, 0),
    latenciaPromedioMs: promedio(ok.map((r) => r.latenciaMs)),
    latenciaMedianaMs: mediana(ok.map((r) => r.latenciaMs)),
    tokensEntradaProm: promedio(ok.map((r) => r.tokens?.entrada ?? 0)),
    tokensSalidaProm: promedio(ok.map((r) => r.tokens?.salida ?? 0)),
    tokensRazonamientoProm: promedio(ok.map((r) => r.tokens?.razonamiento ?? 0)),
    tokensEstimados: ok.some((r) => r.tokens?.estimado),
    usoFallback: ok.some((r) => r.fallback),
  }
}

// Todo lo que el guion y la pantalla de resultados necesitan, en un solo objeto.
export function calcularEstadisticas(run, viajeros, config) {
  const sim = simularJuego(run, viajeros, config)
  const proveedores = run.proveedores.map((p) => {
    const juego = sim.porProveedor[p.id]
    return {
      id: p.id,
      nombre: p.nombre,
      empresa: p.empresa,
      modelo: p.modelo,
      color: p.color,
      precio: p.precio,
      ...resumirProveedor(run, viajeros, p.id),
      decisionesEnJuego: juego.decisionesEnJuego,
      llegoAlFinal: juego.llegoAlFinal,
      motivoFin: juego.motivoFin,
      finIndice: juego.finIndice,
      gastadoFinal: juego.gastadoFinal,
    }
  })
  const porCosto = [...proveedores].sort((a, b) => a.costoPromedioUSD - b.costoPromedioUSD)
  const porDuracion = [...proveedores].sort(
    (a, b) => (b.llegoAlFinal - a.llegoAlFinal) || (b.decisionesEnJuego - a.decisionesEnJuego),
  )
  const porPrecision = [...proveedores].sort((a, b) => b.precisionAccion - a.precisionAccion)
  return {
    esDemo: run.source !== 'live',
    fechaCorrida: run.createdAt,
    totalViajeros: run.viajeros.length,
    presupuestoUSD: config.presupuestoUSD,
    vidas: config.vidas,
    proveedores,
    masBarato: porCosto[0],
    masCaro: porCosto[porCosto.length - 1],
    quienDuroMas: porDuracion[0],
    masPreciso: porPrecision[0],
    sobrevivientes: proveedores.filter((p) => p.llegoAlFinal),
    sim,
  }
}

// Cuántas veces más barato es `a` que `b` por decisión (null si no aplica).
export function vecesMasBarato(a, b) {
  if (!a || !b || a.costoPromedioUSD <= 0) return null
  return b.costoPromedioUSD / a.costoPromedioUSD
}
