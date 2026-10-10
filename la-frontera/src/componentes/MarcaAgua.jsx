// Marca de agua de demostración: franja superior tipo cinta de precaución y banda diagonal
// semitransparente. Se dibuja SIEMPRE que la corrida no sea real (run.source !== 'live').

import { useLayoutEffect, useRef } from 'react'
import { FUENTE_TEXTO, FUENTE_TITULO, tamParaAncho } from '../lib/medir.js'

const TEXTO_FRANJA = 'DEMO · datos simulados — no son resultados reales'

// La banda diagonal se dibuja UNA vez en un canvas (texto rotado): así cada cuadro solo
// compone un mapa de bits fijo y el resultado no depende de los cuadros anteriores.
function dibujarBanda(canvas, W, H) {
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, W, H)
  const diagonal = Math.hypot(W, H)
  const rot = -Math.atan2(H, W) * 0.75
  const tamBanda = Math.round(Math.min(W, H) * 0.036)
  const alto = tamBanda * 3.2
  ctx.save()
  ctx.translate(W / 2, H / 2)
  ctx.rotate(rot)
  ctx.fillStyle = 'rgba(255, 207, 51, 0.05)'
  ctx.fillRect(-diagonal * 0.6, -alto / 2, diagonal * 1.2, alto)
  ctx.fillStyle = 'rgba(255, 207, 51, 0.2)'
  ctx.fillRect(-diagonal * 0.6, -alto / 2, diagonal * 1.2, 3)
  ctx.fillRect(-diagonal * 0.6, alto / 2 - 3, diagonal * 1.2, 3)
  ctx.font = `${tamBanda}px ${FUENTE_TITULO}`
  ctx.fillStyle = 'rgba(255, 214, 80, 0.22)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('DEMO · DATOS SIMULADOS · '.repeat(8), 0, 2)
  ctx.restore()
}

// Se dibuja una sola vez por tamaño y luego se copia píxel a píxel (drawImage sin escalar).
const bandas = new Map()
function banda(W, H) {
  const clave = `${W}x${H}`
  let c = bandas.get(clave)
  if (!c) {
    c = document.createElement('canvas')
    c.width = W
    c.height = H
    dibujarBanda(c, W, H)
    bandas.set(clave, c)
  }
  return c
}

export function MarcaAgua({ L }) {
  const { W, H, franja } = L
  const cinta = 'repeating-linear-gradient(135deg, #111 0 14px, #ffcf33 14px 28px)'
  const anchoCinta = L.formato === 'horizontal' ? 120 : 56
  const tam = tamParaAncho(TEXTO_FRANJA, W - anchoCinta * 2 - 40, Math.round(franja.h * 0.58), 16, 800)
  const ref = useRef(null)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ctx = ref.current.getContext('2d')
    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(banda(W, H), 0, 0)
  }, [W, H])
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50, overflow: 'hidden' }}>
      <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }} />
      <div
        style={{
          position: 'absolute',
          left: franja.x,
          top: franja.y,
          width: franja.w,
          height: franja.h,
          background: '#ffcf33',
          boxShadow: '0 4px 0 rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ width: anchoCinta, height: '100%', background: cinta }} />
        <div
          style={{
            fontFamily: FUENTE_TEXTO,
            fontWeight: 800,
            fontSize: tam,
            color: '#1a1400',
            whiteSpace: 'nowrap',
          }}
        >
          {TEXTO_FRANJA}
        </div>
        <div style={{ width: anchoCinta, height: '100%', background: cinta }} />
      </div>
    </div>
  )
}
