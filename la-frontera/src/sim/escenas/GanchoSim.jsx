// Gancho (0 - 8.2 s): «Tres inteligencias artificiales. Un mismo trabajo: cuidar una frontera.
// Y el mismo presupuesto para cada una. ¿Cuál aguantaría más?»
// Título, los tres cerebros entrando con sus colores, «US$ 0.25 para cada una» y el sello.

import { usd } from '../../../shared/formato.js'
import { clamp, easeOutBack, easeOutCubic, golpe, prog, sacudir } from '../../lib/anim.js'
import { FUENTE_TEXTO, FUENTE_TITULO, tamParaAncho } from '../../lib/medir.js'
import { COLORES, alfa, tono } from '../../lib/textos.js'
import { bordePixel, TextoPixel } from '../../componentes/ui.jsx'
import { T } from '../tiempos.js'
import { Chip, Moneda, SOMBRA_TEXTO } from '../piezas.jsx'

function Franja({ ancho }) {
  const tramos = Math.ceil(ancho / 40)
  return (
    <svg width={Math.max(1, ancho)} height={14} style={{ display: 'block', margin: '16px auto 0' }} shapeRendering="crispEdges">
      <rect x={0} y={10} width={ancho} height={4} fill="#000" />
      {Array.from({ length: tramos }, (_, i) => (
        <rect key={i} x={i * 40} y={0} width={Math.min(40, ancho - i * 40)} height={10} fill={i % 2 ? '#f6f2e9' : '#e5383b'} />
      ))}
    </svg>
  )
}

function TituloLetras({ texto, tam, t, t0 }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', whiteSpace: 'pre' }}>
      {[...texto].map((ch, i) => {
        const k = easeOutBack(prog(t, t0 + i * 0.045, 0.42), 2.2)
        return (
          <span key={i} style={{ display: 'inline-block', fontFamily: FUENTE_TITULO, fontSize: tam, lineHeight: 1.1, color: COLORES.ambar, textShadow: `0 ${tam * 0.09}px 0 #8a4b00, 0 ${tam * 0.18}px 0 #000`, transform: `translateY(${(1 - k) * -tam * 2.4}px)`, opacity: clamp(prog(t, t0 + i * 0.045, 0.1)) }}>
            {ch}
          </span>
        )
      })}
    </div>
  )
}

