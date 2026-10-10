// Medición de texto con canvas (usa las mismas fuentes cargadas por la página).
// Sirve para ajustar tamaños y cortar líneas sin desbordes, de forma determinista.

export const FUENTE_TITULO = "'Press Start 2P', monospace"
export const FUENTE_TEXTO = "Inter, 'Liberation Sans', sans-serif"
export const FUENTE_MONO = "'DejaVu Sans Mono', 'Liberation Mono', monospace"

let ctx = null
const cache = new Map()

function contexto() {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d')
  return ctx
}

// Ancho en px de `texto` con el tamaño, peso y familia dados.
export function anchoTexto(texto, tam, peso = 400, familia = FUENTE_TEXTO, espaciado = 0) {
  const clave = `${peso}|${tam}|${familia}|${espaciado}|${texto}`
  const v = cache.get(clave)
  if (v !== undefined) return v
  const c = contexto()
  c.font = `${peso} ${tam}px ${familia}`
  const ancho = c.measureText(texto).width + espaciado * texto.length
  cache.set(clave, ancho)
  return ancho
}

// Mayor tamaño (entre min y max) con el que el texto cabe en `anchoMax`.
export function tamParaAncho(texto, anchoMax, max, min, peso = 400, familia = FUENTE_TEXTO, espaciado = 0) {
  const a = anchoTexto(texto, max, peso, familia, espaciado * max)
  if (a <= anchoMax) return max
  const t = Math.floor((max * anchoMax) / a)
  return Math.max(min, t)
}

// Corta el texto en líneas que caben en `anchoMax`.
export function partirLineas(texto, anchoMax, tam, peso = 400, familia = FUENTE_TEXTO) {
  const palabras = String(texto).split(/\s+/).filter(Boolean)
  const lineas = []
  let actual = ''
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p
    if (!actual || anchoTexto(prueba, tam, peso, familia) <= anchoMax) actual = prueba
    else {
      lineas.push(actual)
      actual = p
    }
  }
  if (actual) lineas.push(actual)
  return lineas
}

// Mayor tamaño con el que el texto cabe en `maxLineas` líneas.
export function tamParaCaja(texto, anchoMax, maxLineas, max, min, peso = 400, familia = FUENTE_TEXTO) {
  for (let tam = max; tam > min; tam -= 1) {
    if (partirLineas(texto, anchoMax, tam, peso, familia).length <= maxLineas) return tam
  }
  return min
}

// Recorta con "…" si no cabe en una línea.
export function recortar(texto, anchoMax, tam, peso = 400, familia = FUENTE_TEXTO) {
  if (anchoTexto(texto, tam, peso, familia) <= anchoMax) return texto
  let s = texto
  while (s.length > 1 && anchoTexto(`${s}…`, tam, peso, familia) > anchoMax) s = s.slice(0, -1)
  return `${s.trimEnd()}…`
}
