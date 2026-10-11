// El juego (43.2 - 50.8 s): «Mismo viajero, misma información, mismas preguntas para las tres.
// Lo que cambia es cuánto cuesta cada decisión.»
// Las tres columnas reciben el MISMO viajero de ejemplo (v01) y el MISMO sello: su respuesta correcta
// (data/viajeros.json), rotulada «respuesta correcta». No se compara quién acierta: solo el costo estimado.

import { centavos } from '../../../shared/simulacion-video.js'
import { clamp, easeOutBack, easeOutCubic, golpe, prog } from '../../lib/anim.js'
import { FUENTE_TEXTO, anchoTexto, tamParaAncho } from '../../lib/medir.js'
import { COLORES, alfa, siNo } from '../../lib/textos.js'
import { Icono } from '../../componentes/Pixel.jsx'
import { Sello } from '../../componentes/Sello.jsx'
import { bordePixel } from '../../componentes/ui.jsx'
import { T } from '../tiempos.js'
import { cajasJuego, ColumnaSim } from '../columnas.jsx'
import { Hoja, Moneda, PasaporteCerrado, Rotulo, colorNacion } from '../piezas.jsx'
import { CabinaViajero } from './DecisionesSim.jsx'

const ICONOS_PREGUNTAS = [
  ['barrera', '#c9cfe0'],
  ['mascara', '#c9b6ff'],
  ['peligro', '#ffc23d'],
  ['sello', '#ff8a9a'],
]

function Cuerpo({ m, e, i, t, L, w, h, maxCosto }) {
  const vertical = L.formato === 'vertical'
  const horizontal = L.orientacion === 'horizontal'
  const v = m.ejemploJuego
  const pad = 12
  const interior = w - pad * 2
  const tamIc = vertical ? 34 : 30
  const kInfo = easeOutBack(prog(t, T.mismaInfo + i * 0.06, 0.35), 2)
  const kPreg = (j) => easeOutBack(prog(t, T.mismasPreguntas + j * 0.07 + i * 0.03, 0.3), 2)
  const hojaH = Math.round(Math.min(h * 0.3, horizontal ? 190 : vertical ? 170 : 140))
  const g = golpe(t, T.selloEjemplo, -4)
  const tamChip = vertical ? 28 : horizontal ? 28 : 24
  const kChips = easeOutBack(prog(t, T.selloEjemplo + 0.2, 0.3))
  const tCosto = T.cuantoCuesta + i * 0.22
  const kC = easeOutBack(prog(t, tCosto, 0.4), 1.6)
  const kBarra = easeOutCubic(prog(t, tCosto + 0.15, 0.6))
  const conCosto = t >= tCosto
  const textoCosto = conCosto ? `≈ ${centavos(e.costo.central)} ¢` : '≈ ? ¢'
  const tamCosto = tamParaAncho(`≈ ${centavos(e.costo.central)} ¢`, interior - 24, vertical ? 54 : horizontal ? 60 : 46, 26, 800)
  const tamMini = vertical ? 24 : 22
  const frac = Math.max(e.costo.central / maxCosto, 0)
  // El sello es la respuesta correcta del ejemplo (no lo que contestó cada modelo): el rótulo lo dice.
  const tamRotulo = vertical ? 21 : 19
  const cabeRotulo = (x) => anchoTexto(x, tamRotulo, 800) + 2 * Math.round(tamRotulo * 0.45) <= interior
  const rotuloSello = ['EJEMPLO · RESPUESTA CORRECTA', 'RESPUESTA CORRECTA'].find(cabeRotulo) ?? 'EJEMPLO'
  const respuestas = [
    ['barrera', '#c9cfe0', siNo(v.verdad.pasa)],
    ['mascara', '#c9b6ff', siNo(v.verdad.miente)],
    ['peligro', '#ffc23d', `${v.verdad.peligro}/4`],
  ]
  return (
    <div style={{ position: 'absolute', inset: 0, padding: `${pad}px ${pad}px ${pad + 4}px`, display: 'flex', flexDirection: 'column', gap: vertical ? 14 : 12 }}>
      {/* Misma información (pasaporte) y mismas preguntas (los 4 íconos) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: tamIc + 12 }}>
        <div style={{ transform: `scale(${kInfo})`, opacity: clamp(kInfo * 2) }}>
          <PasaporteCerrado alto={tamIc + 8} color={colorNacion(v.documento.nacionalidad)} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {ICONOS_PREGUNTAS.map(([ic, col], j) => (
            <div key={ic} style={{ width: tamIc + 8, height: tamIc + 8, background: '#0e1322', boxShadow: bordePixel('#323c5e', 2, false), display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${kPreg(j)})`, opacity: clamp(kPreg(j) * 2) }}>
              <Icono nombre={ic} alto={Math.round(tamIc * 0.75)} color={col} claro="#0e1322" extra={{ R: '#e5383b', W: '#f5f5f5' }} />
            </div>
          ))}
        </div>
      </div>
      {/* Hoja con el sello: la respuesta correcta del ejemplo, igual en las tres */}
      <div style={{ position: 'relative', marginTop: 6 }}>
        <Hoja w={interior} h={hojaH} style={{ transform: `translate(${g.sacudida * 3}px, ${g.sacudida * 4}px)`, opacity: t >= T.mismasPreguntas ? 1 : 0.4 }}>
          {g.visible && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sello accion={v.verdad.accion} t={t} t0={T.selloEjemplo} ancho={interior * 0.84} alto={hojaH * 0.52} rot={-5} clave={`ej-${e.id}`} sobrePapel />
            </div>
          )}
        </Hoja>
        <div style={{ position: 'absolute', left: -6, top: -14 }}>
          <Rotulo texto={rotuloSello} tam={tamRotulo} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, opacity: clamp(kChips * 2), transform: `scale(${0.8 + 0.2 * kChips})` }}>
        {respuestas.map(([ic, col, x]) => (
          <div key={ic} style={{ flex: 1, padding: '5px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#0e1322', boxShadow: bordePixel('#323c5e', 3, false), fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamChip, color: '#fff', lineHeight: 1.15, whiteSpace: 'nowrap' }}>
            <Icono nombre={ic} alto={Math.round(tamChip * 0.75)} color={col} claro="#0e1322" extra={{ R: '#e5383b', W: '#f5f5f5' }} />
            {x}
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      {/* Lo que cambia: el costo estimado por decisión */}
      <div style={{ padding: '12px 12px 14px', background: 'rgba(5,6,12,0.82)', boxShadow: bordePixel(conCosto ? alfa(e.color, 0.85) : '#2a3150', 3, false), transform: `scale(${conCosto ? 0.75 + 0.25 * kC : 1})`, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: tamMini, color: COLORES.suave, whiteSpace: 'nowrap' }}>
          <Moneda alto={tamMini} />
          costo estimado
        </div>
        <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamCosto, lineHeight: 1.05, color: conCosto ? COLORES.ambar : 'rgba(180,190,215,0.3)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', opacity: conCosto ? clamp(kC * 2) : 1 }}>{textoCosto}</div>
        <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: tamMini, color: COLORES.suave, whiteSpace: 'nowrap' }}>por decisión</div>
        <div style={{ position: 'relative', height: Math.round(tamMini * 0.75), background: '#20263b', boxShadow: bordePixel('#0a0c16', 2, false) }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: conCosto ? Math.max(3, frac * (interior - 24) * kBarra) : 0, background: e.color }} />
        </div>
      </div>
    </div>
  )
}

