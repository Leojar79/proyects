// Pruebas de bench/recalcular.mjs (precios nuevos sin repetir el benchmark) y de la corrida demo.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JUEGO, PUBLICACION } from '../shared/config.js'
import { calcularCosto, PROVEEDORES } from '../shared/modelos.js'
import { motivosNoPublicable } from '../shared/publicable.js'
import { generarDemo } from './demo.mjs'
import { problemasCorrida } from './lib/contrato.mjs'
import { cargarViajeros, huellaPrompt, redondearCosto } from './lib/datos.mjs'
import { recalcularCorrida } from './recalcular.mjs'

const RECALCULAR = fileURLToPath(new URL('./recalcular.mjs', import.meta.url))
const viajeros = cargarViajeros()

// Corrida "real" de prueba: la demo con source live, precios viejos y un error facturado.
function corridaConPreciosViejos() {
  const run = generarDemo(viajeros, '2026-10-10T18:00:00.000Z')
  run.source = 'live'
  delete run.nota
  const gpt = run.proveedores.find((p) => p.id === 'gpt')
  gpt.precio = { ...gpt.precio, entradaPorMTok: 12, salidaPorMTok: 60, fuente: 'vieja', fecha: '2026-01-01' }
  for (const r of run.resultados.gpt) r.costoUSD = redondearCosto(calcularCosto(gpt.precio, r.tokens))
  // Un error con tokens facturados (p. ej. JSON inválido) y su historia.
  const err = run.resultados.gpt[5]
  Object.assign(err, { ok: false, error: 'La salida de GPT no es JSON válido', codigoError: 'json_invalido', decision: null, latenciaMs: null, costoUSD: 0 })
  err.costoFacturadoUSD = redondearCosto(calcularCosto(gpt.precio, err.tokens))
  const ok = run.resultados.gpt[6]
  ok.reemplazaA = [{ ok: false, error: 'negativa', codigoError: 'negativa', intentos: 1, tokens: ok.tokens, costoFacturadoUSD: 1 }]
  return run
}

describe('recalcularCorrida', () => {
  test('reemplaza los precios por los de shared/modelos.js y recalcula desde los tokens', () => {
    const viejo = corridaConPreciosViejos()
    const { run, cambios, huboCambio } = recalcularCorrida(viejo, { fecha: '2026-10-11T00:00:00.000Z' })
    assert.equal(huboCambio, true)
    const actual = PROVEEDORES.find((p) => p.id === 'gpt')
    const gpt = run.proveedores.find((p) => p.id === 'gpt')
    assert.deepEqual(gpt.precio, actual.precio, 'incluye fuente, verificado y fecha')
    for (const r of run.resultados.gpt) {
      if (r.ok) assert.equal(r.costoUSD, redondearCosto(calcularCosto(actual.precio, r.tokens)))
      else {
        assert.equal(r.costoUSD, 0)
        assert.equal(r.costoFacturadoUSD, redondearCosto(calcularCosto(actual.precio, r.tokens)))
      }
    }
    assert.equal(run.resultados.gpt[6].reemplazaA[0].costoFacturadoUSD, redondearCosto(calcularCosto(actual.precio, run.resultados.gpt[6].tokens)))
    const c = cambios.find((x) => x.id === 'gpt')
    assert.equal(c.cambioPrecio, true)
    assert.ok(c.despues.total < c.antes.total)
    assert.equal(cambios.find((x) => x.id === 'opus').cambioPrecio, false)
    // Historia del cambio, con los precios de antes y de después.
    assert.equal(run.recalculos.length, 1)
    assert.equal(run.recalculos[0].precios.gpt.antes.entradaPorMTok, 12)
    assert.equal(run.recalculos[0].precios.gpt.despues.entradaPorMTok, actual.precio.entradaPorMTok)
    // No toca nada más ni modifica el original.
    assert.deepEqual(run.resultados.gpt.map((r) => r.tokens), viejo.resultados.gpt.map((r) => r.tokens))
    assert.deepEqual(run.juego, viejo.juego)
    assert.equal(viejo.proveedores.find((p) => p.id === 'gpt').precio.entradaPorMTok, 12)
    assert.deepEqual(problemasCorrida(run, viajeros, { exigirCompleta: true }), [])
    const codigos = motivosNoPublicable(run, viajeros, { juego: JUEGO, publicacion: PUBLICACION, proveedores: PROVEEDORES }).bloqueos.map((b) => b.codigo)
    assert.ok(!codigos.includes('precio_cambiado'))
  })

  test('sin cambios de precio: no agrega historia', () => {
    const { huboCambio, run } = recalcularCorrida(generarDemo(viajeros, '2026-10-10T18:00:00.000Z'))
    assert.equal(huboCambio, false)
    assert.equal(run.recalculos, undefined)
  })

  test('se niega si la corrida usó otro modelo', () => {
    const run = corridaConPreciosViejos()
    run.proveedores.find((p) => p.id === 'gpt').modelo = 'gpt-otro'
    assert.throws(() => recalcularCorrida(run), /usó el modelo "gpt-otro"/)
  })
})

