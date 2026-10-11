// Pruebas de la composición "simulación": estimación de costos (shared/simulacion.js), subtítulos
// (.srt desde sim/voz.json), regla de publicación, momentos sincronizados con la voz y que la voz
// grabada nunca se publique con la app.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { PUBLICACION } from '../shared/config.js'
import { PROVEEDORES } from '../shared/modelos.js'
import { SUPUESTOS, estimarCostos } from '../shared/simulacion.js'
import {
  centavos,
  cuesSubtitulos,
  decisionesRedondas,
  divulgacionVisible,
  lineasEquilibradas,
  publicableSim,
  seccionEn,
  textoEtiquetaSim,
  tiempoSRT,
} from '../shared/simulacion-video.js'
import { SECCION_DE, T } from '../src/sim/tiempos.js'
import { RAIZ } from './comun.mjs'
import { leerVoz, srtSimulacion } from './srt-sim.mjs'

const viajeros = JSON.parse(readFileSync(join(RAIZ, 'data', 'viajeros.json'), 'utf8')).viajeros
const est = Object.fromEntries(estimarCostos(viajeros).map((e) => [e.id, e]))
const voz = leerVoz()

// ---------------------------------------------------------------------------
// shared/simulacion.js

test('GPT-6 Astra: ≈15 decisiones con US$ 0.25 y entre 1 y 2.5 centavos por decisión', () => {
  const g = est.gpt
  assert.ok(Math.abs(g.decisiones.central - 15) <= 1, `central ${g.decisiones.central}`)
  const c = g.costo.central * 100
  assert.ok(c > 1 && c < 2.5, `costo ${c} centavos`)
  assert.ok(g.decisiones.minimo <= g.decisiones.central && g.decisiones.central <= g.decisiones.maximo)
})

test('Claude Opus 5.5: entre 26 y 58 decisiones (≈38 en el centro) y menos de 1 centavo por decisión', () => {
  const o = est.opus
  assert.equal(o.decisiones.minimo, 26)
  assert.equal(o.decisiones.maximo, 58)
  assert.ok(Math.abs(o.decisiones.central - 38) <= 1, `central ${o.decisiones.central}`)
  assert.ok(o.costo.central * 100 < 1, `costo ${o.costo.central * 100} centavos`)
})

test('Jev: más de 1000 decisiones y menos de 0.01 centavos por decisión', () => {
  const j = est.jev
  assert.ok(j.decisiones.central > 1000, `central ${j.decisiones.central}`)
  assert.ok(j.costo.central * 100 < 0.01, `costo ${j.costo.central * 100} centavos`)
  // No escribe texto: sin tokens de salida estimados.
  assert.deepEqual(j.tokensSalida, { minimo: 0, central: 0, maximo: 0 })
})

test('supuestos: ≈875 tokens de entrada para GPT y Opus, ≈773 para Jev, salida 40-300 (150 central)', () => {
  assert.ok(Math.abs(est.gpt.tokensEntrada - 875) <= 5, `${est.gpt.tokensEntrada}`)
  assert.equal(est.gpt.tokensEntrada, est.opus.tokensEntrada)
  assert.ok(Math.abs(est.jev.tokensEntrada - 773) <= 5, `${est.jev.tokensEntrada}`)
  assert.deepEqual(SUPUESTOS.salidaLLM, { minimo: 40, central: 150, maximo: 300 })
  assert.equal(SUPUESTOS.presupuestoUSD, 0.25)
})

test('cifras redondas que se muestran: ≈1.6 ¢, ≈0.65 ¢, ≈0.003 ¢ y ≈7,700 viajeros', () => {
  assert.equal(centavos(est.gpt.costo.central), '1.6')
  assert.equal(centavos(est.opus.costo.central), '0.65')
  assert.equal(centavos(est.jev.costo.central), '0.003')
  assert.equal(decisionesRedondas(est.jev.decisiones.central), '7,700')
  assert.equal(decisionesRedondas(15), '15')
})

// ---------------------------------------------------------------------------
// Subtítulos (.srt)

function leerSrt(texto) {
  return texto
    .trim()
    .split(/\n\n+/)
    .map((bloque) => {
      const [num, tiempos, ...lineas] = bloque.split('\n')
      const m = /^(\d\d):(\d\d):(\d\d),(\d\d\d) --> (\d\d):(\d\d):(\d\d),(\d\d\d)$/.exec(tiempos)
      assert.ok(m, `tiempo mal formado: "${tiempos}"`)
      const s = (h, mi, se, ms) => Number(h) * 3600 + Number(mi) * 60 + Number(se) + Number(ms) / 1000
      return { num: Number(num), inicio: s(m[1], m[2], m[3], m[4]), fin: s(m[5], m[6], m[7], m[8]), lineas }
    })
}

