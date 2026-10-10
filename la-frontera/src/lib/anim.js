// Utilidades de animación. TODO se calcula a partir del tiempo t: nada de relojes,
// Math.random ni animaciones CSS. Así cada cuadro del video es reproducible.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const lerp = (a, b, k) => a + (b - a) * k

// Progreso 0..1 de un tramo que empieza en `inicio` y dura `dur` segundos.
export const prog = (t, inicio, dur) => (dur <= 0 ? (t >= inicio ? 1 : 0) : clamp((t - inicio) / dur))

export const easeOutCubic = (k) => 1 - (1 - k) ** 3
export const easeInCubic = (k) => k ** 3
export const easeInOutCubic = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2)
export const easeOutQuad = (k) => 1 - (1 - k) * (1 - k)
export function easeOutBack(k, s = 1.70158) {
  const c3 = s + 1
  return 1 + c3 * (k - 1) ** 3 + s * (k - 1) ** 2
}
export function easeOutElastic(k) {
  if (k <= 0) return 0
  if (k >= 1) return 1
  return 2 ** (-10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1
}

// Entrada típica: devuelve { o (opacidad), k (progreso con easing) }.
export function entrada(t, inicio, dur = 0.45, easing = easeOutCubic) {
  const p = prog(t, inicio, dur)
  return { o: clamp(p * 2.2), k: easing(p), p }
}

// Golpe de sello: escala 1,6 -> 1 y rotación ligera en ~0,15 s, con destello.
export function golpe(t, t0, rotFinal = -6, escalaInicial = 1.6, dur = 0.15) {
  const dt = t - t0
  if (dt < 0) return { visible: false, escala: escalaInicial, rot: rotFinal, flash: 0, o: 0, sacudida: 0 }
  const k = clamp(dt / dur)
  const e = easeInCubic(k)
  const escala = lerp(escalaInicial, 1, e)
  const rot = lerp(rotFinal - 9, rotFinal, e)
  // Pequeño rebote después del impacto.
  const rebote = dt > 0.15 && dt < 0.3 ? Math.sin(((dt - 0.15) / 0.15) * Math.PI) * 0.04 : 0
  const flash = dt >= 0.13 ? clamp(1 - (dt - 0.13) / 0.3) : 0
  const sacudida = dt >= 0.13 ? clamp(1 - (dt - 0.13) / 0.25) : 0
  return { visible: true, escala: escala - rebote, rot, flash, o: clamp(k * 3), sacudida }
}

// Contador que sube de `desde` a `hasta` entre t0 y t0+dur.
export function contar(t, t0, dur, desde, hasta) {
  return lerp(desde, hasta, easeOutCubic(prog(t, t0, dur)))
}

// Generador pseudoaleatorio determinista (mulberry32).
export function mulberry32(semilla) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let x = a
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

export function hash32(texto) {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// Valor pseudoaleatorio fijo para una clave (sirve para rotaciones, desfases, etc.).
export const azarFijo = (clave) => mulberry32(hash32(String(clave)))()

// Sacudida de cámara determinista: desplazamiento en px.
export function sacudir(intensidad, t, amp = 14) {
  if (intensidad <= 0) return { x: 0, y: 0 }
  // Píxeles enteros: un desplazamiento fraccionario cambia el rasterizado según el cuadro anterior.
  return {
    x: Math.round(Math.sin(t * 91.7) * amp * intensidad),
    y: Math.round(Math.cos(t * 77.3) * amp * intensidad * 0.8),
  }
}

// Ventana de visibilidad con entrada y salida suaves.
export function ventana(t, inicio, fin, entradaDur = 0.35, salidaDur = 0.3) {
  if (t < inicio || t > fin) return 0
  return Math.min(easeOutCubic(prog(t, inicio, entradaDur)), 1 - easeInCubic(prog(t, fin - salidaDur, salidaDur)))
}

export const px = (n) => `${Math.round(n * 100) / 100}px`
