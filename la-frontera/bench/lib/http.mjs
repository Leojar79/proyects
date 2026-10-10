// POST JSON con fetch, sin SDK. Devuelve el cuerpo crudo (texto) además del JSON interpretado,
// para guardar la respuesta HTTP tal como llegó.

import { ErrorProveedor, leerRetryAfter, recortar, statusReintentable } from './errores.mjs'

const CABECERAS_SECRETAS = new Set(['authorization', 'x-api-key', 'api-key'])

// Copia de la petición apta para imprimir o guardar: sin claves.
export function peticionSinClave(peticion) {
  const cabeceras = {}
  for (const [k, v] of Object.entries(peticion.cabeceras ?? {})) {
    cabeceras[k] = CABECERAS_SECRETAS.has(k.toLowerCase()) ? '(oculta)' : v
  }
  return { metodo: peticion.metodo ?? 'POST', url: peticion.url, cabeceras, cuerpo: peticion.cuerpo }
}

export async function enviarJSON(peticion, signal, nombreProveedor) {
  let res
  let crudo
  try {
    res = await fetch(peticion.url, {
      method: peticion.metodo ?? 'POST',
      headers: peticion.cabeceras,
      body: JSON.stringify(peticion.cuerpo),
      signal,
    })
    crudo = await res.text()
  } catch (e) {
    // Si el runner abortó (tiempo agotado), que lo resuelva el runner.
    if (signal?.aborted) throw e
    const causa = e?.cause?.code ?? e?.cause?.message ?? e?.message ?? String(e)
    let host = peticion.url
    try {
      host = new URL(peticion.url).host
    } catch {}
    throw new ErrorProveedor(
      `Error de red al llamar a ${nombreProveedor} (${host}): ${causa}. ` +
        'Revisa que la red del entorno permita ese dominio.',
      { reintentable: true, causa: e },
    )
  }
  let cuerpo = null
  try {
    cuerpo = JSON.parse(crudo)
  } catch {}
  return { status: res.status, crudo, cuerpo, cabeceras: res.headers }
}

// Error claro a partir de una respuesta HTTP no exitosa.
export function errorHttp(nombreProveedor, respuesta, extra = {}) {
  const detalle = respuesta.cuerpo?.error?.message ?? respuesta.cuerpo?.message ?? null
  const extracto = recortar(detalle ? `${detalle} — ${respuesta.crudo}` : respuesta.crudo, 600)
  return new ErrorProveedor(`${nombreProveedor} respondió HTTP ${respuesta.status}: ${extracto}`, {
    status: respuesta.status,
    reintentable: statusReintentable(respuesta.status),
    retryAfterMs: leerRetryAfter(respuesta.cabeceras),
    crudo: respuesta.crudo,
    ...extra,
  })
}
