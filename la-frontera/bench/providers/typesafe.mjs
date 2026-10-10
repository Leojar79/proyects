// Adaptador de Jev (TypeSafe) con fetch.
// Variables: TYPESAFE_API_KEY (obligatoria), TYPESAFE_MODEL (opcional),
// TYPESAFE_BASE_URL (opcional; por defecto https://api.typesafe.ai).
//
// IMPORTANTE: el formato EXACTO de la respuesta de POST /v1/systemone no está confirmado
// (no hubo acceso a la documentación oficial). El parser es defensivo: acepta varias formas
// plausibles y, si no reconoce la respuesta, falla con el JSON crudo para ajustarlo tras
// el primer `npm run probar-apis`. Pruebas: bench/typesafe.test.mjs.

import { ACCIONES, NIVELES_PELIGRO, PREGUNTAS, preguntasJev, textoEstado } from '../../shared/preguntas.js'
import { ErrorProveedor, recortar } from '../lib/errores.mjs'
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

export function baseURL() {
  return (process.env.TYPESAFE_BASE_URL || 'https://api.typesafe.ai').replace(/\/+$/, '')
}

export function modeloEfectivo(proveedor) {
  return process.env.TYPESAFE_MODEL || proveedor.modelo
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

export function normalizarScore(x) {
  const max = NIVELES_PELIGRO.length - 1
  if (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= max) return x
  if (typeof x === 'string') {
    const s = plano(x)
    if (/^\d+(\.0+)?$/.test(s)) {
      const n = Number(s)
      if (n >= 0 && n <= max) return n
    }
    const i = NIVELES_PELIGRO.findIndex((n) => plano(n) === s)
    if (i >= 0) return i
  }
  throw new ErrorFormato(`nivel de peligro no reconocido: ${JSON.stringify(x)} (se espera 0-${max} o ${NIVELES_PELIGRO.join('/')})`)
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

// Probabilidad en [0, 1]. Acepta porcentajes (0-100) y strings numéricos.
export function aProbabilidad(x) {
  const n = typeof x === 'string' && x.trim() !== '' ? Number(x) : x
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null
  if (n <= 1) return n
  if (n <= 100) return n / 100
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
  const pares = [] // [{ opcion: {ok, valor|crudo}, prob }]
  if (Array.isArray(d)) {
    if (d.length && d.every((x) => typeof x === 'number')) {
      // Lista de números: solo tiene sentido como índice para el nivel de peligro.
      if (tipo !== 'score' || d.length !== NIVELES_PELIGRO.length) return null
      d.forEach((p, i) => pares.push({ opcion: { ok: true, valor: i }, prob: aProbabilidad(p) }))
    } else {
      for (const item of d) {
        if (!esObjeto(item)) return null
        const kv = CLAVES_VALOR.find((k) => k !== 'score' && item[k] !== undefined && item[k] !== null)
        const kp = [...CLAVES_PROB, 'score'].find((k) => k !== kv && aProbabilidad(item[k]) !== null)
        if (!kv || !kp) return null
        pares.push({ opcion: intentarNormalizar(item[kv], tipo), prob: aProbabilidad(item[kp]) })
      }
    }
  } else if (esObjeto(d)) {
    for (const [k, v] of Object.entries(d)) {
      const p = esObjeto(v) ? aProbabilidad(v[CLAVES_PROB.find((c) => v[c] !== undefined)]) : aProbabilidad(v)
      pares.push({ opcion: intentarNormalizar(k, tipo), prob: p })
    }
  } else {
    return null
  }
  if (!pares.length || pares.some((x) => x.prob === null)) return null
  let mejor = pares[0]
  for (const x of pares) if (x.prob > mejor.prob) mejor = x
  if (!mejor.opcion.ok) throw new ErrorFormato(`la opción más probable no se reconoce: ${JSON.stringify(mejor.opcion.crudo)}`)
  const mapa = new Map(pares.filter((x) => x.opcion.ok).map((x) => [x.opcion.valor, x.prob]))
  return { valor: mejor.opcion.valor, prob: mejor.prob, mapa }
}

// Extrae { valor, prob } de una respuesta individual.
function extraer(a, tipo, profundidad = 0) {
  if (profundidad > 3) throw new ErrorFormato('respuesta demasiado anidada')
  if (a === null || a === undefined) throw new ErrorFormato('respuesta vacía')
  if (typeof a !== 'object') return { valor: normalizar(a, tipo), prob: null }
  if (Array.isArray(a)) {
    const d = distribucion(a, tipo)
    if (d) return { valor: d.valor, prob: d.prob }
    throw new ErrorFormato(`lista no reconocida: ${recortar(JSON.stringify(a), 200)}`)
  }
  const kd = CLAVES_DISTRIB.find((k) => a[k] !== undefined && a[k] !== null && typeof a[k] === 'object')
  const dist = kd ? distribucion(a[kd], tipo) : null
  const kv = CLAVES_VALOR.find((k) => a[k] !== undefined && a[k] !== null)
  const kp = CLAVES_PROB.find((k) => aProbabilidad(a[k]) !== null)

  if (kv) {
    let { valor, prob } = typeof a[kv] === 'object' ? extraer(a[kv], tipo, profundidad + 1) : { valor: normalizar(a[kv], tipo), prob: null }
    if (prob === null && kp) prob = aProbabilidad(a[kp])
    if (prob === null && dist) prob = dist.mapa.get(valor) ?? null
    // Formato tipo { label: "aprobar", score: 0.88 }: "score" como probabilidad.
    if (prob === null && kv !== 'score' && typeof a.score === 'number' && a.score >= 0 && a.score <= 1) prob = a.score
    return { valor, prob }
  }
  if (dist) return { valor: dist.valor, prob: dist.prob }
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
    if (esObjeto(m) && NOMBRES.some((n) => aProbabilidad(m[n]) !== null)) return m
  }
  return null
}

// Interpreta el cuerpo JSON de una respuesta 2xx de Jev.
// Devuelve { decision, confianza, salidaTexto } o lanza Error('Formato de respuesta de Jev no reconocido: ...').
export function interpretarRespuestaJev(body) {
  const crudoRecortado = () => recortar(JSON.stringify(body), 1500)
  const encontrado = localizarRespuestas(body)
  if (!encontrado) {
    const err = esObjeto(body) ? body.error ?? body.detail ?? null : null
    if (err) throw new ErrorProveedor(`Jev devolvió un error: ${recortar(typeof err === 'string' ? err : JSON.stringify(err), 600)}`)
    throw new ErrorProveedor(
      `Formato de respuesta de Jev no reconocido: no encontré las respuestas "${NOMBRES.join('", "')}". Respuesta: ${crudoRecortado()}`,
    )
  }
  const { mapa, padre } = encontrado
  const globales = probabilidadesGlobales(padre)
  const decision = {}
  const confianza = {}
  for (const n of NOMBRES) {
    try {
      const { valor, prob } = extraer(mapa[n], PREGUNTAS[n].tipo)
      decision[n] = valor
      confianza[n] = prob ?? (globales ? aProbabilidad(globales[n]) : null)
    } catch (e) {
      if (!(e instanceof ErrorFormato)) throw e
      throw new ErrorProveedor(`Formato de respuesta de Jev no reconocido: pregunta "${n}": ${e.message}. Respuesta: ${crudoRecortado()}`)
    }
  }
  const hayConfianza = NOMBRES.some((n) => confianza[n] !== null)
  return { decision, confianza: hayConfianza ? confianza : null, salidaTexto: JSON.stringify(mapa) }
}

const primerNumero = (...xs) => xs.find((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0) ?? null

// Tokens reportados por Jev; si no vienen, se estiman (caracteres / 4) y se marca estimado: true.
export function tokensJev(body, cuerpoPeticion) {
  const u = esObjeto(body?.usage) ? body.usage : {}
  let entrada = primerNumero(u.input_tokens, u.prompt_tokens, u.tokens?.input, u.tokens_in, body?.tokens_in, body?.input_tokens)
  const salida = primerNumero(u.output_tokens, u.completion_tokens, u.tokens?.output, u.tokens_out, body?.tokens_out, body?.output_tokens) ?? 0
  const entradaCacheada = primerNumero(u.input_tokens_details?.cached_tokens, u.cached_tokens, u.cached_input_tokens) ?? 0
  let estimado = false
  if (entrada === null) {
    const caracteres = cuerpoPeticion.state.length + JSON.stringify(cuerpoPeticion.questions).length
    entrada = Math.ceil(caracteres / 4)
    estimado = true
  }
  return { entrada, entradaCacheada, salida, razonamiento: null, estimado }
}

export async function decidir(viajero, proveedor, { signal } = {}) {
  const peticion = construirPeticion(viajero, proveedor)
  const resp = await enviarJSON(peticion, signal, 'TypeSafe (Jev)')
  const traza = [{ peticion: peticionSinClave(peticion), status: resp.status, crudo: resp.crudo }]
  if (resp.status < 200 || resp.status >= 300) throw errorHttp('TypeSafe (Jev)', resp, { traza, opcionesUsadas: {} })
  if (resp.cuerpo === null) {
    throw new ErrorProveedor(`Formato de respuesta de Jev no reconocido: el cuerpo no es JSON. Respuesta: ${recortar(resp.crudo, 1500)}`, {
      status: resp.status,
      crudo: resp.crudo,
      traza,
    })
  }
  const tokens = tokensJev(resp.cuerpo, peticion.cuerpo)
  const modeloServido = resp.cuerpo.model ?? resp.cuerpo.model_id ?? resp.cuerpo.model_version ?? null
  try {
    const r = interpretarRespuestaJev(resp.cuerpo)
    return { ...r, crudo: resp.crudo, tokens, modeloServido, fallback: false, traza, opcionesUsadas: {} }
  } catch (e) {
    if (e instanceof ErrorProveedor) Object.assign(e, { status: resp.status, crudo: resp.crudo, traza, tokens, modeloServido, opcionesUsadas: {} })
    throw e
  }
}
