// PROVISIONAL: lo reemplaza el módulo definitivo del guion.
// Contrato: segmentosGuion(estadisticas) -> [{ inicio, fin, escena, texto, enPantalla }]
// `estadisticas` es lo que devuelve calcularEstadisticas() de shared/juego.js.

export function segmentosGuion() {
  return [
    { inicio: 0, fin: 4, escena: 'gancho', texto: 'Le di el mismo presupuesto a tres inteligencias artificiales.', enPantalla: '' },
  ]
}
