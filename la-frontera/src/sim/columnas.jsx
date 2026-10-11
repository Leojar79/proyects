// Cabina + tres columnas (una por cerebro), como en el juego. Lo usan «qué es» y «el juego».

import { clamp } from '../lib/anim.js'
import { COLORES, tono } from '../lib/textos.js'
import { bordePixel } from '../componentes/ui.jsx'
import { CabeceraCerebro } from './piezas.jsx'

// Cajas de la cabina y las columnas. `cabinaH` solo aplica en vertical y feed.
export function cajasJuego(L, cabinaH) {
  const C = L.contenido
  if (L.orientacion === 'horizontal') {
    const cabW = 620
    const gap = 24
    const colX = C.x + cabW + gap
    const colW = Math.floor((C.x + C.w - colX - 2 * 16) / 3)
    return {
      cabina: { x: C.x, y: C.y, w: cabW, h: C.h },
      columnas: [0, 1, 2].map((k) => ({ x: colX + k * (colW + 16), y: C.y, w: colW, h: C.h })),
    }
  }
  const gap = 16
  const colY = C.y + cabinaH + gap
  const colW = Math.floor((C.w - 2 * 12) / 3)
  return {
    cabina: { x: C.x, y: C.y, w: C.w, h: cabinaH },
    columnas: [0, 1, 2].map((k) => ({ x: C.x + k * (colW + 12), y: colY, w: colW, h: C.y + C.h - colY })),
  }
}

export function medidasColumna(L) {
  const v = L.formato === 'vertical'
  return { tamNombre: v ? 34 : 30, tamSec: v ? 26 : 23, pad: 14 }
}

// Columna de un cerebro: cabecera + cuerpo. `kEntrada` (0..1) la hace subir desde abajo.
export function ColumnaSim({ e, caja, L, kEntrada = 1, children }) {
  const M = medidasColumna(L)
  return (
    <div style={{ position: 'absolute', left: caja.x, top: caja.y, width: caja.w, height: caja.h, transform: `translateY(${(1 - kEntrada) * (caja.h + 260)}px)`, opacity: clamp(kEntrada * 3) }}>
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${COLORES.panel2}, ${COLORES.panel})`, boxShadow: bordePixel(tono(e.color, -0.45), 4), display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <CabeceraCerebro e={e} w={caja.w} tamNombre={M.tamNombre} tamSec={M.tamSec} pad={M.pad} />
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>{children}</div>
      </div>
    </div>
  )
}
