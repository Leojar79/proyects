// Etiqueta de divulgación (la relación del autor con TypeSafe, PUBLICACION.divulgacion).
// Se ve durante TODO el video, arriba a la derecha: sin marca de agua ocupa el lugar de la
// franja; con marca de agua va justo debajo (L.aviso lo decide crearLayout).

import { FUENTE_TEXTO, tamParaAncho } from '../lib/medir.js'
import { COLORES } from '../lib/textos.js'

export function Divulgacion({ L, texto }) {
  if (!texto) return null
  const caja = L.aviso
  const tamMax = L.formato === 'vertical' ? 26 : 24
  const pad = 14
  const tam = tamParaAncho(texto, caja.w - pad * 2, tamMax, L.formato === 'vertical' ? 24 : 20, 700)
  return (
    <div
      style={{
        position: 'absolute',
        left: caja.x,
        top: caja.y,
        width: caja.w,
        height: caja.h,
        zIndex: 55,
        pointerEvents: 'none',
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          height: caja.h,
          maxWidth: caja.w,
          padding: `0 ${pad}px`,
          display: 'flex',
          alignItems: 'center',
          background: 'rgba(6, 8, 16, 0.88)',
          boxShadow: '0 0 0 2px rgba(255, 194, 61, 0.75)',
          fontFamily: FUENTE_TEXTO,
          fontWeight: 700,
          fontSize: tam,
          lineHeight: 1,
          color: COLORES.texto,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        {texto}
      </div>
    </div>
  )
}
