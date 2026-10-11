// Cómo responde cada una (26.8 - 43.2 s):
// «GPT y Opus son modelos generativos: razonan y escriben su respuesta. Y se cobra cada token,
//  incluido ese razonamiento interno. En cambio, Jev funciona distinto: no escribe. Lee el caso y
//  devuelve directamente la decisión, con qué tan seguro está.»
// Todo aquí es ILUSTRATIVO (no hubo llamadas reales): la respuesta que se escribe y el sello son la
// respuesta correcta del viajero de ejemplo (v02); los tokens son los supuestos de shared/simulacion.js;
// las probabilidades de Jev son valores redondos de ejemplo, no medidos.

import { entero } from '../../../shared/formato.js'
import { clamp, easeOutBack, easeOutCubic, golpe, prog } from '../../lib/anim.js'
import { FUENTE_MONO, FUENTE_TEXTO, FUENTE_TITULO, anchoTexto, tamParaAncho } from '../../lib/medir.js'
import { COLORES, SELLO, alfa, siNo, tono } from '../../lib/textos.js'
import { Icono } from '../../componentes/Pixel.jsx'
import { Sello } from '../../componentes/Sello.jsx'
import { bordePixel, TextoPixel } from '../../componentes/ui.jsx'
import { T } from '../tiempos.js'
import { Hoja, Moneda, Pildora, Rotulo, TituloPixel, pop } from '../piezas.jsx'

// Probabilidades de EJEMPLO para el panel de Jev (valores redondos; no son resultados medidos).
const PROB_EJEMPLO = { accion: 0.9, pasa: 0.95, miente: 0.85, peligro: 0.7 }

// Tokens ≈ caracteres / 4 × 1.3 (mismo supuesto que shared/simulacion.js).
const tokensDe = (texto, s) => Math.round((texto.length / s.caracteresPorToken) * s.factorEspanol)

function Monedas({ n, t, t0, t1, tam, max }) {
  // Monedas que caen a una bandeja a medida que se acumulan tokens (ilustrativo).
  const items = []
  for (let i = 0; i < Math.min(n, max); i++) {
    const ti = t0 + ((i + 1) / n) * (t1 - t0)
    if (t < ti) break
    const k = easeOutBack(prog(t, ti, 0.25), 2)
    items.push(
      <div key={i} style={{ transform: `translateY(${(1 - k) * -tam * 1.6}px)`, opacity: clamp(k * 3) }}>
        <Moneda alto={tam} />
      </div>,
    )
  }
  return <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: tam + 2 }}>{items}</div>
}

