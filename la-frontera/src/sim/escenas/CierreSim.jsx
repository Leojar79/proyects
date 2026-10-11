// Cierre (84.2 - 93 s): «Mi conclusión: los modelos generativos sirven para crear. Jev, para decidir.»
// Dos tiempos, sin cortes:
//  1. La conclusión (rotulada como OPINIÓN), grande y centrada, línea por línea con la voz.
//  2. Al terminar la voz, la conclusión sube y se achica; aparecen las fuentes de los precios con
//     fecha, los supuestos, los modelos más baratos que no se compararon, el enlace al método, la línea
//     de marcas y el título final.
// La divulgación (relación con TypeSafe) solo aparece si PUBLICACION.relacionTypeSafe no es 'ninguna'.

import { usd } from '../../../shared/formato.js'
import { CONCLUSION, LINEA_MARCAS, precioMasBarato } from '../../../shared/simulacion-video.js'
import { clamp, easeInOutCubic, easeOutBack, easeOutCubic, golpe, lerp, prog } from '../../lib/anim.js'
import { FUENTE_TEXTO, FUENTE_TITULO, tamParaAncho } from '../../lib/medir.js'
import { COLORES, alfa, fechaISOaCorta, numeroPrecio } from '../../lib/textos.js'
import { bordePixel, TextoPixel } from '../../componentes/ui.jsx'
import { T } from '../tiempos.js'
import { conNB, partir } from '../texto.js'
import { Rotulo, SOMBRA_TEXTO } from '../piezas.jsx'

