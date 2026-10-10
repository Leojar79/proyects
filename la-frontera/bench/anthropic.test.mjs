// Pruebas del adaptador de Claude Opus 5.5: interpretación de respuestas y llamada real del SDK
// contra un servidor local (ANTHROPIC_BASE_URL).

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { esquemaJSON, promptSistemaLLM, textoEstado } from '../shared/preguntas.js'
import { ErrorProveedor } from './lib/errores.mjs'
import { construirParametros, crudoSinFirmas, decidir, interpretarMensaje, tokensDeUso } from './providers/anthropic.mjs'

const DECISION = { pasa: false, miente: true, peligro: 3, accion: 'arrestar' }
const viajero = {
  id: 'v02',
  nombre: 'Bruno Lenk',
  documento: { nombre: 'Bruno Lenk', nacionalidad: 'Kolechia', vence: '10/05/1985', permiso: 'trabajo', permisoNombre: 'Bruno Lenk', equipajeDeclarado: 'Herramientas', inspeccion: 'Tabaco sin declarar' },
  dice: 'Solo traigo herramientas.',
}
const proveedor = { id: 'opus', modelo: 'claude-opus-5-5', opciones: { effort: 'low' } }

const mensaje = (extra = {}) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: [
    { type: 'thinking', thinking: '', signature: 'x' },
    { type: 'text', text: JSON.stringify(DECISION) },
  ],
  stop_reason: 'end_turn',
  stop_details: null,
  usage: { input_tokens: 900, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 240, iterations: null },
  ...extra,
})

