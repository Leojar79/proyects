// Cómo responde cada una (26.8 - 43.2 s):
// «GPT y Opus son modelos generativos: razonan y escriben su respuesta. Y se cobra cada token,
//  incluido ese razonamiento interno. En cambio, Jev funciona distinto: no escribe. Lee el caso y
//  devuelve directamente la decisión, con qué tan seguro está.»
// Todo aquí es ILUSTRATIVO (no hubo llamadas reales): la respuesta que se escribe y el sello son la
// respuesta correcta del viajero de ejemplo (v02); los tokens son los supuestos de shared/simulacion.js;
// las probabilidades de Jev son valores redondos de ejemplo, no medidos.

import { entero } from '../../../shared/formato.js'
import { clamp, easeInOutCubic, easeOutBack, easeOutCubic, golpe, prog } from '../../lib/anim.js'
import { FUENTE_MONO, FUENTE_TEXTO, FUENTE_TITULO, anchoTexto, tamParaAncho } from '../../lib/medir.js'
import { COLORES, SELLO, alfa, siNo, tono } from '../../lib/textos.js'
import { Icono } from '../../componentes/Pixel.jsx'
import { Sello } from '../../componentes/Sello.jsx'
import { bordePixel, TextoPixel } from '../../componentes/ui.jsx'
import { T } from '../tiempos.js'
import { Hoja, Moneda, PasaporteCerrado, Pildora, Rotulo, TituloPixel, colorNacion, pop } from '../piezas.jsx'

// Probabilidades de EJEMPLO para el panel de Jev (valores redondos; no son resultados medidos).
const PROB_EJEMPLO = { accion: 0.9, pasa: 0.95, miente: 0.85, peligro: 0.7 }

// Tokens ≈ caracteres / 4 × 1.3 (mismo supuesto que shared/simulacion.js).
const tokensDe = (texto, s) => Math.round((texto.length / s.caracteresPorToken) * s.factorEspanol)

// Tiempos internos del panel de los modelos generativos (sobre la voz).
const R0 = T.razonan + 0.1 // empieza el razonamiento interno
const R1 = T.razonan + 1.65 // termina
const J0 = T.escriben + 0.15 // empieza a escribir la respuesta
const J1 = T.cobra + 0.15 // termina de escribir

function Monedas({ n, t, t0, t1, tam, max }) {
  // Monedas que caen a medida que se acumulan tokens (ilustrativo: una cada ~10 tokens).
  const items = []
  const total = Math.min(n, max)
  for (let i = 0; i < total; i++) {
    const ti = t0 + ((i + 1) / total) * (t1 - t0)
    if (t < ti) break
    const k = easeOutBack(prog(t, ti, 0.25), 2)
    items.push(
      <div key={i} style={{ transform: `translateY(${(1 - k) * -tam * 1.6}px)`, opacity: clamp(k * 3) }}>
        <Moneda alto={tam} />
      </div>,
    )
  }
  return <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: tam + 2, flex: 'none' }}>{items}</div>
}

function medidas(L) {
  const vertical = L.formato === 'vertical'
  const horizontal = L.orientacion === 'horizontal'
  return {
    vertical,
    horizontal,
    pad: vertical ? 20 : 18,
    tamPill: vertical ? 28 : 26,
    tamRot: vertical ? 22 : 20,
    tamTit: vertical ? 30 : 28,
    tamSub: vertical ? 32 : horizontal ? 32 : 28,
    tamEt: vertical ? 27 : horizontal ? 27 : 24,
    tamMon: vertical ? 26 : horizontal ? 26 : 22,
  }
}

