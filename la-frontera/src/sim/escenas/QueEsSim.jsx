// Qué es (8.2 - 17.2 s): «Armé una simulación de cómo funcionarían GPT-6 Astra, Claude Opus 5.5 y Jev
// en un juego estilo Papers, Please.» La cabina del puesto y las tres columnas, que aparecen cuando
// la voz nombra a cada cerebro; el pasaporte y el sello de goma al decir «Papers, Please».

import { clamp, easeInCubic, easeOutBack, easeOutCubic, golpe, prog } from '../../lib/anim.js'
import { FUENTE_TEXTO, FUENTE_TITULO, tamParaAncho } from '../../lib/medir.js'
import { COLORES, alfa, tono } from '../../lib/textos.js'
import { bordePixel } from '../../componentes/ui.jsx'
import { Retrato } from '../../componentes/Retrato.jsx'
import { Icono } from '../../componentes/Pixel.jsx'
import { T } from '../tiempos.js'
import { partir, tamPara, usdNB } from '../texto.js'
import { cajasJuego, ColumnaSim } from '../columnas.jsx'
import { Chip, Moneda, PasaporteCerrado, SelloGoma, TituloPixel, Ventanilla } from '../piezas.jsx'

const FILA = [6, 11, 19, 27]

// Qué tipo de modelo es cada uno (lo mismo que dice la voz más adelante).
const TIPO = { gpt: 'modelo generativo', opus: 'modelo generativo', jev: 'modelo de decisión' }

function Fila({ m, w, h, t }) {
  // Viajeros esperando su turno (decorativo), del más cercano al más lejano.
  const base = Math.min(h * 0.62, w * 0.5)
  return FILA.map((idx, i) => {
    const tam = Math.round(base * (1 - i * 0.2))
    const x = w * 0.08 + i * base * 0.62
    const y = h - Math.max(14, h * 0.07) - tam + 4 - Math.abs(Math.sin(t * 2.2 + i * 1.3)) * 6
    return (
      <div key={idx} style={{ position: 'absolute', left: x, top: y, zIndex: 10 - i, filter: `brightness(${1 - i * 0.16})` }}>
        <Retrato semilla={m.viajeros[idx].semilla} tam={tam} t={t} />
      </div>
    )
  }).reverse()
}

function Cartel({ tam }) {
  return (
    <div style={{ position: 'absolute', left: '50%', top: 22, transform: 'translateX(-50%)', padding: `${Math.round(tam * 0.45)}px ${Math.round(tam * 0.7)}px`, background: '#1b2138', boxShadow: bordePixel('#0b0d18', 3), fontFamily: FUENTE_TITULO, fontSize: tam, color: COLORES.ambar, whiteSpace: 'nowrap', zIndex: 20 }}>
      PUESTO FRONTERIZO
    </div>
  )
}

// Referencia visual a Papers, Please: pasaporte + hoja, y el sello de goma que baja y golpea.
// Todo dentro de una caja de alto fijo (`altoCaja`): el sello nunca se sale hacia el texto de arriba.
function alturaPapers(alto) {
  return Math.round(alto * 1.7)
}

