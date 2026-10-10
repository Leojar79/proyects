// Textos y formatos compartidos por las escenas.

export const SELLO = {
  aprobar: { texto: 'APROBADO', verbo: 'APROBAR', color: '#1f9d4c', tinta: '#1f9d4c' },
  rechazar: { texto: 'RECHAZADO', verbo: 'RECHAZAR', color: '#e5383b', tinta: '#d62f33' },
  interrogar: { texto: 'INTERROGAR', verbo: 'INTERROGAR', color: '#f5a524', tinta: '#d98a0b' },
  arrestar: { texto: 'ARRESTAR', verbo: 'ARRESTAR', color: '#9b1530', tinta: '#7d0f25' },
}

export const COLORES = {
  fondo: '#0b0d18',
  panel: '#141a2c',
  panel2: '#1b2338',
  borde: '#2e3a5c',
  texto: '#f6f2e9',
  suave: '#b4bdd3',
  tenue: '#7d87a3',
  papel: '#f1e7cf',
  papelOscuro: '#dfd0ad',
  tinta: '#2a2118',
  ambar: '#ffc23d',
  bien: '#3ddc84',
  mal: '#ff4d5e',
  oro: '#ffd25e',
}

export const siNo = (b) => (b ? 'SÍ' : 'NO')

// "2026-10-10T18:00:00.000Z" -> "10/10/2026" (fecha UTC, sin depender de la zona horaria).
export function fechaCorta(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getUTCFullYear()}`
}

// "2026-10-06" -> "06/10/2026"
export function fechaISOaCorta(f) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (f ?? '—')
}

// Rango de fechas de los precios: "06/10/2026" o "06/10/2026 al 10/10/2026".
export function rangoFechasPrecios(proveedores) {
  const fechas = [...new Set(proveedores.map((p) => p.precio?.fecha).filter(Boolean))].sort()
  if (!fechas.length) return '—'
  if (fechas.length === 1) return fechaISOaCorta(fechas[0])
  return `${fechaISOaCorta(fechas[0])} al ${fechaISOaCorta(fechas[fechas.length - 1])}`
}

// "x2" / "x1,5" para el letrero de cámara rápida.
export function multiplicador(x) {
  return `x${x.toLocaleString('es-419', { maximumFractionDigits: 1 })}`
}

// Color con transparencia a partir de #rrggbb.
export function alfa(hex, a) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '')
  if (!m) return `rgba(255,255,255,${a})`
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`
}

// Aclara (k>0) u oscurece (k<0) un color #rrggbb.
export function tono(hex, k) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '')
  if (!m) return hex
  const f = (c) => {
    const v = parseInt(c, 16)
    const r = k >= 0 ? v + (255 - v) * k : v * (1 + k)
    return Math.round(Math.min(255, Math.max(0, r))).toString(16).padStart(2, '0')
  }
  return `#${f(m[1])}${f(m[2])}${f(m[3])}`
}

// "A", "A y B", "A, B y C".
export function lista(xs) {
  const v = xs.filter(Boolean)
  if (v.length <= 1) return v[0] ?? ''
  return `${v.slice(0, -1).join(', ')} y ${v[v.length - 1]}`
}

// Precio por millón de tokens sin ceros de más: 10, 0.2, 0.042.
export function numeroPrecio(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '?'
  return x.toLocaleString('es-419', { maximumFractionDigits: 4, useGrouping: false })
}

// "GPT-6 Astra 10/50": precio de entrada / salida en US$ por millón de tokens, tal como se usó
// para calcular el costo de la corrida (el que viene copiado dentro de la corrida).
export function precioCorto(p) {
  return `${p.nombre} ${numeroPrecio(p.precio?.entradaPorMTok)}/${numeroPrecio(p.precio?.salidaPorMTok)}`
}
