// Diseño de cada formato: zonas seguras, franja de demo, zona de contenido, subtítulos
// y cajas del juego (cabina del viajero + tres columnas).

import { VIDEO } from '../../shared/config.js'

export const FORMATOS = Object.keys(VIDEO.formatos)

export function normalizarFormato(f) {
  return FORMATOS.includes(f) ? f : 'vertical'
}

const caja = (x, y, w, h) => ({ x, y, w, h })

export function crearLayout(formato, subs) {
  const { ancho: W, alto: H } = VIDEO.formatos[formato]

  if (formato === 'vertical') {
    // TikTok / Reels / Shorts: ~220 px libres arriba y ~380 px abajo para su interfaz.
    const seguro = caja(36, 220, W - 72, H - 220 - 380)
    const franja = caja(0, 220, W, 48)
    const subsCaja = subs ? caja(36, 1540 - 116, W - 72, 110) : null
    const top = franja.y + franja.h + 10
    const bottom = subs ? subsCaja.y - 12 : 1540 - 8
    const contenido = caja(36, top, W - 72, bottom - top)
    const cabinaH = 492
    const colY = top + cabinaH + 14
    const colW = (contenido.w - 2 * 12) / 3
    return {
      formato, W, H, orientacion: 'vertical', seguro, franja, contenido, subs: subsCaja,
      fs: { min: 30, chico: 30, base: 32, medio: 38, grande: 48, titulo: 64, enorme: 88 },
      juego: {
        cabina: caja(contenido.x, top, contenido.w, cabinaH),
        columnas: [0, 1, 2].map((k) => caja(contenido.x + k * (colW + 12), colY, colW, bottom - colY)),
      },
    }
  }

  if (formato === 'feed') {
    const seguro = caja(60, 60, W - 120, H - 120)
    const franja = caja(0, 0, W, 46)
    const subsCaja = subs ? caja(60, H - 60 - 104, W - 120, 104) : null
    const top = 64
    const bottom = subs ? subsCaja.y - 12 : H - 56
    const contenido = caja(60, top, W - 120, bottom - top)
    const cabinaH = 456
    const colY = top + cabinaH + 14
    const colW = (contenido.w - 2 * 12) / 3
    return {
      formato, W, H, orientacion: 'vertical', seguro, franja, contenido, subs: subsCaja,
      fs: { min: 26, chico: 26, base: 28, medio: 34, grande: 44, titulo: 56, enorme: 76 },
      juego: {
        cabina: caja(contenido.x, top, contenido.w, cabinaH),
        columnas: [0, 1, 2].map((k) => caja(contenido.x + k * (colW + 12), colY, colW, bottom - colY)),
      },
    }
  }

  // horizontal
  const seguro = caja(60, 60, W - 120, H - 120)
  const franja = caja(0, 0, W, 46)
  const subsCaja = subs ? caja(180, H - 60 - 96, W - 360, 96) : null
  const top = 64
  const bottom = subs ? subsCaja.y - 12 : H - 56
  const contenido = caja(60, top, W - 120, bottom - top)
  const cabinaW = 640
  const colX = contenido.x + cabinaW + 24
  const colW = (contenido.x + contenido.w - colX - 2 * 16) / 3
  return {
    formato, W, H, orientacion: 'horizontal', seguro, franja, contenido, subs: subsCaja,
    fs: { min: 26, chico: 26, base: 28, medio: 34, grande: 44, titulo: 60, enorme: 96 },
    juego: {
      cabina: caja(contenido.x, top, cabinaW, contenido.h),
      columnas: [0, 1, 2].map((k) => caja(colX + k * (colW + 16), top, colW, contenido.h)),
    },
  }
}
