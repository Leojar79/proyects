// Escena 1 (0-4 s): título, "3 cerebros · 1 frontera · US$ X de presupuesto", los tres
// nombres entrando con fuerza y un sello que golpea la pantalla. No anticipa resultados.

import { JUEGO } from '../../shared/config.js'
import { usd } from '../../shared/formato.js'
import { clamp, easeOutBack, easeOutCubic, golpe, prog, sacudir } from '../lib/anim.js'
import { FUENTE_TEXTO, FUENTE_TITULO, tamParaAncho } from '../lib/medir.js'
import { COLORES, alfa, tono } from '../lib/textos.js'
import { Icono } from '../componentes/Pixel.jsx'
import { bordePixel, TextoPixel } from '../componentes/ui.jsx'

const T_SELLO = 2.55

// Barrera rayada roja y blanca (rectángulos SVG, sin degradados).
function Franja({ ancho }) {
  const tramos = Math.ceil(ancho / 40)
  return (
    <svg width={ancho} height={14} style={{ display: 'block', margin: '18px auto 0' }} shapeRendering="crispEdges">
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
          <span
            key={i}
            style={{
              display: 'inline-block',
              fontFamily: FUENTE_TITULO,
              fontSize: tam,
              lineHeight: 1.1,
              color: COLORES.ambar,
              textShadow: `0 ${tam * 0.09}px 0 #8a4b00, 0 ${tam * 0.18}px 0 #000`,
              transform: `translateY(${(1 - k) * -tam * 2.4}px)`,
              opacity: clamp(prog(t, t0 + i * 0.045, 0.1)),
            }}
          >
            {ch}
          </span>
        )
      })}
    </div>
  )
}

function TarjetaNombre({ p, t, t0, desde, w, L }) {
  const k = easeOutCubic(prog(t, t0, 0.32))
  const dx = desde === 'izq' ? -1 : desde === 'der' ? 1 : 0
  const dy = desde === 'abajo' ? 1 : 0
  const tam = tamParaAncho(p.nombre, w - 120, L.fs.grande, 24, 800)
  const impacto = t >= t0 + 0.28 ? Math.sin(clamp((t - t0 - 0.28) / 0.25) * Math.PI) : 0
  return (
    <div
      style={{
        width: w,
        padding: `${L.fs.base * 0.5}px ${L.fs.base * 0.8}px`,
        background: `linear-gradient(90deg, ${alfa(p.color, 0.32)}, ${alfa(p.color, 0.08)})`,
        boxShadow: bordePixel(p.color, 5),
        display: 'flex',
        alignItems: 'center',
        gap: L.fs.base * 0.6,
        transform: `translate(${dx * (1 - k) * 900}px, ${dy * (1 - k) * 700}px) scale(${1 + impacto * 0.08})`,
        opacity: clamp(prog(t, t0, 0.12)),
        flex: 'none',
      }}
    >
      <div style={{ width: L.fs.base * 1.3, height: L.fs.base * 1.3, background: p.color, boxShadow: bordePixel(tono(p.color, -0.5), 3, false), flex: 'none' }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tam, lineHeight: 1.05, color: '#fff', whiteSpace: 'nowrap' }}>{p.nombre}</div>
        <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: L.fs.chico, color: tono(p.color, 0.45), whiteSpace: 'nowrap' }}>{p.empresa}</div>
      </div>
    </div>
  )
}

