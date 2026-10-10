// Escena 6 (67-75 s): la conclusión (solo si los datos la sostienen), el título y las fuentes:
// divulgación, fecha y archivo de la corrida con su huella sha256, precios por millón de tokens,
// alcance de la comparación, método y código, y créditos/marcas.
// Las posiciones se calculan una vez (el título tiene su lugar reservado): nada salta cuando entra.

import { PUBLICACION } from '../../shared/config.js'
import { clamp, easeOutBack, easeOutCubic, golpe, prog } from '../lib/anim.js'
import { ESC } from '../lib/datos.js'
import { FUENTE_TEXTO, FUENTE_TITULO, anchoTexto, tamParaAncho } from '../lib/medir.js'
import { COLORES, alfa, fechaCorta, lista, precioCorto, rangoFechasPrecios } from '../lib/textos.js'
import { bordePixel, TextoPixel } from '../componentes/ui.jsx'
import { Retrato } from '../componentes/Retrato.jsx'

const T0 = ESC.cierre.inicio
const T_LINEA2 = T0 + 0.9
const T_INFO = T0 + 2.0
const T_TITULO = T0 + 4.4

const SOMBRA = '0 4px 0 #000, 2px 0 0 #000, -2px 0 0 #000, 0 -2px 0 #000'

// Corta por espacios comunes (no por espacios duros \u00a0, que mantienen unidas fechas y valores).
function partirEspacios(texto, ancho, tam, peso) {
  const lineas = []
  let actual = ''
  for (const p of String(texto).split(' ').filter(Boolean)) {
    const prueba = actual ? `${actual} ${p}` : p
    if (!actual || anchoTexto(prueba, tam, peso) <= ancho) actual = prueba
    else {
      lineas.push(actual)
      actual = p
    }
  }
  if (actual) lineas.push(actual)
  return lineas
}

// Junta segmentos con `sep` mientras quepan en `ancho`; un segmento que no cabe solo se corta por palabras.
function lineasParrafo(segmentos, sep, ancho, tam, peso) {
  const out = []
  let actual = ''
  for (const seg of segmentos) {
    const prueba = actual ? `${actual}${sep}${seg}` : seg
    if (anchoTexto(prueba, tam, peso) <= ancho) {
      actual = prueba
      continue
    }
    if (actual) out.push(actual)
    if (anchoTexto(seg, tam, peso) <= ancho) actual = seg
    else {
      const partes = partirEspacios(seg, ancho, tam, peso)
      out.push(...partes.slice(0, -1))
      actual = partes[partes.length - 1] ?? ''
    }
  }
  if (actual) out.push(actual)
  return out
}

// Esfuerzo de razonamiento declarado de cada modelo de lenguaje (p. ej. "low").
function esfuerzo(p) {
  const o = p.opciones ?? {}
  return o.reasoningEffort ?? o.effort ?? null
}

// Conclusión: el lema solo si Jev empata o gana en aciertos y es el más barato
// (stats.jevRecomendable); si no, una frase neutra que sale de los ganadores.
function conclusion(m) {
  const st = m.stats
  const porId = new Map(st.proveedores.map((p) => [p.id, p]))
  const llms = st.proveedores.filter((p) => p.id !== 'jev')
  const jev = porId.get('jev')
  if (st.jevRecomendable && jev) {
    const grad = llms.length >= 2 ? `linear-gradient(90deg, ${llms[0].color}, ${llms[1].color})` : llms[0]?.color ?? '#fff'
    return {
      etiqueta: 'MI CONCLUSIÓN',
      lineas: [
        [{ texto: 'Los modelos generativos:' }, { texto: 'para crear.', gradiente: grad, corte: true }],
        [{ texto: `${jev.nombre}:`, color: jev.color }, { texto: 'para decidir.' }],
      ],
    }
  }
  const nombres = (ids) => (ids ?? []).map((id) => porId.get(id)).filter(Boolean)
  const aci = nombres(st.ganadores?.aciertos)
  const costo = nombres(st.ganadores?.costo)
  const conColor = (ps) => ps.flatMap((p, i) => [
    ...(i === 0 ? [] : [{ texto: i === ps.length - 1 ? ' y ' : ', ', pegado: true }]),
    { texto: p.nombre, color: p.color, pegado: i > 0 },
  ])
  const lineas = []
  if (aci.length) lineas.push([{ texto: 'Si cada acierto cuenta:' }, ...conColor(aci).map((x, i) => (i === 0 ? { ...x, corte: true } : x)), { texto: '.', pegado: true }])
  if (costo.length) lineas.push([{ texto: 'Si manda el costo:' }, ...conColor(costo).map((x, i) => (i === 0 ? { ...x, corte: true } : x)), { texto: '.', pegado: true }])
  if (!lineas.length) lineas.push([{ texto: 'Los números, en la tabla.' }])
  return { etiqueta: null, lineas }
}

