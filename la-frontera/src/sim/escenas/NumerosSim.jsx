// Los números (50.8 - 71.3 s). Todo ESTIMADO con shared/simulacion.js (precios publicados × tokens supuestos).
// (a) «Con los precios publicados de cada API, una decisión así costaría más o menos un centavo y medio
//      con GPT, medio centavo con Opus… y con Jev, unas milésimas de centavo.»
// (b) «Eso quiere decir: con 25 centavos, GPT atendería unos 15 viajeros, Opus unos 40… y Jev, miles de viajeros.»

import { usd } from '../../../shared/formato.js'
import { centavos, decisionesRedondas } from '../../../shared/simulacion-video.js'
import { clamp, easeInCubic, easeOutBack, easeOutCubic, golpe, prog } from '../../lib/anim.js'
import { FUENTE_TEXTO, FUENTE_TITULO, anchoTexto, partirLineas, tamParaAncho } from '../../lib/medir.js'
import { COLORES, alfa, numeroPrecio, tono } from '../../lib/textos.js'
import { Retrato } from '../../componentes/Retrato.jsx'
import { bordePixel, TextoPixel } from '../../componentes/ui.jsx'
import { T } from '../tiempos.js'
import { Moneda, Rotulo, TituloPixel, fondoTenido } from '../piezas.jsx'
import { NB, partir, usdNB } from '../texto.js'

const FIN_A = T.presupuestoSim

function Encabezado({ titulo, sub, rotulo, L, w, t, t0 }) {
  const vertical = L.formato === 'vertical'
  const tamT = tamParaAncho(titulo, w * 0.96, vertical ? 34 : 32, 14, 400, FUENTE_TITULO)
  const tamS = vertical ? 30 : 26
  const k = easeOutBack(prog(t, t0, 0.4))
  const kS = easeOutCubic(prog(t, t0 + 0.25, 0.4))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ transform: `scale(${0.6 + 0.4 * k})`, opacity: clamp(k * 2) }}>
        <TituloPixel texto={titulo} tam={tamT} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: kS, flexWrap: 'wrap', justifyContent: 'center' }}>
        <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: tamS, color: COLORES.texto, whiteSpace: 'nowrap', textShadow: '0 3px 0 #000' }}>{sub}</span>
        <Rotulo texto={rotulo} tam={vertical ? 22 : 20} />
      </div>
    </div>
  )
}

function FuentePrecio({ e, tam }) {
  const ok = e.precio.verificado !== false
  return (
    <span style={{ padding: '2px 8px', fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tam, whiteSpace: 'nowrap', color: ok ? '#8ff0b5' : COLORES.ambar, boxShadow: `inset 0 0 0 2px ${ok ? '#2f8f5a' : '#a07a16'}` }}>
      {ok ? 'precio oficial' : 'precio de fuentes secundarias'}
    </span>
  )
}

