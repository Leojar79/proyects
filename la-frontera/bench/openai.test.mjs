// Pruebas del adaptador de GPT (OpenAI) contra un servidor local que imita la API.

import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { esquemaJSON, promptSistemaLLM, textoEstado } from '../shared/preguntas.js'
import { ErrorProveedor } from './lib/errores.mjs'
import { decidir, olvidarConfiguracion, interpretarRespuesta } from './providers/openai.mjs'

const DECISION = { pasa: false, miente: true, peligro: 3, accion: 'arrestar' }
const viajero = {
  id: 'v02',
  nombre: 'Bruno Lenk',
  documento: { nombre: 'Bruno Lenk', nacionalidad: 'Kolechia', vence: '10/05/1985', permiso: 'trabajo', permisoNombre: 'Bruno Lenk', equipajeDeclarado: 'Herramientas', inspeccion: 'Tabaco sin declarar' },
  dice: 'Solo traigo herramientas.',
}
const proveedor = { id: 'gpt', modelo: 'gpt-astra', opciones: { reasoningEffort: 'low' } }
let cabecerasRespuesta = {}

const respuestaChat = (contenido = JSON.stringify(DECISION), extra = {}) => ({
  id: 'chatcmpl-1',
  model: 'gpt-astra-2026-09-03',
  choices: [{ index: 0, message: { role: 'assistant', content: contenido, refusal: null }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 700, completion_tokens: 180, prompt_tokens_details: { cached_tokens: 128 }, completion_tokens_details: { reasoning_tokens: 150 } },
  ...extra,
})
const respuestaResponses = () => ({
  id: 'resp_1',
  model: 'gpt-astra-2026-09-03',
  status: 'completed',
  output: [
    { type: 'reasoning', summary: [] },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(DECISION) }] },
  ],
  usage: { input_tokens: 690, input_tokens_details: { cached_tokens: 0 }, output_tokens: 210, output_tokens_details: { reasoning_tokens: 190 } },
})

