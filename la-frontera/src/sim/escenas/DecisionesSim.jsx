// Decisiones (17.2 - 26.8 s): «Llega un viajero y hay que decidir cuatro cosas: ¿puede pasar?,
// ¿está mintiendo?, ¿qué tan peligroso es? y ¿qué hacemos con él?»
// El viajero de ejemplo (v02) llega con su pasaporte; cada tarjeta aparece cuando la voz dice su pregunta.

import { ACCIONES } from '../../../shared/preguntas.js'
import { clamp, easeOutBack, easeOutCubic, prog } from '../../lib/anim.js'
import { FUENTE_TEXTO, FUENTE_TITULO, tamParaAncho } from '../../lib/medir.js'
import { COLORES, tono } from '../../lib/textos.js'
import { Icono } from '../../componentes/Pixel.jsx'
import { Retrato } from '../../componentes/Retrato.jsx'
import { bordePixel, TextoPixel } from '../../componentes/ui.jsx'
import { T } from '../tiempos.js'
import { FichaAccion, Globo, Pasaporte, Rotulo, TituloPixel, Ventanilla } from '../piezas.jsx'

const NIVELES = ['#3ddc84', '#a5d63f', '#ffc23d', '#ff8a3d', '#ff3b55']

const PREGUNTAS = [
  { id: 'pasa', icono: 'barrera', color: '#c9cfe0', texto: '¿Puede pasar?', tipo: 'SÍ / NO' },
  { id: 'miente', icono: 'mascara', color: '#c9b6ff', texto: '¿Está mintiendo?', tipo: 'SÍ / NO' },
  { id: 'peligro', icono: 'peligro', color: '#ffc23d', texto: '¿Qué tan peligroso es?', tipo: 'ESCALA 0-4' },
  { id: 'accion', icono: 'sello', color: '#ff8a9a', texto: '¿Qué hacemos con él?', tipo: 'OPCIÓN' },
]

// Cabina con el viajero: ventanilla, globo de diálogo y pasaporte.
export function CabinaViajero({ v, caja, L, t, t0, tHabla0, tHabla1, rotulo, conGlobo = true }) {
  const horizontal = L.orientacion === 'horizontal'
  const bubbleH = conGlobo ? (L.formato === 'vertical' ? 118 : 104) : 0
  let win
  let pas
  let bub
  if (horizontal) {
    const winH = Math.round(caja.h * (conGlobo ? 0.4 : 0.5))
    win = { x: 0, y: 0, w: caja.w, h: winH }
    bub = { x: 0, y: winH + 20, w: caja.w, h: bubbleH }
    const pasY = conGlobo ? bub.y + bubbleH + 18 : winH + 18
    pas = { x: 0, y: pasY, w: caja.w, h: caja.h - pasY }
  } else {
    const mainH = caja.h - (conGlobo ? bubbleH + 22 : 0)
    const winW = Math.round(Math.min(caja.w * 0.4, mainH * 0.92))
    win = { x: 0, y: 0, w: winW, h: mainH }
    pas = { x: winW + 16, y: 0, w: caja.w - winW - 16, h: mainH }
    bub = { x: 0, y: mainH + 22, w: caja.w, h: bubbleH }
  }
  const kIn = easeOutCubic(prog(t, t0, 0.8))
  const tamRet = Math.round(Math.min(win.h * 0.78, win.w * 0.86))
  const xRet = (win.w - tamRet) / 2 + (1 - kIn) * win.w * 1.1
  const yRet = win.h - tamRet - Math.max(14, win.h * 0.07) + 4 - Math.abs(Math.sin((t - t0) * 15)) * 10 * (1 - kIn)
  const hablando = t > tHabla0 && t < tHabla1
  const kPas = easeOutCubic(prog(t, t0 + 0.3, 0.55))
  const tamRot = L.formato === 'vertical' ? 24 : 22
  return (
    <div style={{ position: 'absolute', left: caja.x, top: caja.y, width: caja.w, height: caja.h }}>
      <div style={{ position: 'absolute', left: win.x, top: win.y, width: win.w, height: win.h }}>
        <Ventanilla w={win.w} h={win.h}>
          <div style={{ position: 'absolute', left: xRet, top: yRet }}>
            <Retrato semilla={v.semilla} tam={tamRet} t={t} hablando={hablando} />
          </div>
          {rotulo && (
            <div style={{ position: 'absolute', left: 10, top: Math.max(20, win.h * 0.1) + 6 }}>
              <Rotulo texto={rotulo} tam={tamRot} />
            </div>
          )}
        </Ventanilla>
      </div>
      <div style={{ position: 'absolute', left: pas.x, top: pas.y, width: pas.w, height: pas.h, transform: `translateY(${(1 - kPas) * (pas.h + 160)}px) rotate(${(1 - kPas) * 6 - 1}deg)` }}>
        <Pasaporte v={v} w={pas.w} h={pas.h} tamMax={L.formato === 'vertical' ? 30 : 27} tamMin={L.formato === 'vertical' ? 22 : 20} />
      </div>
      {conGlobo && (
        <div style={{ position: 'absolute', left: bub.x, top: bub.y, width: bub.w, height: bub.h }}>
          <Globo texto={v.dice} w={bub.w} h={bub.h} t={t} t0={tHabla0} t1={tHabla1} tamMax={L.fs.base * 0.9} tamMin={L.formato === 'vertical' ? 24 : 21} colaX={win.w * 0.5} />
        </div>
      )}
    </div>
  )
}