// "Finout y OpenRouter (no es la página oficial…)" -> "Finout y OpenRouter";
// "Agregadores (flaviocopes.com, eesel.ai, OpenRouter); TypeSafe no…" -> "flaviocopes.com, eesel.ai, OpenRouter".
function fuenteCorta(e) {
  if (e.precio.verificado !== false) return `tabla oficial de ${e.empresa}`
  const nombres = String(e.precio.fuente ?? '')
    .split(/\s\(no es|;/)[0]
    .replace(/^Agregadores \((.*)\)$/, '$1')
    .trim()
  return nombres ? `fuentes secundarias (${nombres})` : 'fuentes secundarias'
}

export function CierreSim({ m, L, t }) {
  const C = L.contenido
  const vertical = L.formato === 'vertical'
  const horizontal = L.orientacion === 'horizontal'
  const jev = m.porId.jev
  // --- 1. Conclusión (opinión).
  const lineasConc = horizontal
    ? [
        [{ texto: 'Los modelos generativos:' }, { texto: 'para crear.', acento: true }],
        [{ texto: 'Jev:', color: jev.color }, { texto: 'para decidir.', acento: true }],
      ]
    : [[{ texto: 'Los modelos generativos:' }], [{ texto: 'para crear.', acento: true }], [{ texto: 'Jev:', color: jev.color }, { texto: 'para decidir.', acento: true }]]
  const plano = (ln) => ln.map((x) => x.texto).join(' ')
  const tamConc = Math.min(...lineasConc.map((ln) => tamParaAncho(plano(ln), C.w * 0.94, vertical ? 66 : horizontal ? 64 : 58, 26, 800)))
  const tamEtq = vertical ? 32 : 28
  const altoEtq = Math.round(tamEtq * 1.9)
  const altoLineaConc = Math.round(tamConc * 1.2)
  const hConc = altoEtq + lineasConc.length * altoLineaConc
  const momentoLinea = (i) => (horizontal ? (i === 0 ? T.crear : T.decidir) : i < 2 ? T.crear : T.decidir)

  // --- 2. Información (fuentes, supuestos, más baratos, método, marcas).
  const anchoInfo = Math.min(C.w * 0.97, horizontal ? 1500 : C.w)
  const tamInfo = vertical ? 25 : horizontal ? 25 : 23
  const info = []
  const parrafo = (texto, extra = {}) => {
    const peso = extra.peso ?? 600
    const tam = extra.tam ?? tamInfo
    for (const l of partir(conNB(texto), anchoInfo, tam, peso)) info.push({ texto: l, tam, peso, color: COLORES.suave, ...extra, sep: false })
  }
  const separar = () => {
    if (info.length) info[info.length - 1].sep = true
  }
  if (m.divulgacion) {
    parrafo(m.divulgacion, { color: COLORES.texto, peso: 800, tam: tamInfo + 4 })
    separar()
  } else if (m.bloqueado && m.marcaAgua) {
    parrafo(m.marcaAgua, { color: '#ffcf33', peso: 800, tam: tamInfo + 2 })
    separar()
  }
  parrafo('Fuentes de los precios (US$ por millón de tokens, entrada / salida):', { color: COLORES.ambar, peso: 800 })
  for (const e of m.estimaciones) {
    parrafo(`${e.nombre}: ${numeroPrecio(e.precio.entradaPorMTok)} / ${numeroPrecio(e.precio.salidaPorMTok)} · ${fuenteCorta(e)}, ${fechaISOaCorta(e.precio.fecha)}`, { color: COLORES.texto })
  }
  separar()
  const s = m.supuestos
  parrafo(
    `Supuestos de la estimación: ≈${m.porId.gpt.tokensEntrada} tokens de entrada por decisión (Jev ≈${jev.tokensEntrada}); GPT y Opus escriben ${s.salidaLLM.minimo}–${s.salidaLLM.maximo} tokens (${s.salidaLLM.central} en el centro). Presupuesto: ${usd(m.presupuestoUSD)} para cada una.`,
  )
  separar()
  parrafo(`Hay modelos de lenguaje más baratos que no se compararon (p. ej. ${precioMasBarato()}).`)
  separar()
  const metodo = `Método y código: ${m.enlaceMetodo}`
  info.push({ texto: metodo, tam: tamParaAncho(metodo, anchoInfo, tamInfo + 3, 20, 800), peso: 800, color: COLORES.ambar, sep: true })
  parrafo(LINEA_MARCAS, { color: COLORES.tenue, tam: vertical ? 22 : 22 })
  const altoInfo = (x) => Math.round(x.tam * 1.3) + (x.sep ? Math.round(tamInfo * 0.45) : 0)
  const hInfo = info.reduce((a, x) => a + altoInfo(x), 0)

  // --- 3. Título.
  const tamTitulo = tamParaAncho('LA FRONTERA', C.w * 0.7, vertical ? 64 : horizontal ? 60 : 54, 24, 400, FUENTE_TITULO)
  const tamPildora = vertical ? 26 : 24
  const hTitulo = Math.round(tamTitulo * 1.35) + Math.round(tamPildora * 1.7) + 12

  // --- Posiciones. Tiempo 1: conclusión centrada. Tiempo 2: arriba y más chica, con todo lo demás.
  const escalaB = Math.min(horizontal ? 0.72 : 0.7, 1)
  let gap = vertical ? 30 : 22
  const hConcB = Math.round(hConc * escalaB)
  let total = hConcB + gap + hInfo + gap + hTitulo
  if (total > C.h) {
    gap = Math.max(8, (C.h - hConcB - hInfo - hTitulo) / 2)
    total = hConcB + gap * 2 + hInfo + hTitulo
  }
  const y0 = C.y + Math.max(0, (C.h - total) / 2)
  const yConcA = C.y + (C.h - hConc) / 2
  const yConcB = y0
  const yInfo = y0 + hConcB + gap
  const yTitulo = yInfo + hInfo + gap
  const kMover = easeInOutCubic(prog(t, T.info - 0.2, 0.6))
  // La información entra cuando la conclusión ya dejó libre su lugar.
  const tInfo = T.info + 0.35
  const yConc = lerp(yConcA, yConcB, kMover)
  const escala = lerp(1, escalaB, kMover)

  const kE = easeOutBack(prog(t, T.conclusion, 0.4))
  const kTit = golpe(t, T.tituloFinal, -3, 1.35)
  let y = yInfo
  return (
    <>
      <div style={{ position: 'absolute', left: C.x, top: yConc, width: C.w, height: hConc, textAlign: 'center', transform: `scale(${escala})`, transformOrigin: 'center top' }}>
        <div style={{ height: altoEtq, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, opacity: clamp(kE * 2), transform: `scale(${0.6 + 0.4 * kE})` }}>
          <div style={{ fontFamily: FUENTE_TITULO, fontSize: tamEtq, color: COLORES.ambar, textShadow: '0 4px 0 #000', whiteSpace: 'nowrap' }}>
            <TextoPixel>{CONCLUSION.etiqueta}</TextoPixel>
          </div>
          <Rotulo texto="OPINIÓN" tam={vertical ? 24 : 22} />
        </div>
        {lineasConc.map((ln, i) => {
          const t0 = momentoLinea(i)
          const k = easeOutBack(prog(t, t0, 0.45), 1.3)
          return (
            <div key={i} style={{ height: altoLineaConc, fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamConc, lineHeight: 1.15, color: COLORES.texto, whiteSpace: 'nowrap', textShadow: SOMBRA_TEXTO, opacity: clamp(k * 2), transform: `translateX(${(1 - k) * (i % 2 ? 160 : -160)}px)` }}>
              {ln.map((x, j) => (
                <span key={j} style={{ color: x.acento ? COLORES.ambar : (x.color ?? COLORES.texto) }}>
                  {j > 0 ? ' ' : ''}
                  {x.texto}
                </span>
              ))}
            </div>
          )
        })}
      </div>
      {/* Panel oscuro detrás de la información (se lee mejor que sobre los ladrillos). */}
      {t >= tInfo && (
        <div style={{ position: 'absolute', left: C.x + (C.w - anchoInfo) / 2 - 22, top: yInfo - 16, width: anchoInfo + 44, height: hInfo + 26, background: 'rgba(6, 8, 16, 0.84)', boxShadow: bordePixel('#2e3a5c', 3, false), opacity: easeOutCubic(prog(t, tInfo, 0.4)) }} />
      )}
      {info.map((x, i) => {
        const k = easeOutCubic(prog(t, tInfo + 0.1 + i * 0.05, 0.4))
        const top = y
        y += altoInfo(x)
        if (t < tInfo) return null
        return (
          <div key={i} style={{ position: 'absolute', left: C.x, top, width: C.w, height: Math.round(x.tam * 1.3), display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: k, transform: `translateY(${(1 - k) * 14}px)` }}>
            <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: x.peso, fontSize: x.tam, lineHeight: 1.2, color: x.color, whiteSpace: 'nowrap', textShadow: '0 2px 0 #000, 0 0 8px rgba(0,0,0,0.6)' }}>{x.texto}</div>
          </div>
        )
      })}
      {kTit.visible && (
        <div style={{ position: 'absolute', left: C.x, top: yTitulo, width: C.w, height: hTitulo, textAlign: 'center', transform: `rotate(${kTit.rot * 0.3}deg) scale(${kTit.escala})`, opacity: kTit.o }}>
          <div style={{ fontFamily: FUENTE_TITULO, fontSize: tamTitulo, lineHeight: 1.3, color: COLORES.ambar, textShadow: `0 ${tamTitulo * 0.09}px 0 #8a4b00, 0 ${tamTitulo * 0.18}px 0 #000`, whiteSpace: 'nowrap' }}>LA FRONTERA</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 12 }}>
            {m.estimaciones.map((e) => (
              <div key={e.id} style={{ padding: '4px 12px', background: alfa(e.color, 0.2), boxShadow: bordePixel(e.color, 3, false), fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamPildora, lineHeight: 1.25, color: '#fff', whiteSpace: 'nowrap' }}>{e.nombre}</div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
