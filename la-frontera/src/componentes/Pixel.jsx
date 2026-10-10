// Arte de pixeles en SVG a partir de filas de caracteres. Cada carácter es una clave de color;
// '.' es transparente. Las filas se agrupan en rectángulos horizontales (menos nodos en el DOM).

import { memo } from 'react'

function rects(filas, colores) {
  const out = []
  filas.forEach((fila, y) => {
    let x = 0
    while (x < fila.length) {
      const c = fila[x]
      if (c === '.' || c === ' ' || !colores[c]) {
        x++
        continue
      }
      let x2 = x + 1
      while (x2 < fila.length && fila[x2] === c) x2++
      out.push(<rect key={`${x}-${y}`} x={x} y={y} width={x2 - x} height={1} fill={colores[c]} />)
      x = x2
    }
  })
  return out
}

export const PixelArt = memo(function PixelArt({ filas, colores, alto, style }) {
  const h = filas.length
  const w = Math.max(...filas.map((f) => f.length))
  const tam = alto / h
  return (
    <svg
      width={w * tam}
      height={alto}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      style={{ display: 'block', flex: 'none', ...style }}
    >
      {rects(filas, colores)}
    </svg>
  )
})

export const ICONOS = {
  corazon: [
    '.XX...XX.',
    'XWXX.XXXX',
    'XWXXXXXXX',
    'XXXXXXXXX',
    '.XXXXXXX.',
    '..XXXXX..',
    '...XXX...',
    '....X....',
  ],
  corazonVacio: [
    '.XX...XX.',
    'X..X.X..X',
    'X...X...X',
    'X.......X',
    '.X.....X.',
    '..X...X..',
    '...X.X...',
    '....X....',
  ],
  corazonIzq: [
    '.XX......',
    'XWXX.....',
    'XWXXX....',
    'XXXX.....',
    '.XXXX....',
    '..XX.....',
    '...X.....',
    '.........',
  ],
  corazonDer: [
    '......XX.',
    '.....XXXX',
    '.....XXXX',
    '....XXXXX',
    '.....XXX.',
    '....XXX..',
    '....XX...',
    '....X....',
  ],
  check: [
    '........XX',
    '.......XXX',
    '......XXX.',
    'XX...XXX..',
    'XXX.XXX...',
    '.XXXXX....',
    '..XXX.....',
    '...X......',
  ],
  cruz: [
    'XX....XX',
    'XXX..XXX',
    '.XXXXXX.',
    '..XXXX..',
    '..XXXX..',
    '.XXXXXX.',
    'XXX..XXX',
    'XX....XX',
  ],
  reloj: [
    '..XXXXX..',
    '.XWWWWWX.',
    'XWWWXWWWX',
    'XWWWXWWWX',
    'XWWWXXXWX',
    'XWWWWWWWX',
    'XWWWWWWWX',
    '.XWWWWWX.',
    '..XXXXX..',
  ],
  moneda: [
    '..XXXX..',
    '.XYYYYX.',
    'XYYXXYYX',
    'XYXYYYYX',
    'XYYXXYYX',
    'XYYYYXYX',
    'XYYXXYYX',
    '.XYYYYX.',
    '..XXXX..',
  ],
  barrera: [
    'XX.........',
    'XXRRWWRRWWR',
    'XXRRWWRRWWR',
    'XX.........',
    'XX.........',
    'XX.........',
    'XX.........',
    'XXXX.......',
  ],
  mascara: [
    '.XXXXXXX.',
    'XXXXXXXXX',
    'XX..X..XX',
    'XX..X..XX',
    'XXXXXXXXX',
    'XXXXXXXXX',
    '.XX...XX.',
    '..XXXXX..',
  ],
  peligro: [
    '....X....',
    '...XXX...',
    '...XWX...',
    '..XXWXX..',
    '..XXWXX..',
    '.XXXXXXX.',
    '.XXXWXXX.',
    'XXXXXXXXX',
  ],
  sello: [
    '...XXX...',
    '...XXX...',
    '...XXX...',
    '..XXXXX..',
    '.XXXXXXX.',
    '.XXXXXXX.',
    '.........',
    'XXXXXXXXX',
    'XXXXXXXXX',
  ],
  avance: [
    'X.....X.....',
    'XX....XX....',
    'XXX...XXX...',
    'XXXX..XXXX..',
    'XXXXX.XXXXX.',
    'XXXX..XXXX..',
    'XXX...XXX...',
    'XX....XX....',
    'X.....X.....',
  ],
  estrella: [
    '....X....',
    '...XXX...',
    'XXXXXXXXX',
    '.XXXXXXX.',
    '..XXXXX..',
    '..XXXXX..',
    '.XXX.XXX.',
    '.XX...XX.',
    'X.......X',
  ],
  corona: [
    'X...X...X',
    'XX.XXX.XX',
    'XXXXXXXXX',
    'XXXXXXXXX',
    'XRXXBXXRX',
    'XXXXXXXXX',
  ],
  trofeo: [
    'XXXXXXXXX',
    'XWXXXXXXX',
    '.XWXXXXX.',
    '.XXXXXXX.',
    '..XXXXX..',
    '...XXX...',
    '....X....',
    '...XXX...',
    '..XXXXX..',
  ],
  calendario: [
    '.X....X.',
    'XXXXXXXX',
    'XWWWWWWX',
    'XWXWXWWX',
    'XWWWWWWX',
    'XWXWXWXX',
    'XXXXXXXX',
  ],
  json: [
    '..XX....XX..',
    '.X........X.',
    '.X..X.....X.',
    'X...X.XX...X',
    '.X..X.....X.',
    '.X........X.',
    '..XX....XX..',
  ],
  diana: [
    '..XXXXX..',
    '.XWWWWWX.',
    'XWWXXXWWX',
    'XWXWWWXWX',
    'XWXWXWXWX',
    'XWXWWWXWX',
    'XWWXXXWWX',
    '.XWWWWWX.',
    '..XXXXX..',
  ],
}

export function Icono({ nombre, color = '#fff', alto = 32, claro = '#ffffff', extra = {}, style }) {
  const filas = ICONOS[nombre]
  if (!filas) return null
  return (
    <PixelArt
      filas={filas}
      alto={alto}
      colores={{ X: color, W: claro, Y: '#ffd25e', R: '#e5383b', B: '#4f7cff', ...extra }}
      style={style}
    />
  )
}
