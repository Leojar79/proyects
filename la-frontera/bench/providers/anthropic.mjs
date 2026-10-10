// Adaptador de Claude Opus 5.5 (Anthropic) con el SDK oficial.
// Lee ANTHROPIC_API_KEY (y ANTHROPIC_BASE_URL si existe) desde el entorno.
//
// Notas (documentación de Opus 5.5):
// - El razonamiento (thinking) NO se puede desactivar: no se envía el parámetro `thinking`.
// - effort 'low' es el mínimo (va en output_config, junto con el formato JSON).
// - SIN respaldo del lado del servidor (`fallbacks`): en un benchmark, una negativa de Opus es
//   conducta de Opus. Queda como error, con los tokens que la API sí cobró; nunca se cuenta como
//   respuesta de "Claude Opus 5.5" la de otro modelo.

import Anthropic from '@anthropic-ai/sdk'
import { esquemaJSON, promptSistemaLLM, textoEstado } from '../../shared/preguntas.js'
import { ErrorProveedor, recortar } from '../lib/errores.mjs'
import { validarDecision } from '../lib/decision.mjs'

const MAX_TOKENS = 8000
// Opciones de shared/modelos.js que este adaptador sabe enviar.
const OPCIONES_ADMITIDAS = ['effort']

let cliente = null
function obtenerCliente() {
  // Sin reintentos del SDK: los reintentos (y la medición de latencia) los controla bench/run.mjs.
  cliente ??= new Anthropic({ maxRetries: 0 })
  return cliente
}

function esfuerzoDeclarado(proveedor) {
  const op = proveedor.opciones ?? {}
  const extra = Object.keys(op).filter((k) => !OPCIONES_ADMITIDAS.includes(k))
  if (extra.length) {
    throw new ErrorProveedor(
      `Opciones de Opus en shared/modelos.js que este adaptador no envía: ${extra.join(', ')}. ` +
        'Nunca se declara una opción que no se usa: quítala o agrégala al adaptador.',
      { codigo: 'configuracion' },
    )
  }
  if (typeof op.effort !== 'string' || !op.effort) {
    throw new ErrorProveedor('Falta opciones.effort de Opus en shared/modelos.js (por ejemplo "low").', { codigo: 'configuracion' })
  }
  return op.effort
}

export function construirParametros(viajero, proveedor) {
  return {
    model: proveedor.modelo,
    max_tokens: MAX_TOKENS,
    output_config: {
      effort: esfuerzoDeclarado(proveedor),
      format: { type: 'json_schema', schema: esquemaJSON() },
    },
    system: promptSistemaLLM(),
    messages: [{ role: 'user', content: textoEstado(viajero) }],
  }
}

// Opciones con las que se llamaría ahora (para registrar errores sin respuesta, p. ej. de red).
export function opcionesPedidas(proveedor) {
  return { effort: proveedor.opciones?.effort ?? null }
}

// Opciones tal como salieron en la petición.
function opcionesDeParametros(params) {
  return { effort: params.output_config?.effort ?? null }
}

// Tokens según la API de Anthropic: input_tokens NO incluye los cacheados.
export function tokensDeUso(usage) {
  const cacheLeida = usage?.cache_read_input_tokens ?? 0
  const cacheCreada = usage?.cache_creation_input_tokens ?? 0
  const salida = usage?.output_tokens
  return {
    entrada: (usage?.input_tokens ?? 0) + cacheLeida + cacheCreada,
    entradaCacheada: cacheLeida,
    // output_tokens ya incluye el razonamiento (se cobra como salida). null si no se informa.
    salida: typeof salida === 'number' && Number.isFinite(salida) ? salida : null,
    // Solo si la API lo desglosa; si no, null (no se inventa).
    razonamiento: usage?.output_tokens_details?.thinking_tokens ?? null,
    estimado: false,
  }
}

// La firma de los bloques thinking (y el contenido cifrado de redacted_thinking) puede ocupar
// miles de caracteres y, al recortar `crudo` a 4000, se perdía la respuesta. Se reemplaza por su largo.
export function crudoSinFirmas(mensaje) {
  return JSON.stringify(mensaje, function (k, v) {
    if (typeof v !== 'string') return v
    if (k === 'signature') return `(firma omitida: ${v.length} caracteres)`
    if (k === 'data' && this?.type === 'redacted_thinking') return `(contenido cifrado omitido: ${v.length} caracteres)`
    return v
  })
}

// Señales de que respondió otro modelo (solo pasaría con `fallbacks`, que no se envía).
export function huboFallback(mensaje) {
  return (
    (mensaje?.usage?.iterations ?? []).some((e) => e?.type === 'fallback_message') ||
    (mensaje?.content ?? []).some((b) => b?.type === 'fallback')
  )
}