test('el .srt tiene las frases de sim/voz.json con sus tiempos exactos, máximo 2 líneas de ~40 caracteres', () => {
  const cues = leerSrt(srtSimulacion(voz))
  assert.ok(cues.length >= voz.frases.length)
  cues.forEach((c, i) => {
    assert.equal(c.num, i + 1)
    assert.ok(c.lineas.length >= 1 && c.lineas.length <= 2, `subtítulo ${c.num}: ${c.lineas.length} líneas`)
    for (const l of c.lineas) assert.ok([...l].length <= 40, `subtítulo ${c.num}: línea de ${[...l].length} caracteres: "${l}"`)
    assert.ok(c.fin > c.inicio)
    if (i) assert.ok(c.inicio >= cues[i - 1].fin, `subtítulo ${c.num} empieza antes de que termine el anterior`)
  })
  // El texto completo es el de la voz, en orden, y cada frase empieza y termina donde dice voz.json.
  const texto = cues.map((c) => c.lineas.join(' ')).join(' ')
  assert.equal(texto, voz.frases.map((f) => f.texto).join(' '))
  for (const f of voz.frases) {
    assert.ok(cues.some((c) => Math.abs(c.inicio - f.inicio) < 0.001), `ningún subtítulo empieza en ${f.inicio}`)
    assert.ok(cues.some((c) => Math.abs(c.fin - f.fin) < 0.001), `ningún subtítulo termina en ${f.fin}`)
  }
  assert.ok(cues.at(-1).fin <= voz.duracion)
})

test('subtítulos: una frase larga se parte en varios bloques y las líneas quedan equilibradas', () => {
  const larga = { inicio: 10, fin: 20, texto: 'uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis diecisiete' }
  const cues = cuesSubtitulos([larga], { maxCar: 30, maxLineas: 2 })
  assert.ok(cues.length >= 2)
  assert.equal(cues[0].inicio, 10)
  assert.equal(cues.at(-1).fin, 20)
  for (const c of cues) for (const l of c.lineas) assert.ok(l.length <= 30)
  assert.deepEqual(lineasEquilibradas('Tres inteligencias artificiales. Un mismo trabajo:', 40), ['Tres inteligencias artificiales.', 'Un mismo trabajo:'])
  assert.equal(tiempoSRT(19.7), '00:00:19,700')
})

// ---------------------------------------------------------------------------
// Voz y sincronización

test('sim/voz.json: secciones seguidas de 0 a 93 s y frases ordenadas dentro del audio', () => {
  assert.equal(voz.duracion, 93)
  assert.equal(voz.secciones[0].inicio, 0)
  assert.equal(voz.secciones.at(-1).fin, voz.duracion)
  voz.secciones.slice(1).forEach((s, i) => assert.equal(s.inicio, voz.secciones[i].fin))
  voz.frases.forEach((f, i) => {
    assert.ok(f.fin > f.inicio && f.fin <= voz.duracion)
    if (i) assert.ok(f.inicio >= voz.frases[i - 1].fin)
  })
})

test('cada momento de src/sim/tiempos.js cae dentro de su sección de la voz', () => {
  for (const [clave, valor] of Object.entries(T)) {
    const seccion = SECCION_DE[clave]
    assert.ok(seccion, `falta la sección de T.${clave}`)
    const s = voz.secciones.find((x) => x.id === seccion)
    const valores = typeof valor === 'number' ? [valor] : Object.values(valor)
    for (const v of valores) assert.ok(v >= s.inicio && v < s.fin, `T.${clave} = ${v} no está en ${seccion} (${s.inicio}-${s.fin})`)
  }
})