// (a) Costo estimado por decisión: barras en escala lineal (Jev casi no se ve: es la diferencia real).
function FilaCosto({ e, L, w, h, t, escalaMax, t0Fila }) {
  const vertical = L.formato === 'vertical'
  const horizontal = L.orientacion === 'horizontal'
  const pad = vertical ? 18 : 14
  const tCosto = T.costo[e.id]
  const kF = easeOutCubic(prog(t, t0Fila, 0.4))
  const kN = easeOutBack(prog(t, tCosto, 0.45), 1.8)
  const kB = easeOutCubic(prog(t, tCosto + 0.1, 0.7))
  const tamNombre = vertical ? 38 : 32
  const tamMini = vertical ? 24 : 21
  const tamBig = vertical ? 64 : horizontal ? 60 : 54
  const textoBig = `≈ ${centavos(e.costo.central)} ¢`
  const precio = `US$${NB}${numeroPrecio(e.precio.entradaPorMTok)}${NB}/${NB}${numeroPrecio(e.precio.salidaPorMTok)} por millón de tokens (entrada${NB}/${NB}salida)`
  const esJev = e.id === 'jev'
  const rango = esJev
    ? `≈${NB}${usdNB(e.costo.central)} · ≈${e.tokensEntrada} tokens de entrada, no escribe texto`
    : `≈${NB}${usdNB(e.costo.central)} · rango ${centavos(e.costo.minimo)}–${centavos(e.costo.maximo)}${NB}¢`
  const anchoBarra = horizontal ? w - 2 * pad - 560 - 330 : w - 2 * pad
  const fx = (x) => Math.max(3, (x / escalaMax) * anchoBarra)
  const barra = (
    <div style={{ position: 'relative', width: anchoBarra, height: vertical ? 34 : 28, background: '#1b2136', boxShadow: bordePixel('#0a0c16', 3, false), flex: 'none' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: fx(e.costo.central) * kB, background: `linear-gradient(180deg, ${tono(e.color, 0.2)}, ${e.color})` }} />
      {!esJev && kB > 0.6 && (
        <>
          {/* rango (40 a 300 tokens de salida) */}
          <div style={{ position: 'absolute', left: fx(e.costo.minimo), width: fx(e.costo.maximo) - fx(e.costo.minimo), top: '50%', height: 4, marginTop: -2, background: '#fff', opacity: clamp((kB - 0.6) * 3) }} />
          <div style={{ position: 'absolute', left: fx(e.costo.minimo) - 2, top: 4, bottom: 4, width: 4, background: '#fff', opacity: clamp((kB - 0.6) * 3) }} />
          <div style={{ position: 'absolute', left: fx(e.costo.maximo) - 2, top: 4, bottom: 4, width: 4, background: '#fff', opacity: clamp((kB - 0.6) * 3) }} />
        </>
      )}
    </div>
  )
  const numero = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: horizontal ? 'flex-end' : 'flex-start', minWidth: horizontal ? 330 : 0 }}>
      <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamBig, lineHeight: 1, color: t >= tCosto ? COLORES.ambar : 'rgba(180,190,215,0.25)', transform: `scale(${t >= tCosto ? 0.6 + 0.4 * kN : 1})`, transformOrigin: horizontal ? 'right center' : 'left center', whiteSpace: 'nowrap', textShadow: '0 4px 0 #000', fontVariantNumeric: 'tabular-nums' }}>
        {t >= tCosto ? textoBig : '≈ ? ¢'}
      </div>
      <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: tamMini, color: COLORES.suave, marginTop: 6, opacity: t >= tCosto ? clamp(kN * 2) : 0, whiteSpace: 'nowrap' }}>{rango}</div>
    </div>
  )
  const lineasPrecio = partir(precio, horizontal ? 540 : w - 2 * pad, tamMini, 600)
  const infoNombre = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: horizontal ? 540 : 'auto', flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: horizontal ? 'flex-start' : 'space-between', gap: 12 }}>
        <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamNombre, color: tono(e.color, 0.3), whiteSpace: 'nowrap' }}>{e.nombre}</span>
        <FuentePrecio e={e} tam={tamMini - 2} />
      </div>
      {lineasPrecio.map((l, i) => (
        <div key={i} style={{ fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: tamMini, color: COLORES.suave, whiteSpace: 'nowrap', lineHeight: 1.2 }}>{l}</div>
      ))}
    </div>
  )
  return (
    <div style={{ width: w, height: h, padding: pad, background: fondoTenido(e.color), boxShadow: bordePixel(tono(e.color, -0.4), 4), display: 'flex', flexDirection: horizontal ? 'row' : 'column', alignItems: horizontal ? 'center' : 'stretch', justifyContent: 'center', gap: horizontal ? 0 : vertical ? 10 : 8, opacity: clamp(kF * 2), transform: `translateX(${(1 - kF) * 120}px)`, flex: 'none' }}>
      {infoNombre}
      {horizontal ? (
        <>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>{barra}</div>
          {numero}
        </>
      ) : (
        <>
          {numero}
          {barra}
        </>
      )}
    </div>
  )
}

