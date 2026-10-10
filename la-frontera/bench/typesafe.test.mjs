// Pruebas del parser defensivo de Jev (TypeSafe). Ejecutar: node --test bench/
// El formato real de POST /v1/systemone no está confirmado: estas son formas plausibles.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { preguntasJev, textoEstado } from '../shared/preguntas.js'
import { ErrorProveedor } from './lib/errores.mjs'
import { decidir, interpretarRespuestaJev, tokensJev, normalizarScore, normalizarNoul, aProbabilidad } from './providers/typesafe.mjs'

const ARRESTAR = { pasa: false, miente: true, peligro: 3, accion: 'arrestar' }

describe('Jev: formas de respuesta reconocidas', () => {
  test('1. body.answers con valores primitivos', () => {
    const r = interpretarRespuestaJev({ answers: { pasa: false, miente: true, peligro: 3, accion: 'arrestar' } })
    assert.deepEqual(r.decision, ARRESTAR)
    assert.equal(r.confianza, null)
    assert.equal(typeof r.salidaTexto, 'string')
  })

  test('2. body.answers con objetos { value, probability } y etiquetas en texto', () => {
    const r = interpretarRespuestaJev({
      answers: {
        pasa: { value: 'no', probability: 0.93 },
        miente: { value: 'yes', probability: 0.88 },
        peligro: { value: 'Alto', probability: 0.71 },
        accion: { value: 'Arrestar', probability: 0.9 },
      },
    })
    assert.deepEqual(r.decision, ARRESTAR)
    assert.deepEqual(r.confianza, { pasa: 0.93, miente: 0.88, peligro: 0.71, accion: 0.9 })
  })

  test('3. body.results como lista con "name", "answer" y "confidence"', () => {
    const r = interpretarRespuestaJev({
      results: [
        { name: 'accion', answer: 'arrestar', confidence: 0.81 },
        { name: 'pasa', answer: 'false', confidence: 0.95 },
        { name: 'peligro', answer: 3, confidence: 0.6 },
        { name: 'miente', answer: 'true', confidence: 0.77 },
      ],
    })
    assert.deepEqual(r.decision, ARRESTAR)
    assert.deepEqual(r.confianza, { pasa: 0.95, miente: 0.77, peligro: 0.6, accion: 0.81 })
  })

  test('4. body.outputs con distribuciones de probabilidad (se toma la máxima)', () => {
    const r = interpretarRespuestaJev({
      outputs: {
        pasa: { probabilities: { yes: 0.1, no: 0.9 } },
        miente: { probabilities: { true: 0.8, false: 0.2 } },
        peligro: { distribution: [0.01, 0.02, 0.07, 0.8, 0.1] },
        accion: { scores: { aprobar: 0.05, rechazar: 0.1, interrogar: 0.05, arrestar: 0.8 } },
      },
    })
    assert.deepEqual(r.decision, ARRESTAR)
    assert.deepEqual(r.confianza, { pasa: 0.9, miente: 0.8, peligro: 0.8, accion: 0.8 })
  })

  test('5. body.decisions estilo clasificador: { question, label, score }', () => {
    const r = interpretarRespuestaJev({
      decisions: [
        { question: 'pasa', label: 'No', score: 0.97 },
        { question: 'miente', label: 'Yes', score: 0.66 },
        { question: 'peligro', label: 'ALTO', score: 0.58 },
        { question: 'accion', label: 'arrestar', score: 0.88 },
      ],
    })
    assert.deepEqual(r.decision, ARRESTAR)
    assert.deepEqual(r.confianza, { pasa: 0.97, miente: 0.66, peligro: 0.58, accion: 0.88 })
  })

  test('6. body.data.answers anidado, "question_id", "selected" y confianza en porcentaje', () => {
    const r = interpretarRespuestaJev({
      data: {
        answers: [
          { question_id: 'pasa', selected: 'Sí', confidence: 93 },
          { question_id: 'miente', selected: 'no', confidence: 80 },
          { question_id: 'peligro', selected: 'Inofensivo', confidence: 99 },
          { question_id: 'accion', selected: ' Aprobar ', confidence: 91.5 },
        ],
      },
    })
    assert.deepEqual(r.decision, { pasa: true, miente: false, peligro: 0, accion: 'aprobar' })
    assert.deepEqual(r.confianza, { pasa: 0.93, miente: 0.8, peligro: 0.99, accion: 0.915 })
  })

  test('7. respuestas directamente en el cuerpo, con "sí"/"no" y peligro como texto numérico', () => {
    const r = interpretarRespuestaJev({ pasa: 'sí', miente: 'no', peligro: '2', accion: 'interrogar', tokens_in: 420 })
    assert.deepEqual(r.decision, { pasa: true, miente: false, peligro: 2, accion: 'interrogar' })
    assert.equal(r.confianza, null)
  })

  test('8. mapa de confianza al lado de las respuestas (body.confidence)', () => {
    const r = interpretarRespuestaJev({
      answers: { pasa: 0, miente: 1, peligro: 'moderado', accion: 'RECHAZAR' },
      confidence: { pasa: 0.9, miente: 0.8, peligro: 0.7, accion: 0.95 },
    })
    assert.deepEqual(r.decision, { pasa: false, miente: true, peligro: 2, accion: 'rechazar' })
    assert.deepEqual(r.confianza, { pasa: 0.9, miente: 0.8, peligro: 0.7, accion: 0.95 })
  })

  test('9. valor anidado: { result: { label, probability } } y "decision"', () => {
    const r = interpretarRespuestaJev({
      answers: {
        pasa: { result: { label: false, probability: 0.7 } },
        miente: { decision: true },
        peligro: { score: 3, scores: { Inofensivo: 0.05, Bajo: 0.05, Moderado: 0.1, Alto: 0.6, Extremo: 0.2 } },
        accion: { output: 'arrestar', prob: '0.75' },
      },
    })
    assert.deepEqual(r.decision, ARRESTAR)
    assert.deepEqual(r.confianza, { pasa: 0.7, miente: null, peligro: 0.6, accion: 0.75 })
  })

  test('10. lista de opciones con probabilidad y opción desconocida ("unknown") que no gana', () => {
    const r = interpretarRespuestaJev({
      answers: {
        pasa: { probabilities: { yes: 0.2, no: 0.7, unknown: 0.1 } },
        miente: [
          { label: 'true', probability: 0.85 },
          { label: 'false', probability: 0.15 },
        ],
        peligro: { value: 4, probability: 0.51 },
        accion: { distribution: [{ label: 'arrestar', probability: 0.64 }, { label: 'interrogar', probability: 0.36 }] },
      },
    })
    assert.deepEqual(r.decision, { pasa: false, miente: true, peligro: 4, accion: 'arrestar' })
    assert.deepEqual(r.confianza, { pasa: 0.7, miente: 0.85, peligro: 0.51, accion: 0.64 })
  })

  test('11. body.answers como lista con "key" y "value", peligro "3.0"', () => {
    const r = interpretarRespuestaJev({
      answers: [
        { key: 'pasa', value: 'False' },
        { key: 'miente', value: 'True' },
        { key: 'peligro', value: '3.0' },
        { key: 'accion', value: 'arrestar' },
      ],
    })
    assert.deepEqual(r.decision, ARRESTAR)
  })
})