function Tarjeta({ q, w, h, L, t, t0 }) {
  const k = easeOutBack(prog(t, t0 - 0.08, 0.4), 1.8)
  const vertical = L.formato === 'vertical'
  const pad = 16
  const tamQ = tamParaAncho(q.texto, w - pad * 2, vertical ? 38 : 34, vertical ? 28 : 22, 800)
  const tamTipo = vertical ? 20 : 17
  const tamIcono = Math.round(Math.min(h * 0.2, 52))
  const tamChip = vertical ? 30 : 26
  let visual = null
  if (q.id === 'pasa' || q.id === 'miente') {
    visual = (
      <div style={{ display: 'flex', gap: 14 }}>
        {['SÍ', 'NO'].map((x) => (
          <div key={x} style={{ padding: `4px ${Math.round(tamChip * 0.6)}px`, background: '#0e1322', boxShadow: bordePixel('#3a4770', 3, false), fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamChip, color: '#fff' }}>{x}</div>
        ))}
      </div>
    )
  } else if (q.id === 'peligro') {
    const lado = Math.min(Math.round((w - pad * 2 - 4 * 8) / 5), vertical ? 56 : 48)
    visual = (
      <div style={{ display: 'flex', gap: 8 }}>
        {NIVELES.map((col, i) => (
          <div key={i} style={{ width: lado, height: lado, background: col, boxShadow: bordePixel(tono(col, -0.5), 3, false), display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: Math.round(lado * 0.55), color: '#111' }}>{i}</div>
        ))}
      </div>
    )
  } else {
    const anchoF = Math.floor((w - pad * 2 - 8) / 2)
    const tamF = tamParaAncho('INTERROGAR', anchoF - 16, vertical ? 18 : 16, 10, 400, FUENTE_TITULO)
    visual = (
      <div style={{ display: 'grid', gridTemplateColumns: `${anchoF}px ${anchoF}px`, gap: 8 }}>
        {ACCIONES.map((a) => (
          <FichaAccion key={a} accion={a} tam={tamF} w={anchoF} />
        ))}
      </div>
    )
  }
  return (
    <div style={{ position: 'relative', width: w, height: h, flex: 'none' }}>
      {/* Lugar reservado (tenue) hasta que la voz dice la pregunta. */}
      <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 3px rgba(120,135,180,0.35)', background: 'rgba(10,12,22,0.45)', opacity: 1 - clamp(k * 2) }} />
      {t >= t0 - 0.08 && (
        <div style={{ position: 'absolute', inset: 0, padding: pad, background: `linear-gradient(180deg, ${COLORES.panel2}, ${COLORES.panel})`, boxShadow: bordePixel('#3a4770', 4), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-evenly', transform: `translateY(${(1 - k) * 80}px) scale(${0.8 + 0.2 * k})`, opacity: clamp(k * 2) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icono nombre={q.icono} alto={tamIcono} color={q.color} claro="#141a2c" extra={{ R: '#e5383b', W: '#f5f5f5' }} />
            <div style={{ fontFamily: FUENTE_TITULO, fontSize: tamTipo, color: COLORES.ambar, padding: '6px 10px', boxShadow: `inset 0 0 0 3px ${COLORES.ambar}`, whiteSpace: 'nowrap' }}>
              <TextoPixel>{q.tipo}</TextoPixel>
            </div>
          </div>
          <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamQ, color: '#fff', whiteSpace: 'nowrap' }}>{q.texto}</div>
          {visual}
        </div>
      )}
    </div>
  )
}

export function DecisionesSim({ m, L, t }) {
  const C = L.contenido
  const horizontal = L.orientacion === 'horizontal'
  const vertical = L.formato === 'vertical'
  const v = m.ejemploDecisiones
  const gap = vertical ? 18 : 16
  const cabina = horizontal ? { x: C.x, y: C.y, w: 620, h: C.h } : { x: C.x, y: C.y, w: C.w, h: vertical ? 440 : 400 }
  const zona = horizontal ? { x: C.x + 620 + 30, y: C.y, w: C.w - 650, h: C.h } : { x: C.x, y: cabina.y + cabina.h + 20, w: C.w, h: C.y + C.h - (cabina.y + cabina.h + 20) }
  const tamTitulo = tamParaAncho('4 DECISIONES POR VIAJERO', zona.w * 0.96, L.fs.titulo * 0.62, 16, 400, FUENTE_TITULO)
  const altoTitulo = Math.round(tamTitulo * 1.4)
  const wCard = Math.floor((zona.w - gap) / 2)
  const hCard = Math.floor(Math.min((zona.h - altoTitulo - 14 - gap) / 2, horizontal ? 330 : 290))
  const kT = easeOutBack(prog(t, T.cuatro, 0.4))
  return (
    <>
      <CabinaViajero v={v} caja={cabina} L={L} t={t} t0={T.viajero} tHabla0={T.viajero + 0.7} tHabla1={T.viajero + 2.6} rotulo="VIAJERO DE EJEMPLO" />
      <div style={{ position: 'absolute', left: zona.x, top: zona.y, width: zona.w, height: zona.h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: horizontal ? 'center' : 'flex-start', gap: 14 }}>
        <div style={{ height: altoTitulo, display: 'flex', alignItems: 'center', transform: `scale(${0.6 + 0.4 * kT})`, opacity: clamp(kT * 2) }}>
          <TituloPixel texto="4 DECISIONES POR VIAJERO" tam={tamTitulo} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `${wCard}px ${wCard}px`, gap, opacity: clamp(prog(t, T.cuatro, 0.3) * 2) }}>
          {PREGUNTAS.map((q, i) => (
            <Tarjeta key={q.id} q={q} w={wCard} h={hCard} L={L} t={t} t0={T.preguntas[i]} />
          ))}
        </div>
      </div>
    </>
  )
}