function ParteA({ m, L, t, C }) {
  const vertical = L.formato === 'vertical'
  const horizontal = L.orientacion === 'horizontal'
  const gap = vertical ? 16 : 14
  const escalaMax = Math.max(...m.estimaciones.map((e) => e.costo.maximo)) * 1.04
  const s = m.supuestos
  const tokLLM = m.porId.gpt.tokensEntrada
  const tokJev = m.porId.jev.tokensEntrada
  const nota = `¢${NB}=${NB}centavo de dólar · supuestos: ≈${tokLLM} tokens de entrada (Jev${NB}≈${tokJev}); GPT y Opus escriben ${s.salidaLLM.minimo}–${s.salidaLLM.maximo} tokens (${s.salidaLLM.central} en el centro)`
  const tamNota = vertical ? 24 : 21
  const lineasNota = partir(nota, C.w - 20, tamNota, 600)
  const altoEnc = vertical ? 110 : 96
  const altoNota = lineasNota.length * tamNota * 1.25
  const hFila = Math.floor(Math.min((C.h - altoEnc - altoNota - gap * 4) / 3, horizontal ? 200 : 270))
  const kNota = easeOutCubic(prog(t, T.precios + 1.0, 0.5))
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap }}>
      <div style={{ height: altoEnc, display: 'flex', alignItems: 'center' }}>
        <Encabezado titulo="COSTO ESTIMADO POR DECISIÓN" sub="con los precios publicados de cada API" rotulo="ESTIMADO" L={L} w={C.w} t={t} t0={50.85} />
      </div>
      {m.estimaciones.map((e, i) => (
        <FilaCosto key={e.id} e={e} L={L} w={C.w} h={hFila} t={t} escalaMax={escalaMax} t0Fila={T.precios + 0.15 + i * 0.25} />
      ))}
      <div style={{ opacity: kNota, textAlign: 'center' }}>
        {lineasNota.map((l, i) => (
          <div key={i} style={{ fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: tamNota, lineHeight: 1.25, color: COLORES.suave, whiteSpace: 'nowrap', textShadow: '0 2px 0 #000' }}>{l}</div>
        ))}
      </div>
    </div>
  )
}

// (b) Simulación del presupuesto: cuántos viajeros alcanza a atender cada uno con US$ 0.25.
function atendidos(e, t) {
  const t0 = T.drenado
  const t1 = T.agotado[e.id]
  const N = e.decisiones.central
  const p = clamp((t - t0) / (t1 - t0))
  // Jev acelera (son miles); GPT y Opus van a ritmo constante: uno por uno.
  const f = e.id === 'jev' ? p ** 2.4 : p
  return N * f
}

