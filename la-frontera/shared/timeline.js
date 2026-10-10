// Línea de tiempo del video (segundos). El guion de voz, los subtítulos y el render
// dependen de estos tiempos: si cambias uno, cambian todos a la vez.

export const DURACION = 75

export const ESCENAS = [
  { id: 'gancho', inicio: 0, fin: 4 },
  { id: 'presentacion', inicio: 4, fin: 14 },
  { id: 'detalle', inicio: 14, fin: 31 },
  { id: 'rapido', inicio: 31, fin: 53 },
  { id: 'resultados', inicio: 53, fin: 67 },
  { id: 'cierre', inicio: 67, fin: 75 },
]

// Cuántos viajeros se muestran despacio, con todo el detalle.
export const VIAJEROS_DETALLE = 3

// Dentro de cada viajero en detalle (segundos desde que empieza su turno):
export const DETALLE = {
  entrada: 0.8, // el viajero entra a la cabina
  habla: 2.0, // termina de "escribirse" lo que dice
  // Ventana para mostrar las respuestas. Las latencias reales se escalan en proporción
  // si alguna supera esta ventana (se muestra el factor en pantalla).
  ventanaRespuesta: 3.0,
}

export function escenaEn(t) {
  const tt = Math.min(Math.max(t, 0), DURACION - 1e-6)
  const escena = ESCENAS.find((e) => tt >= e.inicio && tt < e.fin) ?? ESCENAS[ESCENAS.length - 1]
  return { ...escena, local: tt - escena.inicio, progreso: (tt - escena.inicio) / (escena.fin - escena.inicio) }
}

// Qué viajero está en la cabina en el segundo t.
// Devuelve null fuera de las escenas de juego.
export function viajeroEn(t, totalViajeros) {
  const det = ESCENAS.find((e) => e.id === 'detalle')
  const rap = ESCENAS.find((e) => e.id === 'rapido')
  if (t >= det.inicio && t < det.fin) {
    const slot = (det.fin - det.inicio) / VIAJEROS_DETALLE
    const indice = Math.min(VIAJEROS_DETALLE - 1, Math.floor((t - det.inicio) / slot))
    const local = t - det.inicio - indice * slot
    return { modo: 'detalle', indice, local, duracionSlot: slot, progreso: local / slot }
  }
  if (t >= rap.inicio && t < rap.fin) {
    const restantes = Math.max(1, totalViajeros - VIAJEROS_DETALLE)
    const slot = (rap.fin - rap.inicio) / restantes
    const indice = Math.min(totalViajeros - 1, VIAJEROS_DETALLE + Math.floor((t - rap.inicio) / slot))
    const local = t - rap.inicio - (indice - VIAJEROS_DETALLE) * slot
    return { modo: 'rapido', indice, local, duracionSlot: slot, progreso: local / slot }
  }
  return null
}

// Factor de aceleración del avance rápido respecto al tiempo real medido
// (útil para el letrero "x20" en pantalla).
export function velocidadAvanceRapido(latenciaPromedioMs, totalViajeros) {
  const rap = ESCENAS.find((e) => e.id === 'rapido')
  const slot = (rap.fin - rap.inicio) / Math.max(1, totalViajeros - VIAJEROS_DETALLE)
  return latenciaPromedioMs > 0 ? latenciaPromedioMs / 1000 / slot : 1
}