describe('Jev: respuestas que NO se reconocen (fallan con el JSON crudo)', () => {
  test('formato desconocido', () => {
    assert.throws(
      () => interpretarRespuestaJev({ foo: 'bar', resultado: 'ok' }),
      (e) => e instanceof ErrorProveedor && /Formato de respuesta de Jev no reconocido/.test(e.message) && /"foo":"bar"/.test(e.message),
    )
  })
  test('acción fuera de la lista', () => {
    assert.throws(
      () => interpretarRespuestaJev({ answers: { pasa: true, miente: false, peligro: 0, accion: 'deportar' } }),
      /no reconocido: pregunta "accion".*deportar/,
    )
  })
  test('peligro fuera de rango o con decimales', () => {
    assert.throws(() => interpretarRespuestaJev({ answers: { pasa: true, miente: false, peligro: 7, accion: 'aprobar' } }), /pregunta "peligro"/)
    assert.throws(() => interpretarRespuestaJev({ answers: { pasa: true, miente: false, peligro: 0.77, accion: 'aprobar' } }), /pregunta "peligro"/)
  })
  test('sí/no como probabilidad suelta no se adivina', () => {
    assert.throws(() => interpretarRespuestaJev({ answers: { pasa: 0.87, miente: false, peligro: 0, accion: 'aprobar' } }), /pregunta "pasa"/)
  })
  test('la opción más probable es desconocida', () => {
    assert.throws(
      () => interpretarRespuestaJev({ answers: { pasa: { probabilities: { yes: 0.2, unknown: 0.8 } }, miente: false, peligro: 0, accion: 'aprobar' } }),
      /más probable no se reconoce/,
    )
  })
  test('error explícito en el cuerpo', () => {
    assert.throws(() => interpretarRespuestaJev({ error: { message: 'cuota agotada' } }), /Jev devolvió un error: .*cuota agotada/)
  })
})

