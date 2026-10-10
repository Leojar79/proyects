// Reglas del juego aplicadas a una corrida del benchmark. Funciones puras: el juego,
// el guion y el render llegan siempre a los mismos números.

// Diferencias de aciertos de hasta este número de casos se tratan como empate: con una sola
// corrida de 60 casos, 1 o 2 casos de diferencia no son una diferencia real. Se dice en pantalla.
export const EMPATE_ACIERTOS = 2
// Un costo solo "gana" si es al menos 5 % menor que el siguiente.
export const EMPATE_COSTO = 1.05

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

// Lo que realmente costó una llamada: si falló pero la API la cobró (p. ej. JSON inválido),
// el benchmark guarda `costoFacturadoUSD`.
export function costoReal(r) {
  if (!r) return 0
  return r.ok ? (r.costoUSD ?? 0) : (r.costoFacturadoUSD ?? 0)
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

// Presupuesto y vidas de una corrida: los registrados ANTES de correr (run.juego).
// Las corridas viejas o la demo sin ese dato usan la configuración actual.
export function reglasDeCorrida(run, configActual) {
  return run.juego ?? configActual
}

// Recorre los viajeros en orden para cada proveedor aplicando presupuesto y vidas.
// `pasos[i]` es el estado DESPUÉS de procesar al viajero i (o el estado congelado si ya perdió).
// `finIndice` = primer viajero que ya no pudo atender (null si llegó al final).
// Una llamada con error no decide nada: no suma aciertos ni quita vidas, pero gasta lo que se cobró.
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
      const costo = costoReal(r)
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
      // Si no respondió ninguna, no "llegó al final": nunca jugó.
      llegoAlFinal: motivoFin === null && decisiones > 0,
      decisionesEnJuego: decisiones,
      gastadoFinal: gastado,
    }
  }
  return { porProveedor, presupuestoUSD, vidas, totalViajeros: orden.length }
}

// Métricas sobre TODOS los viajeros de la corrida (no solo los que alcanzó el presupuesto),
// para que la comparación de aciertos y costo sea completa. El denominador es siempre el total
// de viajeros de la corrida: un resultado que falta cuenta como fallo, no se descarta.
export function resumirProveedor(run, viajeros, proveedorId) {
  const porId = new Map(viajeros.map((v) => [v.id, v]))
  const total = run.viajeros.length
  const porViajero = new Map((run.resultados[proveedorId] ?? []).map((r) => [r.viajeroId, r]))
  const res = run.viajeros.map((id) => porViajero.get(id)).filter(Boolean)
  const ok = res.filter((r) => r.ok)
  const evals = res.map((r) => evaluarDecision(r.ok ? r.decision : null, porId.get(r.viajeroId).verdad))
  const aciertosAccion = evals.filter((e) => e.aciertoAccion).length
  const costoPromedioUSD = promedio(ok.map((r) => r.costoUSD))
  const salidas = ok.map((r) => r.tokens?.salida).filter((x) => x !== null && x !== undefined)
  return {
    casos: total,
    respondidas: ok.length,
    erroresApi: res.length - ok.length,
    faltantes: total - res.length,
    aciertosAccion,
    precisionAccion: total ? aciertosAccion / total : 0,
    precisionMiente: total ? evals.filter((e) => e.aciertoMiente).length / total : 0,
    erroresGraves: evals.filter((e) => e.errorGrave).length,
    costoPromedioUSD,
    costoPor1000USD: costoPromedioUSD * 1000,
    // Lo que costó atender a TODOS los viajeros (incluye llamadas fallidas que se cobraron).
    costoTotalUSD: res.reduce((a, r) => a + costoReal(r), 0),
    latenciaPromedioMs: promedio(ok.map((r) => r.latenciaMs)),
    latenciaMedianaMs: mediana(ok.map((r) => r.latenciaMs)),
    tokensEntradaProm: promedio(ok.map((r) => r.tokens?.entrada ?? 0)),
    // null si la API nunca informó tokens de salida (no se asume 0).
    tokensSalidaProm: salidas.length ? promedio(salidas) : null,
    salidaInformada: ok.length > 0 && salidas.length === ok.length,
    tokensRazonamientoProm: promedio(ok.map((r) => r.tokens?.razonamiento ?? 0)),
    tokensEstimados: ok.some((r) => r.tokens?.estimado),
    usoFallback: ok.some((r) => r.fallback),
  }
}

