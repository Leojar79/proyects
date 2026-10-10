// Cabina del guardia: ventanilla con el viajero, pasaporte, globo de diálogo y el veredicto.
// En el avance rápido muestra la fila de viajeros que avanza.

import { DETALLE, VIAJEROS_DETALLE } from '../../shared/timeline.js'
import { FECHA_PUESTO } from '../../shared/preguntas.js'
import { clamp, easeInCubic, easeOutBack, easeOutCubic, golpe, prog } from '../lib/anim.js'
import { FUENTE_TEXTO, FUENTE_TITULO, anchoTexto, partirLineas, tamParaAncho, tamParaCaja, recortar } from '../lib/medir.js'
import { COLORES, SELLO, alfa, multiplicador, tono } from '../lib/textos.js'
import { Icono } from './Pixel.jsx'
import { Retrato } from './Retrato.jsx'
import { Sello } from './Sello.jsx'
import { bordePixel, TextoPixel } from './ui.jsx'

const NACIONES = {
  Valdoria: '#2f5fa8',
  Brenia: '#2f7d4f',
  Galvonia: '#9b2f2f',
  Marelia: '#6a3f8f',
  Ludovia: '#2a7a7a',
  Esterlia: '#b5651d',
  Orsenia: '#6b4a2b',
}

function colorNacion(n) {
  if (NACIONES[n]) return NACIONES[n]
  let h = 0
  for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return ['#2f5fa8', '#2f7d4f', '#9b2f2f', '#6a3f8f', '#2a7a7a', '#b5651d'][h % 6]
}

function lineaPermiso(d) {
  if (d.permiso === null || d.permiso === undefined) return 'No requiere (ciudadano)'
  if (d.permiso === 'ninguno') return 'No presenta permiso'
  const otro = d.permisoNombre && d.permisoNombre !== d.nombre ? ` · a nombre de ${d.permisoNombre}` : ''
  return `${d.permiso}${otro}`
}

function cajasCabina(L, modo) {
  const c = L.juego.cabina
  if (L.orientacion === 'horizontal') {
    const headH = 58
    if (modo === 'rapido') {
      // Ventanilla grande, la fila debajo y la barra de progreso al final.
      const winH = 360
      const barraH = 120
      const filaY = headH + 14 + winH + 14
      return {
        c,
        head: { x: 0, y: 0, w: c.w, h: headH },
        win: { x: 0, y: headH + 14, w: c.w, h: winH },
        pas: { x: 0, y: filaY, w: c.w, h: c.h - filaY - barraH - 16 },
        bubble: { x: 0, y: c.h - barraH, w: c.w, h: barraH },
      }
    }
    // Ventanilla arriba, el globo justo debajo (el viajero habla) y el pasaporte sobre el mostrador.
    const winH = 290
    const bubbleH = 140
    const bubbleY = headH + 14 + winH + 18
    const pasY = bubbleY + bubbleH + 16
    return {
      c,
      head: { x: 0, y: 0, w: c.w, h: headH },
      win: { x: 0, y: headH + 14, w: c.w, h: winH },
      bubble: { x: 0, y: bubbleY, w: c.w, h: bubbleH },
      pas: { x: 0, y: pasY, w: c.w, h: c.h - pasY },
    }
  }
  const vertical = L.formato === 'vertical'
  const headH = vertical ? 60 : 54
  const bubbleH = vertical ? 124 : 112
  const mainY = headH + 12
  const mainH = c.h - mainY - bubbleH - 16
  const winW = Math.round(mainH * 0.8)
  return {
    c,
    head: { x: 0, y: 0, w: c.w, h: headH },
    win: { x: 0, y: mainY, w: winW, h: mainH },
    pas: { x: winW + 16, y: mainY, w: c.w - winW - 16, h: mainH },
    bubble: { x: 0, y: c.h - bubbleH, w: c.w, h: bubbleH },
  }
}