function PanelGenerativos({ m, L, w, h, t }) {
  const vertical = L.formato === 'vertical'
  const horizontal = L.orientacion === 'horizontal'
  const s = m.supuestos
  const llms = m.estimaciones.filter((e) => e.id !== 'jev')
  const pad = vertical ? 20 : 16
  const interior = w - pad * 2
  const v = m.ejemploDecisiones
  const json = JSON.stringify(v.verdad)
  const tokJson = tokensDe(json, s)
  const tokTotal = s.salidaLLM.central
  const tokRazon = tokTotal - tokJson
  // Respuesta en 2 líneas: {"pasa": false, "miente": true, / "peligro": 3, "accion": "arrestar"}
  const partes = Object.entries(v.verdad).map(([k, x]) => `"${k}": ${JSON.stringify(x)}`)
  const lineasJson = [`{${partes[0]}, ${partes[1]},`, ` ${partes[2]}, ${partes[3]}}`]
  const tamJ = Math.min(vertical ? 28 : 25, Math.floor((interior - 40) / (Math.max(...lineasJson.map((x) => x.length)) * 0.61)))
  const tamPill = vertical ? 28 : 24
  const tamTit = tamParaAncho('MODELOS GENERATIVOS', interior * 0.7, vertical ? 30 : 26, 14, 400, FUENTE_TITULO)
  const tamSub = vertical ? 32 : 28
  const tamEt = vertical ? 26 : 23
  const tamMon = vertical ? 24 : 21
  const kA = pop(t, T.generativos, 0.45, 1.2)
  const kSub = easeOutCubic(prog(t, T.razonan, 0.4))
  // Razonamiento interno: se "piensa" (bloques ocultos) y suma tokens.
  const tR0 = T.razonan + 0.15
  const tR1 = T.escriben + 0.2
  const kR = clamp((t - tR0) / (tR1 - tR0))
  const tokR = Math.round(tokRazon * easeOutCubic(kR))
  // Respuesta: se escribe letra a letra.
  const tJ0 = T.escriben + 0.15
  const tJ1 = T.cobra - 0.1
  const kJ = clamp((t - tJ0) / (tJ1 - tJ0))
  const totalChars = lineasJson.reduce((a, x) => a + x.length, 0)
  const escritos = Math.floor(kJ * totalChars)
  const tokJ = Math.round(tokJson * kJ)
  const kCobra = easeOutBack(prog(t, T.cobra, 0.4))
  const resalta = t >= T.razonamientoInterno
  const pulso = resalta ? 0.5 + 0.5 * Math.sin((t - T.razonamientoInterno) * 7) : 0
  const kInc = easeOutBack(prog(t, T.razonamientoInterno, 0.35), 2)
  const nBloques = 18
  let n = 0
  const anchoContador = anchoTexto('≈ 888 tokens', tamEt, 800) + 6
  return (
    <div style={{ width: w, height: h, padding: pad, background: `linear-gradient(180deg, ${COLORES.panel2}, ${COLORES.panel})`, boxShadow: bordePixel('#3a4770', 4), display: 'flex', flexDirection: 'column', gap: vertical ? 14 : 10, transform: `translateY(${(1 - kA.k) * 90}px)`, opacity: kA.o, overflow: 'hidden', flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap' }}>
        {llms.map((e) => (
          <Pildora key={e.id} texto={e.nombre} color={e.color} tam={tamPill} />
        ))}
        <div style={{ flex: 1 }} />
        <Rotulo texto="EJEMPLO ILUSTRATIVO" tam={vertical ? 22 : 20} />
      </div>
      <TituloPixel texto="MODELOS GENERATIVOS" tam={tamTit} color="#fff" />
      <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: tamSub, color: COLORES.texto, opacity: kSub, transform: `translateX(${(1 - kSub) * 30}px)`, whiteSpace: 'nowrap' }}>Razonan y escriben su respuesta.</div>
      {/* Razonamiento interno */}
      <div style={{ padding: '10px 12px', background: 'rgba(5,7,13,0.75)', boxShadow: resalta ? `0 0 0 3px ${alfa(COLORES.ambar, 0.6 + 0.4 * pulso)}` : bordePixel('#2a3352', 3, false), opacity: t >= tR0 - 0.1 ? 1 : 0.25, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: tamEt, color: '#e7b9ff', whiteSpace: 'nowrap' }}>razonamiento interno (no se ve)</span>
          <span style={{ width: anchoContador, textAlign: 'right', fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamEt, color: COLORES.texto, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>≈ {entero(tokR)} tokens</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, display: 'flex', gap: 4, height: tamEt * 0.8 }}>
            {Array.from({ length: nBloques }, (_, i) => (
              <div key={i} style={{ flex: 1, background: i / nBloques < kR ? (i % 3 === 0 ? '#7c5ab8' : '#5b3f8f') : '#1c2238' }} />
            ))}
          </div>
          <Monedas n={Math.round(tokRazon / 10)} t={t} t0={tR0} t1={tR1} tam={tamMon} max={14} />
        </div>
        {t >= T.razonamientoInterno && (
          <div style={{ alignSelf: 'flex-start', transform: `scale(${kInc})`, transformOrigin: 'left center', fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamEt, color: '#1a1400', background: COLORES.ambar, padding: '3px 10px', whiteSpace: 'nowrap' }}>
            también se cobra
          </div>
        )}
      </div>
      {/* Respuesta escrita */}
      <div style={{ position: 'relative', padding: '10px 12px', background: '#05070d', boxShadow: bordePixel('#1f2a44', 3, false), opacity: t >= tJ0 - 0.1 ? 1 : 0.25 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
          <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: tamEt, color: '#8ff0b5', whiteSpace: 'nowrap' }}>respuesta que escribe</span>
          <span style={{ width: anchoContador, textAlign: 'right', fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamEt, color: COLORES.texto, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>≈ {entero(tokJ)} tokens</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontFamily: FUENTE_MONO, fontSize: tamJ, lineHeight: 1.3, color: '#8ff0b5' }}>
            {lineasJson.map((ln, k) => {
              const vis = clamp(escritos - n, 0, ln.length)
              n += ln.length
              const cursor = vis < ln.length && vis > 0 && Math.floor(t * 6) % 2 === 0
              return (
                <div key={k} style={{ whiteSpace: 'pre' }}>
                  {ln.slice(0, vis)}
                  {cursor ? '▌' : ''}
                  <span style={{ color: 'transparent' }}>{ln.slice(vis + (cursor ? 1 : 0))}</span>
                </div>
              )
            })}
          </div>
          <Monedas n={Math.max(1, Math.round(tokJson / 10))} t={t} t0={tJ0} t1={tJ1} tam={tamMon} max={4} />
        </div>
      </div>
      {/* Se cobra cada token */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, transform: `scale(${0.7 + 0.3 * kCobra})`, transformOrigin: 'left center', opacity: clamp(kCobra * 2), whiteSpace: 'nowrap' }}>
        <Moneda alto={Math.round(tamSub * 0.95)} />
        <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamSub, color: COLORES.ambar }}>Se cobra cada token:</span>
        <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamSub, color: COLORES.texto }}>≈ {entero(tokTotal)} de salida</span>
      </div>
      {!horizontal && <div style={{ flex: 1 }} />}
    </div>
  )
}

