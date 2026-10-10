// Escenas 3 y 4 (detalle y avance rápido): la cabina del viajero y las tres columnas.

import { viajeroEn } from '../../shared/timeline.js'
import { easeOutBack, easeOutCubic, prog } from '../lib/anim.js'
import { ESC } from '../lib/datos.js'
import { Cabina } from '../componentes/Cabina.jsx'
import { Columna } from '../componentes/Columna.jsx'

export function Juego({ m, L, t }) {
  const info = viajeroEn(t, m.N)
  if (!info || info.indice >= m.N) return null
  const t0 = ESC.detalle.inicio
  const kCab = easeOutCubic(prog(t, t0, 0.5))
  return (
    <>
      <Cabina m={m} L={L} t={t} info={info} kEntrada={kCab} />
      {m.proveedores.slice(0, 3).map((p, k) => (
        <Columna
          key={p.id}
          m={m}
          p={p}
          k={k}
          caja={L.juego.columnas[k]}
          t={t}
          L={L}
          info={info}
          kEntrada={easeOutBack(prog(t, t0 + 0.1 + k * 0.1, 0.55), 1.2)}
        />
      ))}
    </>
  )
}
