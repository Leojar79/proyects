// Pruebas del parser defensivo de Jev (TypeSafe). Ejecutar: node --test bench/
// El formato real de POST /v1/systemone no está confirmado: estas son formas plausibles.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { preguntasJev, textoEstado } from '../shared/preguntas.js'
import { ErrorProveedor } from './lib/errores.mjs'
import { estimarTokens } from './lib/datos.mjs'
import {
  aProbabilidad,
  costoInformado,
  decidir,
  escalaComun,
  interpretarRespuestaJev,
  normalizarNoul,
  normalizarScore,
  tokensJev,
} from './providers/typesafe.mjs'

const ARRESTAR = { pasa: false, miente: true, peligro: 3, accion: 'arrestar' }

// Ejecuta fn con TYPESAFE_SCORE_BASE definida (o borrada con null) y la restaura después.
function conBase(base, fn) {
  const previa = process.env.TYPESAFE_SCORE_BASE
  if (base === null) delete process.env.TYPESAFE_SCORE_BASE
  else process.env.TYPESAFE_SCORE_BASE = String(base)
  try {
    return fn()
  } finally {
    if (previa === undefined) delete process.env.TYPESAFE_SCORE_BASE
    else process.env.TYPESAFE_SCORE_BASE = previa
  }
}
// Las formas con peligro numérico se prueban con la escala 0-4 confirmada.
const base0 = (fn) => () => conBase(0, fn)

