// Sello de goma que cae con un golpe (escala 1,6 -> 1, rotación ligera, destello y partículas).
// Todo se calcula a partir de t y t0 (el instante del golpe).

import { golpe, azarFijo, clamp, easeOutCubic } from '../lib/anim.js'
import { FUENTE_TITULO, tamParaAncho } from '../lib/medir.js'
import { SELLO, alfa } from '../lib/textos.js'

export function Sello({ accion, t, t0, ancho, alto, rot = -6, clave = '', sobrePapel = false, texto, style, escalaInicial = 1.6, dur = 0.15, conParticulas = true }) {
  const g = golpe(t, t0, rot, escalaInicial, dur)
  if (!g.visible) return null
  const s = SELLO[accion] ?? { texto: texto ?? '?', color: '#888', tinta: '#888' }
  const etiqueta = texto ?? s.texto
  const borde = Math.max(3, Math.round(alto * 0.075))
  const tam = tamParaAncho(etiqueta, ancho - borde * 4 - 12, Math.round(alto * 0.36), 10, 400, FUENTE_TITULO)
  const esArresto = accion === 'arrestar'
  const tinta = sobrePapel ? s.tinta : s.color
  const fondo = esArresto
    ? `repeating-linear-gradient(90deg, rgba(0,0,0,0.38) 0 ${Math.round(ancho * 0.03)}px, transparent ${Math.round(ancho * 0.03)}px ${Math.round(ancho * 0.11)}px), #8a1128`
    : alfa(tinta, sobrePapel ? 0.08 : 0.16)
  const colorTexto = esArresto ? '#ffe4e8' : tinta
  const dt = t - t0
  const kPart = clamp(dt / 0.45)
  const particulas = conParticulas && dt > 0.12 && dt < 0.6
    ? Array.from({ length: 10 }, (_, i) => {
        const ang = (i / 10) * Math.PI * 2 + azarFijo(`${clave}a${i}`) * 0.6
        const dist = (0.55 + azarFijo(`${clave}d${i}`) * 0.45) * ancho * 0.7 * easeOutCubic(kPart)
        const lado = Math.round(alto * (0.06 + azarFijo(`${clave}s${i}`) * 0.05))
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: ancho / 2 + Math.cos(ang) * dist - lado / 2,
              top: alto / 2 + Math.sin(ang) * dist * 0.6 - lado / 2,
              width: lado,
              height: lado,
              background: i % 3 === 0 ? '#fff' : s.color,
              opacity: 1 - kPart,
            }}
          />
        )
      })
    : null
  return (
    <div style={{ position: 'relative', width: ancho, height: alto, flex: 'none', ...style }}>
      {g.flash > 0 && (
        <div
          style={{
            position: 'absolute',
            left: -ancho * 0.35,
            top: -alto * 0.9,
            width: ancho * 1.7,
            height: alto * 2.8,
            background: `radial-gradient(closest-side, rgba(255,255,240,${0.85 * g.flash}), ${alfa(s.color, 0.35 * g.flash)} 55%, transparent)`,
            transform: `scale(${1.4 - 0.4 * g.flash})`,
          }}
        />
      )}
      {particulas}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `rotate(${g.rot}deg) scale(${g.escala})`,
          opacity: g.o * (sobrePapel ? 0.93 : 1),
          border: `${borde}px solid ${esArresto ? '#3f0611' : tinta}`,
          boxShadow: esArresto ? `inset 0 0 0 ${Math.round(borde * 0.6)}px #c2193a` : 'none',
          outline: esArresto ? 'none' : `${Math.max(2, Math.round(borde * 0.4))}px solid ${tinta}`,
          outlineOffset: `-${borde * 2.2}px`,
          background: fondo,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: FUENTE_TITULO,
          fontSize: tam,
          lineHeight: 1,
          color: colorTexto,
          letterSpacing: 0,
          textShadow: esArresto ? '0 3px 0 #3f0611' : 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {etiqueta}
      </div>
    </div>
  )
}