function Etiqueta({ children, tam, color = COLORES.texto, fondo = 'rgba(8,10,20,0.85)', borde = '#3a4566', style }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: tam * 0.45,
        padding: `${tam * 0.32}px ${tam * 0.5}px`,
        background: fondo,
        boxShadow: bordePixel(borde, 3),
        fontFamily: FUENTE_TITULO,
        fontSize: tam,
        lineHeight: 1,
        color,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// Ventanilla con el vidrio, luz cálida y el marco.
function Ventanilla({ w, h, children }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(180deg, #3a2a3f 0%, #5a3b3a 60%, #6b4632 100%)',
        boxShadow: bordePixel('#11131f', 6),
        overflow: 'hidden',
      }}
    >
      {/* luz del farol interior */}
      <div
        style={{
          position: 'absolute',
          left: -w * 0.2,
          top: -h * 0.3,
          width: w * 1.4,
          height: h * 1.2,
          background: 'radial-gradient(closest-side, rgba(255,196,110,0.45), rgba(255,160,80,0.08) 70%, transparent)',
        }}
      />
      {/* persiana */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: h * 0.1, background: 'repeating-linear-gradient(180deg, #24202e 0 6px, #2f2a3a 6px 12px)' }} />
      {children}
      {/* reflejo del vidrio */}
      <div style={{ position: 'absolute', left: w * 0.08, top: 0, width: w * 0.06, height: h, background: 'rgba(255,255,255,0.07)', transform: 'skewX(-14deg)' }} />
      <div style={{ position: 'absolute', left: w * 0.18, top: 0, width: w * 0.02, height: h, background: 'rgba(255,255,255,0.06)', transform: 'skewX(-14deg)' }} />
      {/* repisa */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.max(14, h * 0.07), background: '#2a1b12', borderTop: '4px solid #6e4a2e' }} />
    </div>
  )
}

