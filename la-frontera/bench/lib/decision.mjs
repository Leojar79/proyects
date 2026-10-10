// Valida que una decisión cumpla el esquema de shared/preguntas.js (esquemaJSON()).

import { ACCIONES, NIVELES_PELIGRO } from '../../shared/preguntas.js'

// Devuelve la lista de problemas (vacía si la decisión es válida).
export function problemasDecision(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return ['la decisión no es un objeto JSON']
  const problemas = []
  if (typeof d.pasa !== 'boolean') problemas.push(`"pasa" debe ser booleano (llegó ${JSON.stringify(d.pasa)})`)
  if (typeof d.miente !== 'boolean') problemas.push(`"miente" debe ser booleano (llegó ${JSON.stringify(d.miente)})`)
  if (!Number.isInteger(d.peligro) || d.peligro < 0 || d.peligro >= NIVELES_PELIGRO.length) {
    problemas.push(`"peligro" debe ser un entero de 0 a ${NIVELES_PELIGRO.length - 1} (llegó ${JSON.stringify(d.peligro)})`)
  }
  if (!ACCIONES.includes(d.accion)) {
    problemas.push(`"accion" debe ser una de ${ACCIONES.join(', ')} (llegó ${JSON.stringify(d.accion)})`)
  }
  return problemas
}

// Devuelve solo los cuatro campos, o lanza un Error con los problemas encontrados.
export function validarDecision(d) {
  const problemas = problemasDecision(d)
  if (problemas.length) throw new Error(`La salida no cumple el esquema: ${problemas.join('; ')}`)
  return { pasa: d.pasa, miente: d.miente, peligro: d.peligro, accion: d.accion }
}
