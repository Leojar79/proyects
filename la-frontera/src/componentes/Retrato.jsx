// Retrato pixel art procedural (20x20) a partir de la "semilla" del viajero. Determinista:
// la misma semilla da siempre la misma cara. Variantes: parpadeo y boca abierta (hablando).

import { memo } from 'react'
import { mulberry32 } from '../lib/anim.js'
import { tono } from '../lib/textos.js'

const N = 20
const PIELES = ['#f6d5bd', '#eab894', '#d39a6e', '#b07a50', '#8a5634', '#5f3a22']
const PELOS = ['#1b1715', '#3a2516', '#5e3a1e', '#8d5a2b', '#c99a4b', '#e2c27a', '#b5432a', '#8f8f97', '#e6e6ea']
const ROPAS = ['#355c9e', '#8c3434', '#3c7a4c', '#6a4c8c', '#b8822a', '#2c6c72', '#55586a', '#9a4f2a', '#1f3a60', '#7a2f55']
const SOMBREROS = ['#2b2b36', '#6b3e26', '#8c2f2f', '#2f4f7a', '#4a5a2a', '#d9c7a0']
const BUFANDAS = ['#d64545', '#e0b030', '#3d8bd6', '#4caf6a', '#e8e8e8']
const CONTORNO = '#0c0a12'

