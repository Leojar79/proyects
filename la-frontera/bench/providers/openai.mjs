// Adaptador de GPT Astra (OpenAI) con fetch, sin SDK.
// Variables: OPENAI_API_KEY (obligatoria), OPENAI_MODEL (opcional), OPENAI_API_STYLE = chat | responses,
// OPENAI_BASE_URL (opcional; por defecto https://api.openai.com/v1).

import { esquemaJSON, promptSistemaLLM, textoEstado } from '../../shared/preguntas.js'
import { ErrorProveedor, recortar } from '../lib/errores.mjs'
import { enviarJSON, errorHttp, peticionSinClave } from '../lib/http.mjs'
import { validarDecision } from '../lib/decision.mjs'

const NOMBRE_ESQUEMA = 'decision_frontera'
export const ESTILOS = ['chat', 'responses']

export function modeloEfectivo(proveedor) {
  return process.env.OPENAI_MODEL || proveedor.modelo
}

export function estiloConfigurado() {
  const estilo = (process.env.OPENAI_API_STYLE || 'chat').trim().toLowerCase()
  if (!ESTILOS.includes(estilo)) {
    throw new ErrorProveedor(`OPENAI_API_STYLE debe ser "chat" o "responses" (llegó "${process.env.OPENAI_API_STYLE}").`)
  }
  return estilo
}

