// Adaptador de GPT-6 Astra (OpenAI) con fetch, sin SDK.
// Variables: OPENAI_API_KEY (obligatoria), OPENAI_MODEL (opcional), OPENAI_API_STYLE = chat | responses,
// OPENAI_BASE_URL (opcional; por defecto https://api.openai.com/v1).
//
// Las opciones declaradas en shared/modelos.js (reasoningEffort) se envían SIEMPRE. Si la API
// rechaza una, la llamada falla con un error claro: nunca se quita una opción en silencio, porque
// el costo y la configuración publicada dejarían de coincidir con lo que realmente se corrió.

import { esquemaJSON, promptSistemaLLM, textoEstado } from '../../shared/preguntas.js'
import { estimarTokens } from '../lib/datos.mjs'
import { ErrorProveedor, idDePeticion, recortar } from '../lib/errores.mjs'
import { enviarJSON, errorHttp, peticionSinClave } from '../lib/http.mjs'
import { validarDecision } from '../lib/decision.mjs'

const NOMBRE_ESQUEMA = 'decision_frontera'
export const ESTILOS = ['chat', 'responses']
// Opciones de shared/modelos.js que este adaptador sabe enviar.
const OPCIONES_ADMITIDAS = ['reasoningEffort']

export function modeloEfectivo(proveedor) {
  return process.env.OPENAI_MODEL || proveedor.modelo
}

export function estiloConfigurado() {
  const estilo = (process.env.OPENAI_API_STYLE || 'chat').trim().toLowerCase()
  if (!ESTILOS.includes(estilo)) {
    throw new ErrorProveedor(`OPENAI_API_STYLE debe ser "chat" o "responses" (llegó "${process.env.OPENAI_API_STYLE}").`, { codigo: 'configuracion' })
  }
  return estilo
}

function baseURL() {
  return (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
}

// Estilo de API que funcionó con cada modelo (tras el cambio automático chat -> responses),
// para no repetir el intento fallido con cada viajero. El estilo no cambia lo que se cobra
// ni lo que se le pide al modelo; queda registrado en opcionesUsadas.estiloApi.
const memoria = new Map()
export function olvidarConfiguracion() {
  memoria.clear()
}

// Esfuerzo de razonamiento declarado. Falla si falta o si hay opciones que no se envían.
function esfuerzoDeclarado(proveedor) {
  const op = proveedor.opciones ?? {}
  const extra = Object.keys(op).filter((k) => !OPCIONES_ADMITIDAS.includes(k))
  if (extra.length) {
    throw new ErrorProveedor(
      `Opciones de GPT en shared/modelos.js que este adaptador no envía: ${extra.join(', ')}. ` +
        'Nunca se declara una opción que no se usa: quítala o agrégala al adaptador.',
      { codigo: 'configuracion' },
    )
  }
  if (typeof op.reasoningEffort !== 'string' || !op.reasoningEffort) {
    throw new ErrorProveedor('Falta opciones.reasoningEffort de GPT en shared/modelos.js (por ejemplo "low").', { codigo: 'configuracion' })
  }
  return op.reasoningEffort
}

// Opciones con las que se llamaría ahora (para registrar errores sin respuesta, p. ej. de red).
export function opcionesPedidas(proveedor) {
  return {
    reasoningEffort: proveedor.opciones?.reasoningEffort ?? null,
    estiloApi: memoria.get(modeloEfectivo(proveedor)) ?? estiloConfigurado(),
  }
}

// Opciones tal como salieron en el cuerpo de la petición (no como estaban configuradas).
export function opcionesDeCuerpo(estilo, cuerpo) {
  const esfuerzo = estilo === 'chat' ? cuerpo.reasoning_effort : cuerpo.reasoning?.effort
  return { reasoningEffort: esfuerzo ?? null, estiloApi: estilo }
}

export function construirPeticion(estilo, modelo, viajero, proveedor) {
  const esfuerzo = esfuerzoDeclarado(proveedor)
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
      reasoning_effort: esfuerzo,
    }
    return { metodo: 'POST', url: `${baseURL()}/chat/completions`, cabeceras, cuerpo }
  }
  const cuerpo = {
    model: modelo,
    instructions: promptSistemaLLM(),
    input: textoEstado(viajero),
    text: { format: { type: 'json_schema', name: NOMBRE_ESQUEMA, strict: true, schema: esquemaJSON() } },
    reasoning: { effort: esfuerzo },
  }
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

// "reasoning_effort no se admite con este modelo" (o ese valor no se admite).
export function esReasoningNoSoportado(status, cuerpo) {
  if (status !== 400) return false
  const e = cuerpo?.error
  if (e?.param === 'reasoning_effort' || e?.param === 'reasoning.effort' || e?.param === 'reasoning') return true
  return /reasoning/i.test(e?.message ?? '') && /not supported|unsupported|unrecognized|unknown|not allowed|invalid/i.test(e?.message ?? '')
}

const numeroONull = (x) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null)

// Tokens de /chat/completions. Si falta la salida queda null (no se asume 0).
export function tokensChat(usage) {
  return {
    entrada: usage.prompt_tokens ?? 0,
    entradaCacheada: usage.prompt_tokens_details?.cached_tokens ?? 0,
    salida: numeroONull(usage.completion_tokens), // incluye razonamiento
    razonamiento: usage.completion_tokens_details?.reasoning_tokens ?? null,
    estimado: false,
  }
}