function generar(semilla) {
  const r = mulberry32(semilla * 2654435761)
  const elegir = (xs) => xs[Math.floor(r() * xs.length)]
  const g = Array.from({ length: N }, () => Array(N).fill(null))
  const set = (x, y, c) => {
    if (x >= 0 && x < N && y >= 0 && y < N) g[y][x] = c
  }
  const fila = (y, x1, x2, c) => {
    for (let x = x1; x <= x2; x++) set(x, y, c)
  }

  const piel = elegir(PIELES)
  const pielSombra = tono(piel, -0.18)
  const pelo = elegir(PELOS)
  const ropa = elegir(ROPAS)
  const ropaClara = tono(ropa, 0.25)
  const ropaOscura = tono(ropa, -0.3)
  const ancha = r() < 0.5
  const estiloPelo = Math.floor(r() * 7)
  const sombrero = r() < 0.32 ? Math.floor(r() * 4) : -1
  const colorSombrero = elegir(SOMBREROS)
  const lentes = r() < 0.22 ? (r() < 0.35 ? 'sol' : 'normal') : null
  const bigote = r() < 0.26
  const barba = r() < 0.16
  const bufanda = r() < 0.2 ? elegir(BUFANDAS) : null
  const arete = r() < 0.15
  const ropaTipo = Math.floor(r() * 3)
  const cejaEnojada = r() < 0.2
  const sonrisa = r() < 0.4

  const xi = ancha ? 5 : 6
  const xd = ancha ? 14 : 13

  // Pelo largo detrás de la cabeza.
  if (estiloPelo === 2 && sombrero < 0) {
    for (let y = 5; y <= 15; y++) {
      fila(y, xi - 2, xi - 1, pelo)
      fila(y, xd + 1, xd + 2, pelo)
    }
  }
  // Afro
  if (estiloPelo === 3 && sombrero < 0) {
    fila(0, 7, 12, pelo)
    fila(1, 5, 14, pelo)
    for (let y = 2; y <= 9; y++) fila(y, xi - 2, xd + 2, pelo)
    fila(10, xi - 1, xd + 1, pelo)
  }

  // Cuerpo y ropa
  fila(15, 5, 14, ropa)
  fila(16, 3, 16, ropa)
  for (let y = 17; y < N; y++) fila(y, 1, 18, ropa)
  for (let y = 17; y < N; y++) {
    set(1, y, ropaOscura)
    set(18, y, ropaOscura)
  }
  if (ropaTipo === 0) {
    // Camisa con cuello blanco
    fila(15, 8, 11, '#f2f2f2')
    fila(16, 8, 11, '#f2f2f2')
    fila(17, 9, 10, '#f2f2f2')
    set(9, 16, piel)
    set(10, 16, piel)
  } else if (ropaTipo === 1) {
    // Abrigo con solapas y botones
    fila(15, 8, 11, ropaOscura)
    fila(16, 7, 12, ropaOscura)
    fila(16, 9, 10, '#e9e4d8')
    for (let y = 17; y < N; y++) set(9, y, ropaOscura)
    set(10, 18, '#d8b24a')
    set(10, 17, ropaClara)
  } else {
    // Suéter con cuello redondo
    fila(15, 7, 12, ropaClara)
    fila(16, 8, 11, ropaClara)
    for (let x = 2; x <= 17; x += 3) set(x, 19, ropaClara)
  }

  // Cuello
  for (let y = 13; y <= 14; y++) fila(y, 8, 11, y === 13 ? pielSombra : piel)
  if (ropaTipo !== 0) fila(15, 9, 10, piel)

  // Cabeza
  fila(3, xi + 2, xd - 2, piel)
  fila(4, xi + 1, xd - 1, piel)
  for (let y = 5; y <= 11; y++) fila(y, xi, xd, piel)
  fila(12, xi + 1, xd - 1, piel)
  fila(13, xi + 2, xd - 2, piel)
  for (let y = 5; y <= 12; y++) set(xd, y, pielSombra)
  // Orejas
  set(xi - 1, 8, pielSombra)
  set(xi - 1, 9, pielSombra)
  set(xd + 1, 8, pielSombra)
  set(xd + 1, 9, pielSombra)
  if (arete) set(xi - 1, 10, '#ffd25e')

  // Pelo
  if (sombrero < 0) {
    if (estiloPelo === 1 || estiloPelo === 2 || estiloPelo === 5) {
      fila(2, xi + 2, xd - 2, pelo)
      fila(3, xi + 1, xd - 1, pelo)
      fila(4, xi, xd, pelo)
      fila(5, xi, xi + 1, pelo)
      fila(5, xd - 1, xd, pelo)
      set(xi, 6, pelo)
      set(xd, 6, pelo)
      if (estiloPelo === 5) {
        fila(0, 8, 11, pelo)
        fila(1, 8, 11, pelo)
      }
    } else if (estiloPelo === 3) {
      fila(3, xi, xd, pelo)
      fila(4, xi, xd, pelo)
    } else if (estiloPelo === 4) {
      // Copete
      fila(1, xi + 3, xd, pelo)
      fila(2, xi + 1, xd + 1, pelo)
      fila(3, xi, xd, pelo)
      fila(4, xi, xd, pelo)
      set(xi, 5, pelo)
      set(xd, 5, pelo)
    } else if (estiloPelo === 6) {
      // Raya al costado
      fila(2, xi + 1, xd - 1, pelo)
      fila(3, xi, xd, pelo)
      fila(4, xi, xi + 3, pelo)
      fila(4, xi + 5, xd, pelo)
      set(xi, 5, pelo)
    } else {
      // Calvo: solo los costados
      set(xi, 6, pelo)
      set(xi, 7, pelo)
      set(xd, 6, pelo)
      set(xd, 7, pelo)
    }
  }

  // Sombreros
  if (sombrero === 0) {
    // Gorra con visera
    fila(1, xi + 2, xd - 2, colorSombrero)
    fila(2, xi + 1, xd - 1, colorSombrero)
    fila(3, xi, xd, colorSombrero)
    fila(4, xi - 3, xd, tono(colorSombrero, -0.3))
    set(9, 1, tono(colorSombrero, 0.3))
  } else if (sombrero === 1) {
    // Sombrero de ala
    fila(0, xi + 2, xd - 2, colorSombrero)
    fila(1, xi + 1, xd - 1, colorSombrero)
    fila(2, xi + 1, xd - 1, colorSombrero)
    fila(3, xi + 1, xd - 1, tono(colorSombrero, -0.45))
    fila(4, xi - 2, xd + 2, colorSombrero)
    fila(5, xi - 1, xd + 1, tono(colorSombrero, -0.2))
  } else if (sombrero === 2) {
    // Gorro de lana con pompón
    fila(0, 9, 10, '#f2f2f2')
    fila(1, xi + 2, xd - 2, colorSombrero)
    fila(2, xi + 1, xd - 1, colorSombrero)
    fila(3, xi, xd, colorSombrero)
    fila(4, xi, xd, tono(colorSombrero, 0.25))
    for (let x = xi; x <= xd; x += 2) set(x, 4, tono(colorSombrero, -0.25))
  } else if (sombrero === 3) {
    // Gorro de piel con orejeras
    const piel2 = '#7a5a3a'
    fila(1, xi + 1, xd - 1, colorSombrero)
    fila(2, xi, xd, colorSombrero)
    fila(3, xi - 1, xd + 1, piel2)
    fila(4, xi - 1, xd + 1, piel2)
    for (let y = 5; y <= 10; y++) {
      set(xi - 1, y, piel2)
      set(xd + 1, y, piel2)
    }
  }

  // Cejas
  const ceja = tono(pelo === '#e6e6ea' ? '#8f8f97' : pelo, -0.2)
  if (cejaEnojada) {
    set(7, 6, ceja)
    set(8, 7, ceja)
    set(12, 6, ceja)
    set(11, 7, ceja)
  } else {
    fila(6, 7, 8, ceja)
    fila(6, 11, 12, ceja)
  }

  // Nariz
  set(10, 9, pielSombra)
  set(10, 10, pielSombra)
  set(9, 10, pielSombra)

  // Barba y bigote
  if (barba) {
    for (let y = 10; y <= 12; y++) {
      set(xi, y, pelo)
      set(xd, y, pelo)
    }
    fila(12, xi + 1, xd - 1, pelo)
    fila(13, xi + 2, xd - 2, pelo)
    fila(11, xi + 1, xi + 1, pelo)
    fila(11, xd - 1, xd - 1, pelo)
  }
  if (bigote || barba) fila(10, 8, 11, pelo)

  // Bufanda
  if (bufanda) {
    fila(13, 6, 13, bufanda)
    fila(14, 6, 13, bufanda)
    fila(15, 6, 9, tono(bufanda, -0.25))
    fila(16, 6, 7, bufanda)
    set(8, 13, tono(bufanda, 0.35))
    set(11, 14, tono(bufanda, 0.35))
  }

  // Contorno oscuro alrededor de la figura (estilo "sticker").
  const base = g.map((f) => [...f])
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (base[y][x]) continue
      const vecino = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => base[y + dy]?.[x + dx])
      if (vecino) g[y][x] = CONTORNO
    }
  }

  return { g, piel, pielSombra, pelo, lentes, bigote, barba, sonrisa }
}

