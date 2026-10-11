// Lo que también hay que decir (71.3 - 84.2 s): «Ojo: son costos estimados. No es una prueba real.
// Comparé contra los modelos insignia. Hay muchos modelos de lenguaje bastante más económicos.
// Aquí no estoy midiendo quién acierta más.»
// Tarjeta de transparencia (cada línea entra con la voz) y tabla de supuestos y precios.

import { precioMasBarato } from '../../../shared/simulacion-video.js'
import { clamp, easeOutBack, easeOutCubic, prog } from '../../lib/anim.js'
import { FUENTE_TEXTO, FUENTE_TITULO, partirLineas, tamParaAncho } from '../../lib/medir.js'
import { COLORES, fechaISOaCorta, numeroPrecio, tono } from '../../lib/textos.js'
import { Icono } from '../../componentes/Pixel.jsx'
import { bordePixel } from '../../componentes/ui.jsx'
import { T } from '../tiempos.js'
import { Moneda, TituloPixel } from '../piezas.jsx'

function Tachado({ alto }) {
  return (
    <div style={{ position: 'relative', width: alto, height: alto }}>
      <Icono nombre="diana" alto={alto} color="#9aa3bd" claro="#141a2c" />
      <div style={{ position: 'absolute', left: -4, right: -4, top: '50%', height: 5, marginTop: -2, background: '#ff4d5e', transform: 'rotate(-35deg)' }} />
    </div>
  )
}

function Linea({ icono, texto, detalle, w, tam, tamDet, t, t0 }) {
  const k = easeOutBack(prog(t, t0 - 0.05, 0.4), 1.6)
  const anchoTexto = w - tam * 1.6 - 18
  const lineas = partirLineas(texto, anchoTexto, tam, 800)
  const lineasDet = detalle ? partirLineas(detalle, anchoTexto, tamDet, 600) : []
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, opacity: t >= t0 - 0.05 ? clamp(k * 2) : 0.12, transform: `translateX(${t >= t0 - 0.05 ? (1 - k) * 60 : 0}px)` }}>
      <div style={{ width: tam * 1.6, display: 'flex', justifyContent: 'center', paddingTop: 4, flex: 'none' }}>{icono(Math.round(tam * 1.05))}</div>
      <div style={{ flex: 1 }}>
        {lineas.map((l, i) => (
          <div key={i} style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tam, lineHeight: 1.2, color: COLORES.texto, whiteSpace: 'nowrap' }}>{l}</div>
        ))}
        {lineasDet.map((l, i) => (
          <div key={`d${i}`} style={{ fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: tamDet, lineHeight: 1.25, color: COLORES.suave, whiteSpace: 'nowrap', marginTop: i === 0 ? 4 : 0 }}>{l}</div>
        ))}
      </div>
    </div>
  )
}

function Tabla({ m, L, w, t }) {
  const vertical = L.formato === 'vertical'
  const tam = vertical ? 24 : 22
  const k = easeOutCubic(prog(t, T.tabla, 0.5))
  const s = m.supuestos
  const colNombre = Math.round(w * 0.3)
  const colPrecio = Math.round(w * 0.2)
  const fila = (a, b, c, estilo = {}, key) => (
    <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '6px 0', borderTop: '2px solid rgba(255,255,255,0.08)', ...estilo }}>
      <div style={{ width: colNombre, flex: 'none' }}>{a}</div>
      <div style={{ width: colPrecio, flex: 'none', fontVariantNumeric: 'tabular-nums' }}>{b}</div>
      <div style={{ flex: 1 }}>{c}</div>
    </div>
  )
  const supuesto = `Tokens por decisión: ≈${m.porId.gpt.tokensEntrada} de entrada (Jev ≈${m.porId.jev.tokensEntrada}). GPT y Opus escriben entre ${s.salidaLLM.minimo} y ${s.salidaLLM.maximo} tokens (${s.salidaLLM.central} en el centro), incluido el razonamiento interno. Presupuesto: US$ ${s.presupuestoUSD} para cada una.`
  const lineasSup = partirLineas(supuesto, w - 36, tam, 600)
  return (
    <div style={{ width: w, padding: '14px 18px', background: 'rgba(6,8,16,0.88)', boxShadow: bordePixel('#2e3a5c', 4), fontFamily: FUENTE_TEXTO, fontSize: tam, color: COLORES.texto, opacity: clamp(k * 1.5), transform: `translateY(${(1 - k) * 40}px)`, flex: 'none' }}>
      <div style={{ fontFamily: FUENTE_TITULO, fontSize: tamParaAncho('SUPUESTOS Y PRECIOS', w - 40, vertical ? 20 : 18, 10, 400, FUENTE_TITULO), color: COLORES.ambar, marginBottom: 10 }}>SUPUESTOS Y PRECIOS</div>
      {fila(
        <span style={{ fontWeight: 700, color: COLORES.suave }}>modelo</span>,
        <span style={{ fontWeight: 700, color: COLORES.suave }}>US$ / M tokens</span>,
        <span style={{ fontWeight: 700, color: COLORES.suave }}>fuente del precio</span>,
        { borderTop: 'none' },
        'h',
      )}
      {m.estimaciones.map((e) =>
        fila(
          <span style={{ fontWeight: 800, color: tono(e.color, 0.3), whiteSpace: 'nowrap' }}>{e.nombre}</span>,
          <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{numeroPrecio(e.precio.entradaPorMTok)} / {numeroPrecio(e.precio.salidaPorMTok)}</span>,
          <span style={{ fontWeight: 700, color: e.precio.verificado === false ? COLORES.ambar : '#8ff0b5', whiteSpace: 'nowrap' }}>
            {e.precio.verificado === false ? 'fuentes secundarias' : 'oficial (Anthropic)'} · {fechaISOaCorta(e.precio.fecha)}
          </span>,
          {},
          e.id,
        ),
      )}
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '2px solid rgba(255,255,255,0.08)' }}>
        {lineasSup.map((l, i) => (
          <div key={i} style={{ fontWeight: 600, color: COLORES.suave, lineHeight: 1.25, whiteSpace: 'nowrap' }}>{l}</div>
        ))}
      </div>
    </div>
  )
}