// Tokens de /responses. Si falta la salida queda null (no se asume 0).
export function tokensResponses(usage) {
  return {
    entrada: usage.input_tokens ?? 0,
    entradaCacheada: usage.input_tokens_details?.cached_tokens ?? 0,
    salida: numeroONull(usage.output_tokens), // incluye razonamiento
    razonamiento: usage.output_tokens_details?.reasoning_tokens ?? null,
    estimado: false,
  }
}

// Si la API no reporta uso (no debería pasar), se estima y se marca. La salida estimada solo ve el
// texto visible (no el razonamiento), así que es una cota inferior.
function tokensEstimados(peticion, texto) {
  console.warn('[GPT] La respuesta no trae "usage": tokens ESTIMADOS (caracteres / 4 x 1,5).')
  const entradaTexto = JSON.stringify(peticion.cuerpo.messages ?? [peticion.cuerpo.instructions, peticion.cuerpo.input])
  return {
    entrada: estimarTokens(entradaTexto.length),
    entradaCacheada: 0,
    salida: estimarTokens((texto ?? '').length),
    razonamiento: null,
    estimado: true,
  }
}

// Extrae texto y tokens de una respuesta 2xx. Lanza ErrorProveedor si no sirve.
export function interpretarRespuesta(estilo, cuerpo, peticion) {
  if (!cuerpo || typeof cuerpo !== 'object') throw new ErrorProveedor('OpenAI devolvió un cuerpo que no es JSON.', { codigo: 'json_invalido' })
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
  const base = { tokens, modeloServido: cuerpo.model ?? null, fallback: false, idRespuesta: typeof cuerpo.id === 'string' ? cuerpo.id : null }

  if (negativa) throw new ErrorProveedor(`GPT se negó a responder: ${recortar(negativa, 400)}`, { ...base, codigo: 'negativa' })
  if (incompleta) throw new ErrorProveedor(`La respuesta de GPT quedó incompleta: ${incompleta}.`, { ...base, salidaTexto: texto, codigo: 'incompleta' })
  if (typeof texto !== 'string' || !texto) throw new ErrorProveedor('GPT no devolvió texto de salida.', { ...base, codigo: 'incompleta' })
  let datos
  try {
    datos = JSON.parse(texto)
  } catch {
    throw new ErrorProveedor(`La salida de GPT no es JSON válido: ${recortar(texto, 300)}`, { ...base, salidaTexto: texto, codigo: 'json_invalido' })
  }
  let decision
  try {
    decision = validarDecision(datos)
  } catch (e) {
    throw new ErrorProveedor(`GPT: ${e.message}`, { ...base, salidaTexto: texto, codigo: 'esquema' })
  }
  return { decision, confianza: null, salidaTexto: texto, ...base }
}

export async function decidir(viajero, proveedor, { signal } = {}) {
  const modelo = modeloEfectivo(proveedor)
  let estilo = memoria.get(modelo) ?? estiloConfigurado()
  const traza = []
  let yaCambioEstilo = false

  for (;;) {
    const peticion = construirPeticion(estilo, modelo, viajero, proveedor)
    const opcionesUsadas = opcionesDeCuerpo(estilo, peticion.cuerpo)
    const t0 = performance.now()
    let resp
    try {
      resp = await enviarJSON(peticion, signal, 'OpenAI')
    } catch (e) {
      if (e instanceof ErrorProveedor) {
        Object.assign(e, { traza: [...traza, { peticion: peticionSinClave(peticion), status: null, crudo: null }], opcionesUsadas })
      }
      throw e
    }
    const latenciaMs = performance.now() - t0
    traza.push({ peticion: peticionSinClave(peticion), status: resp.status, crudo: resp.crudo })
    const ids = { idRespuesta: typeof resp.cuerpo?.id === 'string' ? resp.cuerpo.id : null, requestId: idDePeticion(resp.cabeceras) }

    if (resp.status >= 200 && resp.status < 300) {
      try {
        const r = interpretarRespuesta(estilo, resp.cuerpo, peticion)
        memoria.set(modelo, estilo)
        return {
          ...r,
          ...ids,
          crudo: resp.crudo,
          traza,
          opcionesUsadas,
          // Si hubo un intento previo rechazado dentro de esta misma llamada, la latencia
          // es solo la de la petición que tuvo éxito.
          ...(traza.length > 1 ? { latenciaMs } : {}),
        }
      } catch (e) {
        if (e instanceof ErrorProveedor) Object.assign(e, { crudo: resp.crudo, traza, opcionesUsadas, status: resp.status, ...ids })
        throw e
      }
    }

    if (estilo === 'chat' && !yaCambioEstilo && esModeloNoSoportadoEnChat(resp.status, resp.cuerpo)) {
      console.warn(
        `[GPT] El modelo "${modelo}" no se admite en /chat/completions (HTTP ${resp.status}). ` +
          'Reintento una vez con la API "responses" (mismas opciones). Para fijarlo: OPENAI_API_STYLE=responses',
      )
      estilo = 'responses'
      yaCambioEstilo = true
      continue
    }
    if (esReasoningNoSoportado(resp.status, resp.cuerpo)) {
      const e = errorHttp('OpenAI', resp, { traza, opcionesUsadas, ...ids, reintentable: false, codigo: 'opcion_no_admitida' })
      e.message =
        `OpenAI no acepta reasoning_effort "${opcionesUsadas.reasoningEffort}" para el modelo "${modelo}"; no lo quito en silencio ` +
        '(GPT correría con otro esfuerzo y otro costo que los publicados). Pon un valor admitido en shared/modelos.js ' +
        `(opciones.reasoningEffort) y repite npm run probar-apis. Detalle: ${e.message}`
      throw e
    }
    throw errorHttp('OpenAI', resp, { traza, opcionesUsadas, ...ids })
  }
}