function Tarjeta({ e, t, t0, desde, w, h, L, presupuesto, tMoneda }) {
  const k = easeOutCubic(prog(t, t0, 0.34))
  const dx = desde === 'izq' ? -1 : desde === 'der' ? 1 : 0
  const dy = desde === 'abajo' ? 1 : 0
  const impacto = t >= t0 + 0.3 ? Math.sin(clamp((t - t0 - 0.3) / 0.25) * Math.PI) : 0
  const tamChip = Math.round(h * 0.62)
  const tamBadge = Math.round(L.fs.chico * 0.9)
  const textoBadge = usd(presupuesto)
  const anchoBadge = Math.round(tamBadge * 0.62 * textoBadge.length + tamBadge * 2.4)
  const tamN = tamParaAncho(e.nombre, w - tamChip - anchoBadge - 70, L.fs.grande, 24, 800)
  const kM = easeOutBack(prog(t, tMoneda, 0.35), 2)
  return (
    <div style={{ width: w, height: h, padding: `0 ${Math.round(L.fs.base * 0.6)}px`, background: `linear-gradient(90deg, ${alfa(e.color, 0.34)}, ${alfa(e.color, 0.08)})`, boxShadow: bordePixel(e.color, 5), display: 'flex', alignItems: 'center', gap: Math.round(L.fs.base * 0.55), transform: `translate(${dx * (1 - k) * 1000}px, ${dy * (1 - k) * 800}px) scale(${1 + impacto * 0.07})`, opacity: clamp(prog(t, t0, 0.12)), flex: 'none' }}>
      <Chip color={e.color} alto={tamChip} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamN, lineHeight: 1.05, color: '#fff', whiteSpace: 'nowrap' }}>{e.nombre}</div>
        <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: L.fs.chico, lineHeight: 1.2, color: tono(e.color, 0.5), whiteSpace: 'nowrap' }}>{e.empresa}</div>
      </div>
      <div style={{ width: anchoBadge, display: 'flex', justifyContent: 'flex-end', flex: 'none' }}>
        {t >= tMoneda && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(8,10,20,0.85)', boxShadow: bordePixel('#7a5600', 3, false), transform: `translateY(${(1 - kM) * -60}px) scale(${0.6 + 0.4 * kM})`, opacity: clamp(kM * 2), whiteSpace: 'nowrap' }}>
            <Moneda alto={tamBadge} />
            <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamBadge, color: COLORES.ambar }}>{textoBadge}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function GanchoSim({ m, L, t }) {
  const C = L.contenido
  const horizontal = L.orientacion === 'horizontal'
  const vertical = L.formato === 'vertical'
  const tamTitulo = tamParaAncho('LA FRONTERA', C.w * 0.94, L.fs.enorme * (horizontal ? 1.05 : 1), 30, 400, FUENTE_TITULO)
  const tamFrase = L.fs.medio
  const fraseTrabajo = 'Un mismo trabajo: cuidar la frontera'
  const tamTrabajo = tamParaAncho(fraseTrabajo, C.w * 0.94, tamFrase, 24, 800)
  const frasePresu = `${usd(m.presupuestoUSD)} para cada una`
  const tamPresu = tamParaAncho(frasePresu, C.w * 0.8, L.fs.grande, 26, 800)
  const anchoTarjeta = horizontal ? Math.floor((C.w - 2 * 28) / 3) : Math.min(C.w * 0.9, 860)
  const altoTarjeta = vertical ? 118 : horizontal ? 104 : 100
  const desdes = ['izq', 'der', 'abajo']
  const anchoSello = horizontal ? 1100 : Math.min(C.w * 0.96, 940)
  const altoSello = Math.round(anchoSello * (horizontal ? 0.17 : 0.2))
  const g = golpe(t, T.selloCual, -7)
  const sac = sacudir(g.sacudida, t, 20)
  const kT = suaveK(t, T.trabajo)
  const kP = easeOutBack(prog(t, T.presupuesto, 0.45), 1.8)
  const tamSello = tamParaAncho('¿CUÁL AGUANTARÍA MÁS?', anchoSello * 0.86, altoSello * 0.36, 12, 400, FUENTE_TITULO)
  return (
    <div style={{ position: 'absolute', left: C.x, top: C.y, width: C.w, height: C.h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: horizontal ? 28 : vertical ? 40 : 30, transform: `translate(${sac.x}px, ${sac.y}px)` }}>
      <div style={{ textAlign: 'center' }}>
        <TituloLetras texto="LA FRONTERA" tam={tamTitulo} t={t} t0={T.titulo} />
        <Franja ancho={Math.round(C.w * 0.7 * easeOutCubic(prog(t, 0.5, 0.45)))} />
      </div>
      <div style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', alignItems: 'center', gap: horizontal ? 28 : vertical ? 22 : 18 }}>
        {m.estimaciones.map((e, i) => (
          <Tarjeta key={e.id} e={e} t={t} t0={T.cerebros[i]} desde={desdes[i]} w={anchoTarjeta} h={altoTarjeta} L={L} presupuesto={m.presupuestoUSD} tMoneda={T.presupuesto + 0.25 + i * 0.14} />
        ))}
      </div>
      <div style={{ textAlign: 'center', fontFamily: FUENTE_TEXTO, fontWeight: 800, lineHeight: 1.25, textShadow: SOMBRA_TEXTO, display: 'flex', flexDirection: horizontal ? 'row' : 'column', alignItems: 'center', gap: horizontal ? 40 : 10 }}>
        <div style={{ fontSize: tamTrabajo, color: COLORES.texto, opacity: kT, transform: `translateY(${(1 - kT) * 24}px)`, whiteSpace: 'nowrap' }}>{fraseTrabajo}</div>
        <div style={{ fontSize: tamPresu, color: COLORES.ambar, opacity: clamp(kP * 2), transform: `scale(${0.7 + 0.3 * kP})`, display: 'flex', alignItems: 'center', gap: 14, whiteSpace: 'nowrap' }}>
          <Moneda alto={Math.round(tamPresu * 0.9)} />
          {frasePresu}
        </div>
      </div>
      <div style={{ position: 'relative', width: anchoSello, height: altoSello, flex: 'none' }}>
        {g.visible && (
          <div style={{ position: 'absolute', inset: 0, transform: `rotate(${g.rot}deg) scale(${g.escala})`, opacity: g.o, border: `${Math.round(altoSello * 0.08)}px solid #e5383b`, outline: `${Math.round(altoSello * 0.03)}px solid #e5383b`, outlineOffset: `-${Math.round(altoSello * 0.16)}px`, background: 'rgba(229, 56, 59, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FUENTE_TITULO, fontSize: tamSello, color: '#ff4d4f', textShadow: '0 4px 0 #3a0610', whiteSpace: 'nowrap' }}>
            <TextoPixel>¿CUÁL AGUANTARÍA MÁS?</TextoPixel>
          </div>
        )}
      </div>
      {g.flash > 0 && <div style={{ position: 'absolute', left: -C.x, top: -C.y, width: L.W, height: L.H, background: `rgba(255,250,235,${g.flash * 0.35})`, pointerEvents: 'none' }} />}
    </div>
  )
}

function suaveK(t, t0) {
  return easeOutCubic(prog(t, t0, 0.45))
}