export function JuegoSim({ m, L, t }) {
  const horizontal = L.orientacion === 'horizontal'
  const vertical = L.formato === 'vertical'
  const franjaH = vertical ? 56 : 48
  const cabinaH = vertical ? 330 : 300
  const { cabina, columnas } = cajasJuego(L, cabinaH + (horizontal ? 0 : franjaH + 12))
  const cab = horizontal ? { ...cabina, h: cabina.h - franjaH - 14, y: cabina.y + franjaH + 14 } : { ...cabina, h: cabinaH }
  const franja = horizontal ? { x: cabina.x, y: cabina.y, w: cabina.w, h: franjaH } : { x: cabina.x, y: cabina.y + cabinaH + 12, w: cabina.w, h: franjaH }
  const maxCosto = Math.max(...m.estimaciones.map((e) => e.costo.central))
  const v = m.ejemploJuego
  const piezas = [
    ['Mismo viajero', T.mismoViajero],
    ['misma información', T.mismaInfo],
    ['mismas preguntas', T.mismasPreguntas],
  ]
  const textoFranja = piezas.map((p) => p[0]).join(' · ')
  const tamF = tamParaAncho(textoFranja, franja.w - 30, vertical ? 34 : 28, 18, 800)
  const kCab = easeOutCubic(prog(t, 43.2, 0.5))
  return (
    <>
      <div style={{ opacity: clamp(kCab * 1.5), transform: `translateY(${(1 - kCab) * -50}px)` }}>
        <CabinaViajero v={v} caja={cab} L={L} t={t} t0={T.mismoViajero - 0.3} tHabla0={999} tHabla1={999} rotulo="VIAJERO DE EJEMPLO" conGlobo={false} />
      </div>
      <div style={{ position: 'absolute', left: franja.x, top: franja.y, width: franja.w, height: franja.h, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(8,10,20,0.88)', boxShadow: bordePixel('#2e3a5c', 3, false), fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamF, color: COLORES.texto, whiteSpace: 'nowrap', gap: '0.35em' }}>
        {piezas.map(([txt, t0], i) => {
          const k = easeOutBack(prog(t, t0, 0.35), 2)
          return (
            <span key={txt} style={{ display: 'inline-block', opacity: clamp(k * 2), transform: `translateY(${(1 - k) * 16}px)`, color: i === 0 ? COLORES.ambar : COLORES.texto }}>
              {txt}
              {i < piezas.length - 1 ? ' ·' : ''}
            </span>
          )
        })}
      </div>
      {m.estimaciones.map((e, i) => (
        <ColumnaSim key={e.id} e={e} caja={columnas[i]} L={L} kEntrada={easeOutBack(prog(t, 43.25 + i * 0.1, 0.5), 1.1)}>
          <Cuerpo m={m} e={e} i={i} t={t} L={L} w={columnas[i].w} h={columnas[i].h - 120} maxCosto={maxCosto} />
        </ColumnaSim>
      ))}
    </>
  )
}