describe('npm run recalcular (CLI)', () => {
  let dir
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'frontera-recalcular-'))
  })
  after(() => rmSync(dir, { recursive: true, force: true }))

  const correr = (args) =>
    new Promise((resolve) => {
      execFile(process.execPath, [RECALCULAR, ...args], { env: { ...process.env, FRONTERA_RUNS_DIR: dir } }, (error, stdout, stderr) => {
        resolve({ codigo: error ? error.code : 0, stdout, stderr })
      })
    })
  const leer = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))

  test('--simular no escribe; sin opciones recalcula latest.json y su archivo con fecha', async () => {
    const run = corridaConPreciosViejos()
    writeFileSync(join(dir, 'latest.json'), JSON.stringify(run))
    writeFileSync(join(dir, '2026-10-10_18-00-00.json'), JSON.stringify(run))

    const sim = await correr(['--simular'])
    assert.equal(sim.codigo, 0, sim.stderr)
    assert.match(sim.stdout, /precio antes: +12 \/ 1 \/ 60/)
    assert.match(sim.stdout, /simulación/)
    assert.equal(leer('latest.json').proveedores.find((p) => p.id === 'gpt').precio.entradaPorMTok, 12)

    const r = await correr([])
    assert.equal(r.codigo, 0, r.stderr)
    assert.match(r.stdout, /costo total de la corrida: +US\$ [\d.]+ -> US\$ [\d.]+/)
    for (const f of ['latest.json', '2026-10-10_18-00-00.json']) {
      const nuevo = leer(f)
      assert.equal(nuevo.proveedores.find((p) => p.id === 'gpt').precio.entradaPorMTok, PROVEEDORES[0].precio.entradaPorMTok, f)
      assert.equal(nuevo.recalculos.length, 1, f)
    }
    const otra = await correr([])
    assert.match(otra.stdout, /Sin cambios/)
  })

  test('archivo inexistente -> error', async () => {
    const r = await correr(['no-existe.json'])
    assert.equal(r.codigo, 1)
    assert.match(r.stderr, /no encuentro la corrida/)
  })
})

describe('corrida demo (bench/demo.mjs)', () => {
  const demo = generarDemo(viajeros, '2026-10-10T18:00:00.000Z')

  test('cumple el contrato y registra reglas, huella y opciones como una corrida real', () => {
    assert.deepEqual(problemasCorrida(demo, viajeros, { exigirCompleta: true }), [])
    assert.deepEqual(demo.juego, { presupuestoUSD: JUEGO.presupuestoUSD, vidas: JUEGO.vidas })
    assert.equal(demo.huellaPrompt, huellaPrompt())
    assert.equal(demo.parcial, false)
    assert.equal(demo.probe, false)
    for (const r of demo.resultados.gpt) assert.deepEqual(r.opcionesUsadas, { reasoningEffort: 'low', estiloApi: 'chat' })
    for (const r of demo.resultados.opus) assert.deepEqual(r.opcionesUsadas, { effort: 'low' })
    for (const r of demo.resultados.jev) {
      assert.deepEqual(r.opcionesUsadas, {})
      assert.equal(r.tokens.salida, 0, 'Jev: 0 tokens de salida informados (número, no null)')
    }
  })

  test('solo la bloquea ser demo (más precio y divulgación, que no dependen de la corrida)', () => {
    const { bloqueos } = motivosNoPublicable(demo, viajeros, { juego: JUEGO, publicacion: PUBLICACION, proveedores: PROVEEDORES })
    const codigos = new Set(bloqueos.map((b) => b.codigo))
    assert.ok(codigos.has('demo'))
    for (const c of codigos) assert.ok(['demo', 'precio', 'divulgacion'].includes(c), `bloqueo inesperado: ${c}`)
  })

  test('una respuesta sin la opción declarada (o sin opcionesUsadas) bloquea por configuración', () => {
    const codigos = (run) => motivosNoPublicable(run, viajeros, { juego: JUEGO, publicacion: PUBLICACION, proveedores: PROVEEDORES }).bloqueos.map((b) => b.codigo)
    const sinClave = structuredClone(demo)
    delete sinClave.resultados.gpt[0].opcionesUsadas.reasoningEffort
    assert.ok(codigos(sinClave).includes('config'))
    const sinNada = structuredClone(demo)
    delete sinNada.resultados.opus[0].opcionesUsadas
    assert.ok(codigos(sinNada).includes('config'))
    assert.ok(!codigos(demo).includes('config'))
  })

  test('public/runs/demo.json está al día con el generador (salvo la fecha)', () => {
    const guardada = JSON.parse(readFileSync(fileURLToPath(new URL('../public/runs/demo.json', import.meta.url)), 'utf8'))
    const sinFechas = (run) => JSON.parse(JSON.stringify(run).replaceAll(run.createdAt, 'FECHA'))
    assert.deepEqual(sinFechas(guardada), sinFechas(generarDemo(viajeros, guardada.createdAt)), 'regenera con: npm run demo')
  })
})