function Papers({ t, alto, w, L }) {
  const k = easeOutCubic(prog(t, T.papers - 0.1, 0.4))
  const altoCaja = alturaPapers(alto)
  const tGolpe = T.papers + 0.45
  // Posición del sello: arriba (0) -> sobre la hoja (1) -> vuelve a subir un poco.
  const baja = t < tGolpe ? easeInCubic(prog(t, T.papers, 0.45)) : 1 - easeOutCubic(prog(t, tGolpe + 0.15, 0.4)) * 0.55
  const g = golpe(t, tGolpe, -10, 1.4, 0.12)
  const hojaW = Math.round(alto * 1.3)
  const pasW = Math.round(alto * 0.8)
  const altoSello = Math.round(alto * 0.82)
  const yHoja = altoCaja - alto
  const ySello = yHoja - altoSello + alto * 0.55
  const top = ySello * baja
  const caption = 'juego estilo Papers, Please'
  const tamCap = tamParaAncho(caption, w - 8, L.formato === 'vertical' ? 34 : 30, 22, 800)
  const sub = 'inspirado en el juego de Lucas Pope'
  const tamSub = tamParaAncho(sub, w - 8, L.formato === 'vertical' ? 26 : 24, 20, 600)
  // El texto va debajo del pasaporte y la hoja, a todo el ancho (más grande y legible).
  const textoAlLado = false
  return (
    <div style={{ position: 'relative', height: altoCaja + (textoAlLado ? 0 : L.fs.base * 1.3 + L.fs.mini * 1.3 + 8), opacity: clamp(k * 2), transform: `translateY(${(1 - k) * 30}px)` }}>
      <div style={{ position: 'absolute', left: 0, top: yHoja }}>
        <PasaporteCerrado alto={alto} />
      </div>
      <div style={{ position: 'absolute', left: pasW + 18, top: yHoja, width: hojaW, height: alto, background: `linear-gradient(180deg, ${COLORES.papel}, ${COLORES.papelOscuro})`, boxShadow: bordePixel('#5b4a33', 3) }}>
        {g.visible && (
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: alto * 0.7, height: alto * 0.7, marginLeft: -alto * 0.35, marginTop: -alto * 0.35, borderRadius: '50%', border: `${Math.max(3, Math.round(alto * 0.06))}px solid #c0392b`, transform: `rotate(${g.rot}deg) scale(${g.escala})`, opacity: g.o * 0.9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icono nombre="estrella" alto={Math.round(alto * 0.3)} color="#c0392b" />
          </div>
        )}
      </div>
      <div style={{ position: 'absolute', left: pasW + 18 + hojaW * 0.5 - altoSello * 0.64, top }}>
        <SelloGoma alto={altoSello} />
      </div>
      <div style={textoAlLado ? { position: 'absolute', left: pasW + hojaW + 50, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 6 } : { position: 'absolute', left: 0, top: altoCaja + 8 }}>
        <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamCap, color: COLORES.texto, whiteSpace: 'nowrap', lineHeight: 1.2 }}>{caption}</div>
        <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: tamSub, color: COLORES.suave, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{sub}</div>
      </div>
    </div>
  )
}

function CuerpoCerebro({ e, t, t0, L, presupuesto, h }) {
  const vertical = L.formato === 'vertical'
  const horizontal = L.orientacion === 'horizontal'
  const k = easeOutBack(prog(t, t0 + 0.2, 0.45), 2)
  const kTipo = easeOutCubic(prog(t, t0 + 0.45, 0.4))
  const tamChip = Math.round(Math.min(vertical ? 150 : horizontal ? 150 : 120, h * 0.32))
  const tamP = vertical ? 30 : 26
  const tamTipo = vertical ? 26 : 23
  const brillo = 0.35 + 0.25 * Math.sin(t * 3 + t0)
  const tipo = TIPO[e.id] ?? ''
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-evenly', padding: '12px 14px 18px' }}>
      <div style={{ transform: `scale(${0.4 + 0.6 * k})`, opacity: clamp(k * 2) }}>
        <div style={{ padding: 22, background: `radial-gradient(closest-side, ${alfa(e.color, brillo)}, transparent)` }}>
          <Chip color={e.color} alto={tamChip} />
        </div>
      </div>
      <div style={{ padding: '6px 12px', background: alfa(e.color, 0.16), boxShadow: `inset 0 0 0 3px ${alfa(e.color, 0.7)}`, fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamTipo, color: tono(e.color, 0.45), whiteSpace: 'nowrap', opacity: kTipo, transform: `translateY(${(1 - kTipo) * 14}px)` }}>
        {tipo}
      </div>
      <div style={{ width: '100%' }}>
        <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: vertical ? 24 : 22, color: COLORES.suave, whiteSpace: 'nowrap' }}>presupuesto</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamP, color: COLORES.texto, whiteSpace: 'nowrap', marginTop: 2 }}>
          <Moneda alto={Math.round(tamP * 0.85)} />
          {usdNB(presupuesto)}
        </div>
        <div style={{ marginTop: 8, height: 16, background: e.color, boxShadow: bordePixel('#0a0c16', 3, false) }} />
      </div>
    </div>
  )
}