describe('Jev: normalización y tokens', () => {
  test('normalizadores', () => {
    assert.equal(normalizarNoul('SI'), true)
    assert.equal(normalizarNoul('verdadero'), true)
    assert.equal(normalizarNoul(0), false)
    assert.equal(normalizarScore('extremo'), 4)
    assert.equal(normalizarScore('Bajo'), 1)
    assert.equal(aProbabilidad(55), 0.55)
    assert.equal(aProbabilidad('0.4'), 0.4)
    assert.equal(aProbabilidad(250), null)
  })

  const viajero = {
    id: 'vX',
    nombre: 'Prueba',
    documento: { nombre: 'Prueba', nacionalidad: 'Valdoria', vence: '01/01/1990', permiso: null, equipajeDeclarado: 'Nada', inspeccion: 'Nada' },
    dice: 'Hola',
  }
  const cuerpo = { model: 'jev-latest', state: textoEstado(viajero), questions: preguntasJev() }

  test('tokens reportados en usage.input_tokens', () => {
    assert.deepEqual(tokensJev({ usage: { input_tokens: 512, output_tokens: 0 } }, cuerpo), {
      entrada: 512, entradaCacheada: 0, salida: 0, razonamiento: null, estimado: false,
    })
  })
  test('tokens en usage.tokens.input / prompt_tokens / tokens_in', () => {
    assert.equal(tokensJev({ usage: { tokens: { input: 300, output: 2 } } }, cuerpo).entrada, 300)
    assert.equal(tokensJev({ usage: { tokens: { input: 300, output: 2 } } }, cuerpo).salida, 2)
    assert.equal(tokensJev({ usage: { prompt_tokens: 301, completion_tokens: 0 } }, cuerpo).entrada, 301)
    assert.equal(tokensJev({ tokens_in: 302 }, cuerpo).entrada, 302)
    assert.equal(tokensJev({ usage: { tokens_in: 303 } }, cuerpo).estimado, false)
  })
  test('sin tokens: se estiman (caracteres / 4) y se marca estimado', () => {
    const t = tokensJev({ answers: {} }, cuerpo)
    assert.equal(t.estimado, true)
    assert.equal(t.entrada, Math.ceil((cuerpo.state.length + JSON.stringify(cuerpo.questions).length) / 4))
    assert.equal(t.salida, 0)
  })
})