// Interpreta la respuesta ya recibida (separado de la llamada para poder probarlo).
export function interpretarMensaje(mensaje) {
  const tokens = tokensDeUso(mensaje.usage)
  const base = {
    tokens,
    modeloServido: mensaje.model ?? null,
    fallback: false,
    crudo: crudoSinFirmas(mensaje),
    idRespuesta: typeof mensaje.id === 'string' ? mensaje.id : null,
  }

  if (huboFallback(mensaje)) {
    throw new ErrorProveedor(
      `La respuesta la sirvió otro modelo (${mensaje.model ?? '?'}) aunque no se pidió respaldo; no cuenta como respuesta de Opus.`,
      { ...base, fallback: true, codigo: 'fallback' },
    )
  }
  if (mensaje.stop_reason === 'refusal') {
    const d = mensaje.stop_details ?? {}
    throw new ErrorProveedor(
      `Opus se negó a responder (stop_reason "refusal"; categoría: ${d.category ?? 'sin categoría'}` +
        `${d.explanation ? `; explicación: ${d.explanation}` : ''}). stop_details: ${recortar(JSON.stringify(mensaje.stop_details), 500)}`,
      { ...base, codigo: 'negativa' },
    )
  }
  if (mensaje.stop_reason === 'max_tokens') {
    throw new ErrorProveedor(`La respuesta de Opus se cortó al llegar a max_tokens (${MAX_TOKENS}).`, { ...base, codigo: 'max_tokens' })
  }

  const bloque = (mensaje.content ?? []).find((b) => b.type === 'text')
  if (!bloque) {
    throw new ErrorProveedor(`Opus no devolvió ningún bloque de texto (stop_reason "${mensaje.stop_reason}").`, { ...base, codigo: 'incompleta' })
  }
  let datos
  try {
    datos = JSON.parse(bloque.text)
  } catch {
    throw new ErrorProveedor(`La salida de Opus no es JSON válido: ${recortar(bloque.text, 300)}`, { ...base, salidaTexto: bloque.text, codigo: 'json_invalido' })
  }
  let decision
  try {
    decision = validarDecision(datos)
  } catch (e) {
    throw new ErrorProveedor(`Opus: ${e.message}`, { ...base, salidaTexto: bloque.text, codigo: 'esquema' })
  }
  return { decision, confianza: null, salidaTexto: bloque.text, ...base }
}

export async function decidir(viajero, proveedor, { signal } = {}) {
  const client = obtenerCliente()
  const params = construirParametros(viajero, proveedor)
  const opcionesUsadas = opcionesDeParametros(params)
  const peticion = {
    metodo: 'POST',
    url: `${String(client.baseURL).replace(/\/+$/, '')}/v1/messages`,
    cabeceras: { 'anthropic-version': '2023-06-01', 'x-api-key': '(oculta)', 'content-type': 'application/json' },
    cuerpo: params,
  }

  let data
  let response
  try {
    ;({ data, response } = await client.messages.create(params, { signal }).withResponse())
  } catch (e) {
    // Abortado por el runner (tiempo agotado): lo resuelve el runner.
    if (e instanceof Anthropic.APIUserAbortError || signal?.aborted) throw e
    if (e instanceof Anthropic.APIConnectionError) {
      // Incluye APIConnectionTimeoutError.
      throw new ErrorProveedor(
        `Error de red al llamar a Anthropic (${peticion.url}): ${e.message}. Revisa que la red del entorno permita api.anthropic.com.`,
        { reintentable: true, causa: e, traza: [{ peticion, status: null, crudo: null }], opcionesUsadas, codigo: 'red' },
      )
    }
    if (e instanceof Anthropic.APIError) {
      const crudo = e.error ? JSON.stringify(e.error) : null
      const retryAfter = Number(e.headers?.get?.('retry-after'))
      const reintentable =
        e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || (e.status ?? 0) >= 500
      throw new ErrorProveedor(
        `Anthropic respondió HTTP ${e.status}${e.type ? ` (${e.type})` : ''}: ${recortar(crudo ?? e.message, 600)}`,
        {
          status: e.status ?? null,
          reintentable,
          retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1000 : null,
          crudo,
          causa: e,
          traza: [{ peticion, status: e.status ?? null, crudo }],
          opcionesUsadas,
          codigo: e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError ? 'autenticacion' : 'http',
          requestId: e.requestID ?? null,
        },
      )
    }
    throw e
  }

  const requestId = response.headers?.get?.('request-id') ?? null
  const traza = [{ peticion, status: response.status, crudo: crudoSinFirmas(data) }]
  try {
    const r = interpretarMensaje(data)
    return { ...r, traza, opcionesUsadas, requestId }
  } catch (e) {
    if (e instanceof ErrorProveedor) Object.assign(e, { traza, opcionesUsadas, requestId, status: response.status })
    throw e
  }
}
