// Punto de entrada para `node --test bench/`.
// Node 22 no acepta una carpeta como argumento de --test (la trata como un módulo y busca
// bench/index.js), así que este archivo carga todas las pruebas *.test.mjs de bench/.
// Alternativa equivalente: node --test 'bench/**/*.test.mjs'

import { readdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const carpeta = dirname(fileURLToPath(import.meta.url))
const pruebas = readdirSync(carpeta, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('.test.mjs') && !f.includes('node_modules'))
  .sort()
for (const f of pruebas) await import(new URL(f, import.meta.url))