function PanelGenerativos({ m, L, w, h, t }) {
  const M = medidas(L)
  const s = m.supuestos
  const llms = m.estimaciones.filter((e) => e.id !== 'jev')
  const interior = w - M.pad * 2
  const v = m.ejemploDecisiones
  const json = JSON.stringify(v.verdad)
  const tokJson = tokensDe(json, s)
  const tokTotal = s.salidaLLM.central
  const tokRazon = tokTotal - tokJson
  // Respuesta en 2 líneas: {"pasa": false, "miente": true, / "peligro": 3, "accion": "arrestar"}
  const partes = Object.entries(v.verdad).map(([k, x]) => `"${k}": ${JSON.stringify(x)}`)
  const lineasJson = [`{${partes[0]}, ${partes[1]},`, ` ${partes[2]}, ${partes[3]}}`]
  const largo = Math.max(...lineasJson.map((x) => x.length))
  const tamJ = Math.min(M.vertical ? 31 : 29, Math.floor((interior - 24 - 4 * (M.tamMon + 3)) / (largo * 0.61)))
  const tamTit = tamParaAncho('MODELOS GENERATIVOS', interior * 0.75, M.tamTit, 14, 400, FUENTE_TITULO)
  const kA = pop(t, T.generativos, 0.45, 1.2)
  const kSub = easeOutCubic(prog(t, T.razonan, 0.4))
  // Razonamiento interno: se "piensa" (bloques ocultos) y suma tokens.
  const kR = clamp((t - R0) / (R1 - R0))
  const tokR = Math.round(tokRazon * easeInOutCubic(kR))
  // Respuesta: se escribe letra a letra.
  const kJ = clamp((t - J0) / (J1 - J0))
  const totalChars = lineasJson.reduce((a, x) => a + x.length, 0)
  const escritos = Math.floor(kJ * totalChars)
  const tokJ = Math.round(tokJson * kJ)
  const kCobra = easeOutBack(prog(t, T.cobra, 0.4))
  const resalta = t >= T.razonamientoInterno
  const pulso = resalta ? 0.5 + 0.5 * Math.sin((t - T.razonamientoInterno) * 7) : 0
  const kInc = easeOutBack(prog(t, T.razonamientoInterno, 0.35), 2)
  const nBloques = 20
  let n = 0
  const anchoContador = anchoTexto('≈ 888 tokens', M.tamEt, 800) + 6
  const caja = (activo) => ({ padding: '12px 14px', background: 'rgba(5,7,13,0.8)', opacity: activo ? 1 : 0.3, display: 'flex', flexDirection: 'column', gap: 10 })
  const tamTotal = M.vertical ? 40 : 36
  return (
    <div style={{ width: w, height: h, padding: M.pad, background: `linear-gradient(180deg, ${COLORES.panel2}, ${COLORES.panel})`, boxShadow: bordePixel('#3a4770', 4), display: 'flex', flexDirection: 'column', justifyContent: 'space-between', transform: `translateY(${(1 - kA.k) * 90}px)`, opacity: kA.o, overflow: 'hidden', flex: 'none' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: M.vertical ? 10 : 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap' }}>
          {llms.map((e) => (
            <Pildora key={e.id} texto={e.nombre} color={e.color} tam={M.tamPill} />
          ))}
          <div style={{ flex: 1 }} />
          <Rotulo texto="EJEMPLO ILUSTRATIVO" tam={M.tamRot} />
        </div>
        <TituloPixel texto="MODELOS GENERATIVOS" tam={tamTit} color="#fff" />
        <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: M.tamSub, color: COLORES.texto, opacity: kSub, transform: `translateX(${(1 - kSub) * 30}px)`, whiteSpace: 'nowrap' }}>Razonan y escriben su respuesta.</div>
      </div>
      {/* Razonamiento interno */}
      <div style={{ ...caja(t >= R0 - 0.1), boxShadow: resalta ? `0 0 0 4px ${alfa(COLORES.ambar, 0.6 + 0.4 * pulso)}` : bordePixel('#2a3352', 3, false) }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: M.tamEt, color: '#e7b9ff', whiteSpace: 'nowrap' }}>razonamiento interno (no se ve)</span>
          <span style={{ width: anchoContador, textAlign: 'right', fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: M.tamEt, color: COLORES.texto, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>≈ {entero(tokR)} tokens</span>
        </div>
        <div style={{ display: 'flex', gap: 4, height: Math.round(M.tamEt * 0.9) }}>
          {Array.from({ length: nBloques }, (_, i) => (
            <div key={i} style={{ flex: 1, background: i / nBloques < kR ? (i % 3 === 0 ? '#8b66cc' : '#5b3f8f') : '#1c2238' }} />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: M.tamMon + 8 }}>
          <div style={{ opacity: t >= T.razonamientoInterno ? 1 : 0, transform: `scale(${t >= T.razonamientoInterno ? kInc : 0.5})`, transformOrigin: 'left center', fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: M.tamEt, color: '#1a1400', background: COLORES.ambar, padding: '3px 12px', whiteSpace: 'nowrap' }}>
            también se cobra
          </div>
          <Monedas n={Math.round(tokRazon / 10)} t={t} t0={R0} t1={R1} tam={M.tamMon} max={14} />
        </div>
      </div>
      {/* Respuesta escrita */}
      <div style={{ ...caja(t >= J0 - 0.1), boxShadow: bordePixel('#1f2a44', 3, false) }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: M.tamEt, color: '#8ff0b5', whiteSpace: 'nowrap' }}>respuesta que escribe</span>
          <span style={{ width: anchoContador, textAlign: 'right', fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: M.tamEt, color: COLORES.texto, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>≈ {entero(tokJ)} tokens</span>
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
          <Monedas n={Math.max(1, Math.round(tokJson / 10))} t={t} t0={J0} t1={J1} tam={M.tamMon} max={4} />
        </div>
      </div>
      {/* Se cobra cada token */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, transform: `scale(${0.7 + 0.3 * kCobra})`, transformOrigin: 'left center', opacity: clamp(kCobra * 2), whiteSpace: 'nowrap', padding: '10px 14px', background: alfa(COLORES.ambar, 0.12), boxShadow: `inset 0 0 0 3px ${alfa(COLORES.ambar, 0.55)}` }}>
        <Moneda alto={Math.round(tamTotal * 0.9)} />
        <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: M.tamSub, color: COLORES.ambar }}>Se cobra cada token:</span>
        <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamTotal, color: COLORES.texto, fontVariantNumeric: 'tabular-nums' }}>≈ {entero(tokTotal)}</span>
        <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: M.tamEt, color: COLORES.suave }}>tokens de salida</span>
      </div>
    </div>
  )
}

