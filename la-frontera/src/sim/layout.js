// Diseño de cada formato para la composición "simulación".
//
// Arriba, dentro de la zona segura y siempre en el mismo lugar (el contenido no salta):
//   1. `franja`: la marca "NO PUBLICABLE" (si hay bloqueos) o, si se puede publicar, la etiqueta
//      de divulgación (`aviso`, a la derecha).
//   2. `etiqueta`: «SIMULACIÓN ILUSTRATIVA · costos estimados con precios publicados», fija.
// Abajo, los subtítulos (con subs=1) en la zona inferior segura; el contenido termina antes.

import { VIDEO } from '../../shared/config.js'

export const FORMATOS = Object.keys(VIDEO.formatos)
export const normalizarFormato = (f) => (FORMATOS.includes(f) ? f : 'vertical')

const caja = (x, y, w, h) => ({ x, y, w, h })

export function crearLayoutSim(formato, subs) {
  const { ancho: W, alto: H } = VIDEO.formatos[formato]
  if (formato === 'vertical') {
    // TikTok / Reels / Shorts: ~220 px libres arriba y ~380 px abajo para su interfaz.
    const franja = caja(0, 220, W, 48)
    const aviso = caja(36, 226, W - 72, 36)
    const etiqueta = caja(36, 276, W - 72, 82)
    const top = etiqueta.y + etiqueta.h + 14
    const subsCaja = subs ? caja(36, 1540 - 116, W - 72, 110) : null
    const bottom = subs ? subsCaja.y - 14 : 1532
    return {
      formato, W, H, orientacion: 'vertical', franja, aviso, etiqueta, subs: subsCaja,
      contenido: caja(36, top, W - 72, bottom - top),
      fs: { mini: 24, chico: 30, base: 34, medio: 40, grande: 52, titulo: 56, enorme: 88 },
      horizonte: 640,
    }
  }
  if (formato === 'feed') {
    const franja = caja(0, 60, W, 44)
    const aviso = caja(60, 64, W - 120, 36)
    const etiqueta = caja(60, 112, W - 120, 74)
    const top = etiqueta.y + etiqueta.h + 12
    const subsCaja = subs ? caja(60, H - 60 - 100, W - 120, 100) : null
    const bottom = subs ? subsCaja.y - 12 : H - 60
    return {
      formato, W, H, orientacion: 'vertical', franja, aviso, etiqueta, subs: subsCaja,
      contenido: caja(60, top, W - 120, bottom - top),
      fs: { mini: 22, chico: 26, base: 30, medio: 36, grande: 46, titulo: 48, enorme: 76 },
      horizonte: 470,
    }
  }
  // horizontal
  const franja = caja(0, 60, W, 44)
  const aviso = caja(60, 64, W - 120, 36)
  const etiqueta = caja(60, 112, W - 120, 48)
  const top = etiqueta.y + etiqueta.h + 12
  const subsCaja = subs ? caja(180, H - 60 - 92, W - 360, 92) : null
  const bottom = subs ? subsCaja.y - 12 : H - 60
  return {
    formato, W, H, orientacion: 'horizontal', franja, aviso, etiqueta, subs: subsCaja,
    contenido: caja(60, top, W - 120, bottom - top),
    fs: { mini: 22, chico: 26, base: 30, medio: 36, grande: 46, titulo: 52, enorme: 96 },
    horizonte: 430,
  }
}
