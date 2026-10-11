// Simulación ilustrativa: costo ESTIMADO por decisión con los precios publicados de cada API.
// No llama a ninguna API ni inventa aciertos ni velocidades: solo multiplica tokens estimados
// por precios. Es la fuente de todos los números del video de simulación (pantalla y textos).

import { PROVEEDORES, calcularCosto } from './modelos.js'
import { textoEstado, promptSistemaLLM, esquemaJSON, preguntasJev } from './preguntas.js'

// Supuestos (se muestran en pantalla y en la descripción del post).
export const SUPUESTOS = {
  // Tokens ≈ caracteres / 4, × 1.3 por la tokenización del español.
  caracteresPorToken: 4,
  factorEspanol: 1.3,
  // Tokens de salida de GPT y Opus por decisión (JSON + razonamiento interno con esfuerzo "low").
  salidaLLM: { minimo: 40, central: 150, maximo: 300 },
  presupuestoUSD: 0.25,
}

function tokens(texto) {
  return (texto.length / SUPUESTOS.caracteresPorToken) * SUPUESTOS.factorEspanol
}

function promedio(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

// Costo estimado por decisión para cada proveedor, promediado sobre los viajeros del juego.
export function estimarCostos(viajeros) {
  const entradaLLM = promedio(viajeros.map((v) => tokens(promptSistemaLLM() + textoEstado(v) + JSON.stringify(esquemaJSON()))))
  const entradaJev = promedio(viajeros.map((v) => tokens(textoEstado(v) + JSON.stringify(preguntasJev()))))
  return PROVEEDORES.map((p) => {
    const esJev = p.id === 'jev'
    const entrada = esJev ? entradaJev : entradaLLM
    const salida = esJev ? { minimo: 0, central: 0, maximo: 0 } : SUPUESTOS.salidaLLM
    const costo = (s) => calcularCosto(p.precio, { entrada, salida: s })
    const central = costo(salida.central)
    return {
      id: p.id,
      nombre: p.nombre,
      empresa: p.empresa,
      modelo: p.modelo,
      color: p.color,
      precio: p.precio,
      tokensEntrada: Math.round(entrada),
      tokensSalida: salida,
      costo: { minimo: costo(salida.minimo), central, maximo: costo(salida.maximo) },
      // Cuántas decisiones alcanzan con el presupuesto (estimación central y rango).
      decisiones: {
        central: Math.floor(SUPUESTOS.presupuestoUSD / central),
        minimo: Math.floor(SUPUESTOS.presupuestoUSD / costo(salida.maximo)),
        maximo: Math.floor(SUPUESTOS.presupuestoUSD / costo(salida.minimo)),
      },
    }
  })
}
