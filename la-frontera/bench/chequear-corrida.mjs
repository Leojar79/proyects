#!/usr/bin/env node
// Revisa que un archivo de corrida cumpla el contrato de ARQUITECTURA.md.
// Uso: node bench/chequear-corrida.mjs public/runs/demo.json [--completa]

import { problemasCorrida } from './lib/contrato.mjs'
import { cargarViajeros, leerJSON } from './lib/datos.mjs'

const args = process.argv.slice(2)
const exigirCompleta = args.includes('--completa')
const archivos = args.filter((a) => !a.startsWith('--'))
if (!archivos.length) {
  console.error('Uso: node bench/chequear-corrida.mjs <archivo.json> [--completa]')
  process.exit(1)
}
const viajeros = cargarViajeros()
let fallas = 0
for (const archivo of archivos) {
  let run
  try {
    run = leerJSON(archivo)
  } catch (e) {
    console.error(`${archivo}: no se pudo leer (${e.message})`)
    fallas++
    continue
  }
  const problemas = problemasCorrida(run, viajeros, { exigirCompleta })
  if (problemas.length) {
    fallas++
    console.error(`${archivo}: ${problemas.length} problema(s)\n  - ${problemas.slice(0, 50).join('\n  - ')}`)
  } else {
    const n = Object.values(run.resultados).reduce((a, l) => a + l.length, 0)
    console.log(`${archivo}: OK (source "${run.source}", ${run.viajeros.length} viajeros, ${run.proveedores.length} proveedores, ${n} resultados)`)
  }
}
process.exit(fallas ? 1 : 0)