function Carril({ m, e, i, L, w, h, t }) {
  const vertical = L.formato === 'vertical'
  const horizontal = L.orientacion === 'horizontal'
  const pad = vertical ? 16 : 14
  const n = atendidos(e, t)
  const nEntero = Math.floor(n + 1e-9)
  const esJev = e.id === 'jev'
  const gastado = Math.min(m.presupuestoUSD, (esJev ? n : nEntero) * e.costo.central)
  const queda = Math.max(0, m.presupuestoUSD - gastado)
  const frac = queda / m.presupuestoUSD
  const tFin = T.agotado[e.id]
  const fin = t >= tFin
  const kIn = easeOutCubic(prog(t, FIN_A + 0.1 + i * 0.12, 0.45))
  const tamNombre = vertical ? 36 : 32
  const tamMini = vertical ? 24 : 22
  const tamCont = vertical ? 62 : horizontal ? 60 : 54
  const textoCont = esJev && fin ? `≈${decisionesRedondas(e.decisiones.central)}` : nEntero.toLocaleString('es-419')
  const anchoCont = Math.max(anchoTexto('≈8,888', tamCont, 800), anchoTexto('viajeros · estimado', tamMini, 700))
  // Carril de viajeros (pixel art): pasan por la barrera de la izquierda, uno por decisión.
  const anchoNombre = horizontal ? 300 : 0
  // En horizontal, «presupuesto  queda US$ 0.000088» (el texto más largo posible) cabe en su columna.
  const anchoPresTexto = Math.ceil(tamMini + 8 + anchoTexto('presupuesto', tamMini, 700) + 12 + anchoTexto(`queda ${usd(0.000088)}`, tamMini, 800))
  const anchoPres = horizontal ? Math.max(330, anchoPresTexto) : 0
  const laneW = horizontal ? w - 2 * pad - anchoNombre - anchoCont - anchoPres - 3 * 24 : w - 2 * pad
  // En vertical y feed, el carril usa el alto que dejan la cabecera (nombre y contador) y el
  // presupuesto, para que la barra no se salga del panel (ni quede debajo de los subtítulos).
  const altoCabecera = Math.max(tamNombre * 1.25 + 4 + tamMini * 1.25, tamCont + 4 + tamMini * 1.25)
  const altoPres = tamMini * 1.25 + 6 + (vertical ? 30 : 26)
  const laneH = horizontal ? h - 2 * pad : Math.max(60, Math.min(Math.round(h * 0.38), Math.floor(h - 2 * pad - altoCabecera - altoPres - 2 * 8 - 4)))
  const tamRet = Math.round(laneH * 0.8)
  const esp = tamRet * 1.18
  const gateX = Math.round(Math.min(laneW * 0.16, 150))
  const tMov = Math.max(0, Math.min(t, tFin) - T.drenado)
  const desplaz = esJev ? tMov * 9 : n
  const visibles = Math.ceil(laneW / esp) + 3
  const base = Math.floor(desplaz)
  const frac0 = desplaz - base
  const personas = []
  for (let j = -2; j < visibles; j++) {
    const idx = base + j
    if (idx < 0) continue
    const x = gateX + (j - frac0) * esp
    if (x < -esp || x > laneW + esp) continue
    const v = m.viajeros[(idx * 7 + i * 3) % m.viajeros.length]
    const paso = x < gateX
    const salto = Math.abs(Math.sin((x / esp) * Math.PI)) * 6
    personas.push(
      <div key={idx} style={{ position: 'absolute', left: x, top: laneH - tamRet - 8 - salto, opacity: paso ? clamp(1 + (x - gateX) / (gateX + esp)) * 0.85 : 1, filter: fin && !esJev && !paso ? 'grayscale(0.9) brightness(0.55)' : 'none' }}>
        <Retrato semilla={v.semilla} tam={tamRet} t={t} />
      </div>,
    )
  }
  const lineasVel = esJev && t > T.drenado && !fin
    ? Array.from({ length: 6 }, (_, k) => {
        const y = 10 + ((k * 37) % Math.max(20, laneH - 20))
        const x = ((t * 1400 + k * 230) % (laneW + 300)) - 150
        return <div key={k} style={{ position: 'absolute', left: laneW - x, top: y, width: 120, height: 4, background: alfa('#cfe0ff', 0.55) }} />
      })
    : null
  // Sello al terminar: GPT y Opus se quedan sin presupuesto; Jev llega a miles de viajeros.
  const g = golpe(t, tFin, -4, 1.5, 0.14)
  const tamSello = vertical ? 30 : horizontal ? 28 : 26
  const tituloSello = esJev ? 'MILES DE VIAJEROS' : 'SIN PRESUPUESTO'
  const subSello = esJev
    ? `≈${decisionesRedondas(e.decisiones.central)} con ${usdNB(m.presupuestoUSD)} · estimado`
    : `≈${e.decisiones.central} viajeros · rango ${e.decisiones.minimo}–${e.decisiones.maximo} · estimado`
  // El sello no es más alto que el carril (no tapa el contador ni el presupuesto).
  const tamTitSello = tamParaAncho(tituloSello, laneW * 0.9 - 40, Math.min(tamSello, Math.floor(laneH * 0.3)), 16, 400, FUENTE_TITULO)
  const tamSubSello = tamParaAncho(subSello, laneW * 0.9 - 40, Math.min(tamMini + 2, Math.floor(laneH * 0.24)), 18, 800)
  const carril = (
    <div style={{ position: 'relative', width: laneW, height: laneH, flex: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #151829, #1d2136)', boxShadow: bordePixel('#2a3150', 3, false), overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, background: 'repeating-linear-gradient(90deg, #3a3f5a 0 30px, #30344c 30px 60px)' }} />
        {personas}
        {lineasVel}
        <div style={{ position: 'absolute', left: gateX - 6, top: 0, bottom: 0, width: 8, background: 'repeating-linear-gradient(180deg, #e5383b 0 14px, #f6f2e9 14px 28px)', opacity: 0.85 }} />
        {fin && !esJev && <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,8,14,0.35)' }} />}
      </div>
      {g.visible && (
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%, -50%) rotate(${g.rot}deg) scale(${g.escala})`, opacity: g.o, padding: '10px 20px', background: esJev ? 'rgba(10,20,50,0.94)' : 'rgba(40,6,12,0.94)', boxShadow: `inset 0 0 0 5px ${esJev ? '#4f7cff' : '#e5383b'}, 0 6px 0 rgba(0,0,0,0.5)`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 5, whiteSpace: 'nowrap' }}>
          <div style={{ fontFamily: FUENTE_TITULO, fontSize: tamTitSello, lineHeight: 1.1, color: esJev ? '#9db8ff' : '#ff6b6e' }}>
            <TextoPixel>{tituloSello}</TextoPixel>
          </div>
          <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamSubSello, lineHeight: 1.1, color: '#fff' }}>{subSello}</div>
        </div>
      )}
    </div>
  )
  const contador = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: anchoCont, flex: 'none' }}>
      <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamCont, lineHeight: 1, color: fin ? tono(e.color, 0.35) : COLORES.texto, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textShadow: '0 4px 0 #000' }}>{textoCont}</div>
      <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: tamMini, color: COLORES.suave, whiteSpace: 'nowrap', marginTop: 4 }}>viajeros · estimado</div>
    </div>
  )
  const presupuesto = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: horizontal ? anchoPres : '100%', flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: tamMini, color: COLORES.suave, whiteSpace: 'nowrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Moneda alto={tamMini} />
          presupuesto
        </span>
        <span style={{ color: COLORES.texto, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>queda {usd(queda)}</span>
      </div>
      <div style={{ position: 'relative', height: vertical ? 30 : 26, background: '#20263b', boxShadow: bordePixel('#0a0c16', 3, false) }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${frac * 100}%`, background: frac < 0.15 ? '#ff4d5e' : e.color }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '35%', background: 'rgba(255,255,255,0.15)' }} />
      </div>
    </div>
  )
  const nombre = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: horizontal ? anchoNombre : 'auto', flex: horizontal ? 'none' : 1, minWidth: 0 }}>
      <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamNombre, color: tono(e.color, 0.3), whiteSpace: 'nowrap' }}>{e.nombre}</span>
      <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: tamMini, color: COLORES.suave, whiteSpace: 'nowrap' }}>≈{NB}{centavos(e.costo.central)}{NB}¢ por decisión</span>
    </div>
  )
  return (
    <div style={{ position: 'relative', width: w, height: h, padding: pad, background: fondoTenido(e.color), boxShadow: bordePixel(tono(e.color, -0.4), 4), display: 'flex', flexDirection: horizontal ? 'row' : 'column', alignItems: horizontal ? 'center' : 'stretch', justifyContent: 'space-between', gap: horizontal ? 24 : 8, opacity: clamp(kIn * 2), transform: `translateX(${(1 - kIn) * 160}px)`, flex: 'none' }}>
      {horizontal ? (
        <>
          {nombre}
          {carril}
          {contador}
          {presupuesto}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            {nombre}
            {contador}
          </div>
          {carril}
          {presupuesto}
        </>
      )}
    </div>
  )
}