export function AclaracionSim({ m, L, t }) {
  const C = L.contenido
  const vertical = L.formato === 'vertical'
  const horizontal = L.orientacion === 'horizontal'
  const gap = vertical ? 20 : 16
  const tamTitulo = tamParaAncho('LO QUE TAMBIÉN HAY QUE DECIR', C.w * 0.95, vertical ? 32 : 30, 14, 400, FUENTE_TITULO)
  const kT = easeOutBack(prog(t, 71.35, 0.4))
  const wCard = horizontal ? Math.round(C.w * 0.52) : C.w
  const wTabla = horizontal ? C.w - wCard - 24 : C.w
  const tam = vertical ? 36 : horizontal ? 32 : 31
  const tamDet = vertical ? 26 : 23
  const lineas = [
    { icono: (a) => <Icono nombre="peligro" alto={a} color={COLORES.ambar} claro="#141a2c" />, texto: 'Costos estimados · no es una prueba real', detalle: 'Precios publicados × tokens supuestos. No hubo llamadas a las APIs.' },
    { icono: (a) => <Icono nombre="corona" alto={a} color={COLORES.oro} extra={{ R: '#e5383b', B: '#4f7cff' }} />, texto: 'Comparado con modelos insignia', detalle: 'GPT-6 Astra y Claude Opus 5.5' },
    { icono: (a) => <Moneda alto={a} />, texto: 'Hay modelos de lenguaje más baratos', detalle: `p. ej. ${precioMasBarato()}` },
    { icono: (a) => <Tachado alto={a} />, texto: 'No mide aciertos', detalle: 'Aquí solo se compara el costo; los sellos que se vieron son la respuesta correcta de cada ejemplo.' },
  ]
  return (
    <div style={{ position: 'absolute', left: C.x, top: C.y, width: C.w, height: C.h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap }}>
      <div style={{ transform: `scale(${0.6 + 0.4 * kT})`, opacity: clamp(kT * 2) }}>
        <TituloPixel texto="LO QUE TAMBIÉN HAY QUE DECIR" tam={tamTitulo} />
      </div>
      <div style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', alignItems: horizontal ? 'flex-start' : 'center', gap: horizontal ? 24 : gap }}>
        <div style={{ width: wCard, padding: vertical ? '22px 22px' : '18px 18px', background: `linear-gradient(180deg, ${COLORES.panel2}, ${COLORES.panel})`, boxShadow: bordePixel('#7a5a12', 4), display: 'flex', flexDirection: 'column', gap: vertical ? 20 : 16, flex: 'none' }}>
          {lineas.map((x, i) => (
            <Linea key={i} {...x} w={wCard - 44} tam={tam} tamDet={tamDet} t={t} t0={T.aclaraciones[i]} />
          ))}
        </div>
        <Tabla m={m} L={L} w={wTabla} t={t} />
      </div>
    </div>
  )
}
