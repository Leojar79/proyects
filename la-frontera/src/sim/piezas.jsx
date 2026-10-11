// Piezas visuales de la composición "simulación" (mismo estilo pixel que el juego).
// Todo es función pura de t: nada de transiciones CSS ni relojes.

import { clamp, easeOutBack, easeOutCubic, prog } from '../lib/anim.js'
import { FUENTE_MONO, FUENTE_TEXTO, FUENTE_TITULO, anchoTexto, partirLineas, tamParaAncho, tamParaCaja } from '../lib/medir.js'
import { COLORES, SELLO, alfa, tono } from '../lib/textos.js'
import { PixelArt } from '../componentes/Pixel.jsx'
import { bordePixel, TextoPixel } from '../componentes/ui.jsx'

export const SOMBRA_TEXTO = '0 4px 0 #000, 2px 0 0 #000, -2px 0 0 #000, 0 -2px 0 #000'

// Mezcla opaca de dos colores #rrggbb (k = peso de `b`). Sirve para fondos de panel teñidos con el
// color de cada cerebro sin dejar ver el fondo (ladrillos, alambre) detrás del texto.
export function mezcla(a, b, k) {
  const ca = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(a)
  const cb = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(b)
  if (!ca || !cb) return a
  const c = [1, 2, 3].map((i) => Math.round(parseInt(ca[i], 16) * (1 - k) + parseInt(cb[i], 16) * k).toString(16).padStart(2, '0'))
  return `#${c.join('')}`
}

// Fondo de panel opaco, teñido a la izquierda con el color del cerebro.
export const fondoTenido = (color, k = 0.2) => `linear-gradient(90deg, ${mezcla(COLORES.panel, color, k)}, ${COLORES.panel} 70%)`

// Entrada con rebote: { k, o } (k para escala/posición, o para opacidad).
export function pop(t, t0, dur = 0.4, s = 1.6) {
  const p = prog(t, t0, dur)
  return { k: easeOutBack(p, s), o: clamp(p * 2.5), p, visible: t >= t0 }
}

export function suave(t, t0, dur = 0.45) {
  const p = prog(t, t0, dur)
  return { k: easeOutCubic(p), o: clamp(p * 2), p, visible: t >= t0 }
}

export function Panel({ x, y, w, h, borde = '#3a4770', fondo, style, children }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        background: fondo ?? `linear-gradient(180deg, ${COLORES.panel2}, ${COLORES.panel})`,
        boxShadow: bordePixel(borde, 4),
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function TituloPixel({ texto, tam, color = COLORES.ambar, style }) {
  return (
    <div style={{ fontFamily: FUENTE_TITULO, fontSize: tam, lineHeight: 1.25, color, textShadow: `0 ${Math.max(3, Math.round(tam * 0.12))}px 0 #000`, whiteSpace: 'nowrap', ...style }}>
      <TextoPixel>{texto}</TextoPixel>
    </div>
  )
}

// Rótulo de honestidad: "ILUSTRATIVO", "EJEMPLO", "ESTIMADO"...
export function Rotulo({ texto, tam, color = COLORES.ambar, fondo = 'rgba(8,10,20,0.92)', style }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: `${Math.round(tam * 0.18)}px ${Math.round(tam * 0.45)}px`,
        background: fondo,
        boxShadow: `inset 0 0 0 3px ${color}`,
        fontFamily: FUENTE_TEXTO,
        fontWeight: 800,
        fontSize: tam,
        lineHeight: 1.1,
        letterSpacing: 0.5,
        color,
        whiteSpace: 'nowrap',
        flex: 'none',
        ...style,
      }}
    >
      {texto}
    </div>
  )
}

export function Pildora({ texto, color, tam, style }) {
  return (
    <div style={{ padding: `${Math.round(tam * 0.22)}px ${Math.round(tam * 0.5)}px`, background: alfa(color, 0.2), boxShadow: bordePixel(color, 3, false), fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tam, lineHeight: 1.15, color: '#fff', whiteSpace: 'nowrap', flex: 'none', ...style }}>
      {texto}
    </div>
  )
}

