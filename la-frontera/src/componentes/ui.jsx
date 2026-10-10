// Piezas de interfaz reutilizables con estética pixel (bordes escalonados, sombras duras).

import { FUENTE_TEXTO, FUENTE_TITULO } from '../lib/medir.js'

// Borde "pixel" con esquinas recortadas (técnica de box-shadow) y sombra dura opcional.
export function bordePixel(color, g = 4, sombra = true) {
  const s = [
    `0 -${g}px 0 0 ${color}`,
    `0 ${g}px 0 0 ${color}`,
    `-${g}px 0 0 0 ${color}`,
    `${g}px 0 0 0 ${color}`,
  ]
  if (sombra) s.push(`${g}px ${g * 3}px 0 0 rgba(0,0,0,0.55)`)
  return s.join(', ')
}

export function Caja({ x, y, w, h, children, style, ...resto }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, ...style }} {...resto}>
      {children}
    </div>
  )
}

export function Titulo({ children, tam, color = '#fff', sombra = '#000', style }) {
  return (
    <div
      style={{
        fontFamily: FUENTE_TITULO,
        fontSize: tam,
        lineHeight: 1.15,
        color,
        textShadow: `${Math.max(2, tam * 0.08)}px ${Math.max(2, tam * 0.08)}px 0 ${sombra}`,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function Texto({ children, tam, peso = 600, color = '#f6f2e9', style }) {
  return (
    <div style={{ fontFamily: FUENTE_TEXTO, fontSize: tam, fontWeight: peso, color, lineHeight: 1.2, ...style }}>
      {children}
    </div>
  )
}

// Press Start 2P dibuja las mayúsculas acentuadas como minúsculas: se dibuja la letra base
// con una tilde de pixeles encima, para que "RÁPIDO" o "DECISIÓN" se vean bien.
const ACENTOS = { Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U' }

export function TextoPixel({ children }) {
  const s = String(children ?? '')
  if (!/[ÁÉÍÓÚ]/.test(s)) return s
  return <span>{[...s].map((ch, i) =>
    ACENTOS[ch] ? (
      <span key={i} style={{ position: 'relative', display: 'inline-block' }}>
        {ACENTOS[ch]}
        <span
          style={{
            position: 'absolute',
            left: '0.36em',
            top: '-0.3em',
            width: '0.28em',
            height: '0.16em',
            background: 'currentColor',
            transform: 'skewX(-50deg)',
          }}
        />
      </span>
    ) : (
      ch
    ),
  )}</span>
}