describe('GPT: adaptador con fetch', () => {
  let servidor
  let peticiones = []
  let manejar = null
  const previo = {}

  before(async () => {
    for (const k of ['OPENAI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_API_STYLE']) previo[k] = process.env[k]
    servidor = createServer((req, res) => {
      let datos = ''
      req.on('data', (c) => (datos += c))
      req.on('end', () => {
        const p = { url: req.url, cabeceras: req.headers, cuerpo: JSON.parse(datos) }
        peticiones.push(p)
        const { status, cuerpo } = manejar(p)
        res.writeHead(status, { 'content-type': 'application/json', ...cabecerasRespuesta })
        res.end(JSON.stringify(cuerpo))
      })
    })
    await new Promise((r) => servidor.listen(0, '127.0.0.1', r))
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${servidor.address().port}/v1`
    process.env.OPENAI_API_KEY = 'sk-falsa'
    delete process.env.OPENAI_MODEL
    delete process.env.OPENAI_API_STYLE
  })
  after(() => {
    servidor.close()
    for (const [k, v] of Object.entries(previo)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })
  beforeEach(() => {
    peticiones = []
    cabecerasRespuesta = {}
    olvidarConfiguracion()
    delete process.env.OPENAI_API_STYLE
    delete process.env.OPENAI_MODEL
  })

  test('chat/completions: cuerpo exacto y tokens', async () => {
    manejar = () => ({ status: 200, cuerpo: respuestaChat() })
    cabecerasRespuesta = { 'x-request-id': 'req_abc' }
    const r = await decidir(viajero, proveedor, {})
    assert.equal(peticiones.length, 1)
    const p = peticiones[0]
    assert.equal(p.url, '/v1/chat/completions')
    assert.equal(p.cabeceras.authorization, 'Bearer sk-falsa')
    assert.deepEqual(p.cuerpo, {
      model: 'gpt-astra',
      messages: [
        { role: 'system', content: promptSistemaLLM() },
        { role: 'user', content: textoEstado(viajero) },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'decision_frontera', strict: true, schema: esquemaJSON() } },
      reasoning_effort: 'low',
    })
    assert.deepEqual(r.decision, DECISION)
    assert.deepEqual(r.tokens, { entrada: 700, entradaCacheada: 128, salida: 180, razonamiento: 150, estimado: false })
    assert.equal(r.modeloServido, 'gpt-astra-2026-09-03')
    assert.equal(r.confianza, null)
    assert.equal(r.latenciaMs, undefined, 'sin reintento interno, la latencia la mide el runner')
    assert.deepEqual(r.opcionesUsadas, { reasoningEffort: 'low', estiloApi: 'chat' })
    assert.equal(r.idRespuesta, 'chatcmpl-1')
    assert.equal(r.requestId, 'req_abc')
  })

  test('el esquema JSON solo lleva tipos y valores (las instrucciones van en el prompt)', async () => {
    manejar = () => ({ status: 200, cuerpo: respuestaChat() })
    await decidir(viajero, proveedor, {})
    const esquema = peticiones[0].cuerpo.response_format.json_schema.schema
    assert.ok(!JSON.stringify(esquema).includes('description'))
    assert.deepEqual(esquema.properties.peligro, { type: 'integer', enum: [0, 1, 2, 3, 4] })
  })

  test('OPENAI_MODEL y estilo responses', async () => {
    process.env.OPENAI_MODEL = 'gpt-astra-mini'
    process.env.OPENAI_API_STYLE = 'responses'
    manejar = () => ({ status: 200, cuerpo: respuestaResponses() })
    const r = await decidir(viajero, proveedor, {})
    const p = peticiones[0]
    assert.equal(p.url, '/v1/responses')
    assert.deepEqual(p.cuerpo, {
      model: 'gpt-astra-mini',
      instructions: promptSistemaLLM(),
      input: textoEstado(viajero),
      text: { format: { type: 'json_schema', name: 'decision_frontera', strict: true, schema: esquemaJSON() } },
      reasoning: { effort: 'low' },
    })
    assert.deepEqual(r.tokens, { entrada: 690, entradaCacheada: 0, salida: 210, razonamiento: 190, estimado: false })
    assert.deepEqual(r.opcionesUsadas, { reasoningEffort: 'low', estiloApi: 'responses' })
  })

  test('modelo no admitido en chat -> reintenta UNA vez con responses y lo recuerda', async () => {
    manejar = (p) =>
      p.url.endsWith('/chat/completions')
        ? { status: 400, cuerpo: { error: { message: 'This model is only supported in v1/responses and not in v1/chat/completions.', type: 'invalid_request_error', param: 'model', code: null } } }
        : { status: 200, cuerpo: respuestaResponses() }
    const r = await decidir(viajero, proveedor, {})
    assert.deepEqual(peticiones.map((p) => p.url), ['/v1/chat/completions', '/v1/responses'])
    assert.deepEqual(r.decision, DECISION)
    assert.equal(r.traza.length, 2)
    assert.ok(r.latenciaMs > 0, 'con reintento interno, la latencia es solo la de la petición exitosa')
    assert.deepEqual(r.opcionesUsadas, { estiloApi: 'responses', reasoningEffort: 'low' })
    peticiones = []
    await decidir(viajero, proveedor, {})
    assert.deepEqual(peticiones.map((p) => p.url), ['/v1/responses'], 'la segunda llamada va directo a responses')
  })

  test('reasoning_effort no admitido -> error claro, NO se quita el parámetro en silencio', async () => {
    manejar = (p) =>
      'reasoning_effort' in p.cuerpo
        ? { status: 400, cuerpo: { error: { message: "Unsupported parameter: 'reasoning_effort' is not supported with this model.", type: 'invalid_request_error', param: 'reasoning_effort', code: 'unsupported_parameter' } } }
        : { status: 200, cuerpo: respuestaChat() }
    await assert.rejects(decidir(viajero, proveedor, {}), (e) => {
      assert.ok(e instanceof ErrorProveedor)
      assert.equal(e.codigo, 'opcion_no_admitida')
      assert.equal(e.reintentable, false)
      assert.match(e.message, /no lo quito en silencio/)
      assert.match(e.message, /shared\/modelos\.js/)
      assert.deepEqual(e.opcionesUsadas, { reasoningEffort: 'low', estiloApi: 'chat' })
      return true
    })
    assert.equal(peticiones.length, 1, 'no hay un segundo intento sin el parámetro')
  })

  test('falta reasoningEffort o hay opciones que no se envían -> error de configuración (sin llamar)', async () => {
    manejar = () => ({ status: 200, cuerpo: respuestaChat() })
    await assert.rejects(decidir(viajero, { ...proveedor, opciones: {} }, {}), (e) => e.codigo === 'configuracion')
    await assert.rejects(decidir(viajero, { ...proveedor, opciones: { reasoningEffort: 'low', verbosity: 'low' } }, {}), (e) => e.codigo === 'configuracion' && /verbosity/.test(e.message))
    assert.equal(peticiones.length, 0)
  })

  test('sin usage.completion_tokens: la salida queda null (no 0)', async () => {
    manejar = () => ({ status: 200, cuerpo: respuestaChat(undefined, { usage: { prompt_tokens: 700 } }) })
    const r = await decidir(viajero, proveedor, {})
    assert.equal(r.tokens.salida, null)
    assert.equal(r.tokens.entrada, 700)
  })

  test('429 por cuota agotada (insufficient_quota) -> NO reintentable', async () => {
    manejar = () => ({ status: 429, cuerpo: { error: { message: 'You exceeded your current quota', type: 'insufficient_quota', code: 'insufficient_quota' } } })
    await assert.rejects(decidir(viajero, proveedor, {}), (e) => e.status === 429 && e.reintentable === false && e.codigo === 'cuota')
  })

  test('JSON inválido -> error con tokens facturados e id de respuesta', async () => {
    manejar = () => ({ status: 200, cuerpo: respuestaChat('{"pasa": tr') })
    await assert.rejects(decidir(viajero, proveedor, {}), (e) => e.codigo === 'json_invalido' && e.tokens?.salida === 180 && e.idRespuesta === 'chatcmpl-1')
  })

  test('negativa (refusal) -> error con tokens facturados', async () => {
    manejar = () => ({ status: 200, cuerpo: respuestaChat(null, { choices: [{ message: { content: null, refusal: 'No puedo ayudar con eso.' }, finish_reason: 'stop' }] }) })
    await assert.rejects(decidir(viajero, proveedor, {}), (e) => e instanceof ErrorProveedor && /se negó/.test(e.message) && e.tokens?.salida === 180 && !e.reintentable && e.codigo === 'negativa')
  })

  test('429 y 500 -> reintentables; 401 -> no', async () => {
    for (const [status, reintentable] of [[429, true], [500, true], [401, false]]) {
      manejar = () => ({ status, cuerpo: { error: { message: `error ${status}` } } })
      await assert.rejects(decidir(viajero, proveedor, {}), (e) => e.status === status && e.reintentable === reintentable && new RegExp(`HTTP ${status}`).test(e.message) && e.codigo === (status === 401 ? 'autenticacion' : 'http'))
    }
  })

  test('salida que no cumple el esquema -> error claro', () => {
    assert.throws(
      () => interpretarRespuesta('chat', respuestaChat(JSON.stringify({ pasa: 'no', miente: true, peligro: 9, accion: 'x' })), { cuerpo: {} }),
      /no cumple el esquema/,
    )
  })
})