function PanelJev({ m, L, w, h, t }) {
  const M = medidas(L)
  const jev = m.porId.jev
  const v = m.ejemploDecisiones
  const interior = w - M.pad * 2
  const tamTit = tamParaAncho('MODELO DE DECISIÓN', interior * 0.75, M.tamTit, 14, 400, FUENTE_TITULO)
  const tamFila = M.vertical ? 30 : M.horizontal ? 30 : 26
  const kB = pop(t, T.jev, 0.45, 1.2)
  const kNo = easeOutBack(prog(t, T.noEscribe, 0.35), 2)
  const accion = v.verdad.accion
  const filas = [
    ['sello', '#ff8a9a', SELLO[accion].verbo, PROB_EJEMPLO.accion],
    ['barrera', '#c9cfe0', siNo(v.verdad.pasa), PROB_EJEMPLO.pasa],
    ['mascara', '#c9b6ff', siNo(v.verdad.miente), PROB_EJEMPLO.miente],
    ['peligro', '#ffc23d', `${v.verdad.peligro}/4`, PROB_EJEMPLO.peligro],
  ]
  // Hoja (lee el caso -> decisión) a la izquierda y probabilidades a la derecha (debajo en horizontal).
  const hojaW = M.horizontal ? Math.round(interior * 0.66) : Math.round(interior * 0.42)
  const hojaH = Math.round(hojaW * 0.5)
  const anchoValor = Math.max(...filas.map((f) => anchoTexto(f[2], tamFila, 800))) + 8
  const anchoPct = anchoTexto('100 %', tamFila, 800) + 4
  const g = golpe(t, T.decision, -5)
  // «Lee el caso»: el pasaporte del viajero entra a la hoja; con la decisión, sale.
  const kLee = easeOutCubic(prog(t, T.decision - 1.25, 0.45))
  const kSale = easeInOutCubic(prog(t, T.decision - 0.2, 0.3))
  const altoPas = Math.round(hojaH * 0.62)
  const tamCap = M.vertical ? 24 : 22
  const caption = t < T.decision ? 'lee el caso…' : 'decisión directa'
  const kCap = t < T.decision ? kLee : easeOutCubic(prog(t, T.decision, 0.3))
  return (
    <div style={{ width: w, height: h, padding: M.pad, background: `linear-gradient(180deg, ${COLORES.panel2}, ${COLORES.panel})`, boxShadow: bordePixel(tono(jev.color, -0.3), 4), display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10, transform: `translateY(${(1 - kB.k) * 90}px)`, opacity: kB.o, overflow: 'hidden', flex: 'none' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: M.vertical ? 10 : 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Pildora texto={jev.nombre} color={jev.color} tam={M.tamPill} />
          <div style={{ flex: 1 }} />
          <Rotulo texto="EJEMPLO ILUSTRATIVO" tam={M.tamRot} />
        </div>
        <TituloPixel texto="MODELO DE DECISIÓN" tam={tamTit} color="#fff" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, whiteSpace: 'nowrap', opacity: clamp(kNo * 2), transform: `scale(${0.7 + 0.3 * kNo})`, transformOrigin: 'left center', height: M.tamSub * 1.25 }}>
          <div style={{ position: 'relative', fontFamily: FUENTE_MONO, fontSize: M.tamSub * 0.85, color: '#7f8bb0', padding: '0 6px' }}>
            {'{ … }'}
            <div style={{ position: 'absolute', left: -4, right: -4, top: '50%', height: 5, background: '#ff4d5e', transform: 'rotate(-12deg)' }} />
          </div>
          <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: M.tamSub, color: COLORES.texto }}>No escribe: decide.</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: M.horizontal ? 'column' : 'row', alignItems: M.horizontal ? 'stretch' : 'center', gap: M.horizontal ? 18 : 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 'none', alignItems: 'flex-start' }}>
          <Hoja w={hojaW} h={hojaH} style={{ transform: `translate(${g.sacudida * 4}px, ${g.sacudida * 5}px)` }}>
            {/* El pasaporte del viajero entra a leerse y sale cuando cae la decisión. */}
            {kLee > 0 && kSale < 1 && (
              <div style={{ position: 'absolute', left: hojaW * 0.5 - altoPas * 0.4, top: (hojaH - altoPas) / 2, transform: `translateX(${(1 - kLee) * -hojaW * 0.7 + kSale * hojaW * 0.7}px) rotate(${(1 - kLee) * -12}deg)`, opacity: clamp(kLee * 2) * (1 - kSale) }}>
                <PasaporteCerrado alto={altoPas} color={colorNacion(v.documento.nacionalidad)} />
              </div>
            )}
            {g.visible && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sello accion={accion} t={t} t0={T.decision} ancho={hojaW * 0.84} alto={hojaH * 0.6} rot={-6} clave="jev-ej" sobrePapel />
              </div>
            )}
          </Hoja>
          <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: tamCap, color: COLORES.suave, opacity: kCap, whiteSpace: 'nowrap', height: tamCap * 1.25 }}>{caption}</div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: M.vertical ? 12 : 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: clamp(prog(t, T.seguridad - 0.1, 0.3) * 2), whiteSpace: 'nowrap' }}>
            <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: tamCap, color: COLORES.suave }}>qué tan seguro está</span>
            <Rotulo texto="valores de ejemplo" tam={tamCap - 4} color={COLORES.suave} />
          </div>
          {filas.map(([ic, col, val, p], i) => {
            const k = easeOutBack(prog(t, T.seguridad + i * 0.08, 0.3))
            const kb = easeOutCubic(prog(t, T.seguridad + 0.1 + i * 0.08, 0.5))
            return (
              <div key={ic} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: clamp(k * 2), transform: `scale(${0.85 + 0.15 * k})`, transformOrigin: 'left center' }}>
                <div style={{ width: Math.round(tamFila * 1.2), display: 'flex', justifyContent: 'center', flex: 'none' }}>
                  <Icono nombre={ic} alto={Math.round(tamFila * 0.9)} color={col} claro="#141a2c" extra={{ R: '#e5383b', W: '#f5f5f5' }} />
                </div>
                <div style={{ width: anchoValor, flex: 'none', fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamFila, color: '#fff', whiteSpace: 'nowrap' }}>{val}</div>
                <div style={{ flex: 1, height: Math.round(tamFila * 0.55), background: '#262d45', position: 'relative' }}>
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
  const tamTitulo = tamParaAncho('¿CÓMO RESPONDE CADA UNA?', C.w * 0.95, vertical ? 32 : 30, 14, 400, FUENTE_TITULO)
  const altoTitulo = Math.round(tamTitulo * 1.6)
  const gap = vertical ? 18 : 16
  const kT = easeOutBack(prog(t, 26.85, 0.4))
  const zonaH = C.h - altoTitulo - gap
  const wA = horizontal ? Math.round((C.w - gap) * 0.535) : C.w
  const wB = horizontal ? C.w - gap - wA : C.w
  const hA = horizontal ? zonaH : Math.round((zonaH - gap) * 0.57)
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
            <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 3px rgba(120,135,180,0.3)', background: 'rgba(10,12,22,0.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
              <div style={{ fontFamily: FUENTE_TITULO, fontSize: Math.round(tamTitulo * 1.1), color: alfa(m.porId.jev.color, 0.55) }}>
                <TextoPixel>Y JEV…</TextoPixel>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
