// Escena 6 (67-75 s): la frase final, las fuentes (precios, fecha de la corrida, método y
// código, divulgación) y el título para terminar.

import { PUBLICACION } from '../../shared/config.js'
import { clamp, easeInCubic, easeOutBack, easeOutCubic, golpe, prog } from '../lib/anim.js'
import { ESC } from '../lib/datos.js'
import { FUENTE_TEXTO, FUENTE_TITULO, tamParaAncho } from '../lib/medir.js'
import { COLORES, alfa, fechaCorta, rangoFechasPrecios } from '../lib/textos.js'
import { bordePixel } from '../componentes/ui.jsx'
import { Retrato } from '../componentes/Retrato.jsx'

const T0 = ESC.cierre.inicio
const T_LINEA2 = T0 + 0.9
const T_INFO = T0 + 2.0
const T_TITULO = T0 + 4.4

export function Cierre({ m, L, t }) {
  const c = L.contenido
  const horizontal = L.orientacion === 'horizontal'
  const llms = m.proveedores.filter((p) => p.id !== 'jev')
  const jev = m.proveedores.find((p) => p.id === 'jev')
  const colorJev = jev?.color ?? '#4f7cff'
  const l1a = 'Los modelos de lenguaje:'
  const l1b = 'para crear.'
  const l2a = `${jev?.nombre ?? 'Jev'}:`
  const l2b = 'para decidir.'
  const tamFrase = Math.min(
    tamParaAncho(horizontal ? `${l1a} ${l1b}` : l1a, c.w * 0.92, L.fs.grande * 1.25, 24, 800),
    L.fs.grande * 1.25,
  )
  const k1 = easeOutBack(prog(t, T0 + 0.15, 0.45))
  const k2 = easeOutBack(prog(t, T_LINEA2, 0.45))
  const kTit = golpe(t, T_TITULO, -3)
  // Cuando entra el título, la frase sube y se achica un poco.
  const kSube = easeInCubic(prog(t, T_TITULO - 0.4, 0.4))
  const info = [
    `Precios públicos de cada API (${rangoFechasPrecios(m.proveedores)})`,
    `Corrida: ${fechaCorta(m.run.createdAt)}${m.esDemo ? ' · datos simulados (demo)' : ''}`,
    `Método y código: ${PUBLICACION.enlaceMetodo}`,
    ...(PUBLICACION.divulgacion ? [PUBLICACION.divulgacion] : []),
  ]
  const tamInfo = Math.min(...info.map((x) => tamParaAncho(x, c.w * 0.94, L.fs.base, 18, 600)))
  const tamTitulo = tamParaAncho('LA FRONTERA', c.w * 0.9, L.fs.enorme, 24, 400, FUENTE_TITULO)
  const gradLLM = llms.length >= 2 ? `linear-gradient(90deg, ${llms[0].color}, ${llms[1].color})` : llms[0]?.color ?? '#fff'
  // Desfile de viajeros al pie de la pantalla (decorativo).
  const tamDesfile = horizontal ? 120 : L.formato === 'vertical' ? 130 : 110
  const paso = tamDesfile * 1.15
  const cantidad = Math.ceil((L.W + paso * 2) / paso)
  const desplazamiento = ((t - T0) * 90) % paso
  const desfile = (
    <div style={{ position: 'absolute', left: -c.x, top: c.h - tamDesfile + 6, width: L.W, height: tamDesfile, overflow: 'hidden', opacity: easeOutCubic(prog(t, T0 + 0.3, 0.6)) }}>
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
  return (
    <div style={{ position: 'absolute', left: c.x, top: c.y, width: c.w, height: c.h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: horizontal ? 36 : 56, paddingBottom: tamDesfile }}>
      {desfile}
      <div style={{ textAlign: 'center', transform: `scale(${1 - kSube * 0.18}) translateY(${-kSube * 20}px)` }}>
        <div style={{ transform: `translateX(${(1 - k1) * -200}px)`, opacity: clamp(k1 * 2) }}>
          <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamFrase, color: COLORES.texto, lineHeight: 1.15, whiteSpace: 'nowrap', textShadow: '0 4px 0 #000, 2px 0 0 #000, -2px 0 0 #000, 0 -2px 0 #000' }}>
            {l1a}
            {horizontal ? ' ' : <br />}
            <span style={{ background: gradLLM, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', textShadow: 'none', filter: 'drop-shadow(0 4px 0 #000)' }}>{l1b}</span>
          </div>
        </div>
        <div style={{ marginTop: tamFrase * 0.5, transform: `translateX(${(1 - k2) * 200}px)`, opacity: clamp(k2 * 2) }}>
          <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamFrase * 1.1, color: COLORES.texto, lineHeight: 1.15, whiteSpace: 'nowrap', textShadow: '0 4px 0 #000, 2px 0 0 #000, -2px 0 0 #000, 0 -2px 0 #000' }}>
            <span style={{ color: colorJev }}>{l2a}</span> {l2b}
          </div>
        </div>
      </div>
      {kTit.visible && (
        <div style={{ textAlign: 'center', transform: `rotate(${kTit.rot * 0.3}deg) scale(${kTit.escala})`, opacity: kTit.o }}>
          <div style={{ fontFamily: FUENTE_TITULO, fontSize: tamTitulo, color: COLORES.ambar, textShadow: `0 ${tamTitulo * 0.09}px 0 #8a4b00, 0 ${tamTitulo * 0.18}px 0 #000`, whiteSpace: 'nowrap' }}>LA FRONTERA</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 22 }}>
            {m.proveedores.slice(0, 3).map((p) => (
              <div key={p.id} style={{ padding: '6px 14px', background: alfa(p.color, 0.2), boxShadow: bordePixel(p.color, 3, false), fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamParaAncho(p.nombre, (c.w - 60) / 3 - 30, L.fs.chico, 16, 800), color: '#fff', whiteSpace: 'nowrap' }}>
                {p.nombre}
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {info.map((linea, i) => {
          const k = easeOutCubic(prog(t, T_INFO + i * 0.18, 0.4))
          return (
            <div key={linea} style={{ fontFamily: FUENTE_TEXTO, fontWeight: i === 2 ? 800 : 600, fontSize: tamInfo, color: i === 2 ? COLORES.ambar : COLORES.suave, opacity: k, transform: `translateY(${(1 - k) * 20}px)`, whiteSpace: 'nowrap', textShadow: '0 3px 0 #000' }}>
              {linea}
            </div>
          )
        })}
      </div>
    </div>
  )
}
