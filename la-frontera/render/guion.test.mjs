// Pruebas del guion (node --test render/guion.test.mjs).
// Genera cientos de corridas al azar a partir de la demo (otros costos, latencias, errores,
// decisiones, presupuesto, vidas, proveedores y cantidad de viajeros) y verifica que:
//  - ningún tramo pase de RITMO_MAXIMO palabras por segundo ni se cruce con otro;
//  - cada frase con un dato sea verdad según las estadísticas de esa corrida.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { JUEGO, PUBLICACION } from '../shared/config.js'
import { calcularEstadisticas } from '../shared/juego.js'
import { ESCENAS } from '../shared/timeline.js'
import { contarPalabras, dineroVoz, RITMO_MAXIMO, segmentosGuion, segundosVoz, vecesVoz } from '../shared/guion.js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const demo = JSON.parse(readFileSync(join(RAIZ, 'public/runs/demo.json'), 'utf8'))
const viajeros = JSON.parse(readFileSync(join(RAIZ, 'data/viajeros.json'), 'utf8')).viajeros
const CORTOS = { gpt: 'GPT', opus: 'Opus', jev: 'Jev' }
const ACCIONES = ['aprobar', 'rechazar', 'interrogar', 'arrestar']

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

function corridaAlAzar(semilla) {
  const r = azar(semilla)
  const run = structuredClone(demo)
  const subconjuntos = [['gpt', 'opus', 'jev'], ['gpt', 'opus', 'jev'], ['gpt', 'opus', 'jev'], ['gpt', 'opus'], ['opus', 'jev'], ['gpt', 'jev'], ['jev']]
  const ids = elegir(r, subconjuntos)
  run.proveedores = run.proveedores.filter((p) => ids.includes(p.id))
  const N = r() < 0.6 ? 60 : 1 + Math.floor(r() * 60)
  run.viajeros = run.viajeros.slice(0, N)
  for (const id of ids) {
    const fCosto = elegir(r, [0.01, 0.2, 1, 1, 1, 3, 20])
    const fLat = elegir(r, [0.1, 0.5, 1, 1, 3, 10])
    const pFallo = elegir(r, [0, 0, 0.05, 0.3, 1])
    const pCambio = elegir(r, [0, 0.05, 0.2, 0.6])
    run.resultados[id] = run.resultados[id].slice(0, N).map((x) => {
      const y = { ...x, costoUSD: x.costoUSD * fCosto, latenciaMs: Math.round(x.latenciaMs * fLat) }
      if (r() < pFallo) return { ...y, ok: false, decision: null, error: 'falla simulada', costoUSD: 0 }
      if (r() < pCambio) y.decision = { ...y.decision, accion: elegir(r, ACCIONES) }
      return y
    })
  }
  const config = { presupuestoUSD: elegir(r, [0.001, 0.02, 0.05, 0.25, 0.25, 1, 5]), vidas: elegir(r, [1, 2, 3, 3, 5]) }
  return { run, config }
}