describe('Opus: interpretación', () => {
  test('respuesta normal', () => {
    const r = interpretarMensaje(mensaje())
    assert.deepEqual(r.decision, DECISION)
    assert.deepEqual(r.tokens, { entrada: 900, entradaCacheada: 0, salida: 240, razonamiento: null, estimado: false })
    assert.equal(r.fallback, false)
    assert.equal(r.modeloServido, 'claude-opus-5-5')
    assert.equal(r.confianza, null)
  })

  test('tokens: input_tokens no incluye cacheados; se suman', () => {
    assert.deepEqual(
      tokensDeUso({ input_tokens: 100, cache_read_input_tokens: 800, cache_creation_input_tokens: 50, output_tokens: 300, output_tokens_details: { thinking_tokens: 270 } }),
      { entrada: 950, entradaCacheada: 800, salida: 300, razonamiento: 270, estimado: false },
    )
  })

  test('no se piden respaldos: ni beta ni "fallbacks" en los parámetros', () => {
    const params = construirParametros(viajero, proveedor)
    assert.ok(!('betas' in params))
    assert.ok(!('fallbacks' in params))
    assert.deepEqual(params.output_config.effort, 'low')
  })

  test('si igual respondiera otro modelo (fallback), NO cuenta como respuesta de Opus', () => {
    assert.throws(
      () =>
        interpretarMensaje(
          mensaje({
            model: 'claude-sustituto',
            content: [
              { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-sustituto' }, trigger: { type: 'refusal', category: null } },
              { type: 'text', text: JSON.stringify(DECISION) },
            ],
            usage: { input_tokens: 900, output_tokens: 260, iterations: [{ type: 'message' }, { type: 'fallback_message' }] },
          }),
        ),
      (e) => e instanceof ErrorProveedor && e.codigo === 'fallback' && e.fallback === true && e.tokens.salida === 260,
    )
  })

  test('refusal -> error con stop_details y los tokens facturados (es conducta de Opus)', () => {
    assert.throws(
      () => interpretarMensaje(mensaje({ stop_reason: 'refusal', stop_details: { category: 'general_harms', explanation: 'motivo' }, content: [] })),
      (e) =>
        e instanceof ErrorProveedor &&
        /refusal/.test(e.message) &&
        /general_harms/.test(e.message) &&
        e.tokens.salida === 240 &&
        !e.reintentable &&
        e.codigo === 'negativa' &&
        e.idRespuesta === 'msg_1',
    )
  })

  test('crudo: las firmas de thinking se reemplazan por su largo (la respuesta no se pierde al recortar)', () => {
    const firma = 'x'.repeat(5000)
    const m = mensaje({ content: [{ type: 'thinking', thinking: '', signature: firma }, { type: 'text', text: JSON.stringify(DECISION) }] })
    const crudo = crudoSinFirmas(m)
    assert.ok(!crudo.includes(firma))
    assert.match(crudo, /firma omitida: 5000 caracteres/)
    assert.ok(crudo.length < 4000 && crudo.includes('arrestar'))
    assert.equal(interpretarMensaje(m).crudo, crudo)
  })

  test('tokens: sin output_tokens la salida queda null (no 0)', () => {
    assert.equal(tokensDeUso({ input_tokens: 10 }).salida, null)
  })

  test('max_tokens y JSON inválido -> error', () => {
    assert.throws(() => interpretarMensaje(mensaje({ stop_reason: 'max_tokens' })), /max_tokens/)
    assert.throws(
      () => interpretarMensaje(mensaje({ content: [{ type: 'text', text: 'no es json' }] })),
      (e) => /no es JSON válido/.test(e.message) && e.codigo === 'json_invalido' && e.tokens.salida === 240,
    )
  })
})

describe('Opus: llamada del SDK contra un servidor local', () => {
  let servidor
  let ultima
  let respuesta
  const previo = {}
  before(async () => {
    for (const k of ['ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY']) previo[k] = process.env[k]
    servidor = createServer((req, res) => {
      let datos = ''
      req.on('data', (c) => (datos += c))
      req.on('end', () => {
        ultima = { url: req.url, cabeceras: req.headers, cuerpo: JSON.parse(datos) }
        res.writeHead(respuesta.status, { 'content-type': 'application/json', 'request-id': 'req_ant_1', ...(respuesta.cabeceras ?? {}) })
        res.end(JSON.stringify(respuesta.cuerpo))
      })
    })
    await new Promise((r) => servidor.listen(0, '127.0.0.1', r))
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${servidor.address().port}`
    process.env.ANTHROPIC_API_KEY = 'sk-ant-falsa'
  })
  after(() => {
    servidor.close()
    for (const [k, v] of Object.entries(previo)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  test('petición exacta: sin beta ni fallbacks, effort low, salida estructurada, sin thinking', async () => {
    respuesta = { status: 200, cuerpo: mensaje() }
    const r = await decidir(viajero, proveedor, {})
    assert.equal(ultima.url, '/v1/messages')
    assert.equal(ultima.cabeceras['anthropic-beta'], undefined)
    assert.equal(ultima.cabeceras['x-api-key'], 'sk-ant-falsa')
    assert.deepEqual(ultima.cuerpo, {
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: esquemaJSON() } },
      system: promptSistemaLLM(),
      messages: [{ role: 'user', content: textoEstado(viajero) }],
    })
    assert.ok(!('thinking' in ultima.cuerpo))
    assert.deepEqual(r.decision, DECISION)
    assert.equal(r.traza[0].status, 200)
    assert.equal(r.traza[0].peticion.cabeceras['x-api-key'], '(oculta)')
    assert.deepEqual(r.opcionesUsadas, { effort: 'low' })
    assert.equal(r.idRespuesta, 'msg_1')
    assert.equal(r.requestId, 'req_ant_1')
  })

  test('negativa por la API: error no reintentable, con tokens, opciones e ids', async () => {
    respuesta = { status: 200, cuerpo: mensaje({ stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: null }, content: [], usage: { input_tokens: 900, output_tokens: 12 } }) }
    await assert.rejects(decidir(viajero, proveedor, {}), (e) => {
      assert.equal(e.codigo, 'negativa')
      assert.equal(e.reintentable, false)
      assert.deepEqual(e.tokens, { entrada: 900, entradaCacheada: 0, salida: 12, razonamiento: null, estimado: false })
      assert.deepEqual(e.opcionesUsadas, { effort: 'low' })
      assert.equal(e.requestId, 'req_ant_1')
      return true
    })
  })

  test('429 y 529 -> reintentables (clases tipadas del SDK); 400 -> no', async () => {
    for (const [status, tipo, reintentable] of [[429, 'rate_limit_error', true], [529, 'overloaded_error', true], [400, 'invalid_request_error', false]]) {
      respuesta = { status, cuerpo: { type: 'error', error: { type: tipo, message: `mensaje ${status}` } }, cabeceras: status === 429 ? { 'retry-after': '3' } : {} }
      await assert.rejects(decidir(viajero, proveedor, {}), (e) => {
        assert.ok(e instanceof ErrorProveedor)
        assert.equal(e.status, status)
        assert.equal(e.reintentable, reintentable)
        assert.match(e.message, new RegExp(`HTTP ${status}.*mensaje ${status}`))
        if (status === 429) assert.equal(e.retryAfterMs, 3000)
        assert.equal(e.requestId, 'req_ant_1')
        assert.deepEqual(e.opcionesUsadas, { effort: 'low' })
        return true
      })
    }
  })
})
