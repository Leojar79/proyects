// Qué es (8.2 - 17.2 s): «Armé una simulación de cómo funcionarían GPT-6 Astra, Claude Opus 5.5 y Jev
// en un juego estilo Papers, Please.» La cabina del puesto y las tres columnas, que aparecen cuando
// la voz nombra a cada cerebro; el pasaporte y el sello de goma al decir «Papers, Please».

import { usd } from '../../../shared/formato.js'
import { clamp, easeInCubic, easeOutBack, easeOutCubic, golpe, prog } from '../../lib/anim.js'
import { FUENTE_TEXTO, FUENTE_TITULO, partirLineas, tamParaAncho, tamParaCaja } from '../../lib/medir.js'
import { COLORES, alfa } from '../../lib/textos.js'
import { bordePixel } from '../../componentes/ui.jsx'
import { Retrato } from '../../componentes/Retrato.jsx'
import { Icono } from '../../componentes/Pixel.jsx'
import { T } from '../tiempos.js'
import { cajasJuego, ColumnaSim } from '../columnas.jsx'
import { Chip, Moneda, PasaporteCerrado, SelloGoma, TituloPixel, Ventanilla } from '../piezas.jsx'

const FILA = [6, 11, 19, 27]

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

function Papers({ t, w, L }) {
  const tam = L.fs.chico
  const alto = Math.round(Math.min(110, w * 0.2))
  const k = easeOutCubic(prog(t, T.papers - 0.1, 0.4))
  // El sello de goma baja, golpea y vuelve a subir.
  const tGolpe = T.papers + 0.45
  const baja = t < tGolpe ? easeInCubic(prog(t, T.papers, 0.45)) : 1 - easeOutCubic(prog(t, tGolpe + 0.15, 0.4)) * 0.6
  const g = golpe(t, tGolpe, -10, 1.4, 0.12)
  const caption = 'juego estilo Papers, Please'
  const tamCap = tamParaAncho(caption, w - 20, L.fs.base, 22, 800)
  return (
    <div style={{ opacity: clamp(k * 2), transform: `translateY(${(1 - k) * 40}px)`, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, height: alto * 1.55 }}>
        <PasaporteCerrado alto={alto} />
        <div style={{ position: 'relative', width: alto * 1.25, height: alto, background: `linear-gradient(180deg, ${COLORES.papel}, ${COLORES.papelOscuro})`, boxShadow: bordePixel('#5b4a33', 3) }}>
          {g.visible && (
            <div style={{ position: 'absolute', left: '50%', top: '50%', width: alto * 0.7, height: alto * 0.7, marginLeft: -alto * 0.35, marginTop: -alto * 0.35, borderRadius: '50%', border: `${Math.max(3, Math.round(alto * 0.06))}px solid #c0392b`, transform: `rotate(${g.rot}deg) scale(${g.escala})`, opacity: g.o * 0.9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icono nombre="estrella" alto={Math.round(alto * 0.3)} color="#c0392b" />
            </div>
          )}
          <div style={{ position: 'absolute', left: alto * 0.2, top: -alto * 1.05 + baja * alto * 0.62 }}>
            <SelloGoma alto={Math.round(alto * 0.9)} />
          </div>
        </div>
      </div>
      <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamCap, color: COLORES.texto, whiteSpace: 'nowrap', lineHeight: 1.2 }}>{caption}</div>
      <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: L.fs.mini, color: COLORES.tenue, whiteSpace: 'nowrap' }}>inspirado en el juego de Lucas Pope</div>
    </div>
  )
}

function CuerpoCerebro({ e, t, t0, L, presupuesto }) {
  const k = easeOutBack(prog(t, t0 + 0.25, 0.45), 2)
  const tam = L.formato === 'vertical' ? 120 : 100
  const tamP = L.formato === 'vertical' ? 28 : 24
  const brillo = 0.35 + 0.25 * Math.sin(t * 3 + t0)
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '18px 14px 16px' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${0.4 + 0.6 * k})`, opacity: clamp(k * 2) }}>
        <div style={{ padding: 18, background: `radial-gradient(closest-side, ${alfa(e.color, brillo)}, transparent)` }}>
          <Chip color={e.color} alto={tam} />
        </div>
      </div>
      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamP, color: COLORES.texto, whiteSpace: 'nowrap' }}>
          <Moneda alto={Math.round(tamP * 0.95)} />
          {usd(presupuesto)}
        </div>
        <div style={{ marginTop: 8, height: 14, background: e.color, boxShadow: bordePixel('#0a0c16', 3, false) }} />
      </div>
    </div>
  )
}

export function QueEsSim({ m, L, t }) {
  const horizontal = L.orientacion === 'horizontal'
  const vertical = L.formato === 'vertical'
  const cabinaH = vertical ? 420 : 380
  const { cabina, columnas } = cajasJuego(L, cabinaH)
  const kCab = easeOutCubic(prog(t, 8.2, 0.5))
  // Cajas internas de la cabina: ventanilla + texto (a la derecha en vertical/feed, debajo en horizontal).
  const win = horizontal ? { x: 0, y: 0, w: cabina.w, h: Math.round(cabina.h * 0.48) } : { x: 0, y: 0, w: Math.round(cabina.w * 0.44), h: cabina.h }
  const info = horizontal ? { x: 0, y: win.h + 22, w: cabina.w, h: cabina.h - win.h - 22 } : { x: win.w + 22, y: 0, w: cabina.w - win.w - 22, h: cabina.h }
  const tamT = tamParaAncho('UNA SIMULACIÓN', info.w - 8, L.fs.titulo * 0.62, 18, 400, FUENTE_TITULO)
  const texto = '¿Cómo funcionarían tres cerebros en el mismo puesto fronterizo?'
  const tamTexto = tamParaCaja(texto, info.w - 8, 3, L.fs.base, L.fs.mini, 700)
  const lineas = partirLineas(texto, info.w - 8, tamTexto, 700)
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
        <div style={{ position: 'absolute', left: info.x, top: info.y, width: info.w, height: info.h, display: 'flex', flexDirection: 'column', justifyContent: horizontal ? 'flex-start' : 'center', gap: vertical ? 18 : 14 }}>
          <div style={{ transform: `scale(${0.7 + 0.3 * kS})`, transformOrigin: 'left center', opacity: clamp(kS * 2) }}>
            <TituloPixel texto="UNA SIMULACIÓN" tam={tamT} />
          </div>
          <div style={{ opacity: kTx, transform: `translateY(${(1 - kTx) * 20}px)`, fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: tamTexto, lineHeight: 1.22, color: COLORES.texto, textShadow: '0 3px 0 #000' }}>
            {lineas.map((l, i) => (
              <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>
            ))}
          </div>
          {t >= T.papers - 0.1 && <Papers t={t} w={info.w} L={L} />}
          {t < T.papers - 0.1 && <div style={{ height: Math.round(Math.min(110, info.w * 0.2)) * 1.55 + L.fs.base * 1.2 + L.fs.mini * 1.3 + 20 }} />}
        </div>
      </div>
      {m.estimaciones.map((e, i) => {
        const t0 = T.columnas[e.id]
        const k = easeOutBack(prog(t, t0 - 0.12, 0.5), 1.15)
        if (t < t0 - 0.12) return null
        return (
          <ColumnaSim key={e.id} e={e} caja={columnas[i]} L={L} kEntrada={k}>
            <CuerpoCerebro e={e} t={t} t0={t0} L={L} presupuesto={m.presupuestoUSD} />
          </ColumnaSim>
        )
      })}
    </>
  )
}
