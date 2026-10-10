// Fondo nocturno del puesto fronterizo: cielo con estrellas, luna de pixeles, reflector,
// muro de ladrillos, alambre de púas, farol con luz cálida y el mostrador de madera.
// Todo depende de t (titileo, barrido del reflector, parpadeo del farol).

import { memo } from 'react'
import { mulberry32 } from '../lib/anim.js'

const LUNA = [
  '..XXXX..',
  '.XXXXWX.',
  'XXXXXXWX',
  'XXCXXXXX',
  'XXXXXCXX',
  'XCXXXXXX',
  '.XXXXXX.',
  '..XXXX..',
]

function estrellas(W, H, horizonte) {
  const r = mulberry32(777)
  return Array.from({ length: 70 }, () => ({
    x: Math.floor(r() * W),
    y: Math.floor(r() * horizonte * 0.95),
    s: r() < 0.2 ? 6 : r() < 0.6 ? 4 : 3,
    fase: r() * Math.PI * 2,
    vel: 0.8 + r() * 2.2,
  }))
}

const cacheEstrellas = new Map()

const Estatico = memo(function Estatico({ W, H, horizonte, ladrillo }) {
  const bw = ladrillo * 2
  const bh = ladrillo
  return (
    <>
      <defs>
        <linearGradient id="cielo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#070914" />
          <stop offset="0.6" stopColor="#141335" />
          <stop offset="1" stopColor="#2a1d3d" />
        </linearGradient>
        <pattern id="ladrillos" width={bw} height={bh * 2} patternUnits="userSpaceOnUse">
          <rect width={bw} height={bh * 2} fill="#120f1d" />
          <rect x="2" y="2" width={bw - 4} height={bh - 4} fill="#251d33" />
          <rect x="2" y="2" width={bw - 4} height="3" fill="#30263f" />
          <rect x={-bw / 2 + 2} y={bh + 2} width={bw - 4} height={bh - 4} fill="#211a2e" />
          <rect x={bw / 2 + 2} y={bh + 2} width={bw - 4} height={bh - 4} fill="#211a2e" />
          <rect x={-bw / 2 + 2} y={bh + 2} width={bw - 4} height="3" fill="#2b223a" />
          <rect x={bw / 2 + 2} y={bh + 2} width={bw - 4} height="3" fill="#2b223a" />
        </pattern>
        <pattern id="madera" width="240" height="40" patternUnits="userSpaceOnUse">
          <rect width="240" height="40" fill="#4a2c1b" />
          <rect y="0" width="240" height="4" fill="#5c3823" />
          <rect y="36" width="240" height="4" fill="#2e1a10" />
          <rect x="60" y="14" width="40" height="3" fill="#3c2416" />
          <rect x="170" y="24" width="30" height="3" fill="#3c2416" />
        </pattern>
        <radialGradient id="farol" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffbf5e" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#ff9a3c" stopOpacity="0.18" />
          <stop offset="1" stopColor="#ff9a3c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="vineta" cx="0.5" cy="0.45" r="0.75">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.6" />
        </radialGradient>
        <linearGradient id="haz" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#fff6d8" stopOpacity="0.16" />
          <stop offset="1" stopColor="#fff6d8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width={W} height={horizonte} fill="url(#cielo)" />
      {/* Siluetas de montañas */}
      <path
        d={`M0 ${horizonte} L0 ${horizonte - 90} L${W * 0.12} ${horizonte - 150} L${W * 0.22} ${horizonte - 100} L${W * 0.35} ${horizonte - 190} L${W * 0.5} ${horizonte - 110} L${W * 0.64} ${horizonte - 170} L${W * 0.8} ${horizonte - 95} L${W * 0.9} ${horizonte - 140} L${W} ${horizonte - 80} L${W} ${horizonte} Z`}
        fill="#0f0d22"
      />
      <rect y={horizonte} width={W} height={H - horizonte} fill="url(#ladrillos)" />
      {/* Remate del muro y alambre de púas */}
      <rect y={horizonte - 6} width={W} height="14" fill="#352a48" />
      <rect y={horizonte + 8} width={W} height="6" fill="#0d0a15" />
      {Array.from({ length: Math.ceil(W / 48) + 1 }, (_, i) => (
        <g key={i} fill="#4b4560">
          <rect x={i * 48} y={horizonte - 30} width="48" height="3" />
          <rect x={i * 48 + 20} y={horizonte - 36} width="4" height="14" />
          <rect x={i * 48 + 16} y={horizonte - 31} width="12" height="4" />
          {i % 4 === 0 && <rect x={i * 48 + 2} y={horizonte - 44} width="6" height="40" fill="#2c2840" />}
        </g>
      ))}
    </>
  )
})

export function Fondo({ W, H, t, horizonte, mostrador = 0, ladrillo = 30, luna = true }) {
  let est = cacheEstrellas.get(`${W}x${H}`)
  if (!est) {
    est = estrellas(W, H, horizonte)
    cacheEstrellas.set(`${W}x${H}`, est)
  }
  const ang = Math.sin(t * 0.35) * 26
  const parpadeo = 0.86 + 0.14 * Math.sin(t * 7.3) * Math.sin(t * 2.1)
  const lunaTam = Math.round(W * 0.085)
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ position: 'absolute', left: 0, top: 0 }}
      shapeRendering="crispEdges"
    >
      <Estatico W={W} H={H} horizonte={horizonte} ladrillo={ladrillo} />
      {est.map((s, i) => {
        const brillo = 0.35 + 0.65 * Math.max(0, Math.sin(t * s.vel + s.fase))
        return <rect key={i} x={s.x} y={s.y} width={s.s} height={s.s} fill="#e8e4ff" opacity={brillo} />
      })}
      {luna && <g transform={`translate(${W * 0.8} ${Math.max(40, horizonte * 0.12)}) scale(${lunaTam / 8})`}>
        {LUNA.map((f, y) =>
          [...f].map((c, x) =>
            c === '.' ? null : (
              <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={c === 'W' ? '#fffbe8' : c === 'C' ? '#cfc6a2' : '#efe6c2'} />
            ),
          ),
        )}
      </g>}
      {/* Reflector que barre el cielo */}
      <g transform={`rotate(${ang} ${W * 0.5} ${horizonte})`}>
        <polygon
          points={`${W * 0.5 - 10},${horizonte} ${W * 0.5 + 10},${horizonte} ${W * 0.5 + W * 0.28},${-H * 0.2} ${W * 0.5 - W * 0.28},${-H * 0.2}`}
          fill="url(#haz)"
        />
      </g>
      {/* Farol con luz cálida */}
      <circle cx={W * 0.12} cy={horizonte + 30} r={W * 0.42} fill="url(#farol)" opacity={parpadeo} shapeRendering="auto" />
      <circle cx={W * 0.88} cy={horizonte + 30} r={W * 0.3} fill="url(#farol)" opacity={parpadeo * 0.6} shapeRendering="auto" />
      {mostrador > 0 && (
        <>
          <rect y={H - mostrador} width={W} height={mostrador} fill="url(#madera)" />
          <rect y={H - mostrador} width={W} height="10" fill="#7a4a2c" />
          <rect y={H - mostrador + 10} width={W} height="6" fill="#26150c" />
        </>
      )}
      <rect width={W} height={H} fill="url(#vineta)" />
    </svg>
  )
}
