// Pruebas de punta a punta de bench/run.mjs (proceso aparte) contra un servidor HTTP local
// que imita las tres APIs. Escribe en una carpeta temporal (FRONTERA_RUNS_DIR), nunca en public/runs.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { problemasCorrida } from './lib/contrato.mjs'

const RUN = fileURLToPath(new URL('./run.mjs', import.meta.url))

const VIAJEROS = [
  {
    id: 'v01', nombre: 'Ana Kovač', semilla: 1,
    documento: { nombre: 'Ana Kovač', nacionalidad: 'Ostrava', vence: '02/11/1986', permiso: 'turismo', permisoNombre: 'Ana Kovač', equipajeDeclarado: 'Ropa', inspeccion: 'Ropa. Nada irregular.' },
    dice: 'Vengo de turismo.', verdad: { pasa: true, miente: false, peligro: 0, accion: 'aprobar' }, porque: '-', dificultad: 'facil',
  },
  {
    id: 'v02', nombre: 'Bruno Lenk', semilla: 2,
    documento: { nombre: 'Bruno Lenk', nacionalidad: 'Kolechia', vence: '10/05/1985', permiso: 'trabajo', permisoNombre: 'Bruno Lenk', equipajeDeclarado: 'Herramientas', inspeccion: 'Tabaco sin declarar.' },
    dice: 'Solo herramientas.', verdad: { pasa: false, miente: true, peligro: 3, accion: 'arrestar' }, porque: '-', dificultad: 'media',
  },
  {
    id: 'v03', nombre: 'Elsa Marin', semilla: 3,
    documento: { nombre: 'Elsa Marin', nacionalidad: 'Valdoria', vence: '20/01/1984', permiso: null, equipajeDeclarado: 'Medicinas', inspeccion: 'Medicinas.' },
    dice: 'Quiero volver a casa.', verdad: { pasa: false, miente: false, peligro: 0, accion: 'rechazar' }, porque: '-', dificultad: 'media',
  },
  {
    id: 'v04', nombre: 'Iris Novak', semilla: 4,
    documento: { nombre: 'Iris Novak', nacionalidad: 'Impor', vence: '01/01/1987', permiso: 'estudios', permisoNombre: 'Iris Novak', equipajeDeclarado: 'Libros', inspeccion: 'Libros.' },
    dice: 'Vengo a trabajar.', verdad: { pasa: false, miente: true, peligro: 1, accion: 'interrogar' }, porque: '-', dificultad: 'dificil',
  },
]
const verdadDe = (texto) => VIAJEROS.find((v) => texto.includes(`Nombre en el pasaporte: ${v.nombre}`))

