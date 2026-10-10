// ¿Se puede publicar un video hecho con esta corrida?
// La app (marca de agua), el render (nombre del archivo y código de salida) y el guion (avisos)
// usan esta MISMA función, así no hay forma de sacar un video "limpio" con datos que no lo son.
//
// motivosNoPublicable(run, viajeros, { juego, publicacion, proveedores })
//   -> { bloqueos: [{ codigo, texto }], avisos: [{ codigo, texto }] }
// `juego` = JUEGO, `publicacion` = PUBLICACION (shared/config.js),
// `proveedores` = PROVEEDORES (shared/modelos.js), para comparar con la configuración actual.
// Con al menos un bloqueo, el video lleva marca de agua y el render lo nombra -NO-PUBLICAR.

const MAX_ERRORES = 0.1 // más de 10 % de errores de API en un proveedor bloquea

function iguales(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

export function motivosNoPublicable(run, viajeros, { juego, publicacion, proveedores } = {}) {
  const bloqueos = []
  const avisos = []
  const b = (codigo, texto) => bloqueos.push({ codigo, texto })
  const a = (codigo, texto) => avisos.push({ codigo, texto })

  if (!run) {
    b('sin_corrida', 'No hay corrida')
    return { bloqueos, avisos }
  }
  if (run.source !== 'live') b('demo', 'Datos simulados (demo)')
  if (run.probe) b('probe', 'Corrida de prueba (--probe)')

  const total = viajeros?.length ?? 0
  if (run.parcial || (total && run.viajeros.length !== total)) {
    b('parcial', `Corrida parcial (${run.viajeros.length}/${total} viajeros)`)
  }

  for (const p of run.proveedores ?? []) {
    const res = run.resultados?.[p.id] ?? []
    const porViajero = new Set(res.map((r) => r.viajeroId))
    const faltan = run.viajeros.filter((id) => !porViajero.has(id)).length
    if (faltan) b('faltan', `Faltan ${faltan} resultados de ${p.nombre}`)
    const errores = res.filter((r) => !r.ok).length
    if (res.length && errores / run.viajeros.length > MAX_ERRORES) {
      b('errores', `${p.nombre}: ${errores} errores de API (más de 10 %)`)
    } else if (errores) {
      a('errores', `${p.nombre}: ${errores} ${errores === 1 ? 'error' : 'errores'} de API`)
    }
    // Cada llamada debe haber usado la configuración declarada (p. ej. reasoning_effort "low").
    const distintas = res.filter((r) => r.ok && r.opcionesUsadas && !coincideConfiguracion(p.opciones, r.opcionesUsadas))
    if (distintas.length) b('config', `${p.nombre} no usó la configuración declarada en ${distintas.length} llamadas`)
    if (p.precio?.verificado === false) b('precio', `Precio de ${p.nombre} sin verificar en la página oficial`)
    if (res.some((r) => r.ok && r.tokens?.estimado)) a('tokens', `Tokens de ${p.nombre} estimados: la API no los informó`)
    if (res.some((r) => r.ok && r.fallback)) b('fallback', `${p.nombre}: respondió otro modelo (fallback)`)
    // Precios de la corrida distintos de los actuales: hay que recalcular (npm run recalcular).
    const actual = proveedores?.find((x) => x.id === p.id)
    if (actual && !iguales(sinMeta(actual.precio), sinMeta(p.precio))) {
      b('precio_cambiado', `Precio de ${p.nombre} distinto al de shared/modelos.js: corre npm run recalcular`)
    }
  }

  if (run.source === 'live') {
    if (!run.juego) b('reglas', 'La corrida no registró presupuesto y vidas antes de correr')
    else if (juego && !iguales(run.juego, { presupuestoUSD: juego.presupuestoUSD, vidas: juego.vidas })) {
      b('reglas_cambiadas', 'Presupuesto o vidas cambiados después de la corrida')
    }
  }

  const div = publicacion?.divulgacion
  if (div === null || div === undefined || String(div).trim() === '') {
    b('divulgacion', 'Falta declarar tu relación con TypeSafe (shared/config.js)')
  }

  return { bloqueos, avisos }
}

// Texto de la franja de marca de agua.
export function textoMarcaAgua({ bloqueos }) {
  if (!bloqueos.length) return null
  if (bloqueos.some((x) => x.codigo === 'demo')) return 'DEMO · datos simulados — no son resultados reales'
  return `NO PUBLICABLE · ${bloqueos[0].texto}`
}

function sinMeta(precio) {
  if (!precio) return null
  const { entradaPorMTok, entradaCacheadaPorMTok, salidaPorMTok } = precio
  return { entradaPorMTok, entradaCacheadaPorMTok, salidaPorMTok }
}

// Las opciones usadas deben incluir cada opción declarada con el mismo valor.
function coincideConfiguracion(declaradas, usadas) {
  for (const [k, v] of Object.entries(declaradas ?? {})) {
    if (k in usadas && !iguales(usadas[k], v)) return false
  }
  return true
}