const cache = new Map()
function retrato(semilla) {
  let v = cache.get(semilla)
  if (!v) {
    v = generar(semilla)
    cache.set(semilla, v)
  }
  return v
}

function aplicarCara(base, { parpadeo, hablando }) {
  const { g, pielSombra, lentes, bigote, barba, sonrisa } = base
  const c = g.map((f) => [...f])
  // Ojos (miran un poco hacia la izquierda, hacia el guardia)
  if (parpadeo) {
    c[8][7] = pielSombra
    c[8][8] = pielSombra
    c[8][11] = pielSombra
    c[8][12] = pielSombra
  } else {
    c[8][7] = '#14121c'
    c[8][8] = '#f4f4f4'
    c[8][11] = '#14121c'
    c[8][12] = '#f4f4f4'
  }
  // Lentes
  if (lentes) {
    const marco = lentes === 'sol' ? '#111' : '#2b2b2b'
    for (const x of [6, 9, 10, 13]) c[8][x] = marco
    for (const x of [7, 8, 11, 12]) c[7][x] = marco
    if (lentes === 'sol') for (const x of [7, 8, 11, 12]) c[8][x] = '#1a1a24'
  }
  // Boca
  const boca = '#7a2e33'
  if (hablando) {
    c[11][9] = '#3a1216'
    c[11][10] = '#3a1216'
    c[12][9] = boca
    c[12][10] = boca
    if (!barba) {
      c[11][8] = boca
      c[11][11] = boca
    }
  } else if (!(bigote && barba)) {
    c[11][9] = boca
    c[11][10] = boca
    if (sonrisa) {
      c[10][8] = bigote ? c[10][8] : boca
      c[10][11] = bigote ? c[10][11] : boca
    } else {
      c[11][8] = boca
      c[11][11] = boca
    }
  }
  return c
}

function rectsDe(c) {
  const out = []
  for (let y = 0; y < N; y++) {
    let x = 0
    while (x < N) {
      const col = c[y][x]
      if (!col) {
        x++
        continue
      }
      let x2 = x + 1
      while (x2 < N && c[y][x2] === col) x2++
      out.push(<rect key={`${x}-${y}`} x={x} y={y} width={x2 - x} height={1} fill={col} />)
      x = x2
    }
  }
  return out
}

const cacheCaras = new Map()
function cara(semilla, parpadeo, hablando) {
  const k = `${semilla}|${parpadeo ? 1 : 0}|${hablando ? 1 : 0}`
  let v = cacheCaras.get(k)
  if (!v) {
    v = rectsDe(aplicarCara(retrato(semilla), { parpadeo, hablando }))
    cacheCaras.set(k, v)
  }
  return v
}

// t: tiempo (para el parpadeo); hablando: boca que se abre y se cierra.
export const Retrato = memo(function Retrato({ semilla, tam, t = 0, hablando = false, style }) {
  const fase = ((semilla % 997) / 997) * 3.3
  const ciclo = (t + fase) % 3.3
  const parpadeo = ciclo > 3.15
  const bocaAbierta = hablando && Math.floor(t * 9) % 2 === 0
  return (
    <svg
      width={tam}
      height={tam}
      viewBox={`0 0 ${N} ${N}`}
      shapeRendering="crispEdges"
      style={{ display: 'block', flex: 'none', ...style }}
    >
      {cara(semilla, parpadeo, bocaAbierta)}
    </svg>
  )
})
