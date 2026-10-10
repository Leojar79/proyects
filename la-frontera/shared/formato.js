// Formato de números para pantalla y guion (español latinoamericano, es-419: punto decimal).

const LOCALE = 'es-419'

export function usd(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—'
  if (x === 0) return 'US$ 0'
  const abs = Math.abs(x)
  let texto
  if (abs >= 1) texto = x.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  else if (abs >= 0.01) texto = x.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 3 })
  else texto = x.toLocaleString(LOCALE, { maximumSignificantDigits: 2 })
  return `US$ ${texto}`
}

export function segundos(ms) {
  if (!ms && ms !== 0) return '—'
  return `${(ms / 1000).toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`
}

export function porcentaje(x) {
  return `${Math.round(x * 100)} %`
}

export function entero(x) {
  return Math.round(x).toLocaleString(LOCALE)
}

// "1,234 veces" para factores grandes, "2.5 veces" para pequeños.
export function factor(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—'
  if (x >= 100) return `${Math.round(x).toLocaleString(LOCALE)} veces`
  if (x >= 10) return `${Math.round(x)} veces`
  return `${x.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} veces`
}