function verificarVerdades(est, segs) {
  const ps = est.proveedores
  const porCorto = (nombre) => ps.find((p) => CORTOS[p.id] === nombre)
  const unico = (lista, valor, menor) => {
    const vals = lista.map(valor)
    const mejor = menor ? Math.min(...vals) : Math.max(...vals)
    return lista.filter((p) => Math.abs(valor(p) - mejor) <= Math.max(1e-12, Math.abs(mejor) * 1e-9))
  }
  const g = segs[0].texto
  const n = est.sobrevivientes.length
  if (est.sobrevivientes.some((p) => p.decisionesEnJuego === 0)) assert.match(g, /¿Quién dura más\?/)
  else if (ps.length === 1) assert.match(g, n ? /\. Llegó al final/ : /No llegó al final/)
  else if (n === 0) assert.match(g, /Ninguna llegó al final/)
  else if (n === 1) assert.match(g, /Solo una llegó al final/)
  else if (n === ps.length) assert.match(g, /llegaron al final/)
  else assert.match(g, /Solo \S+ llegaron al final/)
  if (ps.length > 1) assert.doesNotMatch(g, n === 1 ? /Ninguna/ : /Solo una llegó/)

  for (const s of segs) {
    let m
    if ((m = /(\S+) duró más que nadie/.exec(s.texto))) {
      const p = porCorto(m[1])
      const top = unico(ps, (x) => (x.llegoAlFinal ? 1e9 : 0) + x.decisionesEnJuego, false)
      assert.deepEqual(top.map((x) => x.id), [p.id], s.texto)
      assert.equal(p.llegoAlFinal, false)
    }
    if ((m = /Solo (\S+) llegó al final/.exec(s.texto)) && porCorto(m[1])) {
      assert.deepEqual(est.sobrevivientes.map((x) => x.id), [porCorto(m[1]).id], s.texto)
    }
    if ((m = /(\S+)(?:, el más rápido| gana en velocidad)/.exec(s.texto))) {
      const top = unico(ps.filter((x) => x.respondidas > 0), (x) => x.latenciaPromedioMs, true)
      assert.deepEqual(top.map((x) => x.id), [porCorto(m[1]).id], s.texto)
    }
    if ((m = /(?:En aciertos, gana (\S+?)\.|(\S+) gana en velocidad y en aciertos)/.exec(s.texto))) {
      m[1] = m[1] ?? m[2]
      const top = unico(ps, (x) => x.precisionAccion, false)
      assert.deepEqual(top.map((x) => x.id), [porCorto(m[1]).id], s.texto)
    }
    if ((m = /(\S+) sale .* más barato que (\S+?)\./.exec(s.texto))) {
      assert.equal(est.masBarato.id, porCorto(m[1]).id, s.texto)
      assert.equal(est.masCaro.id, porCorto(m[2]).id, s.texto)
    }
    if ((m = /(\S+) se queda sin presupuesto/.exec(s.texto))) {
      assert.equal(porCorto(m[1]).motivoFin, 'sin_fondos', s.texto)
    }
    if ((m = /(\S+) pierde su última vida/.exec(s.texto))) {
      assert.equal(porCorto(m[1]).motivoFin, 'sin_vidas', s.texto)
    }
    if ((m = /tras ([\d,]+) decisi/.exec(s.texto))) {
      const quien = porCorto(/^(\S+)/.exec(s.texto)[1])
      if (quien) assert.equal(quien.decisionesEnJuego, Number(m[1].replace(/,/g, '')), s.texto)
    }
    if ((m = /Solo queda (\S+?)\./.exec(s.texto))) {
      // El único que no tiene GAME OVER todavía (o que llegó al final).
      const p = porCorto(m[1])
      assert.ok(p.finIndice === null || p.finIndice > 0, s.texto)
    }
  }
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
  assert.equal(segundosVoz(2860), '3 segundos')
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
  assert.match(todo, /razonamiento también se paga/)
  assert.match(todo, /probabilidad/)
  assert.match(todo, /para crear\. Jev, para decidir/)
  assert.match(todo, /descripción/)
})

test('600 corridas al azar: nunca se pasa del ritmo y no afirma nada falso', () => {
  for (let semilla = 1; semilla <= 600; semilla++) {
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
})

test('divulgación en el cierre si está configurada (y no rompe el ritmo si es larga)', () => {
  const original = PUBLICACION.divulgacion
  try {
    PUBLICACION.divulgacion = 'Colaboración pagada con TypeSafe'
    let segs = segmentosGuion(calcularEstadisticas(demo, viajeros, JUEGO))
    assert.match(segs.at(-1).texto, /Colaboración pagada con TypeSafe/)
    PUBLICACION.divulgacion = 'Este video es una colaboración pagada con TypeSafe, que además me regaló créditos para su API durante tres meses'
    segs = segmentosGuion(calcularEstadisticas(demo, viajeros, JUEGO))
    assert.doesNotMatch(segs.at(-1).texto, /colaboración pagada/) // no cabe: queda en pantalla y en la publicación
  } finally {
    PUBLICACION.divulgacion = original
  }
})

