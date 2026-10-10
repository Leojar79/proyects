// Adaptador de Jev (TypeSafe) con fetch.
// Variables: TYPESAFE_API_KEY (obligatoria), TYPESAFE_MODEL (opcional),
// TYPESAFE_BASE_URL (opcional; por defecto https://api.typesafe.ai),
// TYPESAFE_SCORE_BASE (0 o 1; solo hace falta si Jev devuelve el nivel de peligro como NÚMERO:
// confirma con `npm run probar-apis` si su escala empieza en 0 o en 1).
//
// IMPORTANTE: el formato EXACTO de la respuesta de POST /v1/systemone no está confirmado
// (no hubo acceso a la documentación oficial). El parser es defensivo: acepta varias formas
// plausibles y, si algo es ambiguo o no lo reconoce, FALLA con el JSON crudo en vez de adivinar
// (una decisión mal leída le costaría aciertos y vidas a Jev, o se los regalaría).
// Pruebas: bench/typesafe.test.mjs.

import { ACCIONES, NIVELES_PELIGRO, PREGUNTAS, preguntasJev, textoEstado } from '../../shared/preguntas.js'
import { estimarTokens } from '../lib/datos.mjs'
import { ErrorProveedor, idDePeticion, recortar } from '../lib/errores.mjs'
import { enviarJSON, errorHttp, peticionSinClave } from '../lib/http.mjs'

const NOMBRES = ['pasa', 'miente', 'peligro', 'accion']
// Dónde pueden venir las respuestas, en este orden (al final, el cuerpo mismo).
const CONTENEDORES = ['answers', 'results', 'outputs', 'decisions', 'data']
// Claves que identifican la pregunta cuando las respuestas vienen en una lista.
const CLAVES_NOMBRE = ['name', 'question', 'key', 'id', 'field', 'question_id', 'questionId']
// Claves con el valor elegido y con su probabilidad, en orden de preferencia.
const CLAVES_VALOR = ['value', 'answer', 'result', 'selected', 'label', 'choice', 'decision', 'score', 'output', 'option']
const CLAVES_PROB = ['probability', 'confidence', 'p', 'prob', 'score_probability']
const CLAVES_DISTRIB = ['probabilities', 'distribution', 'scores']
// Mapa de probabilidades por pregunta, al lado de las respuestas (p. ej. body.confidence.pasa).
const CLAVES_PROB_GLOBAL = ['probabilities', 'confidences', 'confidence', 'probability']

// Jev no tiene opciones configurables en shared/modelos.js.
const OPCIONES_ADMITIDAS = []

export function baseURL() {
  return (process.env.TYPESAFE_BASE_URL || 'https://api.typesafe.ai').replace(/\/+$/, '')
}

export function modeloEfectivo(proveedor) {
  return process.env.TYPESAFE_MODEL || proveedor.modelo
}

// Escala del nivel de peligro cuando Jev lo devuelve como número: 0 (0-4) o 1 (1-5).
// null = no confirmada: un peligro numérico es entonces un error, no se adivina.
export function basePeligroConfigurada() {
  const v = (process.env.TYPESAFE_SCORE_BASE ?? '').trim()
  if (v === '') return null
  if (v === '0' || v === '1') return Number(v)
  throw new ErrorProveedor(`TYPESAFE_SCORE_BASE debe ser 0 o 1 (llegó "${process.env.TYPESAFE_SCORE_BASE}").`, { codigo: 'configuracion' })
}

// Opciones con las que se llama a Jev (no tiene: el cuerpo es siempre { model, state, questions }).
export function opcionesPedidas() {
  return {}
}

function comprobarOpciones(proveedor) {
  const extra = Object.keys(proveedor.opciones ?? {}).filter((k) => !OPCIONES_ADMITIDAS.includes(k))
  if (extra.length) {
    throw new ErrorProveedor(
      `Opciones de Jev en shared/modelos.js que este adaptador no envía: ${extra.join(', ')}. ` +
        'Nunca se declara una opción que no se usa: quítala o agrégala al adaptador.',
      { codigo: 'configuracion', opcionesUsadas: {} },
    )
  }
}