describe('bench/run.mjs de punta a punta', () => {
  let servidor
  let base
  let dir
  let rutaViajeros
  const llamadas = { jev: 0, opus: 0, chat: 0, responses: 0 }
  const vistos529 = new Set()

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'frontera-run-'))
    rutaViajeros = join(dir, 'viajeros.json')
    writeFileSync(rutaViajeros, JSON.stringify({ version: 1, viajeros: VIAJEROS }))
    servidor = createServer((req, res) => {
      let datos = ''
      req.on('data', (c) => (datos += c))
      req.on('end', () => {
        const cuerpo = JSON.parse(datos)
        const responder = (status, json) => {
          res.writeHead(status, { 'content-type': 'application/json' })
          res.end(JSON.stringify(json))
        }
        if (req.url === '/v1/systemone') {
          llamadas.jev++
          const v = verdadDe(cuerpo.state)
          return responder(200, {
            model: 'jev-2026-10-01',
            answers: Object.fromEntries(Object.entries(v.verdad).map(([k, x]) => [k, { value: x, probability: 0.9 }])),
            usage: { input_tokens: 500 },
          })
        }
        if (req.url.startsWith('/v1/messages')) {
          llamadas.opus++
          const v = verdadDe(cuerpo.messages[0].content)
          // v01: la primera vez (en la prueba de la corrida completa) responde 529 (sobrecarga).
          if (v.id === 'v01' && !vistos529.has(v.id)) {
            vistos529.add(v.id)
            return responder(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })
          }
          const fallback = v.id === 'v03'
          return responder(200, {
            id: 'msg', type: 'message', role: 'assistant', model: fallback ? 'claude-sustituto' : 'claude-opus-5-5',
            content: [{ type: 'text', text: JSON.stringify(v.verdad) }], stop_reason: 'end_turn', stop_details: null,
            usage: { input_tokens: 900, output_tokens: 200, iterations: fallback ? [{ type: 'message' }, { type: 'fallback_message' }] : null },
          })
        }
        if (req.url === '/oa/v1/chat/completions') {
          llamadas.chat++
          return responder(400, { error: { message: 'This model is only supported in v1/responses and not in v1/chat/completions.', param: 'model' } })
        }
        if (req.url === '/oa/v1/responses') {
          llamadas.responses++
          const v = verdadDe(cuerpo.input)
          // GPT se equivoca con v04 (elige rechazar).
          const d = v.id === 'v04' ? { ...v.verdad, accion: 'rechazar' } : v.verdad
          return responder(200, {
            model: 'gpt-astra-2026-09-03', status: 'completed',
            output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(d) }] }],
            usage: { input_tokens: 800, output_tokens: 300, output_tokens_details: { reasoning_tokens: 270 } },
          })
        }
        responder(404, { error: { message: `ruta desconocida ${req.url}` } })
      })
    })
    await new Promise((r) => servidor.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${servidor.address().port}`
  })
  after(() => {
    servidor.close()
    rmSync(dir, { recursive: true, force: true })
  })

  // Ejecuta run.mjs en otro proceso con un entorno controlado.
  function correr(args, { claves = true, carpeta, extraEnv = {} } = {}) {
    const env = { ...process.env }
    for (const k of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'TYPESAFE_API_KEY', 'OPENAI_MODEL', 'TYPESAFE_MODEL', 'OPENAI_API_STYLE']) delete env[k]
    Object.assign(env, {
      FRONTERA_RUNS_DIR: carpeta,
      FRONTERA_VIAJEROS: rutaViajeros,
      FRONTERA_ENV_FILE: join(dir, 'no-existe.env'),
      FRONTERA_ESPERA_BASE_MS: '5',
      TYPESAFE_BASE_URL: base,
      ANTHROPIC_BASE_URL: base,
      OPENAI_BASE_URL: `${base}/oa/v1`,
      ...(claves ? { OPENAI_API_KEY: 'sk-falsa', ANTHROPIC_API_KEY: 'sk-ant-falsa', TYPESAFE_API_KEY: 'ts-falsa' } : {}),
      ...extraEnv,
    })
    return new Promise((resolve) => {
      execFile(process.execPath, [RUN, ...args], { env, timeout: 60_000 }, (error, stdout, stderr) => {
        resolve({ codigo: error ? error.code : 0, stdout, stderr })
      })
    })
  }
  const nuevaCarpeta = (nombre) => {
    const c = join(dir, nombre)
    rmSync(c, { recursive: true, force: true })
    return c
  }
  const leer = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'))

  test('sin claves: explica qué falta, cómo configurarlo y qué dominios permitir', async () => {
    const r = await correr([], { claves: false, carpeta: nuevaCarpeta('sin-claves') })
    assert.equal(r.codigo, 1)
    for (const texto of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'TYPESAFE_API_KEY', 'NUNCA', 'api.openai.com', 'api.anthropic.com', 'api.typesafe.ai']) {
      assert.ok(r.stderr.includes(texto), `falta "${texto}" en el mensaje:\n${r.stderr}`)
    }
  })

  test('solo falta la clave de un proveedor que no se pidió: no se queja', async () => {
    const carpeta = nuevaCarpeta('solo-jev-sin-otras')
    const r = await correr(['--proveedores', 'jev', '--limit', '1'], { claves: false, carpeta, extraEnv: { TYPESAFE_API_KEY: 'ts-falsa' } })
    assert.equal(r.codigo, 0, r.stderr)
  })

  test('opciones inválidas', async () => {
    const r = await correr(['--proveedores', 'gpt,llama'], { carpeta: nuevaCarpeta('malas') })
    assert.equal(r.codigo, 1)
    assert.match(r.stderr, /Proveedores no válidos: llama/)
  })

  test('--proveedores jev --limit 3: corrida parcial válida y latest.json intacto', async () => {
    const carpeta = nuevaCarpeta('jev')
    const r0 = await correr(['--proveedores', 'jev', '--limit', '1'], { carpeta }) // crea la carpeta
    assert.equal(r0.codigo, 0, r0.stderr)
    const latest = join(carpeta, 'latest.json')
    writeFileSync(latest, '{"centinela": true}\n')
    const antes = statSync(latest).mtimeMs
    for (const f of readdirSync(carpeta)) if (f !== 'latest.json') rmSync(join(carpeta, f))

    const r = await correr(['--proveedores', 'jev', '--limit', '3'], { carpeta })
    assert.equal(r.codigo, 0, r.stderr)
    assert.match(r.stdout, /No se tocó latest\.json/)
    assert.equal(readFileSync(latest, 'utf8'), '{"centinela": true}\n')
    assert.equal(statSync(latest).mtimeMs, antes)
    const archivos = readdirSync(carpeta).filter((f) => f.startsWith('prueba-'))
    assert.equal(archivos.length, 1)
    const run = leer(join(carpeta, archivos[0]))
    assert.deepEqual(problemasCorrida(run, VIAJEROS), [])
    assert.equal(run.source, 'live')
    assert.deepEqual(run.viajeros, ['v01', 'v02', 'v03'])
    assert.deepEqual(run.proveedores.map((p) => p.id), ['jev'])
    assert.equal(run.resultados.jev.length, 3)
    for (const res of run.resultados.jev) {
      assert.equal(res.ok, true)
      assert.equal(res.tokens.entrada, 500)
      assert.equal(res.costoUSD, (500 * 0.042) / 1e6)
      assert.equal(res.modeloServido, 'jev-2026-10-01')
      assert.deepEqual(res.confianza, { pasa: 0.9, miente: 0.9, peligro: 0.9, accion: 0.9 })
    }
    assert.match(r.stdout, /RESUMEN/)
    assert.match(r.stdout, /Aciertos \(acción\)\s+100 %/)
  })

  test('corrida completa con los 3 proveedores: reintentos, fallback, cambio a responses y latest.json', async () => {
    const carpeta = nuevaCarpeta('completa')
    const r = await correr(['--concurrencia', '3'], { carpeta })
    assert.equal(r.codigo, 0, r.stderr)
    const archivos = readdirSync(carpeta).filter((f) => /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/.test(f))
    assert.equal(archivos.length, 1, readdirSync(carpeta).join(', '))
    const run = leer(join(carpeta, archivos[0]))
    assert.deepEqual(problemasCorrida(run, VIAJEROS, { exigirCompleta: true }), [])
    assert.deepEqual(leer(join(carpeta, 'latest.json')), run)
    assert.match(r.stdout, /Copiada a .*latest\.json/)

    const opusV01 = run.resultados.opus.find((x) => x.viajeroId === 'v01')
    assert.equal(opusV01.ok, true)
    assert.equal(opusV01.intentos, 2, 'el 529 se reintentó')
    const opusV03 = run.resultados.opus.find((x) => x.viajeroId === 'v03')
    assert.equal(opusV03.fallback, true)
    assert.equal(opusV03.modeloServido, 'claude-sustituto')
    assert.match(r.stdout, /fallback/i)

    for (const res of run.resultados.gpt) {
      assert.deepEqual(res.opcionesUsadas, { estiloApi: 'responses', reasoningEffort: 'low' })
      assert.deepEqual(res.tokens, { entrada: 800, entradaCacheada: 0, salida: 300, razonamiento: 270, estimado: false })
      assert.equal(res.costoUSD, (800 * 10 + 300 * 50) / 1e6)
    }
    assert.equal(run.resultados.gpt.find((x) => x.viajeroId === 'v04').decision.accion, 'rechazar')
    assert.match(r.stdout, /Aciertos \(acción\)\s+75 % \(3\/4\)\s+100 % \(4\/4\)\s+100 % \(4\/4\)/)
    assert.match(r.stdout, /precio NO verificado/)
  })

  test('--continuar retoma una corrida parcial sin repetir lo hecho', async () => {
    const carpeta = nuevaCarpeta('continuar')
    const r1 = await correr(['--limit', '2'], { carpeta })
    assert.equal(r1.codigo, 0, r1.stderr)
    const archivo = readdirSync(carpeta).find((f) => f.startsWith('prueba-'))
    const antes = leer(join(carpeta, archivo))
    const jevAntes = llamadas.jev
    const r2 = await correr(['--continuar', join(carpeta, archivo)], { carpeta })
    assert.equal(r2.codigo, 0, r2.stderr)
    assert.equal(llamadas.jev - jevAntes, 2, 'solo se llama a los 2 viajeros que faltaban')
    const despues = leer(join(carpeta, archivo))
    assert.deepEqual(despues.viajeros, ['v01', 'v02', 'v03', 'v04'])
    assert.equal(despues.createdAt, antes.createdAt)
    assert.deepEqual(despues.resultados.jev[0], antes.resultados.jev[0], 'los resultados previos no cambian')
    assert.deepEqual(problemasCorrida(despues, VIAJEROS, { exigirCompleta: true }), [])
    assert.deepEqual(leer(join(carpeta, 'latest.json')), despues, 'completa: se publica en latest.json')
  })

  test('--probe: un viajero (v02), imprime petición y respuesta cruda, guarda probe-*.json', async () => {
    const carpeta = nuevaCarpeta('probe')
    const r = await correr(['--probe'], { carpeta })
    assert.equal(r.codigo, 0, r.stderr)
    for (const texto of ['Petición HTTP #1 (sin la clave)', 'Respuesta HTTP #1 cruda', 'Decisión interpretada', 'Tokens:', 'Costo:', '/v1/systemone']) {
      assert.ok(r.stdout.includes(texto), `falta "${texto}"`)
    }
    assert.ok(!r.stdout.includes('sk-falsa') && !r.stdout.includes('ts-falsa') && !r.stdout.includes('sk-ant-falsa'), 'las claves no se imprimen')
    const archivos = readdirSync(carpeta)
    assert.equal(archivos.length, 1)
    assert.match(archivos[0], /^probe-.*\.json$/)
    const run = leer(join(carpeta, archivos[0]))
    assert.deepEqual(run.viajeros, ['v02'])
    assert.equal(run.probe, true)
    assert.ok(run.trazas.jev.length >= 1)
    assert.ok(!JSON.stringify(run).includes('ts-falsa'), 'las claves no se guardan')
  })

  test('tiempo agotado: reintenta y termina en error registrado (costo 0)', async () => {
    const carpeta = nuevaCarpeta('timeout')
    // Servidor que nunca responde.
    const mudo = createServer(() => {})
    await new Promise((r) => mudo.listen(0, '127.0.0.1', r))
    const r = await correr(['--proveedores', 'jev', '--limit', '1'], {
      carpeta,
      extraEnv: { TYPESAFE_BASE_URL: `http://127.0.0.1:${mudo.address().port}`, FRONTERA_TIMEOUT_MS: '200' },
    })
    mudo.closeAllConnections()
    mudo.close()
    assert.equal(r.codigo, 0, r.stderr)
    const run = leer(join(carpeta, readdirSync(carpeta)[0]))
    const res = run.resultados.jev[0]
    assert.equal(res.ok, false)
    assert.equal(res.intentos, 4)
    assert.equal(res.costoUSD, 0)
    assert.equal(res.decision, null)
    assert.match(res.error, /Tiempo de espera agotado/)
    assert.deepEqual(problemasCorrida(run, VIAJEROS), [])
  })
})