test('los momentos clave coinciden con lo que dice la voz', () => {
  const cerca = (a, b, tol = 0.35) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`)
  cerca(T.selloCual, 6.94)
  cerca(T.columnas.gpt, 10.5)
  cerca(T.columnas.opus, 12.2)
  cerca(T.columnas.jev, 14.3)
  ;[20.5, 21.6, 23.4, 25.0].forEach((x, i) => cerca(T.preguntas[i], x))
  cerca(T.jev, 35.8)
  cerca(T.cuantoCuesta, 47.9)
  cerca(T.costo.gpt, 55.7)
  cerca(T.costo.opus, 57.6)
  cerca(T.costo.jev, 59.6)
  cerca(T.agotado.gpt, 66)
  cerca(T.agotado.opus, 68)
  cerca(T.agotado.jev, 70)
  ;[71.7, 75.5, 78, 81.3].forEach((x, i) => cerca(T.aclaraciones[i], x))
  cerca(T.conclusion, 84.8)
  cerca(T.crear, 86)
  cerca(T.decidir, 88.6)
  assert.equal(seccionEn(voz.secciones, 50.9).id, 'numeros')
})

// ---------------------------------------------------------------------------
// Publicación y honestidad

test('relación con TypeSafe: con "ninguna" no se muestra divulgación ni bloquea; si es "declarada", es obligatoria', () => {
  const ninguna = publicableSim({ publicacion: { relacionTypeSafe: 'ninguna', divulgacion: '' }, proveedores: PROVEEDORES })
  assert.deepEqual(ninguna.bloqueos, [])
  assert.equal(divulgacionVisible({ relacionTypeSafe: 'ninguna', divulgacion: 'Algo' }), '')
  const vacia = publicableSim({ publicacion: { relacionTypeSafe: 'declarada', divulgacion: '  ' }, proveedores: PROVEEDORES })
  assert.deepEqual(vacia.bloqueos.map((b) => b.codigo), ['divulgacion'])
  const escrita = publicableSim({ publicacion: { relacionTypeSafe: 'declarada', divulgacion: 'Colaboración pagada con TypeSafe' }, proveedores: PROVEEDORES })
  assert.deepEqual(escrita.bloqueos, [])
  assert.equal(divulgacionVisible({ relacionTypeSafe: 'declarada', divulgacion: ' Colaboración pagada con TypeSafe ' }), 'Colaboración pagada con TypeSafe')
})

test('precios de fuentes secundarias: no bloquean la simulación, pero se avisan', () => {
  const r = publicableSim({ publicacion: PUBLICACION, proveedores: PROVEEDORES })
  const sinVerificar = PROVEEDORES.filter((p) => p.precio.verificado === false).map((p) => p.nombre)
  assert.ok(sinVerificar.length > 0)
  for (const n of sinVerificar) assert.ok(r.avisos.some((a) => a.codigo === 'precio_secundario' && a.texto.includes(n)), n)
  if (PUBLICACION.relacionTypeSafe === 'ninguna') assert.deepEqual(r.bloqueos, [])
})

test('la etiqueta fija dice SIMULACIÓN ILUSTRATIVA con costos estimados', () => {
  assert.equal(textoEtiquetaSim(), 'SIMULACIÓN ILUSTRATIVA · costos estimados con precios publicados')
})

function archivos(dir) {
  return readdirSync(dir, { recursive: true }).map(String).map((f) => join(dir, f))
}

test('la simulación no usa corridas del benchmark ni muestra aciertos, vidas o velocidades', () => {
  const fuentes = archivos(join(RAIZ, 'src', 'sim')).filter((f) => /\.(js|jsx)$/.test(f))
  assert.ok(fuentes.length > 5)
  for (const f of fuentes) {
    const sinComentarios = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    assert.ok(!/runs\/|lib\/datos\.js|shared\/juego\.js|shared\/timeline\.js/.test(sinComentarios), `${f} usa datos del benchmark`)
    // Sin relojes ni azar: todo es función de t.
    assert.ok(!/Date\.now|Math\.random/.test(sinComentarios), `${f} usa Date.now o Math.random`)
    // Sin textos de resultados medidos (aciertos, vidas, latencias, "MEJOR", GAME OVER).
    assert.ok(!/GAME OVER|MEJOR|vidas|latencia|aciertos:/i.test(sinComentarios), `${f} muestra resultados que no se midieron`)
  }
})

test('la voz grabada no se publica: audio/ está en .gitignore y no hay audio en public/ ni en dist/', () => {
  const ignorados = readFileSync(join(RAIZ, '.gitignore'), 'utf8').split('\n').map((l) => l.trim())
  assert.ok(ignorados.includes('audio') || ignorados.includes('audio/'), '.gitignore no excluye audio/')
  for (const dir of ['public', 'dist']) {
    const ruta = join(RAIZ, dir)
    if (!existsSync(ruta)) continue
    const audios = archivos(ruta).filter((f) => /\.(m4a|wav|mp3|aac|ogg|flac)$/i.test(f))
    assert.deepEqual(audios, [], `${dir}/ contiene audio`)
  }
  const vite = readFileSync(join(RAIZ, 'vite.config.js'), 'utf8')
  assert.match(vite, /apply: 'serve'/, 'la voz solo debe servirse en desarrollo')
  assert.match(vite, /sim\.html/, 'sim.html debe estar en rollupOptions.input')
})