export function construirPeticion(viajero, proveedor) {
  return {
    metodo: 'POST',
    url: `${baseURL()}/v1/systemone`,
    cabeceras: {
      Authorization: `Bearer ${process.env.TYPESAFE_API_KEY ?? ''}`,
      'Content-Type': 'application/json',
    },
    cuerpo: { model: modeloEfectivo(proveedor), state: textoEstado(viajero), questions: preguntasJev() },
  }
}

// ---------------------------------------------------------------------------
// Normalización de valores

class ErrorFormato extends Error {}
// Falta (o es inválida) la escala del peligro numérico: fallaría con TODOS los viajeros, así que
// es un error de configuración y el benchmark se detiene en vez de seguir llamando.
class ErrorEscala extends ErrorFormato {}

const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)

// Minúsculas, sin acentos ni espacios a los lados.
function plano(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

const VERDADEROS = new Set(['true', 'yes', 'si', '1', 'verdadero'])
const FALSOS = new Set(['false', 'no', '0', 'falso'])

export function normalizarNoul(x) {
  if (typeof x === 'boolean') return x
  if (x === 1 || x === 0) return x === 1
  if (typeof x === 'string') {
    const s = plano(x)
    if (VERDADEROS.has(s)) return true
    if (FALSOS.has(s)) return false
  }
  throw new ErrorFormato(`valor sí/no no reconocido: ${JSON.stringify(x)}`)
}

// Nivel de peligro: etiqueta ("Alto") o número. Un número solo se acepta con la escala confirmada
// (TYPESAFE_SCORE_BASE): si Jev usara 1-5, tomar su "1" como índice correría todo un nivel.
export function normalizarScore(x) {
  const max = NIVELES_PELIGRO.length - 1
  let n = null
  if (typeof x === 'number') n = x
  else if (typeof x === 'string') {
    const s = plano(x)
    const i = NIVELES_PELIGRO.findIndex((nivel) => plano(nivel) === s)
    if (i >= 0) return i
    if (/^\d+(\.0+)?$/.test(s)) n = Number(s)
  }
  if (n !== null && Number.isFinite(n)) {
    if (!Number.isInteger(n)) throw new ErrorFormato(`nivel de peligro no entero: ${JSON.stringify(x)}`)
    let base
    try {
      base = basePeligroConfigurada()
    } catch (e) {
      throw new ErrorEscala(e.message)
    }
    if (base === null) {
      throw new ErrorEscala(
        `peligro numérico (${JSON.stringify(x)}) sin escala confirmada: confirma con --probe si la escala de Jev es ` +
          `0-${max} o 1-${max + 1} y define TYPESAFE_SCORE_BASE=0 o TYPESAFE_SCORE_BASE=1`,
      )
    }
    const nivel = n - base
    if (nivel >= 0 && nivel <= max) return nivel
    throw new ErrorFormato(`nivel de peligro ${n} fuera de la escala ${base}-${max + base} (TYPESAFE_SCORE_BASE=${base})`)
  }
  throw new ErrorFormato(`nivel de peligro no reconocido: ${JSON.stringify(x)} (se espera ${NIVELES_PELIGRO.join('/')} o un número con TYPESAFE_SCORE_BASE)`)
}

export function normalizarChoice(x) {
  if (typeof x === 'string') {
    const s = plano(x)
    const a = ACCIONES.find((op) => plano(op) === s)
    if (a) return a
  }
  throw new ErrorFormato(`acción no reconocida: ${JSON.stringify(x)} (se espera ${ACCIONES.join('/')})`)
}

function normalizar(x, tipo) {
  if (tipo === 'noul') return normalizarNoul(x)
  if (tipo === 'score') return normalizarScore(x)
  if (tipo === 'choice') return normalizarChoice(x)
  throw new ErrorFormato(`tipo de pregunta desconocido: ${tipo}`)
}

// Número >= 0 o null (acepta strings numéricos). NO decide la escala.
function numero(x) {
  const n = typeof x === 'string' && x.trim() !== '' ? Number(x) : x
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null
}

// Probabilidad suelta en [0, 1]: <= 1 es fracción, hasta 100 es porcentaje. Para varios números
// que van juntos (una distribución, o las confianzas de una misma respuesta) se usa escalaComun().
export function aProbabilidad(x) {
  const n = numero(x)
  if (n === null) return null
  if (n <= 1) return n
  if (n <= 100) return n / 100
  return null
}

// Una sola escala para un grupo de números: si alguno pasa de 1, TODOS son porcentajes.
// (Decidir valor por valor convertía {arrestar: 97, interrogar: 1} en "interrogar" con 100 %.)
export function escalaComun(nums) {
  if (!nums.length || nums.some((n) => n === null)) return null
  const max = Math.max(...nums)
  if (max <= 1) return nums
  if (max <= 100) return nums.map((n) => n / 100)
  return null
}

// ---------------------------------------------------------------------------
// Distribuciones de probabilidad: { opcion: p }, [{ label, probability }], o [p0..p4] para score.
// Las opciones que no se reconocen (p. ej. "unknown") se ignoran salvo que sean la más probable.

function intentarNormalizar(x, tipo) {
  try {
    return { ok: true, valor: normalizar(x, tipo) }
  } catch (e) {
    if (e instanceof ErrorFormato) return { ok: false, crudo: x }
    throw e
  }
}

function distribucion(d, tipo) {
  const opciones = []
  const crudos = []
  if (Array.isArray(d)) {
    if (d.length && d.every((x) => typeof x === 'number')) {
      // Lista de números: solo tiene sentido como índice para el nivel de peligro (en el mismo
      // orden de los criterios que se envían a Jev).
      if (tipo !== 'score' || d.length !== NIVELES_PELIGRO.length) return null
      d.forEach((p, i) => {
        opciones.push({ ok: true, valor: i })
        crudos.push(numero(p))
      })
    } else {
      for (const item of d) {
        if (!esObjeto(item)) return null
        const kv = CLAVES_VALOR.find((k) => k !== 'score' && item[k] !== undefined && item[k] !== null)
        const kp = [...CLAVES_PROB, 'score'].find((k) => k !== kv && numero(item[k]) !== null)
        if (!kv || !kp) return null
        opciones.push(intentarNormalizar(item[kv], tipo))
        crudos.push(numero(item[kp]))
      }
    }
  } else if (esObjeto(d)) {
    for (const [k, v] of Object.entries(d)) {
      opciones.push(intentarNormalizar(k, tipo))
      crudos.push(esObjeto(v) ? numero(v[CLAVES_PROB.find((c) => v[c] !== undefined)]) : numero(v))
    }
  } else {
    return null
  }
  const probs = escalaComun(crudos)
  if (!probs) return null
  const pares = opciones.map((opcion, i) => ({ opcion, prob: probs[i] }))
  let mejor = pares[0]
  for (const x of pares) if (x.prob > mejor.prob) mejor = x
  if (pares.filter((x) => x.prob === mejor.prob).length > 1) {
    throw new ErrorFormato(`empate en la opción más probable de la distribución ${recortar(JSON.stringify(d), 200)}`)
  }
  if (!mejor.opcion.ok) throw new ErrorFormato(`la opción más probable no se reconoce: ${JSON.stringify(mejor.opcion.crudo)}`)
  const mapa = new Map(pares.filter((x) => x.opcion.ok).map((x) => [x.opcion.valor, x.prob]))
  return { valor: mejor.opcion.valor, prob: mejor.prob, mapa }
}

// Si un objeto trae varias claves de valor (p. ej. { label: "no", value: 1 }), todas las que se
// reconocen deben decir lo mismo. "score" no se compara: junto a otra clave suele ser un puntaje.
function comprobarClavesValor(a, kv, valor, tipo) {
  for (const k of CLAVES_VALOR) {
    if (k === kv || k === 'score' || a[k] === undefined || a[k] === null || typeof a[k] === 'object') continue
    const otro = intentarNormalizar(a[k], tipo)
    if (otro.ok && otro.valor !== valor) {
      throw new ErrorFormato(`claves de valor contradictorias: "${kv}" = ${JSON.stringify(a[kv])} y "${k}" = ${JSON.stringify(a[k])}`)
    }
  }
}

// Extrae { valor, prob, suelta, deDistribucion } de una respuesta individual.
// - prob: probabilidad ya en [0, 1] (de una distribución o de "score").
// - suelta: número crudo de una clave de probabilidad (probability, confidence...). Su escala
//   (0-1 o 0-100) se decide para TODA la respuesta en interpretarRespuestaJev().
function extraer(a, tipo, profundidad = 0) {
  if (profundidad > 3) throw new ErrorFormato('respuesta demasiado anidada')
  if (a === null || a === undefined) throw new ErrorFormato('respuesta vacía')
  if (typeof a !== 'object') return { valor: normalizar(a, tipo), prob: null, suelta: null, deDistribucion: false }
  if (Array.isArray(a)) {
    const d = distribucion(a, tipo)
    if (d) return { valor: d.valor, prob: d.prob, suelta: null, deDistribucion: true }
    throw new ErrorFormato(`lista no reconocida: ${recortar(JSON.stringify(a), 200)}`)
  }
  const kd = CLAVES_DISTRIB.find((k) => a[k] !== undefined && a[k] !== null && typeof a[k] === 'object')
  const dist = kd ? distribucion(a[kd], tipo) : null
  if (kd && !dist) throw new ErrorFormato(`distribución "${kd}" no reconocida: ${recortar(JSON.stringify(a[kd]), 200)}`)
  const kv = CLAVES_VALOR.find((k) => a[k] !== undefined && a[k] !== null)
  const kp = CLAVES_PROB.find((k) => numero(a[k]) !== null)

  if (kv) {
    const interno =
      typeof a[kv] === 'object'
        ? extraer(a[kv], tipo, profundidad + 1)
        : { valor: normalizar(a[kv], tipo), prob: null, suelta: null, deDistribucion: false }
    let { valor, prob, suelta, deDistribucion } = interno
    comprobarClavesValor(a, kv, valor, tipo)
    // Coherencia: el valor elegido debe ser el más probable de su propia distribución.
    if (dist && dist.valor !== valor) {
      throw new ErrorFormato(`el valor ${JSON.stringify(valor)} no es el más probable de la distribución (${JSON.stringify(dist.valor)})`)
    }
    if (prob === null && suelta === null && kp) suelta = numero(a[kp])
    if (prob === null && suelta === null && dist) {
      prob = dist.mapa.get(valor) ?? null
      deDistribucion = true
    }
    // Formato tipo { label: "aprobar", score: 0.88 }: "score" como probabilidad. No en el nivel de
    // peligro, donde "score" puede ser el propio nivel ({ label: "Bajo", score: 1 }).
    if (prob === null && suelta === null && kv !== 'score' && tipo !== 'score' && typeof a.score === 'number' && a.score >= 0 && a.score <= 1) {
      prob = a.score
    }
    return { valor, prob, suelta, deDistribucion }
  }
  if (dist) return { valor: dist.valor, prob: dist.prob, suelta: null, deDistribucion: true }
  throw new ErrorFormato(`no encontré el valor en ${recortar(JSON.stringify(a), 200)}`)
}

// Convierte un contenedor en { pasa, miente, peligro, accion } -> respuesta cruda, o null.
function comoMapa(c) {
  if (Array.isArray(c)) {
    const mapa = {}
    for (const item of c) {
      if (!esObjeto(item)) continue
      const k = CLAVES_NOMBRE.find((n) => typeof item[n] === 'string' && NOMBRES.includes(item[n]))
      if (k) mapa[item[k]] = item
    }
    return NOMBRES.every((n) => n in mapa) ? mapa : null
  }
  if (esObjeto(c) && NOMBRES.every((n) => n in c)) return c
  return null
}

// Busca las cuatro respuestas: body.answers | results | outputs | decisions | data | body,
// y un nivel más adentro (p. ej. body.data.answers, body.result.answers).
export function localizarRespuestas(body) {
  if (!esObjeto(body)) return null
  const candidatos = [...CONTENEDORES.map((k) => body[k]), body]
  for (const c of candidatos) {
    const mapa = comoMapa(c)
    if (mapa) return { mapa, contenedor: c === body ? body : c, padre: body }
  }
  for (const padre of [...CONTENEDORES.map((k) => body[k]), body.result, body.response, body.output]) {
    if (!esObjeto(padre)) continue
    for (const k of CONTENEDORES) {
      const mapa = comoMapa(padre[k])
      if (mapa) return { mapa, contenedor: padre[k], padre }
    }
  }
  return null
}

function probabilidadesGlobales(padre) {
  for (const k of CLAVES_PROB_GLOBAL) {
    const m = padre?.[k]
    if (esObjeto(m) && NOMBRES.some((n) => numero(m[n]) !== null)) return m
  }
  return null
}

// Escala común para un grupo de probabilidades sueltas ({ pregunta: número | null }).
function escalarSueltas(sueltas, origen) {
  const presentes = NOMBRES.filter((n) => sueltas[n] !== null && sueltas[n] !== undefined)
  if (!presentes.length) return {}
  const escaladas = escalaComun(presentes.map((n) => sueltas[n]))
  if (!escaladas) throw new ErrorFormato(`probabilidades fuera de escala en ${origen}: ${JSON.stringify(sueltas)}`)
  return Object.fromEntries(presentes.map((n, i) => [n, escaladas[i]]))
}

// Interpreta el cuerpo JSON de una respuesta 2xx de Jev.
// Devuelve { decision, confianza, salidaTexto } o lanza ErrorProveedor('Formato de respuesta de Jev no reconocido: ...').
export function interpretarRespuestaJev(body) {
  const crudoRecortado = () => recortar(JSON.stringify(body), 1500)
  const noReconocido = (detalle, e = null) =>
    new ErrorProveedor(`Formato de respuesta de Jev no reconocido: ${detalle}. Respuesta: ${crudoRecortado()}`, {
      codigo: e instanceof ErrorEscala ? 'configuracion' : 'formato',
    })
  const encontrado = localizarRespuestas(body)
  if (!encontrado) {
    const err = esObjeto(body) ? body.error ?? body.detail ?? null : null
    if (err) throw new ErrorProveedor(`Jev devolvió un error: ${recortar(typeof err === 'string' ? err : JSON.stringify(err), 600)}`, { codigo: 'api' })
    throw noReconocido(`no encontré las respuestas "${NOMBRES.join('", "')}"`)
  }
  const { mapa, padre } = encontrado
  const partes = {}
  for (const n of NOMBRES) {
    try {
      partes[n] = extraer(mapa[n], PREGUNTAS[n].tipo)
    } catch (e) {
      if (!(e instanceof ErrorFormato)) throw e
      throw noReconocido(`pregunta "${n}": ${e.message}`, e)
    }
  }
  const decision = Object.fromEntries(NOMBRES.map((n) => [n, partes[n].valor]))
  const confianza = {}
  try {
    // Las probabilidades sueltas de una misma respuesta comparten escala (0-1 o 0-100).
    const sueltas = escalarSueltas(Object.fromEntries(NOMBRES.map((n) => [n, partes[n].suelta])), 'las respuestas')
    const globalesCrudas = probabilidadesGlobales(padre)
    const globales = globalesCrudas
      ? escalarSueltas(Object.fromEntries(NOMBRES.map((n) => [n, numero(globalesCrudas[n])])), 'el mapa de confianza')
      : {}
    for (const n of NOMBRES) {
      const p = partes[n].prob ?? sueltas[n] ?? globales[n] ?? null
      // En una pregunta sí/no, la probabilidad de la respuesta ELEGIDA no puede ser < 0.5:
      // si lo es, probablemente es P(sí) y no se sabe qué eligió Jev.
      if (PREGUNTAS[n].tipo === 'noul' && !partes[n].deDistribucion && p !== null && p < 0.5) {
        throw new ErrorFormato(`pregunta "${n}": probabilidad ${p} < 0.5 para la respuesta elegida (${decision[n]}): ¿es P(sí) en vez de la de la respuesta elegida?`)
      }
      confianza[n] = p
    }
  } catch (e) {
    if (!(e instanceof ErrorFormato)) throw e
    throw noReconocido(e.message)
  }
  const hayConfianza = NOMBRES.some((n) => confianza[n] !== null)
  return { decision, confianza: hayConfianza ? confianza : null, salidaTexto: JSON.stringify(mapa) }
}

const primerNumero = (...xs) => xs.find((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0) ?? null

// Tokens reportados por Jev. Si no informa la entrada, se estima (caracteres / 4 x 1,5, igual que
// la estimación previa de costo) y se marca estimado: true. Si no informa la salida, queda null:
// NO se asume 0 (el video no puede decir "0 tokens de salida" sin que la API lo haya dicho).
export function tokensJev(body, cuerpoPeticion) {
  const u = esObjeto(body?.usage) ? body.usage : {}
  let entrada = primerNumero(u.input_tokens, u.prompt_tokens, u.tokens?.input, u.tokens_in, body?.tokens_in, body?.input_tokens)
  const salida = primerNumero(u.output_tokens, u.completion_tokens, u.tokens?.output, u.tokens_out, body?.tokens_out, body?.output_tokens)
  const entradaCacheada = primerNumero(u.input_tokens_details?.cached_tokens, u.cached_tokens, u.cached_input_tokens) ?? 0
  let estimado = false
  if (entrada === null) {
    entrada = estimarTokens(cuerpoPeticion.state.length + JSON.stringify(cuerpoPeticion.questions).length)
    estimado = true
  }
  return { entrada, entradaCacheada, salida, razonamiento: null, estimado }
}

// Costo que informa la propia API, si lo hace (se guarda como costoReportadoUSD y el benchmark
// avisa si difiere más de 5 % del calculado con los tokens y el precio).
export function costoInformado(body) {
  const u = esObjeto(body?.usage) ? body.usage : {}
  const b = body?.billing
  return primerNumero(
    body?.cost_usd,
    body?.cost,
    u.cost_usd,
    u.cost,
    u.total_cost,
    typeof b === 'number' ? b : undefined,
    b?.cost_usd,
    b?.cost,
    b?.total_cost,
    b?.amount_usd,
  )
}

function idDeRespuesta(body) {
  const id = body?.id ?? body?.request_id ?? body?.response_id ?? null
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

export async function decidir(viajero, proveedor, { signal } = {}) {
  comprobarOpciones(proveedor)
  const opcionesUsadas = opcionesPedidas()
  const peticion = construirPeticion(viajero, proveedor)
  let resp
  try {
    resp = await enviarJSON(peticion, signal, 'TypeSafe (Jev)')
  } catch (e) {
    if (e instanceof ErrorProveedor) Object.assign(e, { traza: [{ peticion: peticionSinClave(peticion), status: null, crudo: null }], opcionesUsadas })
    throw e
  }
  const traza = [{ peticion: peticionSinClave(peticion), status: resp.status, crudo: resp.crudo }]
  const ids = { idRespuesta: idDeRespuesta(resp.cuerpo), requestId: idDePeticion(resp.cabeceras) }
  if (resp.status < 200 || resp.status >= 300) throw errorHttp('TypeSafe (Jev)', resp, { traza, opcionesUsadas, ...ids })
  if (resp.cuerpo === null) {
    throw new ErrorProveedor(`Formato de respuesta de Jev no reconocido: el cuerpo no es JSON. Respuesta: ${recortar(resp.crudo, 1500)}`, {
      status: resp.status,
      crudo: resp.crudo,
      traza,
      opcionesUsadas,
      codigo: 'formato',
      ...ids,
    })
  }
  const tokens = tokensJev(resp.cuerpo, peticion.cuerpo)
  const costoReportadoUSD = costoInformado(resp.cuerpo)
  const modeloServido = resp.cuerpo.model ?? resp.cuerpo.model_id ?? resp.cuerpo.model_version ?? null
  const comun = { tokens, modeloServido, fallback: false, traza, opcionesUsadas, costoReportadoUSD, ...ids }
  try {
    const r = interpretarRespuestaJev(resp.cuerpo)
    return { ...r, crudo: resp.crudo, ...comun }
  } catch (e) {
    if (e instanceof ErrorProveedor) Object.assign(e, { status: resp.status, crudo: resp.crudo, ...comun })
    throw e
  }
}
