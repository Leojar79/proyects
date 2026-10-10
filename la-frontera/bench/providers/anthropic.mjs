// Adaptador de Claude Opus 5.5 (Anthropic) con el SDK oficial.
// Lee ANTHROPIC_API_KEY (y ANTHROPIC_BASE_URL si existe) desde el entorno.
//
// Notas (documentación de Opus 5.5):
// - El razonamiento (thinking) NO se puede desactivar: no se envía el parámetro `thinking`.
// - effort 'low' es el mínimo.
// - Fallback del lado del servidor (beta): si el modelo pedido se niega por política, la API
//   puede responder con un modelo sustituto. Se detecta con usage.iterations[].type === 'fallback_message'.

import Anthropic from '@anthropic-ai/sdk'
import { esquemaJSON, promptSistemaLLM, textoEstado } from '../../shared/preguntas.js'
import { ErrorProveedor, recortar } from '../lib/errores.mjs'
import { validarDecision } from '../lib/decision.mjs'

const BETAS = ['server-side-fallback-2026-07-01']
const MAX_TOKENS = 8000

let cliente = null
function obtenerCliente() {
  // Sin reintentos del SDK: los reintentos (y la medición de latencia) los controla bench/run.mjs.
  cliente ??= new Anthropic({ maxRetries: 0 })
  return cliente
}

export function construirParametros(viajero, proveedor) {
  return {
    model: proveedor.modelo,
    max_tokens: MAX_TOKENS,
    betas: BETAS,
    fallbacks: 'default',
    output_config: {
      effort: proveedor.opciones.effort,
      format: { type: 'json_schema', schema: esquemaJSON() },
    },
    system: promptSistemaLLM(),
    messages: [{ role: 'user', content: textoEstado(viajero) }],
  }
}

// Tokens según la API de Anthropic: input_tokens NO incluye los cacheados.
export function tokensDeUso(usage) {
  const cacheLeida = usage?.cache_read_input_tokens ?? 0
  const cacheCreada = usage?.cache_creation_input_tokens ?? 0
  return {
    entrada: (usage?.input_tokens ?? 0) + cacheLeida + cacheCreada,
    entradaCacheada: cacheLeida,
    // output_tokens ya incluye el razonamiento (se cobra como salida).
    salida: usage?.output_tokens ?? 0,
    // Solo si la API lo desglosa; si no, null (no se inventa).
    razonamiento: usage?.output_tokens_details?.thinking_tokens ?? null,
    estimado: false,
  }
}

export function huboFallback(mensaje) {
  return (mensaje?.usage?.iterations ?? []).some((e) => e.type === 'fallback_message')
}

// Interpreta la respuesta ya recibida (separado de la llamada para poder probarlo).
export function interpretarMensaje(mensaje) {
  const tokens = tokensDeUso(mensaje.usage)
  const fallback = huboFallback(mensaje)
  const base = { tokens, modeloServido: mensaje.model ?? null, fallback, crudo: JSON.stringify(mensaje) }

  if (mensaje.stop_reason === 'refusal') {
    const d = mensaje.stop_details ?? {}
    throw new ErrorProveedor(
      `Opus se negó a responder (stop_reason "refusal"; categoría: ${d.category ?? 'sin categoría'}` +
        `${d.explanation ? `; explicación: ${d.explanation}` : ''}). stop_details: ${recortar(JSON.stringify(mensaje.stop_details), 500)}`,
      base,
    )
  }
  if (mensaje.stop_reason === 'max_tokens') {
    throw new ErrorProveedor(`La respuesta de Opus se cortó al llegar a max_tokens (${MAX_TOKENS}).`, base)
  }

  // Si hubo fallback, el contenido anterior al último bloque `fallback` es del modelo que se negó:
  // se toma el primer bloque de texto del modelo que sirvió la respuesta.
  const contenido = mensaje.content ?? []
  let desde = 0
  contenido.forEach((b, i) => {
    if (b.type === 'fallback') desde = i + 1
  })
  const bloque = contenido.slice(desde).find((b) => b.type === 'text')
  if (!bloque) {
    throw new ErrorProveedor(`Opus no devolvió ningún bloque de texto (stop_reason "${mensaje.stop_reason}").`, base)
  }
  let datos
  try {
    datos = JSON.parse(bloque.text)
  } catch {
    throw new ErrorProveedor(`La salida de Opus no es JSON válido: ${recortar(bloque.text, 300)}`, { ...base, salidaTexto: bloque.text })
  }
  let decision
  try {
    decision = validarDecision(datos)
  } catch (e) {
    throw new ErrorProveedor(`Opus: ${e.message}`, { ...base, salidaTexto: bloque.text })
  }
  return { decision, confianza: null, salidaTexto: bloque.text, ...base }
}

export async function decidir(viajero, proveedor, { signal } = {}) {
  const client = obtenerCliente()
  const params = construirParametros(viajero, proveedor)
  const { betas, ...cuerpo } = params
  const peticion = {
    metodo: 'POST',
    url: `${String(client.baseURL).replace(/\/+$/, '')}/v1/messages?beta=true`,
    cabeceras: { 'anthropic-version': '2023-06-01', 'anthropic-beta': betas.join(','), 'x-api-key': '(oculta)', 'content-type': 'application/json' },
    cuerpo,
  }

  let data
  let response
  try {
    ;({ data, response } = await client.beta.messages.create(params, { signal }).withResponse())
  } catch (e) {
    // Abortado por el runner (tiempo agotado): lo resuelve el runner.
    if (e instanceof Anthropic.APIUserAbortError || signal?.aborted) throw e
    if (e instanceof Anthropic.APIConnectionError) {
      // Incluye APIConnectionTimeoutError.
      throw new ErrorProveedor(
        `Error de red al llamar a Anthropic (${peticion.url}): ${e.message}. Revisa que la red del entorno permita api.anthropic.com.`,
        { reintentable: true, causa: e, traza: [{ peticion, status: null, crudo: null }] },
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
        },
      )
    }
    throw e
  }

  const traza = [{ peticion, status: response.status, crudo: JSON.stringify(data) }]
  try {
    const r = interpretarMensaje(data)
    return { ...r, traza, opcionesUsadas: { effort: proveedor.opciones.effort } }
  } catch (e) {
    if (e instanceof ErrorProveedor) {
      e.traza = traza
      e.opcionesUsadas = { effort: proveedor.opciones.effort }
    }
    throw e
  }
}