// Ganadores de cada métrica, con empates honestos. Lo usan la pantalla de resultados y el guion,
// así nunca se contradicen. Devuelve listas de ids (vacías si nadie compite).
export function calcularGanadores(proveedores, totalViajeros) {
  const compiten = proveedores.filter((p) => p.respondidas > 0)
  const max = (xs, f) => Math.max(...xs.map(f))
  const min = (xs, f) => Math.min(...xs.map(f))
  const ids = (xs) => xs.map((p) => p.id)
  if (!compiten.length) return { duracion: [], costo: [], velocidad: [], aciertos: [] }

  // Duración: llegar al final vale más que cualquier cantidad de decisiones.
  const dur = (p) => (p.llegoAlFinal ? totalViajeros + 1 : 0) + p.decisionesEnJuego
  const mejorDur = max(compiten, dur)

  // Costo: solo costos positivos; empate si la diferencia es menor a EMPATE_COSTO.
  const conCosto = compiten.filter((p) => p.costoPromedioUSD > 0)
  const mejorCosto = conCosto.length ? min(conCosto, (p) => p.costoPromedioUSD) : null

  // Velocidad: se compara lo que se ve en pantalla (décimas de segundo).
  const vel = (p) => Math.round(p.latenciaPromedioMs / 100)
  const mejorVel = min(compiten, vel)

  // Aciertos: empate si la diferencia es de EMPATE_ACIERTOS casos o menos.
  const mejorAci = max(compiten, (p) => p.aciertosAccion)

  return {
    duracion: ids(compiten.filter((p) => dur(p) === mejorDur)),
    costo: mejorCosto === null ? [] : ids(conCosto.filter((p) => p.costoPromedioUSD < mejorCosto * EMPATE_COSTO)),
    velocidad: ids(compiten.filter((p) => vel(p) === mejorVel)),
    aciertos: ids(compiten.filter((p) => mejorAci - p.aciertosAccion <= EMPATE_ACIERTOS)),
  }
}

// Todo lo que el guion y la pantalla de resultados necesitan, en un solo objeto.
// `configActual` es JUEGO de shared/config.js; se usa solo si la corrida no registró sus reglas.
export function calcularEstadisticas(run, viajeros, configActual) {
  const reglas = reglasDeCorrida(run, configActual)
  const sim = simularJuego(run, viajeros, reglas)
  const proveedores = run.proveedores.map((p) => {
    const juego = sim.porProveedor[p.id]
    return {
      id: p.id,
      nombre: p.nombre,
      empresa: p.empresa,
      modelo: p.modelo,
      color: p.color,
      precio: p.precio,
      opciones: p.opciones,
      ...resumirProveedor(run, viajeros, p.id),
      decisionesEnJuego: juego.decisionesEnJuego,
      llegoAlFinal: juego.llegoAlFinal,
      motivoFin: juego.motivoFin,
      finIndice: juego.finIndice,
      gastadoFinal: juego.gastadoFinal,
    }
  })
  const totalViajeros = run.viajeros.length
  const ganadores = calcularGanadores(proveedores, totalViajeros)
  // Un proveedor sin respuestas o con costo 0 no compite en costo.
  const porCosto = proveedores
    .filter((p) => p.respondidas > 0 && p.costoPromedioUSD > 0)
    .sort((a, b) => a.costoPromedioUSD - b.costoPromedioUSD)
  const porDuracion = [...proveedores].sort(
    (a, b) => (b.llegoAlFinal - a.llegoAlFinal) || (b.decisionesEnJuego - a.decisionesEnJuego),
  )
  const porPrecision = [...proveedores].sort((a, b) => b.aciertosAccion - a.aciertosAccion)
  const jev = proveedores.find((p) => p.id === 'jev')
  // Cuántas veces más barato es Jev que cada uno de los demás (solo si de verdad es más barato).
  const factoresJev = {}
  if (jev && jev.respondidas > 0 && jev.costoPromedioUSD > 0) {
    for (const p of proveedores) {
      if (p.id === 'jev' || !(p.respondidas > 0) || !(p.costoPromedioUSD > 0)) continue
      const f = p.costoPromedioUSD / jev.costoPromedioUSD
      if (f >= EMPATE_COSTO) factoresJev[p.id] = f
    }
  }
  return {
    esDemo: run.source !== 'live',
    fechaCorrida: run.createdAt,
    totalViajeros,
    presupuestoUSD: reglas.presupuestoUSD,
    vidas: reglas.vidas,
    reglasRegistradas: Boolean(run.juego),
    proveedores,
    ganadores,
    // La conclusión "Jev, para decidir" solo se sostiene si Jev empata o gana en aciertos
    // y además es el más barato.
    jevRecomendable: Boolean(jev) && ganadores.aciertos.includes('jev') && ganadores.costo.includes('jev'),
    factoresJev,
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
  if (!a || !b || !(a.costoPromedioUSD > 0) || !(b.costoPromedioUSD > 0)) return null
  return b.costoPromedioUSD / a.costoPromedioUSD
}
