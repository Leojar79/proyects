// Utilidades de texto de la simulación (sin tocar src/lib, que usa también el juego).

import { FUENTE_TEXTO, anchoTexto } from '../lib/medir.js'
import { usd } from '../../shared/formato.js'

// Espacio que no se corta al partir líneas (se ve como un espacio normal).
export const NB = ' '

// Como partirLineas de src/lib/medir.js, pero solo corta en espacios normales: "US$ 0.25" escrito con
// NB nunca queda partido entre dos líneas.
export function partir(texto, anchoMax, tam, peso = 400, familia = FUENTE_TEXTO) {
  const palabras = String(texto).split(/ +/).filter(Boolean)
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

// Mayor tamaño (entre max y min) con el que el texto cabe en `maxLineas` líneas.
export function tamPara(texto, anchoMax, maxLineas, max, min, peso = 400, familia = FUENTE_TEXTO) {
  for (let tam = max; tam > min; tam -= 1) {
    if (partir(texto, anchoMax, tam, peso, familia).length <= maxLineas) return tam
  }
  return min
}

// "US$ 0.25" con espacio que no se corta.
export const usdNB = (x) => usd(x).replace(' ', NB)

// Une con espacios que no se cortan lo que no debe quedar partido: "US$ 0.10", "0.10 / 0.50", "(p. ej."
export const conNB = (texto) =>
  String(texto)
    .replace(/US\$ /g, `US$${NB}`)
    .replace(/ \/ /g, `${NB}/${NB}`)
    .replace(/p\. ej\. /g, `p.${NB}ej.${NB}`)
    .replace(/ (\d+\.\d+\b)/g, `${NB}$1`)
    .replace(/ ≈/g, `${NB}≈`)