// Texto plano de una línea de la conclusión (para medir).
const textoPlano = (partes) => partes.map((x, i) => `${i > 0 && !x.pegado ? ' ' : ''}${x.texto}`).join('')

export function Cierre({ m, L, t }) {
  const c = L.contenido
  const horizontal = L.orientacion === 'horizontal'
  const vertical = L.formato === 'vertical'
  const st = m.stats
  const ps = st.proveedores
  const llms = ps.filter((p) => p.id !== 'jev')
  // --- Conclusión: en vertical y feed, cada frase se parte después de los dos puntos.
  const conc = conclusion(m)
  const lineasConc = []
  for (const partes of conc.lineas) {
    const k = partes.findIndex((x) => x.corte)
    if (!horizontal && k > 0) {
      lineasConc.push(partes.slice(0, k))
      lineasConc.push(partes.slice(k).map((x, i) => (i === 0 ? { ...x, pegado: true } : x)))
    } else lineasConc.push(partes)
  }
  const maxFrase = Math.round(L.fs.grande * 1.2)
  const tamFrase = Math.min(...lineasConc.map((ln) => tamParaAncho(textoPlano(ln), c.w * 0.92, maxFrase, 24, 800)))
  const tamEtiqueta = Math.round(L.fs.chico * 0.8)
  // --- Información (de arriba hacia abajo).
  const anchoInfo = c.w * 0.96
  const tamInfo = vertical ? 28 : horizontal ? 26 : 24
  const tamChico = vertical ? 25 : horizontal ? 22 : 21
  const tamMini = vertical ? 24 : 20
  const info = []
  const parrafo = (segmentos, sep, tam, extra = {}) => {
    const peso = extra.peso ?? 600
    for (const linea of lineasParrafo(segmentos, sep, anchoInfo, tam, peso)) info.push({ texto: linea, tam, peso, color: COLORES.suave, ...extra })
  }
  if (m.divulgacion) {
    const tamDiv = tamParaAncho(m.divulgacion, anchoInfo - 40, L.fs.medio, vertical ? 26 : 22, 800)
    for (const linea of lineasParrafo([m.divulgacion], ' ', anchoInfo - 40, tamDiv, 800)) info.push({ texto: linea, tam: tamDiv, peso: 800, color: COLORES.texto, caja: true })
  }
  parrafo([`Corrida: ${fechaCorta(m.run.createdAt)}${m.publicable?.bloqueos.some((b) => b.codigo === 'demo') ? ' (datos simulados, demo)' : ''}`, `Datos: runs/${m.archivo ?? '?'}${m.sha256 ? ` ·\u00a0sha256\u00a0${m.sha256.slice(0, 8)}` : ''}`], ' · ', tamInfo)
  // Precios por millón de tokens con los que se calculó el costo (copiados dentro de la corrida).
  const duro = (x) => x.replaceAll(' ', '\u00a0')
  const precios = ps.slice(0, 3).map((p) => duro(precioCorto(p)))
  const fechas = new Set(ps.map((p) => p.precio?.fecha).filter(Boolean))
  const cabezaPrecios = 'Precios en US$ por millón de tokens (entrada/salida):'
  const fechaPrecios = `(consultados ${fechas.size > 1 ? 'del' : 'el'} ${duro(rangoFechasPrecios(ps))})`
  const listaPrecios = precios.join(' · ')
  const todo = `${cabezaPrecios} ${listaPrecios} ${fechaPrecios}`
  if (anchoTexto(todo, tamInfo, 600) <= anchoInfo) parrafo([todo], ' ', tamInfo)
  else if (anchoTexto(`${cabezaPrecios} ${listaPrecios}`, tamInfo, 600) <= anchoInfo) {
    parrafo([`${cabezaPrecios} ${listaPrecios}`], ' ', tamInfo)
    parrafo([fechaPrecios], ' ', tamInfo)
  } else {
    parrafo([cabezaPrecios], ' ', tamInfo)
    parrafo(precios, ' · ', tamInfo)
    parrafo([fechaPrecios], ' ', tamInfo)
  }
  // Alcance de la comparación (A3): solo modelos insignia, con el esfuerzo realmente declarado.
  const esfuerzos = [...new Set(llms.map(esfuerzo))]
  const textoEsfuerzo =
    esfuerzos.length === 1 && esfuerzos[0] === 'low'
      ? 'razonamiento al mínimo: low'
      : `razonamiento: ${lista(llms.map((p) => `${p.nombre} ${esfuerzo(p) ?? 'por defecto'}`))}`
  parrafo([`Comparado con los modelos insignia (${textoEsfuerzo}).`, 'Hay modelos de lenguaje más baratos que no se probaron.'], ' ', tamChico)
  const metodo = `Método y código: ${PUBLICACION.enlaceMetodo}`
  info.push({ texto: metodo, tam: tamParaAncho(metodo, anchoInfo, tamInfo, vertical ? 24 : 18, 800), peso: 800, color: COLORES.ambar })
  // Mismo texto que el de LinkedIn (render/guion.mjs). No dice "sin afiliación": contradiría una
  // divulgación como "Colaboración pagada con TypeSafe".
  parrafo(['Inspirado en Papers, Please (Lucas Pope). OpenAI, GPT, Anthropic, Claude, TypeSafe y Jev son marcas de sus dueños; las nombro solo para identificar los productos.'], ' ', tamMini, {
    color: COLORES.tenue,
  })
  // --- Alturas y posiciones (todo calculado antes de que entre nada).
  const tamTitulo = tamParaAncho('LA FRONTERA', c.w * 0.9, L.fs.enorme, 24, 400, FUENTE_TITULO)
  const tamPildora = Math.min(...ps.slice(0, 3).map((p) => tamParaAncho(p.nombre, (c.w - 60) / 3 - 30, L.fs.chico, 16, 800)))
  const tamDesfile = horizontal ? 110 : vertical ? 130 : 104
  const altoInfo = (x) => Math.round(x.tam * (x.caja ? 1.5 : 1.28)) + (x.caja ? 10 : 0)
  const hConc = (conc.etiqueta ? Math.round(tamEtiqueta * 1.6) : 0) + lineasConc.length * Math.round(tamFrase * 1.18)
  const hTitulo = Math.round(tamTitulo * 1.25) + 18 + Math.round(tamPildora * 1.25 + 12)
  const hInfo = info.reduce((a, x) => a + altoInfo(x), 0) + (info.length - 1) * 4
  const libre = c.h - tamDesfile - 6
  let gap = horizontal ? 40 : 56
  let total = hConc + hTitulo + hInfo + gap * 2
  if (total > libre) {
    gap = Math.max(14, (libre - hConc - hTitulo - hInfo) / 2)
    total = hConc + hTitulo + hInfo + gap * 2
  }
  const yConc = c.y + Math.max(0, (libre - total) / 2)
  const yTitulo = yConc + hConc + gap
  const yInfo = yTitulo + hTitulo + gap
  // --- Animaciones
  const k1 = easeOutBack(prog(t, T0 + 0.15, 0.45))
  const k2 = easeOutBack(prog(t, T_LINEA2, 0.45))
  const kTit = golpe(t, T_TITULO, -3)
  // Desfile de viajeros al pie de la pantalla (decorativo).
  const paso = tamDesfile * 1.15
  const cantidad = Math.ceil((L.W + paso * 2) / paso)
  const desplazamiento = ((t - T0) * 90) % paso
  const desfile = (
    <div style={{ position: 'absolute', left: 0, top: c.y + c.h - tamDesfile + 6, width: L.W, height: tamDesfile, overflow: 'hidden', opacity: easeOutCubic(prog(t, T0 + 0.3, 0.6)) }}>
      {Array.from({ length: cantidad }, (_, i) => {
        const v = m.viajeros[(i * 7) % m.viajeros.length]
        const x = i * paso - paso + desplazamiento
        const salto = Math.abs(Math.sin((t - T0) * 7 + i)) * 8
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: 6 - salto }}>
            <Retrato semilla={v.semilla} tam={tamDesfile} t={t} />
          </div>
        )
      })}
    </div>
  )
  const mitad = Math.ceil(lineasConc.length / 2)
  let yLinea = yInfo
  return (
    <>
      {desfile}
      <div style={{ position: 'absolute', left: c.x, top: yConc, width: c.w, height: hConc, textAlign: 'center' }}>
        {conc.etiqueta && (
          <div style={{ height: Math.round(tamEtiqueta * 1.6), fontFamily: FUENTE_TITULO, fontSize: tamEtiqueta, lineHeight: 1.3, color: COLORES.ambar, textShadow: '0 3px 0 #000', opacity: clamp(k1 * 2) }}>
            <TextoPixel>{conc.etiqueta}</TextoPixel>
          </div>
        )}
        {lineasConc.map((ln, i) => {
          const k = i < mitad ? k1 : k2
          return (
            <div key={i} style={{ height: Math.round(tamFrase * 1.18), transform: `translateX(${(1 - k) * (i < mitad ? -200 : 200)}px)`, opacity: clamp(k * 2), fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamFrase, lineHeight: 1.15, color: COLORES.texto, whiteSpace: 'nowrap', textShadow: SOMBRA }}>
              {ln.map((x, j) => (
                <span key={j}>
                  {j > 0 && !x.pegado ? ' ' : ''}
                  {x.gradiente ? (
                    <span style={{ background: x.gradiente, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', textShadow: 'none', filter: 'drop-shadow(0 4px 0 #000)' }}>{x.texto}</span>
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
        <div style={{ position: 'absolute', left: c.x, top: yTitulo, width: c.w, height: hTitulo, textAlign: 'center', transform: `rotate(${kTit.rot * 0.3}deg) scale(${kTit.escala})`, opacity: kTit.o }}>
          <div style={{ fontFamily: FUENTE_TITULO, fontSize: tamTitulo, lineHeight: 1.25, color: COLORES.ambar, textShadow: `0 ${tamTitulo * 0.09}px 0 #8a4b00, 0 ${tamTitulo * 0.18}px 0 #000`, whiteSpace: 'nowrap' }}>LA FRONTERA</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 18 }}>
            {ps.slice(0, 3).map((p) => (
              <div key={p.id} style={{ padding: '6px 14px', background: alfa(p.color, 0.2), boxShadow: bordePixel(p.color, 3, false), fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamPildora, lineHeight: 1.25, color: '#fff', whiteSpace: 'nowrap' }}>
                {p.nombre}
              </div>
            ))}
          </div>
        </div>
      )}
      {info.map((x, i) => {
        const k = easeOutCubic(prog(t, T_INFO + i * 0.15, 0.4))
        const y = yLinea
        yLinea += altoInfo(x) + 4
        return (
          <div key={i} style={{ position: 'absolute', left: c.x, top: y, width: c.w, height: altoInfo(x), display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: k, transform: `translateY(${(1 - k) * 20}px)` }}>
            <div
              style={{
                fontFamily: FUENTE_TEXTO,
                fontWeight: x.peso,
                fontSize: x.tam,
                lineHeight: 1.2,
                color: x.color,
                whiteSpace: 'nowrap',
                textShadow: x.caja ? 'none' : '0 3px 0 #000',
                ...(x.caja ? { padding: `${Math.round(x.tam * 0.2)}px 20px`, background: 'rgba(6, 8, 16, 0.9)', boxShadow: bordePixel(COLORES.ambar, 3, false) } : {}),
              }}
            >
              {x.texto}
            </div>
          </div>
        )
      })}
    </>
  )
}