describe('Jev: llamada HTTP contra un servidor local de prueba', () => {
  let servidor
  let ultima = null
  let respuesta = null
  const entornoPrevio = {}
  const viajero = {
    id: 'v02',
    nombre: 'Bruno Lenk',
    documento: { nombre: 'Bruno Lenk', nacionalidad: 'Kolechia', vence: '10/05/1985', permiso: 'trabajo', permisoNombre: 'Bruno Lenk', equipajeDeclarado: 'Herramientas', inspeccion: 'Tabaco sin declarar' },
    dice: 'Solo traigo herramientas.',
  }
  const proveedor = { id: 'jev', modelo: 'jev-latest', opciones: {} }

  before(async () => {
    for (const k of ['TYPESAFE_BASE_URL', 'TYPESAFE_API_KEY', 'TYPESAFE_MODEL']) entornoPrevio[k] = process.env[k]
    servidor = createServer((req, res) => {
      let datos = ''
      req.on('data', (c) => (datos += c))
      req.on('end', () => {
        ultima = { metodo: req.method, url: req.url, cabeceras: req.headers, cuerpo: JSON.parse(datos) }
        res.writeHead(respuesta.status, { 'content-type': respuesta.tipo ?? 'application/json' })
        res.end(respuesta.cuerpo)
      })
    })
    await new Promise((r) => servidor.listen(0, '127.0.0.1', r))
    process.env.TYPESAFE_BASE_URL = `http://127.0.0.1:${servidor.address().port}/`
    process.env.TYPESAFE_API_KEY = 'clave-falsa-de-prueba'
    delete process.env.TYPESAFE_MODEL
  })
  after(() => {
    servidor.close()
    for (const [k, v] of Object.entries(entornoPrevio)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  test('envía { model, state, questions } con Bearer y entiende la respuesta', async () => {
    respuesta = {
      status: 200,
      cuerpo: JSON.stringify({ model: 'jev-2026-10', answers: { pasa: { value: 'no', probability: 0.9 }, miente: 'yes', peligro: 'Alto', accion: 'arrestar' }, usage: { input_tokens: 610 } }),
    }
    const r = await decidir(viajero, proveedor, {})
    assert.equal(ultima.metodo, 'POST')
    assert.equal(ultima.url, '/v1/systemone')
    assert.equal(ultima.cabeceras.authorization, 'Bearer clave-falsa-de-prueba')
    assert.deepEqual(ultima.cuerpo, { model: 'jev-latest', state: textoEstado(viajero), questions: preguntasJev() })
    assert.deepEqual(r.decision, ARRESTAR)
    assert.deepEqual(r.confianza, { pasa: 0.9, miente: null, peligro: null, accion: null })
    assert.equal(r.tokens.entrada, 610)
    assert.equal(r.modeloServido, 'jev-2026-10')
    assert.equal(r.fallback, false)
    assert.equal(r.traza[0].peticion.cabeceras.Authorization, '(oculta)')
  })

  test('HTTP 503 -> error reintentable con status y extracto del cuerpo', async () => {
    respuesta = { status: 503, cuerpo: JSON.stringify({ error: { message: 'sobrecarga' } }) }
    await assert.rejects(decidir(viajero, proveedor, {}), (e) => e instanceof ErrorProveedor && e.reintentable && e.status === 503 && /HTTP 503.*sobrecarga/.test(e.message))
  })

  test('HTTP 401 -> error NO reintentable', async () => {
    respuesta = { status: 401, cuerpo: JSON.stringify({ error: 'clave inválida' }) }
    await assert.rejects(decidir(viajero, proveedor, {}), (e) => e instanceof ErrorProveedor && !e.reintentable && e.status === 401)
  })

  test('HTTP 200 que no es JSON -> formato no reconocido', async () => {
    respuesta = { status: 200, cuerpo: '<html>hola</html>', tipo: 'text/html' }
    await assert.rejects(decidir(viajero, proveedor, {}), /Formato de respuesta de Jev no reconocido: el cuerpo no es JSON.*<html>/)
  })
})