function baseURL() {
  return (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
}

// Configuración que funcionó con cada modelo (tras un cambio automático de estilo u opciones),
// para no repetir el intento fallido con cada viajero.
const memoria = new Map()
export function olvidarConfiguracion() {
  memoria.clear()
}

export function construirPeticion({ estilo, conReasoning }, modelo, viajero, proveedor) {
  const esfuerzo = proveedor.opciones?.reasoningEffort ?? 'low'
  const cabeceras = {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}`,
    'Content-Type': 'application/json',
  }
  if (estilo === 'chat') {
    const cuerpo = {
      model: modelo,
      messages: [
        { role: 'system', content: promptSistemaLLM() },
        { role: 'user', content: textoEstado(viajero) },
      ],
      response_format: { type: 'json_schema', json_schema: { name: NOMBRE_ESQUEMA, strict: true, schema: esquemaJSON() } },
    }
    if (conReasoning) cuerpo.reasoning_effort = esfuerzo
    return { metodo: 'POST', url: `${baseURL()}/chat/completions`, cabeceras, cuerpo }
  }
  const cuerpo = {
    model: modelo,
    instructions: promptSistemaLLM(),
    input: textoEstado(viajero),
    text: { format: { type: 'json_schema', name: NOMBRE_ESQUEMA, strict: true, schema: esquemaJSON() } },
  }
  if (conReasoning) cuerpo.reasoning = { effort: esfuerzo }
  return { metodo: 'POST', url: `${baseURL()}/responses`, cabeceras, cuerpo }
}

function textoError(cuerpo) {
  const e = cuerpo?.error
  if (!e) return ''
  return [e.message, e.code, e.param, e.type].filter(Boolean).join(' ')
}

// "Este modelo solo funciona en /v1/responses" y variantes.
export function esModeloNoSoportadoEnChat(status, cuerpo) {
  if (status !== 400 && status !== 404) return false
  const t = textoError(cuerpo)
  if (esReasoningNoSoportado(status, cuerpo)) return false
  return /v1\/responses|responses api|not a chat model|only supported in|not supported (in|on|with) (the )?(v1\/)?chat|unsupported_api/i.test(t)
}

// "reasoning_effort no se admite con este modelo".
export function esReasoningNoSoportado(status, cuerpo) {
  if (status !== 400) return false
  const e = cuerpo?.error
  if (e?.param === 'reasoning_effort' || e?.param === 'reasoning.effort' || e?.param === 'reasoning') return true
  return /reasoning/i.test(e?.message ?? '') && /not supported|unsupported|unrecognized|unknown|not allowed|invalid/i.test(e?.message ?? '')
}

export function tokensChat(usage) {
  return {
    entrada: usage.prompt_tokens ?? 0,
    entradaCacheada: usage.prompt_tokens_details?.cached_tokens ?? 0,
    salida: usage.completion_tokens ?? 0, // incluye razonamiento
    razonamiento: usage.completion_tokens_details?.reasoning_tokens ?? null,
    estimado: false,
  }
}

export function tokensResponses(usage) {
  return {
    entrada: usage.input_tokens ?? 0,
    entradaCacheada: usage.input_tokens_details?.cached_tokens ?? 0,
    salida: usage.output_tokens ?? 0, // incluye razonamiento
    razonamiento: usage.output_tokens_details?.reasoning_tokens ?? null,
    estimado: false,
  }
}

// Si la API no reporta uso (no debería pasar), se estima con caracteres/4 y se marca.
function tokensEstimados(peticion, texto) {
  console.warn('[GPT] La respuesta no trae "usage": tokens ESTIMADOS (caracteres / 4).')
  const entradaTexto = JSON.stringify(peticion.cuerpo.messages ?? [peticion.cuerpo.instructions, peticion.cuerpo.input])
  return {
    entrada: Math.ceil(entradaTexto.length / 4),
    entradaCacheada: 0,
    salida: Math.ceil((texto ?? '').length / 4),
    razonamiento: null,
    estimado: true,
  }
}

// Extrae texto y tokens de una respuesta 2xx. Lanza ErrorProveedor si no sirve.
export function interpretarRespuesta(estilo, cuerpo, peticion) {
  if (!cuerpo || typeof cuerpo !== 'object') throw new ErrorProveedor('OpenAI devolvió un cuerpo que no es JSON.')
  let texto = null
  let negativa = null
  let incompleta = null
  if (estilo === 'chat') {
    const choice = cuerpo.choices?.[0]
    negativa = choice?.message?.refusal ?? null
    texto = choice?.message?.content ?? null
    if (choice?.finish_reason === 'length') incompleta = 'finish_reason "length" (se acabó el límite de tokens)'
    if (!choice) incompleta = 'la respuesta no trae "choices"'
  } else {
    const partes = []
    for (const item of cuerpo.output ?? []) {
      for (const c of item.content ?? []) {
        if (c.type === 'output_text') partes.push(c.text)
        if (c.type === 'refusal') negativa = c.refusal
      }
    }
    texto = partes.length ? partes.join('') : null
    if (cuerpo.status && cuerpo.status !== 'completed') {
      incompleta = `status "${cuerpo.status}"${cuerpo.incomplete_details ? ` (${JSON.stringify(cuerpo.incomplete_details)})` : ''}`
    }
  }
  const tokens = cuerpo.usage
    ? estilo === 'chat'
      ? tokensChat(cuerpo.usage)
      : tokensResponses(cuerpo.usage)
    : tokensEstimados(peticion, texto)
  const base = { tokens, modeloServido: cuerpo.model ?? null, fallback: false }

  if (negativa) throw new ErrorProveedor(`GPT se negó a responder: ${recortar(negativa, 400)}`, base)
  if (incompleta) throw new ErrorProveedor(`La respuesta de GPT quedó incompleta: ${incompleta}.`, { ...base, salidaTexto: texto })
  if (typeof texto !== 'string' || !texto) throw new ErrorProveedor('GPT no devolvió texto de salida.', base)
  let datos
  try {
    datos = JSON.parse(texto)
  } catch {
    throw new ErrorProveedor(`La salida de GPT no es JSON válido: ${recortar(texto, 300)}`, { ...base, salidaTexto: texto })
  }
  let decision
  try {
    decision = validarDecision(datos)
  } catch (e) {
    throw new ErrorProveedor(`GPT: ${e.message}`, { ...base, salidaTexto: texto })
  }
  return { decision, confianza: null, salidaTexto: texto, ...base }
}

export async function decidir(viajero, proveedor, { signal } = {}) {
  const modelo = modeloEfectivo(proveedor)
  let conf = memoria.get(modelo) ?? { estilo: estiloConfigurado(), conReasoning: true }
  const traza = []
  let yaCambioEstilo = false
  let yaQuitoReasoning = false

  for (;;) {
    const peticion = construirPeticion(conf, modelo, viajero, proveedor)
    const t0 = performance.now()
    const resp = await enviarJSON(peticion, signal, 'OpenAI')
    const latenciaMs = performance.now() - t0
    traza.push({ peticion: peticionSinClave(peticion), status: resp.status, crudo: resp.crudo })
    const opcionesUsadas = {
      estiloApi: conf.estilo,
      reasoningEffort: conf.conReasoning ? (proveedor.opciones?.reasoningEffort ?? 'low') : null,
    }

    if (resp.status >= 200 && resp.status < 300) {
      try {
        const r = interpretarRespuesta(conf.estilo, resp.cuerpo, peticion)
        memoria.set(modelo, conf)
        return {
          ...r,
          crudo: resp.crudo,
          traza,
          opcionesUsadas,
          // Si hubo un intento previo rechazado dentro de esta misma llamada, la latencia
          // es solo la de la petición que tuvo éxito.
          ...(traza.length > 1 ? { latenciaMs } : {}),
        }
      } catch (e) {
        if (e instanceof ErrorProveedor) Object.assign(e, { crudo: resp.crudo, traza, opcionesUsadas, status: resp.status })
        throw e
      }
    }

    if (conf.estilo === 'chat' && !yaCambioEstilo && esModeloNoSoportadoEnChat(resp.status, resp.cuerpo)) {
      console.warn(
        `[GPT] El modelo "${modelo}" no se admite en /chat/completions (HTTP ${resp.status}). ` +
          'Reintento una vez con la API "responses". Para fijarlo: OPENAI_API_STYLE=responses',
      )
      conf = { ...conf, estilo: 'responses' }
      yaCambioEstilo = true
      continue
    }
    if (conf.conReasoning && !yaQuitoReasoning && esReasoningNoSoportado(resp.status, resp.cuerpo)) {
      console.warn(
        `[GPT] El modelo "${modelo}" no admite el esfuerzo de razonamiento (HTTP 400). ` +
          'Reintento una vez SIN ese parámetro; queda registrado en "opcionesUsadas" de cada resultado.',
      )
      conf = { ...conf, conReasoning: false }
      yaQuitoReasoning = true
      continue
    }
    throw errorHttp('OpenAI', resp, { traza, opcionesUsadas })
  }
}