describe('Jev: formas de respuesta reconocidas', () => {
  test('1. body.answers con valores primitivos (peligro numérico con TYPESAFE_SCORE_BASE=0)', base0(() => {
    const r = interpretarRespuestaJev({ answers: { pasa: false, miente: true, peligro: 3, accion: 'arrestar' } })
    assert.deepEqual(r.decision, ARRESTAR)
    assert.equal(r.confianza, null)
    assert.equal(typeof r.salidaTexto, 'string')
  }))

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

  test('3. body.results como lista con "name", "answer" y "confidence"', base0(() => {
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
  }))

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

  test('5. body.decisions estilo clasificador: { question, label, score } (en el peligro, "score" no es probabilidad)', () => {
    const r = interpretarRespuestaJev({
      decisions: [
        { question: 'pasa', label: 'No', score: 0.97 },
        { question: 'miente', label: 'Yes', score: 0.66 },
        { question: 'peligro', label: 'ALTO', score: 0.58 },
        { question: 'accion', label: 'arrestar', score: 0.88 },
      ],
    })
    assert.deepEqual(r.decision, ARRESTAR)
    assert.deepEqual(r.confianza, { pasa: 0.97, miente: 0.66, peligro: null, accion: 0.88 })
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

  test('7. respuestas directamente en el cuerpo, con "sí"/"no" y peligro como texto numérico', base0(() => {
    const r = interpretarRespuestaJev({ pasa: 'sí', miente: 'no', peligro: '2', accion: 'interrogar', tokens_in: 420 })
    assert.deepEqual(r.decision, { pasa: true, miente: false, peligro: 2, accion: 'interrogar' })
    assert.equal(r.confianza, null)
  }))

  test('8. mapa de confianza al lado de las respuestas (body.confidence)', () => {
    const r = interpretarRespuestaJev({
      answers: { pasa: 0, miente: 1, peligro: 'moderado', accion: 'RECHAZAR' },
      confidence: { pasa: 0.9, miente: 0.8, peligro: 0.7, accion: 0.95 },
    })
    assert.deepEqual(r.decision, { pasa: false, miente: true, peligro: 2, accion: 'rechazar' })
    assert.deepEqual(r.confianza, { pasa: 0.9, miente: 0.8, peligro: 0.7, accion: 0.95 })
  })

  test('9. valor anidado: { result: { label, probability } } y "decision"', base0(() => {
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
  }))

  test('10. lista de opciones con probabilidad y opción desconocida ("unknown") que no gana', base0(() => {
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
  }))

  test('11. body.answers como lista con "key" y "value", peligro "3.0"', base0(() => {
    const r = interpretarRespuestaJev({
      answers: [
        { key: 'pasa', value: 'False' },
        { key: 'miente', value: 'True' },
        { key: 'peligro', value: '3.0' },
        { key: 'accion', value: 'arrestar' },
      ],
    })
    assert.deepEqual(r.decision, ARRESTAR)
  }))
})

// Casos del simulador de Jev de la auditoría: antes cambiaban la decisión de Jev sin avisar.
describe('Jev: escalas y coherencia (nunca se adivina)', () => {
  const resto = { pasa: { value: false }, miente: { value: true }, peligro: { value: 'Alto' } }

  test('distribución en porcentaje con un 1: una sola escala para toda la distribución', () => {
    const r = interpretarRespuestaJev({ answers: { ...resto, accion: { probabilities: { aprobar: 0, rechazar: 2, interrogar: 1, arrestar: 97 } } } })
    assert.equal(r.decision.accion, 'arrestar')
    assert.equal(r.confianza.accion, 0.97)
  })

  test('lista [{label, probability}] en porcentaje con un 1: elige "arrestar", no "aprobar"', () => {
    const r = interpretarRespuestaJev({
      answers: {
        ...resto,
        accion: [
          { label: 'aprobar', probability: 1 },
          { label: 'rechazar', probability: 2 },
          { label: 'interrogar', probability: 0 },
          { label: 'arrestar', probability: 97 },
        ],
      },
    })
    assert.equal(r.decision.accion, 'arrestar')
    assert.equal(r.confianza.accion, 0.97)
  })

  test('lista de 5 números en porcentaje para el peligro con un 1: elige el índice 3', () => {
    const r = interpretarRespuestaJev({ answers: { ...resto, peligro: [1, 3, 6, 80, 10], accion: 'arrestar' } })
    assert.equal(r.decision.peligro, 3)
    assert.equal(r.confianza.peligro, 0.8)
  })

  test('escalaComun: fracciones quedan igual, porcentajes se dividen todos, fuera de escala -> null', () => {
    assert.deepEqual(escalaComun([0.2, 0.8]), [0.2, 0.8])
    assert.deepEqual(escalaComun([1, 97, 2]), [0.01, 0.97, 0.02])
    assert.equal(escalaComun([5, 250]), null)
    assert.equal(escalaComun([0.5, null]), null)
  })

  test('confianzas sueltas de una misma respuesta comparten escala (1 junto a 90 es 1 %)', () => {
    assert.throws(
      () =>
        interpretarRespuestaJev({
          answers: {
            pasa: { value: false, confidence: 1 },
            miente: { value: true, confidence: 90 },
            peligro: { value: 'Alto', confidence: 80 },
            accion: { value: 'arrestar', confidence: 95 },
          },
        }),
      /pasa.*0\.01 < 0\.5/,
      'el 1 es 1 %: P(elegida) < 0.5 en una pregunta sí/no -> error, no "100 %"',
    )
  })

  test('empate en la opción más probable -> error', () => {
    assert.throws(
      () => interpretarRespuestaJev({ answers: { ...resto, accion: { probabilities: { arrestar: 0.5, interrogar: 0.5 } } } }),
      /empate/,
    )
  })

  test('valor que no es el más probable de su distribución -> error', () => {
    assert.throws(
      () => interpretarRespuestaJev({ answers: { ...resto, accion: { value: 'aprobar', probabilities: { aprobar: 0.1, arrestar: 0.9 } } } }),
      /no es el más probable/,
    )
  })

  test('sí/no con probabilidad < 0.5 para la respuesta elegida (¿P(sí)?) -> error', () => {
    assert.throws(
      () => interpretarRespuestaJev({ answers: { ...resto, pasa: { value: false, probability: 0.04 }, accion: 'arrestar' } }),
      /P\(sí\)/,
    )
    assert.throws(
      () => interpretarRespuestaJev({ answers: { pasa: false, miente: true, peligro: 'Alto', accion: 'arrestar' }, confidence: { pasa: 0.1 } }),
      /P\(sí\)/,
      'también con el mapa de confianza global',
    )
  })

  test('claves de valor contradictorias ({ label: "no", value: 1 }) -> error', () => {
    assert.throws(() => interpretarRespuestaJev({ answers: { ...resto, pasa: { label: 'no', value: 1 }, accion: 'arrestar' } }), /contradictorias/)
  })

  test('claves de valor que coinciden se aceptan', () => {
    const r = interpretarRespuestaJev({ answers: { ...resto, pasa: { label: 'no', value: false }, accion: 'arrestar' } })
    assert.equal(r.decision.pasa, false)
  })

  test('{ label: "Bajo", score: 1 }: el nivel es "Bajo" y "score" no se toma como confianza', () => {
    const r = interpretarRespuestaJev({ answers: { ...resto, peligro: { label: 'Bajo', score: 1 }, accion: 'arrestar' } })
    assert.equal(r.decision.peligro, 1)
    assert.equal(r.confianza, null)
  })
})

describe('Jev: peligro numérico solo con la escala confirmada (TYPESAFE_SCORE_BASE)', () => {
  const cuerpo = (peligro) => ({ answers: { pasa: false, miente: true, peligro, accion: 'arrestar' } })

  test('sin TYPESAFE_SCORE_BASE: un peligro numérico es un error claro', () => {
    conBase(null, () => {
      assert.throws(() => interpretarRespuestaJev(cuerpo(3)), (e) => /TYPESAFE_SCORE_BASE/.test(e.message) && e.codigo === 'configuracion')
      assert.throws(() => interpretarRespuestaJev(cuerpo('3')), /TYPESAFE_SCORE_BASE/)
      assert.throws(() => interpretarRespuestaJev({ answers: { pasa: false, miente: true, peligro: { score: 1 }, accion: 'arrestar' } }), /TYPESAFE_SCORE_BASE/)
      // Las etiquetas no necesitan escala.
      assert.equal(interpretarRespuestaJev(cuerpo('Extremo')).decision.peligro, 4)
    })
  })

  test('base 0: 0-4 tal cual; 5 es error', () => {
    conBase(0, () => {
      assert.equal(normalizarScore(0), 0)
      assert.equal(normalizarScore(4), 4)
      assert.throws(() => normalizarScore(5), /fuera de la escala 0-4/)
    })
  })

  test('base 1: 1-5 se corre a 0-4 (5 = Extremo); 0 es error', () => {
    conBase(1, () => {
      assert.equal(normalizarScore(1), 0)
      assert.equal(normalizarScore(5), 4)
      assert.equal(normalizarScore('4'), 3)
      assert.throws(() => normalizarScore(0), /fuera de la escala 1-5/)
    })
  })

  test('TYPESAFE_SCORE_BASE inválida -> error', () => {
    conBase(2, () => assert.throws(() => normalizarScore(3), /TYPESAFE_SCORE_BASE debe ser 0 o 1/))
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
      () => interpretarRespuestaJev({ answers: { pasa: true, miente: false, peligro: 'Inofensivo', accion: 'deportar' } }),
      /no reconocido: pregunta "accion".*deportar/,
    )
  })
  test('peligro fuera de rango o con decimales', base0(() => {
    assert.throws(() => interpretarRespuestaJev({ answers: { pasa: true, miente: false, peligro: 7, accion: 'aprobar' } }), /pregunta "peligro"/)
    assert.throws(() => interpretarRespuestaJev({ answers: { pasa: true, miente: false, peligro: 0.77, accion: 'aprobar' } }), /pregunta "peligro"/)
  }))
  test('sí/no como probabilidad suelta no se adivina', () => {
    assert.throws(() => interpretarRespuestaJev({ answers: { pasa: 0.87, miente: false, peligro: 'Inofensivo', accion: 'aprobar' } }), /pregunta "pasa"/)
  })
  test('la opción más probable es desconocida', () => {
    assert.throws(
      () => interpretarRespuestaJev({ answers: { pasa: { probabilities: { yes: 0.2, unknown: 0.8 } }, miente: false, peligro: 'Inofensivo', accion: 'aprobar' } }),
      /más probable no se reconoce/,
    )
  })
  test('el error de formato lleva el código "formato" (bloquea latest.json: es un fallo del parser)', () => {
    assert.throws(() => interpretarRespuestaJev({ foo: 1 }), (e) => e instanceof ErrorProveedor && e.codigo === 'formato')
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
  test('sin tokens: la entrada se estima (caracteres / 4 x 1,5) y la salida queda null (no se asume 0)', () => {
    const t = tokensJev({ answers: {} }, cuerpo)
    assert.equal(t.estimado, true)
    const caracteres = cuerpo.state.length + JSON.stringify(cuerpo.questions).length
    assert.equal(t.entrada, Math.ceil((caracteres / 4) * 1.5))
    assert.equal(t.entrada, estimarTokens(caracteres))
    assert.equal(t.salida, null)
  })
  test('entrada informada sin salida: salida null, no estimado', () => {
    assert.deepEqual(tokensJev({ usage: { input_tokens: 400 } }, cuerpo), { entrada: 400, entradaCacheada: 0, salida: null, razonamiento: null, estimado: false })
  })
  test('costo informado por la API', () => {
    assert.equal(costoInformado({ usage: { cost: 0.00002 } }), 0.00002)
    assert.equal(costoInformado({ billing: { cost_usd: 0.00003 } }), 0.00003)
    assert.equal(costoInformado({ cost: 0.00001 }), 0.00001)
    assert.equal(costoInformado({ answers: {} }), null)
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
  let cabecerasRespuesta = {}

  before(async () => {
    for (const k of ['TYPESAFE_BASE_URL', 'TYPESAFE_API_KEY', 'TYPESAFE_MODEL']) entornoPrevio[k] = process.env[k]
    servidor = createServer((req, res) => {
      let datos = ''
      req.on('data', (c) => (datos += c))
      req.on('end', () => {
        ultima = { metodo: req.method, url: req.url, cabeceras: req.headers, cuerpo: JSON.parse(datos) }
        res.writeHead(respuesta.status, { 'content-type': respuesta.tipo ?? 'application/json', ...cabecerasRespuesta })
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
    cabecerasRespuesta = { 'x-request-id': 'req_jev_1' }
    respuesta = {
      status: 200,
      cuerpo: JSON.stringify({ id: 'resp_jev_1', model: 'jev-2026-10', answers: { pasa: { value: 'no', probability: 0.9 }, miente: 'yes', peligro: 'Alto', accion: 'arrestar' }, usage: { input_tokens: 610, cost: 0.0000256 } }),
    }
    const r = await decidir(viajero, proveedor, {})
    cabecerasRespuesta = {}
    assert.equal(r.idRespuesta, 'resp_jev_1')
    assert.equal(r.requestId, 'req_jev_1')
    assert.equal(r.costoReportadoUSD, 0.0000256)
    assert.equal(r.tokens.salida, null, 'la API no informó la salida')
    assert.deepEqual(r.opcionesUsadas, {})
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

  test('formato no reconocido con tokens informados: el error lleva los tokens (se factura)', async () => {
    respuesta = { status: 200, cuerpo: JSON.stringify({ resultado: 'ok', usage: { input_tokens: 600, output_tokens: 0 } }) }
    await assert.rejects(decidir(viajero, proveedor, {}), (e) => e.codigo === 'formato' && e.tokens?.entrada === 600 && e.tokens.salida === 0)
  })

  test('HTTP 429 por cuota agotada -> NO reintentable', async () => {
    respuesta = { status: 429, cuerpo: JSON.stringify({ error: { message: 'sin saldo', code: 'insufficient_quota' } }) }
    await assert.rejects(decidir(viajero, proveedor, {}), (e) => e.status === 429 && !e.reintentable)
  })

  test('opciones declaradas que el adaptador no envía -> error de configuración', async () => {
    await assert.rejects(decidir(viajero, { ...proveedor, opciones: { temperatura: 0 } }, {}), (e) => e.codigo === 'configuracion' && /temperatura/.test(e.message))
  })
})
