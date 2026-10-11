// Reglas y textos de la composición "simulación" (el video con la voz grabada del autor).
// Funciones puras: las usan la app (src/sim/), el render (render/render.mjs) y los subtítulos
// (render/srt-sim.mjs). Los números de costo salen SOLO de shared/simulacion.js.

// Etiqueta fija que se ve durante TODO el video.
export const ETIQUETA_SIM = {
  principal: 'SIMULACIÓN ILUSTRATIVA',
  detalle: 'costos estimados con precios publicados',
}
export const textoEtiquetaSim = () => `${ETIQUETA_SIM.principal} · ${ETIQUETA_SIM.detalle}`

// Ejemplo de modelo de lenguaje más barato que NO se comparó (tabla de precios de la API de
// Anthropic, consultada el 06/10/2026; precio para prompts de hasta 100K tokens).
export const MODELO_MAS_BARATO = {
  nombre: 'Claude Haiku 5.5',
  entradaPorMTok: 0.1,
  salidaPorMTok: 0.5,
  fuente: 'Tabla de precios de la API de Anthropic',
  fecha: '2026-10-06',
}
export const precioMasBarato = () =>
  `${MODELO_MAS_BARATO.nombre}: US$ ${MODELO_MAS_BARATO.entradaPorMTok.toFixed(2)} / ${MODELO_MAS_BARATO.salidaPorMTok.toFixed(2)} por millón de tokens`

export const CONCLUSION = {
  etiqueta: 'MI CONCLUSIÓN',
  lineas: ['Los modelos generativos: para crear.', 'Jev: para decidir.'],
}

export const LINEA_MARCAS =
  'Inspirado en Papers, Please (Lucas Pope). OpenAI, GPT, Anthropic, Claude, TypeSafe y Jev son marcas de sus dueños; las nombro solo para identificar los productos.'

// ¿Se puede publicar la simulación? Aplica SOLO la regla de divulgación de shared/publicable.js:
// con relacionTypeSafe 'ninguna' (creador independiente) no hay nada que declarar, no se muestra
// nada y no bloquea; con cualquier otra relación ('declarada'), la divulgación es obligatoria y
// bloquea si está vacía. Los precios sin verificar NO bloquean aquí (son estimaciones rotuladas):
// se avisan y se rotulan «precio de fuentes secundarias» en pantalla.
// Devuelve { bloqueos: [{codigo, texto}], avisos: [{codigo, texto}] } (mismo formato que shared/publicable.js).
export function publicableSim({ publicacion, proveedores } = {}) {
  const bloqueos = []
  const avisos = []
  if (debeDeclarar(publicacion) && !textoDivulgacion(publicacion)) {
    bloqueos.push({ codigo: 'divulgacion', texto: 'Falta declarar tu relación con TypeSafe (shared/config.js)' })
  }
  for (const p of proveedores ?? []) {
    if (p.precio?.verificado === false) {
      avisos.push({ codigo: 'precio_secundario', texto: `Precio de ${p.nombre} de fuentes secundarias (se rotula en pantalla)` })
    }
  }
  return { bloqueos, avisos }
}

// Hay relación que declarar salvo que el autor diga explícitamente que no tiene ninguna.
export const debeDeclarar = (publicacion) => publicacion?.relacionTypeSafe !== 'ninguna'
const textoDivulgacion = (publicacion) => String(publicacion?.divulgacion ?? '').trim()

// Texto de divulgación que se MUESTRA en el video: vacío si no hay relación ('ninguna').
export const divulgacionVisible = (publicacion) => (debeDeclarar(publicacion) ? textoDivulgacion(publicacion) : '')

const LOCALE = 'es-419'

// Centavos de dólar con pocas cifras: 0.01625 -> "1.6", 0.0065 -> "0.65", 0.0000325 -> "0.003".
export function centavos(usd) {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return '—'
  const c = usd * 100
  return c.toLocaleString(LOCALE, { maximumSignificantDigits: c < 0.01 ? 1 : 2, useGrouping: false })
}

// Cantidad de decisiones redondeada como se dice en voz: 15, 38, 7,700.
export function decisionesRedondas(n) {
  if (!Number.isFinite(n)) return '—'
  if (n < 100) return Math.round(n).toLocaleString(LOCALE)
  const orden = 10 ** (Math.floor(Math.log10(n)) - 1)
  return (Math.round(n / orden) * orden).toLocaleString(LOCALE)
}