function PanelJev({ m, L, w, h, t }) {
  const vertical = L.formato === 'vertical'
  const horizontal = L.orientacion === 'horizontal'
  const jev = m.porId.jev
  const v = m.ejemploDecisiones
  const pad = vertical ? 20 : 16
  const interior = w - pad * 2
  const tamPill = vertical ? 28 : 24
  const tamTit = tamParaAncho('MODELO DE DECISIÓN', interior * 0.7, vertical ? 30 : 26, 14, 400, FUENTE_TITULO)
  const tamSub = vertical ? 32 : 28
  const tamFila = vertical ? 28 : 24
  const kB = pop(t, T.jev, 0.45, 1.2)
  const kNo = easeOutBack(prog(t, T.noEscribe, 0.35), 2)
  const accion = v.verdad.accion
  const filas = [
    ['sello', '#ff8a9a', SELLO[accion].verbo, PROB_EJEMPLO.accion],
    ['barrera', '#c9cfe0', siNo(v.verdad.pasa), PROB_EJEMPLO.pasa],
    ['mascara', '#c9b6ff', siNo(v.verdad.miente), PROB_EJEMPLO.miente],
    ['peligro', '#ffc23d', `${v.verdad.peligro}/4`, PROB_EJEMPLO.peligro],
  ]
  // Sello (decisión) a la izquierda y probabilidades a la derecha (debajo en horizontal).
  const hojaW = horizontal ? Math.round(interior * 0.62) : Math.round(interior * 0.4)
  const hojaH = Math.round(hojaW * 0.48)
  const anchoValor = Math.max(...filas.map((f) => anchoTexto(f[2], tamFila, 800))) + 8
  const anchoPct = anchoTexto('100 %', tamFila, 800) + 4
  const g = golpe(t, T.decision, -4)
  const sacude = g.sacudida
  return (
    <div style={{ width: w, height: h, padding: pad, background: `linear-gradient(180deg, ${COLORES.panel2}, ${COLORES.panel})`, boxShadow: bordePixel(tono(jev.color, -0.3), 4), display: 'flex', flexDirection: 'column', gap: vertical ? 12 : 10, transform: `translateY(${(1 - kB.k) * 90}px)`, opacity: kB.o, overflow: 'hidden', flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Pildora texto={jev.nombre} color={jev.color} tam={tamPill} />
        <div style={{ flex: 1 }} />
        <Rotulo texto="EJEMPLO ILUSTRATIVO" tam={vertical ? 22 : 20} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <TituloPixel texto="MODELO DE DECISIÓN" tam={tamTit} color="#fff" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, whiteSpace: 'nowrap', opacity: clamp(kNo * 2), transform: `scale(${0.7 + 0.3 * kNo})`, transformOrigin: 'left center' }}>
        <div style={{ position: 'relative', fontFamily: FUENTE_MONO, fontSize: tamSub * 0.8, color: '#5d6a8f', padding: '0 6px' }}>
          {'{ … }'}
          <div style={{ position: 'absolute', left: -4, right: -4, top: '50%', height: 5, background: '#ff4d5e', transform: 'rotate(-12deg)' }} />
        </div>
        <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamSub, color: COLORES.texto }}>No escribe: decide.</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: horizontal ? 'column' : 'row', alignItems: horizontal ? 'flex-start' : 'center', gap: horizontal ? 16 : 22 }}>
        <Hoja w={hojaW} h={hojaH} style={{ transform: `translate(${sacude * 4}px, ${sacude * 5}px)`, opacity: t >= T.decision - 0.6 ? 1 : 0.35 }}>
          {g.visible && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sello accion={accion} t={t} t0={T.decision} ancho={hojaW * 0.84} alto={hojaH * 0.6} rot={-6} clave="jev-ej" sobrePapel />
            </div>
          )}
        </Hoja>
        <div style={{ flex: 1, width: horizontal ? '100%' : 'auto', display: 'flex', flexDirection: 'column', gap: vertical ? 10 : 8 }}>
          <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: vertical ? 24 : 22, color: COLORES.suave, opacity: clamp(prog(t, T.seguridad - 0.1, 0.3) * 2), whiteSpace: 'nowrap' }}>qué tan seguro está (ejemplo)</div>
          {filas.map(([ic, col, val, p], i) => {
            const k = easeOutBack(prog(t, T.seguridad + i * 0.08, 0.3))
            const kb = easeOutCubic(prog(t, T.seguridad + 0.1 + i * 0.08, 0.5))
            return (
              <div key={ic} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: clamp(k * 2), transform: `scale(${0.85 + 0.15 * k})`, transformOrigin: 'left center' }}>
                <Icono nombre={ic} alto={Math.round(tamFila * 0.9)} color={col} claro="#141a2c" extra={{ R: '#e5383b', W: '#f5f5f5' }} />
                <div style={{ width: anchoValor, fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamFila, color: '#fff', whiteSpace: 'nowrap' }}>{val}</div>
                <div style={{ flex: 1, height: Math.round(tamFila * 0.5), background: '#262d45', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${p * 100 * kb}%`, background: jev.color }} />
                </div>
                <div style={{ width: anchoPct, textAlign: 'right', fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamFila, color: '#9db8ff', fontVariantNumeric: 'tabular-nums' }}>{Math.round(p * 100)} %</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function ComoRespondeSim({ m, L, t }) {
  const C = L.contenido
  const horizontal = L.orientacion === 'horizontal'
  const vertical = L.formato === 'vertical'
  const tamTitulo = tamParaAncho('¿CÓMO RESPONDE CADA UNA?', C.w * 0.95, vertical ? 30 : 28, 14, 400, FUENTE_TITULO)
  const altoTitulo = Math.round(tamTitulo * 1.5)
  const gap = vertical ? 18 : 16
  const kT = easeOutBack(prog(t, 26.85, 0.4))
  const zonaH = C.h - altoTitulo - gap
  const wA = horizontal ? Math.round((C.w - gap) * 0.54) : C.w
  const wB = horizontal ? C.w - gap - wA : C.w
  const hA = horizontal ? zonaH : Math.round((zonaH - gap) * 0.585)
  const hB = horizontal ? zonaH : zonaH - gap - hA
  return (
    <div style={{ position: 'absolute', left: C.x, top: C.y, width: C.w, height: C.h, display: 'flex', flexDirection: 'column', gap }}>
      <div style={{ height: altoTitulo, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${0.6 + 0.4 * kT})`, opacity: clamp(kT * 2) }}>
        <TituloPixel texto="¿CÓMO RESPONDE CADA UNA?" tam={tamTitulo} />
      </div>
      <div style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', gap }}>
        <PanelGenerativos m={m} L={L} w={wA} h={hA} t={t} />
        <div style={{ width: wB, height: hB, flex: 'none', position: 'relative' }}>
          {t >= T.jev - 0.05 ? (
            <PanelJev m={m} L={L} w={wB} h={hB} t={t} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 3px rgba(120,135,180,0.3)', background: 'rgba(10,12,22,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FUENTE_TITULO, fontSize: tamTitulo * 0.8, color: 'rgba(160,170,200,0.45)' }}>
              <TextoPixel>Y JEV…</TextoPixel>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
