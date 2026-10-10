// Errores de los adaptadores. El runner decide si reintenta mirando `reintentable`
// (nunca comparando textos de mensajes).

export class ErrorProveedor extends Error {
  /**
   * @param {string} mensaje Mensaje claro en español (incluye status HTTP y un extracto del cuerpo).
   * @param {object} [extra]
   * @param {number|null} [extra.status] Status HTTP, si hubo respuesta.
   * @param {boolean} [extra.reintentable] true para 429, 5xx, 529, errores de red y tiempos de espera.
   * @param {number|null} [extra.retryAfterMs] Espera sugerida por el servidor (cabecera retry-after).
   * @param {string|null} [extra.crudo] Cuerpo HTTP crudo de la respuesta que falló.
   * @param {object|null} [extra.tokens] Tokens facturados aunque la respuesta no sirva (negativa, JSON inválido...).
   * @param {string|null} [extra.salidaTexto] Texto que devolvió el modelo, si lo hubo.
   * @param {string|null} [extra.modeloServido]
   * @param {boolean} [extra.fallback]
   * @param {Array} [extra.traza] Peticiones y respuestas HTTP de esta llamada (para --probe).
   * @param {object} [extra.opcionesUsadas]
   */
  constructor(mensaje, extra = {}) {
    super(mensaje, extra.causa ? { cause: extra.causa } : undefined)
    this.name = 'ErrorProveedor'
    this.status = extra.status ?? null
    this.reintentable = extra.reintentable ?? false
    this.retryAfterMs = extra.retryAfterMs ?? null
    this.crudo = extra.crudo ?? null
    this.tokens = extra.tokens ?? null
    this.salidaTexto = extra.salidaTexto ?? null
    this.modeloServido = extra.modeloServido ?? null
    this.fallback = extra.fallback ?? false
    this.traza = extra.traza ?? []
    this.opcionesUsadas = extra.opcionesUsadas ?? null
  }
}

// El runner aborta la petición con este motivo cuando se agota el tiempo por llamada.
export class ErrorTiempoAgotado extends Error {
  constructor(ms) {
    super(`Tiempo de espera agotado (${Math.round(ms / 1000)} s sin respuesta).`)
    this.name = 'ErrorTiempoAgotado'
    this.ms = ms
  }
}

export function recortar(texto, max = 4000) {
  if (texto === null || texto === undefined) return null
  const s = typeof texto === 'string' ? texto : JSON.stringify(texto)
  return s.length > max ? `${s.slice(0, max)}… [recortado: ${s.length} caracteres en total]` : s
}

// Reintentar en 429 (límite de uso), 5xx y 529 (sobrecarga de Anthropic).
export function statusReintentable(status) {
  return status === 429 || (status >= 500 && status <= 599)
}

// Cabecera retry-after: segundos o fecha HTTP. Devuelve milisegundos o null.
export function leerRetryAfter(cabeceras) {
  const valor = cabeceras?.get?.('retry-after-ms') ?? null
  if (valor !== null && Number.isFinite(Number(valor))) return Number(valor)
  const ra = cabeceras?.get?.('retry-after') ?? null
  if (ra === null) return null
  if (Number.isFinite(Number(ra))) return Number(ra) * 1000
  const fecha = Date.parse(ra)
  return Number.isFinite(fecha) ? Math.max(0, fecha - Date.now()) : null
}
