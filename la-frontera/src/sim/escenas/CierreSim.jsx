// Cierre (84.2 - 93 s): «Mi conclusión: los modelos generativos sirven para crear. Jev, para decidir.»
// La conclusión va rotulada como opinión. Después: divulgación (grande), fuentes de precios con fecha,
// supuestos, modelos más baratos que no se compararon, método y código, marcas y el título.

import { usd } from '../../../shared/formato.js'
import { CONCLUSION, LINEA_MARCAS, precioMasBarato } from '../../../shared/simulacion-video.js'
import { clamp, easeOutBack, easeOutCubic, golpe, prog } from '../../lib/anim.js'
import { FUENTE_TEXTO, FUENTE_TITULO, partirLineas, tamParaAncho } from '../../lib/medir.js'
import { COLORES, alfa, fechaISOaCorta, numeroPrecio } from '../../lib/textos.js'
import { bordePixel, TextoPixel } from '../../componentes/ui.jsx'
import { T } from '../tiempos.js'
import { Rotulo, SOMBRA_TEXTO } from '../piezas.jsx'

export function CierreSim({ m, L, t }) {
  const C = L.contenido
  const vertical = L.formato === 'vertical'
  const horizontal = L.orientacion === 'horizontal'
  const gpt = m.porId.gpt
  const opus = m.porId.opus
  const jev = m.porId.jev
  // --- Conclusión (opinión).
  const grad = `linear-gradient(90deg, ${gpt.color}, ${opus.color})`
  const lineasConc = horizontal
    ? [
        [{ texto: 'Los modelos generativos:' }, { texto: 'para crear.', grad: true }],
        [{ texto: 'Jev:', color: jev.color }, { texto: 'para decidir.' }],
      ]
    : [[{ texto: 'Los modelos generativos:' }], [{ texto: 'para crear.', grad: true }], [{ texto: 'Jev:', color: jev.color }, { texto: 'para decidir.' }]]
  const plano = (ln) => ln.map((x) => x.texto).join(' ')
  const tamConc = Math.min(...lineasConc.map((ln) => tamParaAncho(plano(ln), C.w * 0.94, vertical ? 58 : horizontal ? 56 : 50, 26, 800)))
  const tamEtq = vertical ? 30 : 26
  const momentoLinea = (i) => (horizontal ? (i === 0 ? T.crear : T.decidir) : i < 2 ? T.crear : T.decidir)
  // --- Información (de arriba hacia abajo).
  const anchoInfo = C.w * 0.97
  const tamInfo = vertical ? 24 : 22
  const info = []
  const parrafo = (texto, extra = {}) => {
    const peso = extra.peso ?? 600
    const tam = extra.tam ?? tamInfo
    for (const l of partirLineas(texto, anchoInfo, tam, peso)) info.push({ texto: l, tam, peso, color: COLORES.suave, ...extra })
  }
  const precioDe = (e) => `${e.nombre} ${numeroPrecio(e.precio.entradaPorMTok)} / ${numeroPrecio(e.precio.salidaPorMTok)}`
  const secundarios = m.estimaciones.filter((e) => e.precio.verificado === false)
  const oficiales = m.estimaciones.filter((e) => e.precio.verificado !== false)
  const fechaDe = (xs) => [...new Set(xs.map((e) => fechaISOaCorta(e.precio.fecha)))].join(', ')
  parrafo(
    `Precios en US$ por millón de tokens (entrada / salida): ${oficiales.map(precioDe).join(', ')}, tabla oficial de Anthropic (${fechaDe(oficiales)}); ` +
      `${secundarios.map(precioDe).join(' y ')}, de fuentes secundarias (${fechaDe(secundarios)}).`,
  )
  const s = m.supuestos
  parrafo(
    `Estimación por decisión: ≈${gpt.tokensEntrada} tokens de entrada (Jev ≈${jev.tokensEntrada}); GPT y Opus escriben ${s.salidaLLM.minimo}–${s.salidaLLM.maximo} tokens (${s.salidaLLM.central} en el centro). Presupuesto: ${usd(m.presupuestoUSD)} para cada una.`,
  )
  parrafo(`Hay modelos de lenguaje más baratos que no se compararon (p. ej. ${precioMasBarato()}).`)
  const metodo = `Método y código: ${m.enlaceMetodo}`
  info.push({ texto: metodo, tam: tamParaAncho(metodo, anchoInfo, tamInfo + 2, 18, 800), peso: 800, color: COLORES.ambar })
  parrafo(LINEA_MARCAS, { color: COLORES.tenue, tam: vertical ? 22 : 20 })
  // --- Divulgación: grande. Vacía: aviso de NO PUBLICABLE (el video no se puede publicar así).
  const textoDiv = m.divulgacion || m.marcaAgua || ''
  const tamDiv = vertical ? 34 : 30
  const lineasDiv = textoDiv ? partirLineas(textoDiv, anchoInfo - 48, tamDiv, 800) : []
  // --- Título.
  const tamTitulo = tamParaAncho('LA FRONTERA', C.w * 0.8, vertical ? 72 : horizontal ? 64 : 60, 24, 400, FUENTE_TITULO)
  const tamPildora = vertical ? 26 : 22
  // --- Alturas (todo reservado desde el principio: nada salta cuando entra).
  const hConc = Math.round(tamEtq * 1.7) + lineasConc.length * Math.round(tamConc * 1.18)
  const hTitulo = Math.round(tamTitulo * 1.3) + Math.round(tamPildora * 1.6) + 12
  const hDiv = lineasDiv.length ? lineasDiv.length * Math.round(tamDiv * 1.25) + 24 : 0
  const altoInfo = (x) => Math.round(x.tam * 1.28)
  const hInfo = info.reduce((a, x) => a + altoInfo(x), 0)
  const bloques = [hConc, hTitulo, hDiv, hInfo].filter(Boolean)
  let gap = vertical ? 30 : 22
  const total = bloques.reduce((a, b) => a + b, 0)
  if (total + gap * (bloques.length - 1) > C.h) gap = Math.max(8, (C.h - total) / (bloques.length - 1))
  const yConc = C.y + Math.max(0, (C.h - total - gap * (bloques.length - 1)) / 2)
  const yTitulo = yConc + hConc + gap
  const yDiv = yTitulo + hTitulo + gap
  const yInfo = yDiv + (hDiv ? hDiv + gap : 0)
  const kE = easeOutBack(prog(t, T.conclusion, 0.4))
  const kTit = golpe(t, T.tituloFinal, -3, 1.35)
  const kDiv = easeOutBack(prog(t, T.info, 0.45), 1.4)
  let y = yInfo
  return (
    <>
      <div style={{ position: 'absolute', left: C.x, top: yConc, width: C.w, height: hConc, textAlign: 'center' }}>
        <div style={{ height: Math.round(tamEtq * 1.7), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, opacity: clamp(kE * 2), transform: `scale(${0.6 + 0.4 * kE})` }}>
          <div style={{ fontFamily: FUENTE_TITULO, fontSize: tamEtq, color: COLORES.ambar, textShadow: '0 4px 0 #000', whiteSpace: 'nowrap' }}>
            <TextoPixel>{CONCLUSION.etiqueta}</TextoPixel>
          </div>
          <Rotulo texto="OPINIÓN" tam={vertical ? 22 : 20} />
        </div>
        {lineasConc.map((ln, i) => {
          const t0 = momentoLinea(i)
          const k = easeOutBack(prog(t, t0, 0.45), 1.3)
          return (
            <div key={i} style={{ height: Math.round(tamConc * 1.18), fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamConc, lineHeight: 1.15, color: COLORES.texto, whiteSpace: 'nowrap', textShadow: SOMBRA_TEXTO, opacity: clamp(k * 2), transform: `translateX(${(1 - k) * (i % 2 ? 160 : -160)}px)` }}>
              {ln.map((x, j) => (
                <span key={j}>
                  {j > 0 ? ' ' : ''}
                  {x.grad ? (
                    <span style={{ background: grad, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', textShadow: 'none', filter: 'drop-shadow(0 4px 0 #000)' }}>{x.texto}</span>
                  ) : (
                    <span style={{ color: x.color ?? COLORES.texto }}>{x.texto}</span>
                  )}
                </span>
              ))}
            </div>
          )
        })}
      </div>
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
      {hDiv > 0 && t >= T.info && (
        <div style={{ position: 'absolute', left: C.x, top: yDiv, width: C.w, height: hDiv, display: 'flex', justifyContent: 'center', opacity: clamp(kDiv * 2), transform: `scale(${0.8 + 0.2 * kDiv})` }}>
          <div style={{ padding: '12px 24px', background: m.divulgacion ? 'rgba(6,8,16,0.92)' : '#ffcf33', boxShadow: m.divulgacion ? bordePixel(COLORES.ambar, 3, false) : bordePixel('#1a1400', 3, false), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {lineasDiv.map((l, i) => (
              <div key={i} style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamDiv, lineHeight: 1.25, color: m.divulgacion ? COLORES.texto : '#1a1400', whiteSpace: 'nowrap' }}>{l}</div>
            ))}
          </div>
        </div>
      )}
      {info.map((x, i) => {
        const k = easeOutCubic(prog(t, T.info + 0.25 + i * 0.1, 0.4))
        const top = y
        y += altoInfo(x)
        return (
          <div key={i} style={{ position: 'absolute', left: C.x, top, width: C.w, height: altoInfo(x), display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: k, transform: `translateY(${(1 - k) * 14}px)` }}>
            <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: x.peso, fontSize: x.tam, lineHeight: 1.2, color: x.color, whiteSpace: 'nowrap', textShadow: '0 2px 0 #000' }}>{x.texto}</div>
          </div>
        )
      })}
    </>
  )
}