function ParteB({ m, L, t, C }) {
  const vertical = L.formato === 'vertical'
  const horizontal = L.orientacion === 'horizontal'
  const gap = vertical ? 16 : 14
  const altoEnc = vertical ? 110 : 96
  const hCarril = Math.floor(Math.min((C.h - altoEnc - gap * 3) / 3, horizontal ? 200 : 300))
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap }}>
      <div style={{ height: altoEnc, display: 'flex', alignItems: 'center' }}>
        <Encabezado titulo="SIMULACIÓN DEL PRESUPUESTO" sub={`con ${usd(m.presupuestoUSD)} para cada una`} rotulo="ESTIMADO" L={L} w={C.w} t={t} t0={FIN_A + 0.05} />
      </div>
      {m.estimaciones.map((e, i) => (
        <Carril key={e.id} m={m} e={e} i={i} L={L} w={C.w} h={hCarril} t={t} />
      ))}
    </div>
  )
}

export function NumerosSim({ m, L, t }) {
  const C = L.contenido
  // Cambio de (a) a (b): (a) sale hacia la izquierda y (b) entra desde la derecha.
  const kSal = easeInCubic(prog(t, FIN_A - 0.35, 0.35))
  return (
    <div style={{ position: 'absolute', left: C.x, top: C.y, width: C.w, height: C.h }}>
      {t < FIN_A && (
        <div style={{ position: 'absolute', inset: 0, transform: `translateX(${-kSal * C.w * 0.6}px)`, opacity: 1 - kSal }}>
          <ParteA m={m} L={L} t={t} C={C} />
        </div>
      )}
      {t >= FIN_A && <ParteB m={m} L={L} t={t} C={C} />}
    </div>
  )
}

