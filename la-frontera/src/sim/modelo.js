// Todo lo que la composición "simulación" necesita, calculado una sola vez.
// Números de costo: SOLO shared/simulacion.js (estimarCostos y SUPUESTOS). No usa corridas del
// benchmark ni public/runs/: aquí no hay aciertos, vidas, latencias ni resultados medidos.

import voz from '../../sim/voz.json'
import datos from '../../data/viajeros.json'
import { PUBLICACION } from '../../shared/config.js'
import { PROVEEDORES } from '../../shared/modelos.js'
import { textoMarcaAgua } from '../../shared/publicable.js'
import { SUPUESTOS, estimarCostos } from '../../shared/simulacion.js'
import { publicableSim } from '../../shared/simulacion-video.js'

export function prepararModeloSim() {
  const viajeros = datos.viajeros
  const porIdViajero = new Map(viajeros.map((v) => [v.id, v]))
  const estimaciones = estimarCostos(viajeros)
  const porId = Object.fromEntries(estimaciones.map((e) => [e.id, e]))
  const publicable = publicableSim({ publicacion: PUBLICACION, proveedores: PROVEEDORES })
  return {
    voz,
    duracion: voz.duracion,
    secciones: voz.secciones,
    frases: voz.frases,
    estimaciones,
    porId,
    supuestos: SUPUESTOS,
    presupuestoUSD: SUPUESTOS.presupuestoUSD,
    // Viajeros de ejemplo (data/viajeros.json). Lo que se sella en pantalla es su respuesta correcta.
    ejemploDecisiones: porIdViajero.get('v02'),
    ejemploJuego: porIdViajero.get('v01'),
    viajeros,
    publicable,
    bloqueado: publicable.bloqueos.length > 0,
    marcaAgua: textoMarcaAgua(publicable),
    divulgacion: String(PUBLICACION.divulgacion ?? '').trim(),
    enlaceMetodo: PUBLICACION.enlaceMetodo,
  }
}
