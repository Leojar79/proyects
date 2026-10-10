// Pruebas del guion (node --test render/guion.test.mjs).
// Genera miles de corridas al azar a partir de la demo (otros costos, latencias, errores de API
// cobrados o no, resultados faltantes, decisiones, empates, tokens no informados, presupuesto,
// vidas, proveedores y cantidad de viajeros) y verifica que:
//  - ningún tramo pase de RITMO_MAXIMO palabras por segundo ni se cruce con otro;
//  - cada frase con un dato sea verdad según las estadísticas de esa corrida, y toda frase de
//    "gana / el más X / empate" coincida con estadisticas.ganadores (las coronas de la pantalla);
//  - el lema "Jev, para decidir" salga solo si estadisticas.jevRecomendable;
//  - la divulgación se diga siempre que exista, o que el guion falle si no cabe.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { JUEGO, PUBLICACION } from '../shared/config.js'
import { calcularEstadisticas } from '../shared/juego.js'
import { COLA_RAPIDO, ESCENAS, VIAJEROS_DETALLE } from '../shared/timeline.js'
import {
  contarPalabras,
  dineroVoz,
  FRASE_INSIGNIA,
  RITMO_MAXIMO,
  segmentosGuion,
  segundosVoz,
  validarSegmentos,
  vecesVoz,
} from '../shared/guion.js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const demo = JSON.parse(readFileSync(join(RAIZ, 'public/runs/demo.json'), 'utf8'))
const viajeros = JSON.parse(readFileSync(join(RAIZ, 'data/viajeros.json'), 'utf8')).viajeros
const porIdViajero = new Map(viajeros.map((v) => [v.id, v]))
const CORTOS = { gpt: 'GPT', opus: 'Opus', jev: 'Jev' }
const ID_DE_CORTO = Object.fromEntries(Object.entries(CORTOS).map(([id, c]) => [c, id]))
const ACCIONES = ['aprobar', 'rechazar', 'interrogar', 'arrestar']
const ESC = Object.fromEntries(ESCENAS.map((e) => [e.id, e]))

// Las pruebas no dependen de la divulgación que tenga config.js en este momento.
PUBLICACION.divulgacion = ''