// Chip de "cerebro" (pixel art) con el color de cada IA.
const CHIP = [
  '..X.X.X.X.X..',
  '..X.X.X.X.X..',
  'XXCCCCCCCCCXX',
  '..CBBBBBBBC..',
  'XXCBWWBBBBCXX',
  '..CBWBBBBBC..',
  'XXCBBBBBBBCXX',
  '..CBBBBBBBC..',
  'XXCBBBBBBWCXX',
  '..CBBBBBBBC..',
  'XXCCCCCCCCCXX',
  '..X.X.X.X.X..',
  '..X.X.X.X.X..',
]

export function Chip({ color, alto }) {
  return <PixelArt filas={CHIP} alto={alto} colores={{ X: '#c9cfe0', C: tono(color, -0.45), B: color, W: tono(color, 0.6) }} />
}

// Moneda de pixeles (misma que el juego).
const MONEDA = ['..XXXX..', '.XYYYYX.', 'XYYXXYYX', 'XYXYYYYX', 'XYYXXYYX', 'XYYYYXYX', 'XYYXXYYX', '.XYYYYX.', '..XXXX..']
export function Moneda({ alto, style }) {
  return <PixelArt filas={MONEDA} alto={alto} colores={{ X: '#7a5600', Y: '#ffd25e' }} style={style} />
}

// Pasaporte cerrado y sello de goma (referencia visual al estilo Papers, Please).
const PASAPORTE_CERRADO = [
  'XXXXXXXXXXXX',
  'XBBBBBBBBBBX',
  'XBBBBBBBBBBX',
  'XBBBYYYYBBBX',
  'XBBYBBBBYBBX',
  'XBBYBYYBYBBX',
  'XBBYBBBBYBBX',
  'XBBBYYYYBBBX',
  'XBBBBBBBBBBX',
  'XBBYYYYYYBBX',
  'XBBBBBBBBBBX',
  'XBBBYYYYBBBX',
  'XBBBBBBBBBBX',
  'XBBBBBBBBBBX',
  'XXXXXXXXXXXX',
]
export function PasaporteCerrado({ alto, color = '#9b2f2f' }) {
  return <PixelArt filas={PASAPORTE_CERRADO} alto={alto} colores={{ X: tono(color, -0.5), B: color, Y: '#e8c65a' }} />
}

const SELLO_GOMA = [
  '.....XXXX.....',
  '....XHHHHX....',
  '....XHHHHX....',
  '.....XHHX.....',
  '.....XHHX.....',
  '....XXXXXX....',
  '..XXRRRRRRXX..',
  '.XRRRRRRRRRRX.',
  'XXXXXXXXXXXXXX',
  'XTTTTTTTTTTTTX',
  'XXXXXXXXXXXXXX',
]
export function SelloGoma({ alto }) {
  return <PixelArt filas={SELLO_GOMA} alto={alto} colores={{ X: '#1a120c', H: '#8a5a34', R: '#c0392b', T: '#3a1f4a' }} />
}

