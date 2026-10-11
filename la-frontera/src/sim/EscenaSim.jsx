// Cuadro completo de la composición "simulación" en el segundo t: fondo, sección activa (según la voz),
// cortina entre secciones, subtítulos, etiqueta fija de SIMULACIÓN ILUSTRATIVA, marca de agua (si no se
// puede publicar) y divulgación. Función pura de (t, datos, formato).

import { ETIQUETA_SIM, seccionEn } from '../../shared/simulacion-video.js'
import { clamp } from '../lib/anim.js'
import { FUENTE_TEXTO, FUENTE_TITULO, anchoTexto, tamParaAncho } from '../lib/medir.js'
import { COLORES } from '../lib/textos.js'
import { Fondo } from '../componentes/Fondo.jsx'
import { Escritorio } from '../componentes/Escritorio.jsx'
import { MarcaAgua } from '../componentes/MarcaAgua.jsx'
import { Divulgacion } from '../componentes/Divulgacion.jsx'
import { Subtitulos } from '../componentes/Subtitulos.jsx'
import { bordePixel, TextoPixel } from '../componentes/ui.jsx'
import { GanchoSim } from './escenas/GanchoSim.jsx'
import { QueEsSim } from './escenas/QueEsSim.jsx'
import { DecisionesSim } from './escenas/DecisionesSim.jsx'
import { ComoRespondeSim } from './escenas/ComoRespondeSim.jsx'
import { JuegoSim } from './escenas/JuegoSim.jsx'
import { NumerosSim } from './escenas/NumerosSim.jsx'
import { AclaracionSim } from './escenas/AclaracionSim.jsx'
import { CierreSim } from './escenas/CierreSim.jsx'

const ESCENAS = {
  gancho: GanchoSim,
  quees: QueEsSim,
  decisiones: DecisionesSim,
  comoresponde: ComoRespondeSim,
  juego: JuegoSim,
  numeros: NumerosSim,
  aclaracion: AclaracionSim,
  cierre: CierreSim,
}

// Etiqueta fija: «SIMULACIÓN ILUSTRATIVA · costos estimados con precios publicados».
function EtiquetaSim({ L }) {
  const c = L.etiqueta
  const unaLinea = L.orientacion === 'horizontal'
  const tamP = unaLinea ? 22 : L.formato === 'vertical' ? 28 : 24
  const tamD = unaLinea ? 26 : L.formato === 'vertical' ? 30 : 26
  const detalle = unaLinea ? `· ${ETIQUETA_SIM.detalle}` : ETIQUETA_SIM.detalle
  const tamDet = tamParaAncho(detalle, c.w - 40, tamD, 20, 700)
  const ancho = unaLinea
    ? anchoTexto(ETIQUETA_SIM.principal, tamP, 400, FUENTE_TITULO) + 18 + anchoTexto(detalle, tamDet, 700) + 48
    : Math.max(anchoTexto(ETIQUETA_SIM.principal, tamP, 400, FUENTE_TITULO), anchoTexto(detalle, tamDet, 700)) + 48
  return (
    <div style={{ position: 'absolute', left: c.x, top: c.y, width: c.w, height: c.h, display: 'flex', justifyContent: 'center', zIndex: 56, pointerEvents: 'none' }}>
      <div style={{ width: Math.min(c.w, ancho), height: c.h, background: 'rgba(6, 8, 16, 0.9)', boxShadow: bordePixel(COLORES.ambar, 3, false), display: 'flex', flexDirection: unaLinea ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: unaLinea ? 18 : 8 }}>
        <div style={{ fontFamily: FUENTE_TITULO, fontSize: tamP, lineHeight: 1, color: COLORES.ambar, whiteSpace: 'nowrap' }}>
          <TextoPixel>{ETIQUETA_SIM.principal}</TextoPixel>
        </div>
        <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: tamDet, lineHeight: 1, color: COLORES.texto, whiteSpace: 'nowrap' }}>{detalle}</div>
      </div>
    </div>
  )
}

// Cortina de bloques pixelados entre secciones.
function Cortina({ L, t, cortes }) {
  const corte = cortes.find((b) => t >= b - 0.26 && t < b + 0.32)
  if (corte === undefined) return null
  const lado = L.formato === 'horizontal' ? 96 : 90
  const cols = Math.ceil(L.W / lado)
  const filas = Math.ceil(L.H / lado)
  const rects = []
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < cols; c++) {
      const d = (c / cols + f / filas) / 2
      const s = t < corte ? clamp((t - (corte - 0.26) - d * 0.12) / 0.12) : 1 - clamp((t - corte - d * 0.15) / 0.15)
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

// Subtítulos: la frase de sim/voz.json que se está diciendo (con su tiempo exacto); se queda en
// pantalla un instante después de terminar, hasta la frase siguiente (máx. 0,45 s).
function frasesParaSubtitulos(frases) {
  // Subtitulos.jsx reparte las palabras en el 92 % del tramo: se alarga `fin` para que las palabras
  // avancen al ritmo real de la frase.
  return frases.map((f, i) => {
    const siguiente = frases[i + 1]?.inicio ?? Infinity
    const finVisible = Math.min(siguiente - 0.02, f.fin + 0.45)
    return { inicio: f.inicio, fin: f.inicio + (f.fin - f.inicio) / 0.92, finVisible, texto: f.texto }
  })
}
const cacheFrases = new WeakMap()

export function EscenaSim({ m, L, t, subs }) {
  const seccion = seccionEn(m.secciones, t)
  const Contenido = ESCENAS[seccion.id]
  const cortes = m.secciones.slice(1).map((s) => s.inicio)
  let segs = cacheFrases.get(m.frases)
  if (!segs) {
    segs = frasesParaSubtitulos(m.frases)
    cacheFrases.set(m.frases, segs)
  }
  const activa = segs.find((s) => t >= s.inicio && t < s.finVisible)
  const tSubs = activa ? Math.min(t, activa.fin - 1e-3) : t
  return (
    <div style={{ position: 'relative', width: L.W, height: L.H, overflow: 'hidden', background: '#07080f' }}>
      <Fondo W={L.W} H={L.H} t={t} horizonte={L.horizonte} mostrador={L.formato === 'vertical' ? 330 : 0} luna={L.formato === 'vertical'} ladrillo={L.formato === 'horizontal' ? 28 : 32} />
      <Escritorio L={L} t={t} />
      <div style={{ position: 'absolute', inset: 0 }}>{Contenido && <Contenido m={m} L={L} t={t} />}</div>
      <Cortina L={L} t={t} cortes={cortes} />
      {subs && activa && <Subtitulos L={L} segmentos={[activa]} t={tSubs} />}
      {m.bloqueado && <MarcaAgua L={L} texto={m.marcaAgua} publicable={m.publicable} />}
      {!m.bloqueado && <Divulgacion L={L} texto={m.divulgacion} />}
      <EtiquetaSim L={L} />
    </div>
  )
}