function azar(semilla) {
  let s = semilla >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const elegir = (r, xs) => xs[Math.floor(r() * xs.length)]

// Decisión correcta del viajero, y una incorrecta que no es error grave.
const correcta = (id) => ({ ...porIdViajero.get(id).verdad })
function incorrectaLeve(id) {
  const v = porIdViajero.get(id).verdad
  const accion = v.accion === 'interrogar' ? 'rechazar' : 'interrogar'
  return { ...v, accion }
}

function corridaAlAzar(semilla) {
  const r = azar(semilla)
  const run = structuredClone(demo)
  const subconjuntos = [['gpt', 'opus', 'jev'], ['gpt', 'opus', 'jev'], ['gpt', 'opus', 'jev'], ['gpt', 'opus', 'jev'], ['gpt', 'opus'], ['opus', 'jev'], ['gpt', 'jev'], ['jev']]
  const ids = elegir(r, subconjuntos)
  run.proveedores = run.proveedores.filter((p) => ids.includes(p.id))
  const N = r() < 0.6 ? 60 : 1 + Math.floor(r() * 60)
  run.viajeros = run.viajeros.slice(0, N)
  // A veces todos aciertan casi todo: así salen empates de aciertos (y el caso "GPT 60, Opus 60, Jev 57").
  const modoAciertos = elegir(r, ['azar', 'azar', 'perfecto', 'casi'])
  for (const id of ids) {
    const fCosto = elegir(r, [0.01, 0.2, 1, 1, 1, 3, 20])
    const fLat = elegir(r, [0.1, 0.5, 1, 1, 3, 10])
    const pFallo = elegir(r, [0, 0, 0, 0.05, 0.3, 1])
    const pFacturado = elegir(r, [0, 0.5, 1])
    const pFaltante = elegir(r, [0, 0, 0, 0, 0.1])
    const pCambio = elegir(r, [0, 0.05, 0.2, 0.6])
    const sinSalida = id === 'jev' ? r() < 0.3 : r() < 0.05
    const salidaPositiva = id === 'jev' && r() < 0.15
    const sinRazonamiento = id !== 'jev' && r() < 0.25
    const costoCero = r() < 0.04
    const errores = modoAciertos === 'casi' ? Math.floor(r() * 5) : 0
    let malas = 0
    run.resultados[id] = run.resultados[id]
      .slice(0, N)
      .filter(() => r() >= pFaltante)
      .map((x) => {
        const tokens = { ...x.tokens }
        if (sinSalida) tokens.salida = null
        if (salidaPositiva) tokens.salida = 3
        if (sinRazonamiento) tokens.razonamiento = 0
        const y = { ...x, tokens, costoUSD: costoCero ? 0 : x.costoUSD * fCosto, latenciaMs: Math.round(x.latenciaMs * fLat) }
        if (r() < pFallo) {
          return { ...y, ok: false, decision: null, error: 'falla simulada', costoUSD: 0, latenciaMs: null, costoFacturadoUSD: r() < pFacturado ? y.costoUSD * 0.5 : 0 }
        }
        if (modoAciertos === 'perfecto') y.decision = correcta(x.viajeroId)
        else if (modoAciertos === 'casi') {
          if (malas < errores && r() < 0.3) {
            y.decision = incorrectaLeve(x.viajeroId)
            malas++
          } else y.decision = correcta(x.viajeroId)
        } else if (r() < pCambio) y.decision = { ...y.decision, accion: elegir(r, ACCIONES) }
        return y
      })
  }
  const config = { presupuestoUSD: elegir(r, [0.001, 0.02, 0.05, 0.25, 0.25, 1, 5]), vidas: elegir(r, [1, 2, 3, 3, 5]) }
  if (r() < 0.7) run.juego = config
  else delete run.juego
  return { run, config }
}

// "GPT, Opus y Jev" -> ['gpt', 'opus', 'jev'] (null si algún nombre no es de un proveedor).
function idsDe(texto) {
  const nombres = texto.split(/, | y /).map((x) => x.trim())
  const ids = nombres.map((n) => ID_DE_CORTO[n])
  return ids.every(Boolean) ? ids : null
}
const mismos = (a, b) => assert.deepEqual([...a].sort(), [...b].sort())

// Cuenta qué familias de frases aparecieron (para que la prueba al azar no sea vacía).
const visto = new Map()
const marcar = (clave) => visto.set(clave, (visto.get(clave) ?? 0) + 1)

function verificarVerdades(est, segs) {
  const ps = est.proveedores
  const G = est.ganadores
  const porCorto = (nombre) => ps.find((p) => CORTOS[p.id] === nombre)
  const llms = ps.filter((p) => p.id !== 'jev')
  const jev = ps.find((p) => p.id === 'jev')

  validarSegmentos(segs)
  for (const s of segs) assert.ok(contarPalabras(s.texto).habladas / (s.fin - s.inicio) <= RITMO_MAXIMO + 1e-9, s.texto)

  // --- Gancho
  const g = segs[0].texto
  const n = est.sobrevivientes.length
  if (ps.some((p) => !(p.respondidas > 0))) assert.match(g, /¿Quién dura más\?/)
  else if (ps.length === 1) assert.match(g, n ? /\. Llegó al final/ : /No llegó al final/)
  else if (n === 0) assert.match(g, /Ninguna llegó al final/)
  else if (n === 1) assert.match(g, /Solo una llegó al final/)
  else if (n === ps.length) assert.match(g, /llegaron al final/)
  else assert.match(g, /Solo \S+ llegaron al final/)
  if (/cada una/.test(g)) assert.match(g, new RegExp(`, ${dineroVoz(est.presupuestoUSD)} cada una`))

  const todo = segs.map((s) => s.texto).join(' ')
  // Lema solo si los datos lo sostienen.
  if (/para decidir/.test(todo)) {
    assert.ok(est.jevRecomendable, 'lema sin jevRecomendable')
    marcar('lema')
  }
  // La frase de alcance (modelos insignia) solo con modelos de lenguaje, y una sola vez.
  const insignia = segs.filter((s) => s.texto.includes(FRASE_INSIGNIA) || /modelos insignia/.test(s.texto))
  if (insignia.length) {
    assert.ok(llms.length > 0)
    assert.equal(insignia.length, 1, 'frase de modelos insignia repetida')
    marcar('insignia')
  }

  for (const s of segs) {
    const t = s.texto
    let m
    // --- Presentación y detalle: razonamiento y "no escribe"
    if ((m = /^(.+?) (?:razonan|razona)(?: y escrib| antes de responder)/.exec(t))) {
      const ids = idsDe(m[1])
      assert.ok(ids, t)
      for (const id of ids) assert.ok(ps.find((p) => p.id === id).tokensRazonamientoProm > 0, `${t}: ${id} sin razonamiento medido`)
      if (/razonan y escrib|razona y escrib/.test(t)) assert.ok(llms.every((p) => p.tokensRazonamientoProm > 0), t)
      marcar('razonan')
    }
    if (/Jev, no\.|no escribe/i.test(t)) {
      assert.ok(jev && !(jev.tokensSalidaProm > 0), `${t}: Jev informó tokens de salida`)
      marcar('no escribe')
    }
    if (jev && !jev.salidaInformada) assert.doesNotMatch(s.enPantalla, /0 tokens de salida/, 'dice 0 tokens de salida sin que la API los informe')
    if ((m = /^(\S+) vidas?\. Gana/.exec(t))) assert.equal(m[1].toLowerCase(), ['ninguna', 'una', 'dos', 'tres', 'cuatro', 'cinco'][est.vidas] ?? String(est.vidas))

    // --- Avance rápido
    if ((m = /(\S+) se queda sin presupuesto/.exec(t))) {
      const p = porCorto(m[1])
      assert.equal(p.motivoFin, 'sin_fondos', t)
      if ((m = /, a (.+?) cada una/.exec(t))) {
        assert.equal(m[1], dineroVoz(p.gastadoFinal / p.decisionesEnJuego), `${t}: costo por decisión`)
        marcar('costo por decisión')
      }
    }
    if ((m = /(\S+) pierde su última vida/.exec(t))) assert.equal(porCorto(m[1]).motivoFin, 'sin_vidas', t)
    if ((m = /^(\S+) se queda sin presupuesto tras ([\d,]+) decisi|^(\S+) pierde su última vida tras ([\d,]+) decisi/.exec(t))) {
      const p = porCorto(m[1] ?? m[3])
      assert.equal(p.decisionesEnJuego, Number((m[2] ?? m[4]).replace(/,/g, '')), t)
    }
    if ((m = /Solo queda (\S+?)\./.exec(t))) {
      const p = porCorto(m[1])
      for (const q of ps) if (q !== p) assert.notEqual(q.finIndice, null, `${t}: ${q.id} sigue en juego`)
    }
    if (/Ya no queda nadie/.test(t)) for (const q of ps) assert.notEqual(q.finIndice, null, t)
    if ((m = /^(?:En promedio, )?(\S+) responde en (.+?); (\S+) tarda (.+?)\.$/.exec(t))) {
      const a = porCorto(m[1])
      const b = porCorto(m[3])
      assert.equal(m[2], segundosVoz(a.latenciaPromedioMs), t)
      assert.equal(m[4], segundosVoz(b.latenciaPromedioMs), t)
      assert.ok(a.latenciaPromedioMs <= b.latenciaPromedioMs, t)
    }
    if ((m = /^A (\S+), cada decisión le (?:cuesta|costaba) (.+?)(?: en promedio)?\.$/.exec(t))) {
      assert.equal(m[2], dineroVoz(porCorto(m[1]).costoPromedioUSD), t)
    }

    // --- Resultados: todo "gana / el más X / empate" sale de est.ganadores
    if (s.escena === 'resultados') {
      if ((m = /(\S+) duró más(?: que nadie)?\./.exec(t))) {
        const p = porCorto(m[1])
        mismos(G.duracion, [p.id])
        assert.equal(p.llegoAlFinal, false)
      }
      if ((m = /Solo (\S+) llegó al final/.exec(t))) mismos(est.sobrevivientes.map((x) => x.id), [porCorto(m[1]).id])
      if ((m = /^(?:.*\. )?(\S+) llegó al final\./.exec(t)) && porCorto(m[1])) assert.ok(porCorto(m[1]).llegoAlFinal, t)
      if ((m = /(\S+) no llegó al final/.exec(t))) assert.equal(porCorto(m[1]).llegoAlFinal, false, t)
      if (/Las \S+ llegaron al final|Todas llegaron/.test(t)) assert.ok(ps.every((p) => p.llegoAlFinal), t)
      if ((m = /^(?:.*\. )?(?:Llegaron (.+?)\.|(\S.+?) llegaron al final\.)/.exec(t)) && !/^Las /.test(m[2] ?? '')) {
        mismos(est.sobrevivientes.map((x) => x.id), idsDe(m[1] ?? m[2]))
      }
      if (/Las \S+ duraron lo mismo|Empate en duración\./.test(t)) assert.equal(G.duracion.length, ps.length, t)
      if ((m = /Empate en duración: (.+?)\.|Empatan ((?:GPT|Opus|Jev).*?)\./.exec(t))) mismos(G.duracion, idsDe(m[1] ?? m[2]))
      if ((m = /^(.+?) no (?:respondió|respondieron) ninguna/.exec(t))) for (const id of idsDe(m[1])) assert.equal(ps.find((p) => p.id === id).respondidas, 0, t)

      if ((m = /^(?:Por cada mil|Mil) decisiones: (\S+), (.+?); (\S+), (.+?)\.$/.exec(t))) {
        assert.equal(m[2], dineroVoz(porCorto(m[1]).costoPor1000USD), t)
        assert.equal(m[4], dineroVoz(porCorto(m[3]).costoPor1000USD), t)
      }
      if ((m = /^Mil decisiones de (\S+): (.+?)\.$/.exec(t))) assert.equal(m[2], dineroVoz(porCorto(m[1]).costoPor1000USD), t)
      if ((m = /(\S+), el más barato/.exec(t))) {
        mismos(G.costo, [porCorto(m[1]).id])
        assert.ok(ps.filter((p) => p.respondidas > 0).every((p) => p.costoPromedioUSD > 0), `${t}: hay un costo 0`)
        marcar('el más barato')
      }
      if ((m = /Empatan en costo: (.+?)\./.exec(t))) mismos(G.costo, idsDe(m[1]))
      if (/Empate en costo\./.test(t)) assert.equal(G.costo.length, ps.length, t)

      if ((m = /(\S+), el más rápido/.exec(t))) mismos(G.velocidad, [porCorto(m[1]).id])
      if ((m = /^(.+?), los más rápidos/.exec(t))) mismos(G.velocidad, idsDe(m[1].replace(/^.*\. /, '')))
      if (/Empate en velocidad/.test(t)) assert.equal(G.velocidad.length, ps.length, t)
      if ((m = /(\S+) gana en velocidad y en aciertos|Velocidad y aciertos: (\S+?)\./.exec(t))) {
        const id = porCorto(m[1] ?? m[2]).id
        mismos(G.velocidad, [id])
        mismos(G.aciertos, [id])
      }
      // Hallazgo 1: "empate" a secas solo si empatan TODAS.
      if (/Aciertos: empate|En aciertos, empate/.test(t)) {
        assert.equal(G.aciertos.length, ps.length, `${t}: no empatan todas`)
        assert.ok(ps.length > 1)
        marcar('empate de todas')
      }
      if ((m = /En aciertos, gana (\S+?)\./.exec(t))) {
        mismos(G.aciertos, [porCorto(m[1]).id])
        marcar('gana en aciertos')
      }
      if ((m = /(?:En aciertos, empatan|Aciertos:) ((?:GPT|Opus|Jev)(?:(?:, | y )(?:GPT|Opus|Jev))*)\./.exec(t))) {
        mismos(G.aciertos, idsDe(m[1]))
        if (/ y /.test(m[1])) marcar(G.aciertos.length < ps.length ? 'empate parcial' : 'empate nombrado')
      }
      if ((m = /Aciertos: ([\d,]+) de ([\d,]+)\./.exec(t))) {
        assert.equal(ps.length, 1)
        assert.equal(ps[0].aciertosAccion, Number(m[1].replace(/,/g, '')))
      }
      if ((m = /(?:^|, )(GPT|Opus|Jev):? (?:sale )?(.+?) más barato que (\S+?)(?:, y (.+?) que (\S+?))?\.$/.exec(t))) {
        const quien = porCorto(m[1])
        assert.equal(quien?.id, 'jev', t)
        const a = porCorto(m[3])
        assert.ok(est.factoresJev[a.id] >= 1.05, t)
        assert.equal(m[2], vecesVoz(est.factoresJev[a.id]), t)
        if (m[4]) assert.equal(`${m[4]} veces`, vecesVoz(est.factoresJev[porCorto(m[5]).id]), t)
        marcar('factor')
      }
    }

    // --- Cierre
    if (s.escena === 'cierre') {
      if ((m = /^(?:Si cada acierto cuenta, (.+?)(?:; si manda el costo, (.+?))?|Para acertar, (.+?)(?:; para ahorrar, (.+?))?|Aciertos: (.+?)\. Costo: (.+?))\.$/.exec(t))) {
        assert.equal(est.jevRecomendable && Boolean(jev), false, t)
        mismos(G.aciertos, idsDe(m[1] ?? m[3] ?? m[5]))
        const costo = m[2] ?? m[4] ?? m[6]
        if (costo) mismos(G.costo, idsDe(costo))
        marcar('conclusión neutra')
      }
      if ((m = /^(.+?): (?:el que más acierta y el más barato|los que más aciertan y los más baratos)\.$|^Aciertos y costo: (.+?)\.$/.exec(t))) {
        mismos(G.aciertos, idsDe(m[1] ?? m[2]))
        mismos(G.costo, idsDe(m[1] ?? m[2]))
      }
    }
  }

  // Divulgación: siempre en la voz si está configurada.
  const div = String(PUBLICACION.divulgacion ?? '').trim().replace(/[.\s]+$/, '')
  if (div) assert.ok(segs.at(-1).texto.startsWith(`${div}.`), 'falta la divulgación en la voz')
}

test('palabras: los números cuentan como se leen', () => {
  assert.equal(contarPalabras('Jev duró 54 decisiones.').habladas, 6) // cincuenta y cuatro
  assert.equal(contarPalabras('unas 770 veces').habladas, 4) // setecientas setenta
  assert.equal(contarPalabras('a 1.6 centavos').habladas, 5) // uno punto seis
  assert.equal(contarPalabras('¿Pasa? ¿Miente?').escritas, 2)
  assert.equal(contarPalabras('1,234').habladas, 5) // mil doscientos treinta y cuatro
})

test('números para la voz', () => {
  assert.equal(dineroVoz(0.25), '25 centavos')
  assert.equal(dineroVoz(17.15), '17 dólares')
  assert.equal(dineroVoz(0.0223839), '2 centavos')
  assert.equal(dineroVoz(0.00715), 'menos de un centavo')
  assert.equal(dineroVoz(0.016), '1.6 centavos')
  assert.equal(dineroVoz(1), '1 dólar')
  assert.equal(segundosVoz(360), 'menos de medio segundo')
  // La pantalla muestra un decimal: si la voz redondea, dice hacia dónde.
  assert.equal(segundosVoz(2860), 'casi 3 segundos')
  assert.equal(segundosVoz(4600), 'casi 5 segundos')
  assert.equal(segundosVoz(5300), 'más de 5 segundos')
  assert.equal(segundosVoz(3020), '3 segundos')
  assert.equal(segundosVoz(2320), '2.3 segundos')
  assert.equal(vecesVoz(766.2), 'unas 770 veces')
  assert.equal(vecesVoz(2.4), '2.4 veces')
})

test('demo: tramos dentro de las escenas, ritmo y frases verdaderas', () => {
  const est = calcularEstadisticas(demo, viajeros, JUEGO)
  const segs = segmentosGuion(est)
  assert.ok(segs.length >= 15)
  for (const s of segs) {
    const e = ESCENAS.find((x) => x.id === s.escena)
    assert.ok(s.inicio >= e.inicio - 1e-9 && s.fin <= e.fin + 1e-9, `${s.inicio}-${s.fin} fuera de ${e.id}`)
    assert.ok(contarPalabras(s.texto).habladas / (s.fin - s.inicio) <= RITMO_MAXIMO + 1e-9)
    assert.ok(s.enPantalla && s.enPantalla.length > 10)
  }
  verificarVerdades(est, segs)
  const todo = segs.map((s) => s.texto).join(' ')
  assert.match(todo, /misma información, mismas preguntas/)
  if (est.proveedores.some((p) => p.id !== 'jev' && p.tokensRazonamientoProm > 0)) assert.match(todo, /razonamiento también se paga/)
  assert.match(todo, /probabilidad/)
  assert.match(todo, /descripción|modelos insignia/)
  if (est.jevRecomendable) assert.match(todo, /para crear\. Jev, para decidir/)
  else assert.doesNotMatch(todo, /para decidir/)
})

test('3000 corridas al azar: nunca se pasa del ritmo y no afirma nada falso', () => {
  for (let semilla = 1; semilla <= 3000; semilla++) {
    const { run, config } = corridaAlAzar(semilla)
    const est = calcularEstadisticas(run, viajeros, config)
    let segs
    try {
      segs = segmentosGuion(est)
    } catch (e) {
      e.message = `semilla ${semilla} (segmentosGuion): ${e.message}`
      throw e
    }
    assert.ok(segs.length > 5, `semilla ${semilla}`)
    try {
      verificarVerdades(est, segs)
    } catch (e) {
      e.message = `semilla ${semilla} (verdades): ${e.message}\n${segs.map((x) => `${x.inicio}-${x.fin} ${x.texto}`).join('\n')}`
      throw e
    }
  }
  // Que la prueba no sea vacía: cada familia de frases apareció al menos una vez.
  for (const clave of ['lema', 'conclusión neutra', 'empate de todas', 'empate parcial', 'gana en aciertos', 'factor', 'el más barato', 'costo por decisión', 'razonan', 'no escribe', 'insignia']) {
    assert.ok(visto.get(clave) > 0, `ninguna corrida al azar produjo la frase «${clave}»`)
  }
})

// Hallazgo 1 de la auditoría: GPT 60/60, Opus 60/60, Jev 57/60. La voz no puede decir "empate".
test('GPT y Opus empatan arriba y Jev queda abajo: se nombra a las que empatan', () => {
  const run = structuredClone(demo)
  for (const id of ['gpt', 'opus']) run.resultados[id] = run.resultados[id].map((x) => ({ ...x, ok: true, decision: correcta(x.viajeroId) }))
  let errores = 0
  run.resultados.jev = run.resultados.jev.map((x) => {
    if (errores < 3 && porIdViajero.get(x.viajeroId).verdad.accion === 'rechazar') {
      errores++
      return { ...x, ok: true, decision: incorrectaLeve(x.viajeroId) }
    }
    return { ...x, ok: true, decision: correcta(x.viajeroId) }
  })
  const est = calcularEstadisticas(run, viajeros, JUEGO)
  assert.deepEqual([...est.ganadores.aciertos].sort(), ['gpt', 'opus'])
  assert.equal(est.jevRecomendable, false)
  const segs = segmentosGuion(est)
  verificarVerdades(est, segs)
  const todo = segs.map((s) => s.texto).join(' ')
  assert.doesNotMatch(todo, /Aciertos: empate|En aciertos, empate/)
  assert.match(todo, /(?:En aciertos, empatan|Aciertos:) GPT y Opus\./)
  assert.doesNotMatch(todo, /para decidir/)
})

// Si Jev empata en costo con otro (diferencia menor a 5 %), no tiene ventaja: no hay lema.
test('empate de las tres en aciertos y en costo: no hay lema "Jev, para decidir"', () => {
  const run = structuredClone(demo)
  for (const id of ['gpt', 'opus', 'jev']) {
    run.resultados[id] = run.resultados[id].map((x) => ({ ...x, ok: true, error: null, decision: correcta(x.viajeroId), costoUSD: 0.001 }))
  }
  const est = calcularEstadisticas(run, viajeros, JUEGO)
  assert.deepEqual([...est.ganadores.costo].sort(), ['gpt', 'jev', 'opus'])
  assert.deepEqual([...est.ganadores.aciertos].sort(), ['gpt', 'jev', 'opus'])
  assert.equal(est.jevRecomendable, false)
  const segs = segmentosGuion(est)
  verificarVerdades(est, segs)
  assert.doesNotMatch(segs.map((s) => s.texto).join(' '), /para decidir/)
})

test('sin razonamiento medido no se dice "razonan"; sin tokens de salida informados no se habla de 0 tokens', () => {
  const run = structuredClone(demo)
  for (const id of ['gpt', 'opus']) run.resultados[id] = run.resultados[id].map((x) => ({ ...x, tokens: { ...x.tokens, razonamiento: 0 } }))
  run.resultados.jev = run.resultados.jev.map((x) => ({ ...x, tokens: { ...x.tokens, salida: null } }))
  const est = calcularEstadisticas(run, viajeros, JUEGO)
  const segs = segmentosGuion(est)
  verificarVerdades(est, segs)
  const todo = segs.map((s) => s.texto).join(' ')
  assert.doesNotMatch(todo, /razona/)
  assert.doesNotMatch(segs.map((s) => s.enPantalla).join(' '), /0 tokens de salida/)

  // Solo Opus razona: se nombra solo a Opus.
  const run2 = structuredClone(demo)
  run2.resultados.gpt = run2.resultados.gpt.map((x) => ({ ...x, tokens: { ...x.tokens, razonamiento: 0 } }))
  const segs2 = segmentosGuion(calcularEstadisticas(run2, viajeros, JUEGO))
  assert.match(segs2.map((s) => s.texto).join(' '), /Opus razona antes de responder/)
  assert.doesNotMatch(segs2.map((s) => s.texto).join(' '), /GPT y Opus razonan/)

  // Jev informa tokens de salida > 0: no se dice que no escribe.
  const run3 = structuredClone(demo)
  run3.resultados.jev = run3.resultados.jev.map((x) => ({ ...x, tokens: { ...x.tokens, salida: 5 } }))
  const segs3 = segmentosGuion(calcularEstadisticas(run3, viajeros, JUEGO))
  assert.doesNotMatch(segs3.map((s) => s.texto).join(' '), /Jev, no\.|no escribe/)
})

test('GAME OVER por presupuesto: el costo por decisión descuenta las llamadas con error', () => {
  const run = structuredClone(demo)
  // Errores cobrados antes de que GPT se quede sin presupuesto.
  run.resultados.gpt = run.resultados.gpt.map((x, i) =>
    i >= 3 && i < 7 ? { ...x, ok: false, decision: null, error: 'falla simulada', latenciaMs: null, costoUSD: 0, costoFacturadoUSD: x.costoUSD } : x,
  )
  const est = calcularEstadisticas(run, viajeros, JUEGO)
  const gpt = est.proveedores.find((p) => p.id === 'gpt')
  assert.equal(gpt.motivoFin, 'sin_fondos')
  const segs = segmentosGuion(est)
  verificarVerdades(est, segs)
  const s = segs.find((x) => /GPT se queda sin presupuesto/.test(x.texto))
  assert.ok(s)
  const m = /, a (.+?) cada una/.exec(s.texto)
  if (m) assert.equal(m[1], dineroVoz(gpt.gastadoFinal / gpt.decisionesEnJuego))
})

test('el último GAME OVER del avance rápido se comenta después de verse (con COLA_RAPIDO)', () => {
  for (let semilla = 1; semilla <= 400; semilla++) {
    const { run, config } = corridaAlAzar(semilla)
    const est = calcularEstadisticas(run, viajeros, config)
    const segs = segmentosGuion(est)
    const N = est.totalViajeros
    const rap = ESC.rapido
    const slot = (rap.fin - COLA_RAPIDO - rap.inicio) / Math.max(1, N - VIAJEROS_DETALLE)
    const momento = (p) =>
      p.motivoFin === 'sin_fondos'
        ? rap.inicio + (p.finIndice - VIAJEROS_DETALLE) * slot + 0.05
        : rap.inicio + (p.finIndice - 1 - VIAJEROS_DETALLE) * slot + 0.3 * slot + 0.02 + 0.2
    for (const p of est.proveedores) {
      if (p.finIndice === null || p.finIndice < VIAJEROS_DETALLE + 1) continue
      assert.ok(momento(p) < rap.fin - COLA_RAPIDO + 0.3, `semilla ${semilla}: GAME OVER de ${p.id} en ${momento(p)} cae en la cortina`)
    }
    // Quién protagoniza la primera oración de cada tramo del avance rápido que comenta un GAME OVER.
    for (const s of segs.filter((x) => x.escena === 'rapido')) {
      const m =
        /^((?:GPT|Opus|Jev)(?:(?:, | y )(?:GPT|Opus|Jev))*)(?: se queda| se quedan| pierde| pierden| quedan fuera|, sin)/.exec(s.texto) ??
        /^Fuera ((?:GPT|Opus|Jev)(?:(?:, | y )(?:GPT|Opus|Jev))*)\./.exec(s.texto)
      if (!m) continue
      for (const id of idsDe(m[1])) {
        const p = est.proveedores.find((x) => x.id === id)
        if (p.finIndice < VIAJEROS_DETALLE + 1) continue
        assert.ok(s.inicio >= momento(p) - 1e-9, `semilla ${semilla}: la voz (${s.inicio}) se adelanta al GAME OVER de ${p.id} (${momento(p)})`)
      }
    }
  }
})

test('divulgación: se dice en el cierre; si no cabe, el guion falla (no se omite en silencio)', () => {
  const original = PUBLICACION.divulgacion
  try {
    for (const div of ['Colaboración pagada con TypeSafe', 'Sin relación comercial con TypeSafe', 'TypeSafe me dio créditos gratis para esta prueba.']) {
      PUBLICACION.divulgacion = div
      const est = calcularEstadisticas(demo, viajeros, JUEGO)
      const segs = segmentosGuion(est)
      assert.ok(segs.at(-1).texto.startsWith(div.replace(/\.$/, '') + '.'), segs.at(-1).texto)
      verificarVerdades(est, segs)
    }
    // Con cualquier corrida, la divulgación se dice (y todo lo demás sigue siendo verdad).
    for (const div of ['Sin relación comercial con TypeSafe', 'TypeSafe me dio créditos gratis para esta prueba']) {
      PUBLICACION.divulgacion = div
      for (let semilla = 1; semilla <= 300; semilla++) {
        const { run, config } = corridaAlAzar(semilla)
        const est = calcularEstadisticas(run, viajeros, config)
        verificarVerdades(est, segmentosGuion(est))
      }
    }
    PUBLICACION.divulgacion = 'Este video es una colaboración pagada con TypeSafe, que además me regaló créditos para su API durante tres meses'
    assert.throws(() => segmentosGuion(calcularEstadisticas(demo, viajeros, JUEGO)), /divulgación.*no cabe/)
  } finally {
    PUBLICACION.divulgacion = original
  }
})

test('la frase de modelos insignia se dice una vez cuando hay modelos de lenguaje', () => {
  const segs = segmentosGuion(calcularEstadisticas(demo, viajeros, JUEGO))
  const con = segs.filter((s) => /modelos insignia/.test(s.texto))
  assert.equal(con.length, 1)
  const soloJev = structuredClone(demo)
  soloJev.proveedores = soloJev.proveedores.filter((p) => p.id === 'jev')
  const segs2 = segmentosGuion(calcularEstadisticas(soloJev, viajeros, JUEGO))
  assert.doesNotMatch(segs2.map((s) => s.texto).join(' '), /insignia/)
})
