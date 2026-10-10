// Mostrador del guardia (solo en vertical, en la franja inferior que tapa la interfaz de
// TikTok/Reels): elementos decorativos, sin información.

import { PixelArt } from './Pixel.jsx'

const TAZA = [
  '.XXXXXXXX...',
  '.XooooooXXX.',
  '.XooooooX..X',
  '.XRRRRRRX..X',
  '.XooooooXXX.',
  '.XooooooX...',
  '..XXXXXX....',
]

const SELLO_TINTA = [
  '.....XXXX.......',
  '.....XHHX.......',
  '.....XHHX.......',
  '....XXXXXX......',
  '...XRRRRRRX.....',
  '...XXXXXXXX.....',
  'XXXXXXXXXXXXXXXX',
  'XBBBBBBBBBBBBBBX',
  'XBBBBBBBBBBBBBBX',
  'XXXXXXXXXXXXXXXX',
]

const PASAPORTES = [
  '....GGGGGGGGGG',
  '....GGGGGGGGGG',
  '..RRRRRRRRRRGG',
  '..RRRRRRRRRRGG',
  'PPPPPPPPPPRR..',
  'PPYYPPPPPPRR..',
  'PPPPPPPPPP....',
  'PPPPPPPPPP....',
]

export function Escritorio({ L, t }) {
  if (L.formato !== 'vertical') return null
  const y = L.H - 300
  const vapor = (i) => {
    const k = ((t * 0.6 + i * 0.33) % 1)
    return { x: Math.sin(t * 2 + i * 2) * 8, y: -k * 70, o: Math.sin(k * Math.PI) * 0.5 }
  }
  return (
    <div style={{ position: 'absolute', left: 0, top: y, width: L.W, height: 300, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 70, top: 70 }}>
        <PixelArt filas={PASAPORTES} alto={110} colores={{ G: '#2f7d4f', R: '#9b2f2f', P: '#2f5fa8', Y: '#ffd25e' }} />
      </div>
      <div style={{ position: 'absolute', left: 430, top: 50 }}>
        <PixelArt filas={SELLO_TINTA} alto={130} colores={{ X: '#1a120c', H: '#7a4a2c', R: '#c0392b', B: '#3a1f4a' }} />
      </div>
      <div style={{ position: 'absolute', left: 820, top: 80 }}>
        {[0, 1, 2].map((i) => {
          const v = vapor(i)
          return <div key={i} style={{ position: 'absolute', left: 26 + i * 22 + v.x, top: v.y, width: 10, height: 18, background: '#ffffff', opacity: v.o }} />
        })}
        <PixelArt filas={TAZA} alto={100} colores={{ X: '#2a1a12', o: '#e8e2d4', R: '#c0392b' }} />
      </div>
    </div>
  )
}