function Pasaporte({ v, w, h, L }) {
  const d = v.documento
  const color = colorNacion(d.nacionalidad)
  const pad = Math.round(w * 0.035)
  const bandaH = Math.round(L.fs.chico * 1.2)
  const anchoUtil = w - pad * 2
  const filas = [
    ['NOMBRE', d.nombre, 800],
    ['VENCE', d.vence, 700],
    ['PERMISO', lineaPermiso(d), 600],
    ['DECLARA', d.equipajeDeclarado, 600],
    ['INSPECCIÓN', d.inspeccion, 600],
  ]
  // Busca el tamaño de letra más grande con el que todo cabe en la tarjeta.
  const altoUtil = h - bandaH - pad * 1.4
  let tam = L.fs.base
  let lay = null
  const minimo = L.formato === 'vertical' ? 24 : 20
  for (; tam >= minimo; tam -= 1) {
    const tamEt = Math.round(tam * 0.6)
    const anchoEt = anchoTexto('INSPECCIÓN', tamEt, 800) + tam * 0.45
    const anchoVal = anchoUtil - anchoEt
    lay = filas.map(([et, val, peso]) => ({ et, peso, lineas: partirLineas(val, anchoVal, tam, peso) }))
    const total = lay.reduce((a, f) => a + f.lineas.length * tam * 1.14 + tam * 0.22, 0)
    if (total <= altoUtil) break
  }
  const tamEt = Math.round(tam * 0.6)
  const anchoEt = anchoTexto('INSPECCIÓN', tamEt, 800) + tam * 0.45
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `linear-gradient(180deg, ${COLORES.papel}, #e8dcbf)`,
        boxShadow: bordePixel('#5b4a33', 4),
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: bandaH,
          background: color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `0 ${pad}px`,
          fontFamily: FUENTE_TITULO,
          fontSize: Math.round(bandaH * 0.42),
          color: '#fff6dc',
          borderBottom: `4px solid ${tono(color, -0.35)}`,
        }}
      >
        <span>PASAPORTE</span>
        <span>{String(d.nacionalidad).toUpperCase()}</span>
      </div>
      <div style={{ padding: `${pad * 0.6}px ${pad}px 0`, display: 'flex', flexDirection: 'column', gap: tam * 0.22 }}>
        {lay.map((f) => (
          <div key={f.et} style={{ display: 'flex', alignItems: 'baseline' }}>
            <div
              style={{
                width: anchoEt,
                flex: 'none',
                fontFamily: FUENTE_TEXTO,
                fontWeight: 800,
                fontSize: tamEt,
                color: '#8a7350',
                letterSpacing: 0.5,
              }}
            >
              {f.et}
            </div>
            <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: f.peso, fontSize: tam, lineHeight: 1.14, color: COLORES.tinta }}>
              {f.lineas.map((l, i) => (
                <div key={i} style={{ whiteSpace: 'nowrap' }}>
                  {l}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {/* sello de entrada del país (decorativo) */}
      <div
        style={{
          position: 'absolute',
          right: pad,
          bottom: pad * 0.6,
          width: bandaH * 1.5,
          height: bandaH * 1.5,
          borderRadius: '50%',
          border: `3px solid ${alfa(color, 0.35)}`,
          transform: 'rotate(-12deg)',
        }}
      />
    </div>
  )
}

function Globo({ texto, w, h, t0, t1, t, L, colaX }) {
  const pad = Math.round(L.fs.base * 0.6)
  const maxLineas = 3
  const tam = tamParaCaja(`“${texto}”`, w - pad * 2, maxLineas, L.fs.base, L.formato === 'vertical' ? 26 : 22, 600)
  const lineas = partirLineas(`“${texto}”`, w - pad * 2, tam, 600)
  const total = lineas.reduce((a, l) => a + l.length, 0)
  const escritos = Math.floor(clamp((t - t0) / (t1 - t0)) * total)
  let n = 0
  const pop = easeOutBack(prog(t, t0 - 0.12, 0.25))
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform: `scale(${0.6 + 0.4 * pop})`,
        transformOrigin: `${colaX}px 0px`,
        opacity: clamp(pop * 2),
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: colaX - 14,
          top: -14,
          width: 28,
          height: 18,
          background: '#fbf8f1',
          clipPath: 'polygon(30% 0, 100% 100%, 0 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#fbf8f1',
          boxShadow: bordePixel('#1b1d2c', 4),
          padding: `${pad * 0.6}px ${pad}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          fontFamily: FUENTE_TEXTO,
          fontWeight: 600,
          fontSize: tam,
          lineHeight: 1.22,
          color: '#16151d',
        }}
      >
        {lineas.map((l, i) => {
          const visibles = clamp(escritos - n, 0, l.length)
          n += l.length
          return (
            <div key={i} style={{ whiteSpace: 'nowrap' }}>
              <span>{l.slice(0, visibles)}</span>
              <span style={{ color: 'transparent' }}>{l.slice(visibles)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Veredicto({ v, t, t0, w, h, L }) {
  const g = golpe(t, t0, -2)
  if (!g.visible) return null
  const s = SELLO[v.verdad.accion]
  const tam = Math.min(L.fs.medio, Math.round(h * 0.3))
  const anchoSello = Math.min(w * 0.5, tamParaAncho(s.texto, w * 0.5, Math.round(h * 0.3), 14, 400, FUENTE_TITULO) * 10 + 60)
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: '#0c0e19',
        boxShadow: bordePixel(s.color, 5),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: tam * 0.7,
        opacity: g.o,
        transform: `scale(${1 + (g.escala - 1) * 0.25})`,
      }}
    >
      <div style={{ fontFamily: FUENTE_TITULO, fontSize: tam * 0.8, color: COLORES.texto, whiteSpace: 'nowrap' }}>CORRECTO:</div>
      <Sello accion={v.verdad.accion} t={t} t0={t0 + 0.05} ancho={anchoSello} alto={h * 0.62} rot={-3} clave={`ver${v.id}`} />
    </div>
  )
}

function CabinaDetalle({ m, L, t, info, cajas }) {
  const v = m.viajeros[info.indice]
  const d = m.tl.detalle[info.indice]
  const inicio = m.tl.inicio[info.indice]
  const l = t - inicio
  const slot = info.duracionSlot
  const { win, pas, bubble, head } = cajas
  // Entrada y salida del viajero
  const kIn = easeOutCubic(prog(l, 0, DETALLE.entrada))
  const kOut = info.indice < VIAJEROS_DETALLE - 1 ? easeInCubic(prog(l, slot - 0.38, 0.38)) : 0
  const tamRet = Math.round(Math.min(win.h * 0.8, win.w * 0.86))
  const xRet = (win.w - tamRet) / 2 + (1 - kIn) * (win.w * 1.1) - kOut * win.w * 1.1
  const camina = (1 - kIn) + kOut
  const yRet = win.h - tamRet - Math.max(14, win.h * 0.07) + 4 - Math.abs(Math.sin(l * 15)) * 10 * Math.min(1, camina * 3)
  const hablando = l > DETALLE.entrada && l < DETALLE.habla
  // Pasaporte
  // El pasaporte sube desde abajo (sin pasarse de su lugar) y al final sale hacia la derecha.
  const kPas = easeOutCubic(prog(l, 0.12, 0.5))
  const asiento = Math.sin(clamp((l - 0.62) / 0.25) * Math.PI) * 0.6
  const yPas = (1 - kPas) * (pas.h + 120)
  const xPas = kOut * (pas.w * 0.6 + 120)
  const rotPas = -1.2 + (1 - kPas) * 7 - asiento
  const colaX = L.orientacion === 'horizontal' ? win.w * 0.5 : win.w * 0.5
  const tamHead = L.formato === 'vertical' ? 26 : L.formato === 'feed' ? 22 : 20
  const horizontal = L.orientacion === 'horizontal'
  const factorTiempo = d.escala < 1 && t >= d.t0 - 0.2 && t < d.revela + 0.3
  // Letrero de cámara rápida entre las dos etiquetas de la cabecera.
  const anchoIzq = anchoTexto(`VIAJERO ${info.indice + 1}/${m.N}`, tamHead, 400, FUENTE_TITULO) + tamHead * 1.2
  const anchoDer = anchoTexto(`HOY ${FECHA_PUESTO}`, tamHead, 400, FUENTE_TITULO) + tamHead * 2.8
  const libre = head.w - anchoIzq - anchoDer - 36
  const textoLargo = `TIEMPO ${multiplicador(1 / d.escala)}`
  let textoTiempo = textoLargo
  let tamTiempo = tamParaAncho(textoLargo, libre - tamHead * 2.2, tamHead, 10, 400, FUENTE_TITULO)
  if (tamTiempo < 15) {
    textoTiempo = multiplicador(1 / d.escala)
    tamTiempo = tamParaAncho(textoTiempo, libre - tamHead * 2.2, tamHead, 10, 400, FUENTE_TITULO)
  }
  return (
    <>
      <div style={{ position: 'absolute', left: head.x, top: head.y, width: head.w, height: head.h, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Etiqueta tam={tamHead} color={COLORES.ambar}>
          VIAJERO {info.indice + 1}/{m.N}
        </Etiqueta>
        {factorTiempo && !horizontal ? (
          <div style={{ opacity: clamp((t - d.t0 + 0.2) * 5), transform: `scale(${easeOutBack(prog(t, d.t0 - 0.2, 0.3))})` }}>
            <Etiqueta tam={tamTiempo} color="#1a1400" fondo={COLORES.ambar} borde="#7a5600" style={{ padding: `${tamTiempo * 0.32}px ${tamTiempo * 0.4}px` }}>
              <Icono nombre="avance" alto={tamTiempo} color="#1a1400" />
              {textoTiempo}
            </Etiqueta>
          </div>
        ) : (
          <div />
        )}
        <Etiqueta tam={tamHead} color="#dfe6ff">
          <Icono nombre="calendario" alto={tamHead * 1.1} color="#dfe6ff" claro="#2a3150" />
          HOY {FECHA_PUESTO}
        </Etiqueta>
      </div>
      <div style={{ position: 'absolute', left: win.x, top: win.y, width: win.w, height: win.h }}>
        <Ventanilla w={win.w} h={win.h}>
          <div style={{ position: 'absolute', left: xRet, top: yRet, opacity: 1 - kOut * 0.6 }}>
            <Retrato semilla={v.semilla} tam={tamRet} t={t} hablando={hablando} />
          </div>
          {factorTiempo && horizontal && (
            <div style={{ position: 'absolute', right: 14, top: 22, opacity: clamp((t - d.t0 + 0.2) * 5), transform: `scale(${easeOutBack(prog(t, d.t0 - 0.2, 0.3))})` }}>
              <Etiqueta tam={22} color="#1a1400" fondo={COLORES.ambar} borde="#7a5600">
                <Icono nombre="avance" alto={22} color="#1a1400" />
                TIEMPO {multiplicador(1 / d.escala)}
              </Etiqueta>
            </div>
          )}
        </Ventanilla>
      </div>
      <div
        style={{
          position: 'absolute',
          left: pas.x,
          top: pas.y,
          width: pas.w,
          height: pas.h,
          transform: `translate(${xPas}px, ${yPas}px) rotate(${rotPas + kOut * 6}deg)`,
          opacity: 1 - kOut,
        }}
      >
        <Pasaporte v={v} w={pas.w} h={pas.h} L={L} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: bubble.x,
          top: bubble.y,
          width: bubble.w,
          height: bubble.h,
          transform: `translateX(${-kOut * 40}px)`,
          opacity: 1 - kOut,
        }}
      >
        <Globo texto={v.dice} w={bubble.w} h={bubble.h} t0={inicio + DETALLE.entrada} t1={inicio + DETALLE.habla} t={t} L={L} colaX={colaX} />
        <Veredicto v={v} t={t} t0={d.revela} w={bubble.w} h={bubble.h} L={L} />
      </div>
    </>
  )
}

function CabinaRapida({ m, L, t, info, cajas }) {
  const { win, pas, bubble, head } = cajas
  const slot = info.duracionSlot
  // Al empezar su turno, el viajero sale de la fila y llega a la ventanilla (el anterior se va).
  const avance = info.indice - 1 + easeOutCubic(clamp(info.local / (slot * 0.32)))
  const tamHead = L.formato === 'vertical' ? 26 : L.formato === 'feed' ? 22 : 20
  const tamRet = Math.round(Math.min(win.h * 0.8, win.w * 0.86))
  const horizontal = false
  // Zona de la fila: la caja del pasaporte (a la derecha de la ventanilla, o debajo en horizontal).
  const fila = { x: pas.x, y: pas.y, w: pas.w, h: pas.h }
  const tamFila = Math.round(Math.min(tamRet * 0.62, fila.h - 64))
  const espacio = tamFila * 1.08
  const filaAbajo = L.orientacion === 'horizontal'
  const parpadeo = Math.floor(t * 3) % 2 === 0
  const actual = m.viajeros[info.indice]
  const personas = []
  for (let j = Math.max(0, info.indice - 2); j < Math.min(m.N, info.indice + 8); j++) {
    const rel = j - avance
    let x
    let tam
    let y
    let o = 1
    if (horizontal) {
      // Todos dentro de la ventanilla: el actual grande al centro-izquierda, la fila a la derecha.
      const xActual = win.w * 0.08
      const xFila = xActual + tamRet + 20
      if (rel <= 0) {
        x = xActual + rel * tamRet * 1.2
        tam = tamRet
        o = 1 + rel
      } else if (rel < 1) {
        x = xFila + (xActual - xFila) * (1 - rel)
        tam = tamFila + (tamRet - tamFila) * (1 - rel)
      } else {
        x = xFila + (rel - 1) * espacio * 0.8
        tam = tamFila
      }
      y = win.h - tam - Math.max(14, win.h * 0.07) + 4
    } else if (rel <= 0) {
      x = win.x + (win.w - tamRet) / 2 + rel * win.w
      tam = tamRet
      y = win.y + win.h - tam - Math.max(14, win.h * 0.07) + 4
      o = 1 + rel
    } else if (rel < 1) {
      const x0 = fila.x + 16
      const x1 = win.x + (win.w - tamRet) / 2
      x = x0 + (x1 - x0) * (1 - rel)
      tam = tamFila + (tamRet - tamFila) * (1 - rel)
      y = fila.y + fila.h - tam - 26 + (win.y + win.h - tamRet - Math.max(14, win.h * 0.07) + 4 - (fila.y + fila.h - tamFila - 26)) * (1 - rel)
    } else {
      x = fila.x + 16 + (rel - 1) * espacio
      tam = tamFila
      y = fila.y + fila.h - tam - 26
    }
    const salto = rel > 0 && rel < 1 ? -Math.sin(rel * Math.PI) * 18 : 0
    personas.push({ j, x, y: y + salto, tam, o: clamp(o), dentro: rel <= 0.5 })
  }
  const enVentana = personas.filter((p) => p.dentro)
  const enFila = personas.filter((p) => !p.dentro)
  const tamNombre = L.fs.chico
  return (
    <>
      <div style={{ position: 'absolute', left: head.x, top: head.y, width: head.w, height: head.h, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Etiqueta tam={tamHead * 1.05} color="#1a1400" fondo={parpadeo ? COLORES.ambar : '#ffd66b'} borde="#7a5600">
          <Icono nombre="avance" alto={tamHead * 1.05} color="#1a1400" />
          <TextoPixel>AVANCE RÁPIDO</TextoPixel>
        </Etiqueta>
        <Etiqueta tam={tamHead} color={COLORES.ambar}>
          VIAJERO {info.indice + 1}/{m.N}
        </Etiqueta>
      </div>
      {!horizontal && (
        <div
          style={{
            position: 'absolute',
            left: fila.x,
            top: fila.y,
            width: fila.w,
            height: fila.h,
            background: 'linear-gradient(180deg, rgba(20,22,40,0.55), rgba(20,22,40,0.85))',
            boxShadow: bordePixel('#2a3150', 4),
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', left: 16, top: 12, fontFamily: FUENTE_TITULO, fontSize: Math.round(tamHead * 0.8), color: COLORES.tenue }}>
            FILA
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 26, background: 'repeating-linear-gradient(90deg, #3a3f5a 0 40px, #30344c 40px 80px)' }} />
          {enFila.map((p) => (
            <div key={p.j} style={{ position: 'absolute', left: p.x - fila.x, top: p.y - fila.y, opacity: p.o }}>
              <Retrato semilla={m.viajeros[p.j].semilla} tam={p.tam} t={t} />
            </div>
          ))}
        </div>
      )}
      <div style={{ position: 'absolute', left: win.x, top: win.y, width: win.w, height: win.h }}>
        <Ventanilla w={win.w} h={win.h}>
          {(horizontal ? personas : enVentana).map((p) => (
            <div key={p.j} style={{ position: 'absolute', left: horizontal ? p.x : p.x - win.x, top: horizontal ? p.y : p.y - win.y, opacity: p.o }}>
              <Retrato semilla={m.viajeros[p.j].semilla} tam={p.tam} t={t} />
            </div>
          ))}
        </Ventanilla>
      </div>
      {/* Barra de progreso de la fila */}
      <div style={{ position: 'absolute', left: bubble.x, top: bubble.y, width: bubble.w, height: bubble.h, background: 'rgba(8,10,20,0.88)', boxShadow: bordePixel('#2e3a5c', 4), padding: `${bubble.h * 0.14}px ${bubble.h * 0.2}px`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamNombre, color: COLORES.texto, whiteSpace: 'nowrap' }}>
          <span>{recortar(actual.nombre, bubble.w * 0.55, tamNombre, 800)}</span>
          <span style={{ color: COLORES.suave, fontWeight: 600 }}>quedan {m.N - info.indice - 1}</span>
        </div>
        <div style={{ position: 'relative', height: Math.round(bubble.h * 0.24), background: '#232a42', boxShadow: bordePixel('#0b0d18', 3, false) }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${((avance + 1) / m.N) * 100}%`, background: `repeating-linear-gradient(90deg, ${COLORES.ambar} 0 18px, #e0a01f 18px 24px)` }} />
        </div>
      </div>
    </>
  )
}

export function Cabina({ m, L, t, info, kEntrada = 1 }) {
  const cajas = cajasCabina(L, info.modo)
  const { c } = cajas
  if (info.indice >= m.N) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: c.x,
        top: c.y,
        width: c.w,
        height: c.h,
        transform: `translateY(${(1 - kEntrada) * -80}px)`,
        opacity: clamp(kEntrada * 1.5),
      }}
    >
      {info.modo === 'detalle' ? (
        <CabinaDetalle m={m} L={L} t={t} info={info} cajas={cajas} />
      ) : (
        <CabinaRapida m={m} L={L} t={t} info={info} cajas={cajas} />
      )}
    </div>
  )
}