// Sección de la voz activa en t.
export function seccionEn(secciones, t) {
  return secciones.find((s) => t >= s.inicio && t < s.fin) ?? secciones[secciones.length - 1]
}

// ---------------------------------------------------------------------------
// Subtítulos (.srt y pantalla): frases de sim/voz.json con sus tiempos exactos.

// Corta un texto en líneas de hasta `maxCar` caracteres (por palabras; una palabra más larga va sola).
export function partirPorCaracteres(texto, maxCar = 40) {
  const lineas = []
  let actual = ''
  for (const p of String(texto).split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${p}` : p
    if (!actual || prueba.length <= maxCar) actual = prueba
    else {
      lineas.push(actual)
      actual = p
    }
  }
  if (actual) lineas.push(actual)
  return lineas
}

// Reparte las líneas en grupos de `maxLineas` con largo parecido (sin dejar una línea huérfana al final).
function agrupar(lineas, maxLineas) {
  const n = Math.ceil(lineas.length / maxLineas)
  const grupos = []
  let i = 0
  for (let g = 0; g < n; g++) {
    const quedan = lineas.length - i
    const tam = Math.min(maxLineas, Math.ceil(quedan / (n - g)))
    grupos.push(lineas.slice(i, i + tam))
    i += tam
  }
  return grupos
}

// Parte el texto de un subtítulo en 2 líneas de largo parecido (cada una de hasta `maxCar`),
// prefiriendo cortar después de un signo de puntuación. Si cabe en una línea, queda en una.
export function lineasEquilibradas(texto, maxCar = 40) {
  const palabras = String(texto).split(/\s+/).filter(Boolean)
  const completo = palabras.join(' ')
  if (completo.length <= maxCar || palabras.length < 2) return [completo]
  let mejor = null
  for (let i = 1; i < palabras.length; i++) {
    const a = palabras.slice(0, i).join(' ')
    const b = palabras.slice(i).join(' ')
    if (a.length > maxCar || b.length > maxCar) continue
    const fin = a[a.length - 1]
    const bonus = /[.:?!…;]/.test(fin) ? 14 : fin === ',' ? 8 : 0
    const costo = Math.abs(a.length - b.length) - bonus
    if (!mejor || costo < mejor.costo) mejor = { costo, lineas: [a, b] }
  }
  return mejor ? mejor.lineas : partirPorCaracteres(completo, maxCar)
}

// Cues de subtítulos: una frase por cue (máx. `maxLineas` líneas de ~`maxCar` caracteres); una frase
// más larga se parte en varios cues y su tiempo se reparte en proporción a los caracteres.
export function cuesSubtitulos(frases, { maxCar = 40, maxLineas = 2 } = {}) {
  const cues = []
  for (const f of frases) {
    const lineas = partirPorCaracteres(f.texto, maxCar)
    const grupos = agrupar(lineas, maxLineas)
    const total = grupos.reduce((a, g) => a + g.join(' ').length, 0)
    let t = f.inicio
    grupos.forEach((g, k) => {
      const dur = ((f.fin - f.inicio) * g.join(' ').length) / total
      const fin = k === grupos.length - 1 ? f.fin : t + dur
      const texto = g.join(' ')
      const equilibradas = maxLineas >= 2 ? lineasEquilibradas(texto, maxCar) : g
      cues.push({ inicio: round3(t), fin: round3(fin), lineas: equilibradas.length <= maxLineas ? equilibradas : g })
      t = fin
    })
  }
  return cues
}

const round3 = (x) => Math.round(x * 1000) / 1000

// 19.7 -> "00:00:19,700"
export function tiempoSRT(s) {
  const ms = Math.max(0, Math.round(s * 1000))
  const dos = (x) => String(x).padStart(2, '0')
  return `${dos(Math.floor(ms / 3600000))}:${dos(Math.floor((ms % 3600000) / 60000))}:${dos(Math.floor((ms % 60000) / 1000))},${String(ms % 1000).padStart(3, '0')}`
}

export function textoSRT(cues) {
  return cues.map((c, i) => `${i + 1}\n${tiempoSRT(c.inicio)} --> ${tiempoSRT(c.fin)}\n${c.lineas.join('\n')}\n`).join('\n')
}