export function Gancho({ m, L, t }) {
  const c = L.contenido
  const horizontal = L.orientacion === 'horizontal'
  const tamTitulo = tamParaAncho('LA FRONTERA', c.w * 0.94, L.fs.enorme * (horizontal ? 1.15 : 1), 30, 400, FUENTE_TITULO)
  const g = golpe(t, T_SELLO, -8)
  const sac = sacudir(g.sacudida, t, 22)
  const frase1 = '3 cerebros · 1 frontera'
  const frase2 = `${usd(JUEGO.presupuestoUSD)} de presupuesto`
  const tamFrase = Math.min(L.fs.grande, tamParaAncho(frase2, c.w * 0.9, L.fs.grande, 24, 800))
  const kF1 = easeOutCubic(prog(t, 0.65, 0.4))
  const kF2 = easeOutCubic(prog(t, 0.85, 0.4))
  const anchoTarjeta = horizontal ? (c.w - 80) / 3 : Math.min(c.w * 0.86, 820)
  const desdes = ['izq', 'der', 'abajo']
  const anchoSello = horizontal ? 900 : Math.min(c.w * 0.9, 820)
  const altoSello = anchoSello * (horizontal ? 0.2 : 0.24)
  // Salida: todo se aleja un poco al final de la escena.
  const kSal = clamp((t - 3.7) / 0.3)
  return (
    <div
      style={{
        position: 'absolute',
        left: c.x,
        top: c.y,
        width: c.w,
        height: c.h,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: horizontal ? 34 : 48,
        transform: `translate(${sac.x}px, ${sac.y}px) scale(${1 + kSal * 0.04})`,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <TituloLetras texto="LA FRONTERA" tam={tamTitulo} t={t} t0={0.05} />
        <Franja ancho={Math.round(c.w * 0.7 * easeOutCubic(prog(t, 0.55, 0.4)))} />
      </div>
      <div style={{ textAlign: 'center', fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamFrase, lineHeight: 1.25, color: COLORES.texto, textShadow: '0 4px 0 #000, 2px 0 0 #000, -2px 0 0 #000, 0 -2px 0 #000' }}>
        {horizontal ? (
          <div style={{ opacity: kF1, transform: `translateY(${(1 - kF1) * 30}px)` }}>
            {frase1} · <span style={{ color: COLORES.ambar }}>{frase2}</span>
          </div>
        ) : (
          <>
            <div style={{ opacity: kF1, transform: `translateY(${(1 - kF1) * 30}px)` }}>{frase1}</div>
            <div style={{ opacity: kF2, transform: `translateY(${(1 - kF2) * 30}px)`, color: COLORES.ambar, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <Icono nombre="moneda" alto={tamFrase * 0.9} color="#7a5600" />
              {frase2}
            </div>
          </>
        )}
      </div>
      <div style={{ position: 'relative', display: 'flex', flexDirection: horizontal ? 'row' : 'column', alignItems: 'center', gap: horizontal ? 40 : 30 }}>
        {m.proveedores.slice(0, 3).map((p, i) => (
          <TarjetaNombre key={p.id} p={p} t={t} t0={1.25 + i * 0.28} desde={desdes[i]} w={anchoTarjeta} L={L} />
        ))}
      </div>
      <div style={{ position: 'relative', width: anchoSello, height: altoSello, flex: 'none' }}>
        {g.visible && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              transform: `rotate(${g.rot}deg) scale(${g.escala})`,
              opacity: g.o,
              border: `${altoSello * 0.08}px solid #e5383b`,
              outline: `${altoSello * 0.03}px solid #e5383b`,
              outlineOffset: `-${altoSello * 0.16}px`,
              background: 'rgba(229, 56, 59, 0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: FUENTE_TITULO,
              fontSize: tamParaAncho('¿QUIÉN DURA MÁS?', anchoSello * 0.84, altoSello * 0.4, 12, 400, FUENTE_TITULO),
              color: '#ff4d4f',
              textShadow: '0 4px 0 #3a0610',
              whiteSpace: 'nowrap',
            }}
          >
            <TextoPixel>¿QUIÉN DURA MÁS?</TextoPixel>
          </div>
        )}
      </div>
      {g.flash > 0 && <div style={{ position: 'absolute', left: -c.x, top: -c.y, width: L.W, height: L.H, background: `rgba(255,250,235,${g.flash * 0.4})`, pointerEvents: 'none' }} />}
    </div>
  )
}