// Ventanilla de la cabina: vidrio, luz cálida, persiana y repisa.
export function Ventanilla({ w, h, children }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #3a2a3f 0%, #5a3b3a 60%, #6b4632 100%)', boxShadow: bordePixel('#11131f', 6), overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: -w * 0.2, top: -h * 0.3, width: w * 1.4, height: h * 1.2, background: 'radial-gradient(closest-side, rgba(255,196,110,0.45), rgba(255,160,80,0.08) 70%, transparent)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: Math.max(16, h * 0.09), background: 'repeating-linear-gradient(180deg, #24202e 0 6px, #2f2a3a 6px 12px)' }} />
      {children}
      <div style={{ position: 'absolute', left: w * 0.08, top: 0, width: w * 0.06, height: h, background: 'rgba(255,255,255,0.07)', transform: 'skewX(-14deg)' }} />
      <div style={{ position: 'absolute', left: w * 0.18, top: 0, width: w * 0.02, height: h, background: 'rgba(255,255,255,0.06)', transform: 'skewX(-14deg)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.max(14, h * 0.07), background: '#2a1b12', borderTop: '4px solid #6e4a2e' }} />
    </div>
  )
}

const NACIONES = { Valdoria: '#2f5fa8', Brenia: '#2f7d4f', Galvonia: '#9b2f2f', Marelia: '#6a3f8f', Ludovia: '#2a7a7a', Esterlia: '#b5651d', Orsenia: '#6b4a2b' }
export const colorNacion = (n) => NACIONES[n] ?? '#2f5fa8'

function lineaPermiso(d) {
  if (d.permiso === null || d.permiso === undefined) return 'No requiere (ciudadano)'
  if (d.permiso === 'ninguno') return 'No presenta permiso'
  const otro = d.permisoNombre && d.permisoNombre !== d.nombre ? ` · a nombre de ${d.permisoNombre}` : ''
  return `${d.permiso}${otro}`
}

// Pasaporte abierto con los datos del viajero (el tamaño de letra se ajusta para que todo quepa).
export function Pasaporte({ v, w, h, tamMax = 30, tamMin = 20 }) {
  const d = v.documento
  const color = colorNacion(d.nacionalidad)
  const pad = Math.round(Math.max(12, w * 0.04))
  const bandaH = Math.round(Math.max(36, Math.min(48, h * 0.13)))
  const filas = [
    ['NOMBRE', d.nombre, 800],
    ['VENCE', d.vence, 700],
    ['PERMISO', lineaPermiso(d), 600],
    ['DECLARA', d.equipajeDeclarado, 600],
    ['INSPECCIÓN', d.inspeccion, 600],
  ]
  const altoUtil = h - bandaH - pad * 1.2
  let tam = tamMax
  let lay = null
  for (; tam >= tamMin; tam -= 1) {
    const tamEt = Math.round(tam * 0.62)
    const anchoEt = anchoTexto('INSPECCIÓN', tamEt, 800) + tam * 0.45
    lay = filas.map(([et, val, peso]) => ({ et, peso, lineas: partirLineas(val, w - pad * 2 - anchoEt, tam, peso) }))
    const total = lay.reduce((a, f) => a + f.lineas.length * tam * 1.14 + tam * 0.2, 0)
    if (total <= altoUtil) break
  }
  tam = Math.max(tam, tamMin)
  const tamEt = Math.round(tam * 0.62)
  const anchoEt = anchoTexto('INSPECCIÓN', tamEt, 800) + tam * 0.45
  return (
    <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${COLORES.papel}, #e8dcbf)`, boxShadow: bordePixel('#5b4a33', 4), overflow: 'hidden' }}>
      <div style={{ height: bandaH, background: color, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${pad}px`, fontFamily: FUENTE_TITULO, fontSize: Math.round(bandaH * 0.4), color: '#fff6dc', borderBottom: `4px solid ${tono(color, -0.35)}` }}>
        <span>PASAPORTE</span>
        <span>{String(d.nacionalidad).toUpperCase()}</span>
      </div>
      <div style={{ padding: `${Math.round(pad * 0.5)}px ${pad}px 0`, display: 'flex', flexDirection: 'column', gap: tam * 0.2 }}>
        {lay.map((f) => (
          <div key={f.et} style={{ display: 'flex', alignItems: 'baseline' }}>
            <div style={{ width: anchoEt, flex: 'none', fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamEt, color: '#8a7350', letterSpacing: 0.5 }}>{f.et}</div>
            <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: f.peso, fontSize: tam, lineHeight: 1.14, color: COLORES.tinta }}>
              {f.lineas.map((l, i) => (
                <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Globo de diálogo que se escribe letra a letra entre t0 y t1.
export function Globo({ texto, w, h, t, t0, t1, tamMax, tamMin, colaX }) {
  const pad = Math.round(tamMax * 0.55)
  const conComillas = `“${texto}”`
  const tam = tamParaCaja(conComillas, w - pad * 2, 3, tamMax, tamMin, 600)
  const lineas = partirLineas(conComillas, w - pad * 2, tam, 600)
  const total = lineas.reduce((a, l) => a + l.length, 0)
  const escritos = Math.floor(clamp((t - t0) / (t1 - t0)) * total)
  const k = easeOutBack(prog(t, t0 - 0.15, 0.3))
  let n = 0
  return (
    <div style={{ position: 'absolute', inset: 0, transform: `scale(${0.6 + 0.4 * k})`, transformOrigin: `${colaX}px 0px`, opacity: clamp(k * 2) }}>
      <div style={{ position: 'absolute', left: colaX - 14, top: -14, width: 28, height: 18, background: '#fbf8f1', clipPath: 'polygon(30% 0, 100% 100%, 0 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, background: '#fbf8f1', boxShadow: bordePixel('#1b1d2c', 4), padding: `${Math.round(pad * 0.5)}px ${pad}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center', fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: tam, lineHeight: 1.2, color: '#16151d' }}>
        {lineas.map((l, i) => {
          const vis = clamp(escritos - n, 0, l.length)
          n += l.length
          return (
            <div key={i} style={{ whiteSpace: 'nowrap' }}>
              <span>{l.slice(0, vis)}</span>
              <span style={{ color: 'transparent' }}>{l.slice(vis)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Hoja de papel (donde caen los sellos).
export function Hoja({ w, h, children, style }) {
  return (
    <div style={{ position: 'relative', width: w, height: h, background: `linear-gradient(180deg, ${COLORES.papel}, ${COLORES.papelOscuro})`, boxShadow: bordePixel('#5b4a33', 3), flex: 'none', ...style }}>
      <div style={{ position: 'absolute', left: 8, right: 8, top: h * 0.18, height: 2, background: 'rgba(90,70,40,0.15)' }} />
      <div style={{ position: 'absolute', left: 8, right: 8, top: h * 0.82, height: 2, background: 'rgba(90,70,40,0.15)' }} />
      {children}
    </div>
  )
}

// Cabecera de un cerebro: franja de color, nombre, empresa y modelo.
export function CabeceraCerebro({ e, w, tamNombre, tamSec, pad = 14 }) {
  const interior = w - pad * 2
  const tamN = tamParaAncho(e.nombre, interior, tamNombre, 18, 800)
  const tamE = tamParaAncho(e.empresa, interior, tamSec + 2, 16, 700)
  const tamM = tamParaAncho(e.modelo, interior, tamSec, 14, 400, FUENTE_MONO)
  return (
    <div style={{ padding: `${pad - 4}px ${pad}px ${pad - 6}px`, borderTop: `10px solid ${e.color}`, background: alfa(e.color, 0.14), flex: 'none' }}>
      <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamN, lineHeight: 1.1, color: tono(e.color, 0.3), whiteSpace: 'nowrap' }}>{e.nombre}</div>
      <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: tamE, lineHeight: 1.2, color: COLORES.texto, whiteSpace: 'nowrap', marginTop: 2 }}>{e.empresa}</div>
      <div style={{ fontFamily: FUENTE_MONO, fontSize: tamM, lineHeight: 1.25, color: COLORES.suave, whiteSpace: 'nowrap' }}>{e.modelo}</div>
    </div>
  )
}

// Fichas de acción (para la tarjeta "¿qué hacemos con él?"). Inter 800: se lee mejor que la letra pixel a este tamaño.
export function FichaAccion({ accion, tam, w }) {
  const s = SELLO[accion]
  const arresto = accion === 'arrestar'
  return (
    <div style={{ width: w, padding: `${Math.round(tam * 0.28)}px 4px`, textAlign: 'center', fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tam, lineHeight: 1.1, letterSpacing: 0.5, color: arresto ? '#ffe4e8' : tono(s.color, 0.25), background: arresto ? 'repeating-linear-gradient(90deg, rgba(0,0,0,0.38) 0 4px, transparent 4px 14px), #8a1128' : alfa(s.color, 0.16), boxShadow: `inset 0 0 0 3px ${arresto ? '#c2193a' : s.color}`, whiteSpace: 'nowrap' }}>
      {s.verbo}
    </div>
  )
}