export function QueEsSim({ m, L, t }) {
  const horizontal = L.orientacion === 'horizontal'
  const vertical = L.formato === 'vertical'
  const C = L.contenido
  // Alto de la cabina (vertical/feed): lo que cabe arriba de las columnas, sin apretarlas demasiado.
  const cabinaH = vertical ? Math.round(Math.min(520, C.h * 0.45)) : Math.round(Math.min(440, C.h * 0.44))
  const { cabina, columnas } = cajasJuego(L, cabinaH)
  const kCab = easeOutCubic(prog(t, 8.2, 0.5))
  // Ventanilla + información (a la derecha en vertical/feed, debajo en horizontal).
  const winH = horizontal ? Math.round(cabina.h * 0.44) : cabina.h
  const win = horizontal ? { x: 0, y: 0, w: cabina.w, h: winH } : { x: 0, y: 0, w: Math.round(cabina.w * 0.42), h: cabina.h }
  const info = horizontal ? { x: 0, y: win.h + 22, w: cabina.w, h: cabina.h - win.h - 22 } : { x: win.w + 24, y: 0, w: cabina.w - win.w - 24, h: cabina.h }
  const tamT = tamParaAncho('UNA SIMULACIÓN', info.w - 8, vertical ? 34 : 30, 18, 400, FUENTE_TITULO)
  const texto = '¿Cómo funcionarían tres cerebros en el mismo puesto fronterizo?'
  const altoPapers = Math.round(Math.min(vertical ? 104 : 92, info.w * 0.2))
  const tamTexto = tamPara(texto, info.w - 8, 3, vertical ? 34 : 30, L.fs.mini, 700)
  const lineas = partir(texto, info.w - 8, tamTexto, 700)
  const kS = easeOutBack(prog(t, T.simulacion, 0.4))
  const kTx = easeOutCubic(prog(t, T.simulacion + 0.35, 0.45))
  const tamCartel = Math.round(Math.min(22, win.w / 22))
  return (
    <>
      <div style={{ position: 'absolute', left: cabina.x, top: cabina.y, width: cabina.w, height: cabina.h, transform: `translateY(${(1 - kCab) * -60}px)`, opacity: clamp(kCab * 1.6) }}>
        <div style={{ position: 'absolute', left: win.x, top: win.y, width: win.w, height: win.h }}>
          <Ventanilla w={win.w} h={win.h}>
            <Cartel tam={tamCartel} />
            <Fila m={m} w={win.w} h={win.h} t={t} />
          </Ventanilla>
        </div>
        <div style={{ position: 'absolute', left: info.x, top: info.y, width: info.w, height: info.h, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: vertical ? 14 : 12 }}>
          <div style={{ transform: `scale(${0.7 + 0.3 * kS})`, transformOrigin: 'left center', opacity: clamp(kS * 2) }}>
            <TituloPixel texto="UNA SIMULACIÓN" tam={tamT} />
          </div>
          <div style={{ opacity: kTx, transform: `translateY(${(1 - kTx) * 20}px)`, fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: tamTexto, lineHeight: 1.22, color: COLORES.texto, textShadow: '0 3px 0 #000' }}>
            {lineas.map((l, i) => (
              <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>
            ))}
          </div>
          {t >= T.papers - 0.1 && <Papers t={t} alto={altoPapers} w={info.w} L={L} />}
        </div>
      </div>
      {m.estimaciones.map((e, i) => {
        const t0 = T.columnas[e.id]
        const k = easeOutBack(prog(t, t0 - 0.12, 0.5), 1.15)
        if (t < t0 - 0.12) return null
        return (
          <ColumnaSim key={e.id} e={e} caja={columnas[i]} L={L} kEntrada={k}>
            <CuerpoCerebro e={e} t={t} t0={t0} L={L} presupuesto={m.presupuestoUSD} h={columnas[i].h - 130} />
          </ColumnaSim>
        )
      })}
    </>
  )
}
