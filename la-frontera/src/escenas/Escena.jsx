// Dibuja el cuadro completo del segundo t: fondo, escena activa, cortina de transición,
// subtítulos y marca de agua. Es una función pura de (t, datos, formato).

import { ESCENAS, escenaEn } from '../../shared/timeline.js'
import { clamp } from '../lib/anim.js'
import { Fondo } from '../componentes/Fondo.jsx'
import { Escritorio } from '../componentes/Escritorio.jsx'
import { MarcaAgua } from '../componentes/MarcaAgua.jsx'
import { Subtitulos } from '../componentes/Subtitulos.jsx'
import { Gancho } from './Gancho.jsx'
import { Presentacion } from './Presentacion.jsx'
import { Juego } from './Juego.jsx'
import { Resultados } from './Resultados.jsx'
import { Cierre } from './Cierre.jsx'

// Cortina de bloques pixelados entre escenas (excepto entre detalle y avance rápido).
const CORTES = ESCENAS.slice(1)
  .filter((e) => e.id !== 'rapido')
  .map((e) => e.inicio)

function Cortina({ L, t }) {
  const corte = CORTES.find((b) => t >= b - 0.28 && t < b + 0.34)
  if (corte === undefined) return null
  const lado = L.formato === 'horizontal' ? 96 : 90
  const cols = Math.ceil(L.W / lado)
  const filas = Math.ceil(L.H / lado)
  const rects = []
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < cols; c++) {
      const d = (c / cols + f / filas) / 2
      let s
      if (t < corte) s = clamp((t - (corte - 0.28) - d * 0.13) / 0.13)
      else s = 1 - clamp((t - corte - d * 0.16) / 0.16)
      if (s <= 0) continue
      const tam = lado * s
      rects.push(<rect key={`${c}-${f}`} x={c * lado + (lado - tam) / 2} y={f * lado + (lado - tam) / 2} width={tam + 0.5} height={tam + 0.5} fill="#07080f" />)
    }
  }
  return (
    <svg width={L.W} height={L.H} style={{ position: 'absolute', left: 0, top: 0, zIndex: 30 }} shapeRendering="crispEdges">
      {rects}
    </svg>
  )
}

export function Escena({ m, L, t, subs }) {
  const e = escenaEn(t)
  let contenido = null
  if (e.id === 'gancho') contenido = <Gancho m={m} L={L} t={t} />
  else if (e.id === 'presentacion') contenido = <Presentacion m={m} L={L} t={t} />
  else if (e.id === 'detalle' || e.id === 'rapido') contenido = <Juego m={m} L={L} t={t} />
  else if (e.id === 'resultados') contenido = <Resultados m={m} L={L} t={t} />
  else contenido = <Cierre m={m} L={L} t={t} />
  const horizonte = L.formato === 'vertical' ? 640 : L.formato === 'feed' ? 470 : 430
  return (
    <div style={{ position: 'relative', width: L.W, height: L.H, overflow: 'hidden', background: '#07080f' }}>
      <Fondo W={L.W} H={L.H} t={t} horizonte={horizonte} mostrador={L.formato === 'vertical' ? 330 : 0} luna={L.formato === 'vertical'} ladrillo={L.formato === 'horizontal' ? 28 : 32} />
      <Escritorio L={L} t={t} />
      <div style={{ position: 'absolute', inset: 0 }}>{contenido}</div>
      <Cortina L={L} t={t} />
      {subs && <Subtitulos L={L} segmentos={m.segmentos} t={t} />}
      {m.esDemo && <MarcaAgua L={L} />}
    </div>
  )
}
