// Columna de un cerebro: cabecera (nombre, empresa, modelo), cuerpo (pensando / sello /
// respuestas / costo / tokens / JSON o confianza; o el tablero en avance rápido),
// contadores (presupuesto, vidas, aciertos, latencia) y la pantalla de GAME OVER.

import { JUEGO } from '../../shared/config.js'
import { usd, segundos, entero, porcentaje } from '../../shared/formato.js'
import { clamp, easeOutBack, easeOutCubic, golpe, prog, azarFijo, sacudir } from '../lib/anim.js'
import { estadoProveedor, casilla } from '../lib/datos.js'
import { FUENTE_MONO, FUENTE_TEXTO, FUENTE_TITULO, anchoTexto, recortar, tamParaAncho } from '../lib/medir.js'
import { COLORES, alfa, siNo, tono } from '../lib/textos.js'
import { Icono } from './Pixel.jsx'
import { Retrato } from './Retrato.jsx'
import { Sello } from './Sello.jsx'
import { bordePixel } from './ui.jsx'

export function medidasColumna(L, w) {
  const v = L.formato === 'vertical'
  const h = L.formato === 'horizontal'
  const pad = 14
  return {
    pad,
    interior: w - pad * 2,
    tamNombre: v ? 36 : h ? 34 : 32,
    tamSec: v ? 26 : h ? 26 : 24,
    tam: h ? 30 : L.fs.base,
    tamChico: v ? 28 : h ? 27 : 24,
    cabH: v ? 126 : h ? 120 : 114,
    contH: v ? 162 : h ? 162 : 150,
  }
}

function Cabecera({ p, M, apagado }) {
  const tamN = tamParaAncho(p.nombre, M.interior, M.tamNombre, 20, 800)
  const tamE = tamParaAncho(p.empresa, M.interior, M.tamSec + 2, 18, 700)
  const tamM = tamParaAncho(p.modelo, M.interior, M.tamSec, 16, 400, FUENTE_MONO)
  return (
    <div style={{ height: M.cabH, padding: `${M.pad - 4}px ${M.pad}px 0`, borderTop: `10px solid ${apagado ? '#555' : p.color}`, background: alfa(p.color, 0.13), flex: 'none' }}>
      <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamN, lineHeight: 1.1, color: apagado ? '#aaa' : tono(p.color, 0.25), whiteSpace: 'nowrap' }}>{p.nombre}</div>
      <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: tamE, lineHeight: 1.2, color: COLORES.texto, whiteSpace: 'nowrap', marginTop: 4 }}>{p.empresa}</div>
      <div style={{ fontFamily: FUENTE_MONO, fontSize: tamM, lineHeight: 1.2, color: COLORES.suave, whiteSpace: 'nowrap' }}>{p.modelo}</div>
    </div>
  )
}

function Corazones({ vidas, perdioVidaEn, t, tam }) {
  const items = []
  for (let i = 0; i < JUEGO.vidas; i++) {
    const lleno = i < vidas
    const rompiendo = !lleno && i === vidas && perdioVidaEn !== null && t - perdioVidaEn < 0.9
    if (rompiendo) {
      const k = clamp((t - perdioVidaEn) / 0.9)
      const sep = easeOutCubic(k) * tam * 0.5
      const caida = k * k * tam * 1.2
      const destello = k < 0.15
      items.push(
        <div key={i} style={{ position: 'relative', width: tam * 1.12, height: tam }}>
          <div style={{ position: 'absolute', left: 0, top: 0, opacity: k }}>
            <Icono nombre="corazonVacio" alto={tam} color="#6b6f85" />
          </div>
          <div style={{ position: 'absolute', left: -sep, top: caida, transform: `rotate(${-k * 30}deg) scale(${1 + (1 - k) * 0.4})`, opacity: 1 - k }}>
            <Icono nombre="corazonIzq" alto={tam} color={destello ? '#fff' : '#ff3b55'} />
          </div>
          <div style={{ position: 'absolute', left: sep, top: caida, transform: `rotate(${k * 30}deg) scale(${1 + (1 - k) * 0.4})`, opacity: 1 - k }}>
            <Icono nombre="corazonDer" alto={tam} color={destello ? '#fff' : '#ff3b55'} />
          </div>
        </div>,
      )
    } else {
      items.push(
        <div key={i} style={{ width: tam * 1.12, height: tam }}>
          <Icono nombre={lleno ? 'corazon' : 'corazonVacio'} alto={tam} color={lleno ? '#ff3b55' : '#5b5f75'} claro="#ffc2cb" />
        </div>,
      )
    }
  }
  return <div style={{ display: 'flex', gap: tam * 0.12, alignItems: 'center' }}>{items}</div>
}

function Contadores({ p, M, e, t, L }) {
  const total = JUEGO.presupuestoUSD
  const frac = clamp(e.gastado / total)
  const texto = usd(e.gastado)
  const tamG = tamParaAncho(texto, M.interior - M.tam * 1.1 - anchoTexto(`/ ${usd(total).replace('US$ ', '')}`, M.tamSec, 600) - 16, M.tam, 18, 800)
  const popD = e.cambioAciertoEn !== null ? 1 + 0.25 * (1 - easeOutCubic(prog(t, e.cambioAciertoEn, 0.3))) : 1
  const tamCor = Math.round(M.tam * 1.0)
  const textoAciertos = `${entero(e.aciertos)}/${entero(e.decisiones)} aciertos`
  const tamA = tamParaAncho(textoAciertos, M.interior, M.tamChico + 2, 18, 800)
  const lat = e.ultimaLatMs !== null ? segundos(e.ultimaLatMs) : '—'
  const menosVida = e.perdioVidaEn !== null && t - e.perdioVidaEn < 1.4
  return (
    <div style={{ height: M.contH, padding: `${M.pad * 0.8}px ${M.pad}px`, background: 'rgba(5,6,12,0.55)', borderTop: '3px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
        <Icono nombre="moneda" alto={M.tam * 0.95} color="#7a5600" />
        <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamG, color: COLORES.texto, fontVariantNumeric: 'tabular-nums' }}>{texto}</span>
        <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: M.tamSec, color: COLORES.tenue }}>/ {usd(total).replace('US$ ', '')}</span>
      </div>
      <div style={{ position: 'relative', height: Math.round(M.tam * 0.5), background: '#20263b', boxShadow: bordePixel('#0a0c16', 3, false) }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${frac * 100}%`, background: frac > 0.85 ? '#ff4d5e' : p.color }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '35%', background: 'rgba(255,255,255,0.18)' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Corazones vidas={e.vidas} perdioVidaEn={e.perdioVidaEn} t={t} tam={tamCor} />
        {menosVida ? (
          <div style={{ fontFamily: FUENTE_TITULO, fontSize: Math.round(M.tamChico * 0.62), color: Math.floor(t * 8) % 2 ? '#ff4d5e' : '#ffd0d6', whiteSpace: 'nowrap', transform: `scale(${easeOutBack(prog(t, e.perdioVidaEn, 0.25))})`, transformOrigin: 'right center' }}>
            -1 VIDA
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: M.tamChico, color: COLORES.suave, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            <Icono nombre="reloj" alto={M.tamChico * 0.95} color="#9aa3bd" claro="#1b2138" />
            {lat}
          </div>
        )}
      </div>
      <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamA, color: COLORES.texto, whiteSpace: 'nowrap', transform: `scale(${popD})`, transformOrigin: 'left center' }}>
        <span style={{ color: COLORES.bien }}>{entero(e.aciertos)}</span>/{entero(e.decisiones)} <span style={{ fontWeight: 600, color: COLORES.suave }}>aciertos</span>
      </div>
    </div>
  )
}

// Hoja de papel donde cae el sello.
function Hoja({ w, h, children, style }) {
  return (
    <div style={{ position: 'relative', width: w, height: h, background: `linear-gradient(180deg, ${COLORES.papel}, ${COLORES.papelOscuro})`, boxShadow: bordePixel('#5b4a33', 3), flex: 'none', ...style }}>
      <div style={{ position: 'absolute', left: 8, right: 8, top: h * 0.2, height: 2, background: 'rgba(90,70,40,0.15)' }} />
      <div style={{ position: 'absolute', left: 8, right: 8, top: h * 0.8, height: 2, background: 'rgba(90,70,40,0.15)' }} />
      {children}
    </div>
  )
}

function Pensando({ t, desde, w, h, M }) {
  const seg = Math.max(0, t - desde)
  const puntos = Math.floor(t * 4) % 4
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: h * 0.18 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: h * 0.1, height: h * 0.1, background: COLORES.tinta, transform: `translateY(${-Math.max(0, Math.sin(t * 9 - i * 0.9)) * h * 0.08}px)` }} />
        ))}
      </div>
      <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: M.tamChico, color: COLORES.tinta }}>
        pensando{'.'.repeat(puntos)}
        <span style={{ color: 'transparent' }}>{'.'.repeat(3 - puntos)}</span>
      </div>
    </div>
  )
}

function Chip({ icono, valor, M, w, t, t0, colorIcono }) {
  const k = easeOutBack(prog(t, t0, 0.3))
  if (t < t0) return <div style={{ width: w }} />
  return (
    <div style={{ width: w, padding: '6px 4px', background: '#0e1322', boxShadow: bordePixel('#323c5e', 3, false), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, transform: `scale(${k})`, opacity: clamp(k) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icono nombre={icono} alto={M.tamChico * 0.82} color={colorIcono} claro="#0e1322" extra={{ R: '#e5383b', W: '#f5f5f5' }} />
        <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: M.tamChico + 2, color: COLORES.texto, lineHeight: 1 }}>{valor}</span>
      </div>
    </div>
  )
}

function CuerpoDetalle({ m, p, i, t, M, h, L, info }) {
  // Mientras entra el siguiente viajero, la columna sigue mostrando el veredicto anterior.
  const lSlot = t - m.tl.inicio[i]
  if (i > 0 && lSlot < 0.8) {
    const o = 1 - clamp((lSlot - 0.5) / 0.3)
    return (
      <div style={{ position: 'relative', flex: 1, display: 'flex', opacity: o }}>
        <CuerpoDetalleViajero m={m} p={p} i={i - 1} t={t} M={M} h={h} L={L} />
      </div>
    )
  }
  if (lSlot < 0.8) return <div style={{ flex: 1 }} />
  return <CuerpoDetalleViajero m={m} p={p} i={i} t={t} M={M} h={h} L={L} />
}

function CuerpoDetalleViajero({ m, p, i, t, M, h, L }) {
  const paso = m.sim.porProveedor[p.id].pasos[i]
  const d = m.tl.detalle[i]
  const tRes = d.resuelve[p.id]
  const r = paso.activo ? paso.resultado : null
  const hojaH = Math.round(M.tam * 3.1)
  const w = M.interior
  const esJev = r && r.confianza
  const resuelto = t >= tRes
  const ev = paso.evaluacion
  const revelado = t >= d.revela
  const rot = -7 + azarFijo(`${p.id}${i}`) * 9
  const l = t - m.tl.inicio[i]
  const opacidad = clamp((l - 0.8) / 0.3)
  const items = []
  // Presupuesto de alto para lo que va debajo de la hoja.
  const altoChips = M.tamChico + 2 + 14 + 10
  const altoCosto = (M.tam + 2) * 1.2 + 10
  const altoTok = M.tamSec * 1.25
  const tk = r?.tokens ?? {}
  const altoRazon = tk.razonamiento > 0 ? M.tamSec * 1.25 : 0
  const altoEst = tk.estimado ? M.tamSec * 1.1 : 0
  const resto = h - M.pad - hojaH - altoChips - altoCosto - altoTok - altoRazon - altoEst - 8
  const sacude = resuelto ? golpe(t, tRes).sacudida : 0
  items.push(
    <Hoja key="hoja" w={w} h={hojaH} style={{ transform: `translate(${sacude * 4}px, ${sacude * 6}px)` }}>
      {!paso.activo ? null : t < d.t0 ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: M.tamChico, color: '#9a8a6a' }}>en espera</div>
      ) : !resuelto ? (
        <Pensando t={t} desde={d.t0} w={w} h={hojaH} M={M} />
      ) : r?.ok ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Sello accion={r.decision.accion} t={t} t0={tRes} ancho={w * 0.84} alto={hojaH * 0.58} rot={rot} clave={`${p.id}${i}`} sobrePapel />
        </div>
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
          <div style={{ fontFamily: FUENTE_TITULO, fontSize: M.tamChico * 0.8, color: '#b3122e' }}>ERROR</div>
          <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: M.tamSec * 0.8, color: COLORES.tinta, textAlign: 'center' }}>
            {recortar(r?.error ?? 'sin respuesta', w - 20, M.tamSec * 0.8, 600)}
          </div>
        </div>
      )}
      {/* Cronómetro (tiempo real medido) */}
      {paso.activo && t >= d.t0 && (
        <div style={{ position: 'absolute', right: 6, top: 6, padding: '2px 6px', background: resuelto ? COLORES.tinta : 'transparent', color: resuelto ? '#fff' : COLORES.tinta, fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: M.tamSec * 0.85, fontVariantNumeric: 'tabular-nums' }}>
          {segundos(resuelto && r?.latenciaMs ? r.latenciaMs : ((t - d.t0) / d.escala) * 1000)}
        </div>
      )}
      {/* Marca de acierto o error al revelar */}
      {revelado && paso.activo && (
        <div style={{ position: 'absolute', left: -12, top: -14, transform: `scale(${easeOutBack(prog(t, d.revela + 0.15, 0.3))})` }}>
          <div style={{ width: M.tam * 1.5, height: M.tam * 1.5, background: ev.aciertoAccion ? '#1f9d4c' : '#d62f33', boxShadow: bordePixel('#0b0d18', 3), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icono nombre={ev.aciertoAccion ? 'check' : 'cruz'} alto={M.tam * 0.85} color="#fff" />
          </div>
        </div>
      )}
    </Hoja>,
  )
  if (resuelto && r?.ok) {
    const anchoChip = (w - 16) / 3
    const c = r.confianza ?? {}
    items.push(
      <div key="chips" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
        <Chip icono="barrera" valor={siNo(r.decision.pasa)} M={M} w={anchoChip} t={t} t0={tRes + 0.1} colorIcono="#c9cfe0" />
        <Chip icono="mascara" valor={siNo(r.decision.miente)} M={M} w={anchoChip} t={t} t0={tRes + 0.16} colorIcono="#c9b6ff" />
        <Chip icono="peligro" valor={`${r.decision.peligro}/4`} M={M} w={anchoChip} t={t} t0={tRes + 0.22} colorIcono="#ffc23d" />
      </div>,
    )
    const kC = prog(t, tRes + 0.25, 0.35)
    const tamTok = M.tamSec
    const textoCosto = usd(r.costoUSD)
    const tamEtqCosto = M.tamSec * 0.9
    const tamCosto = tamParaAncho(textoCosto, w - anchoTexto('costo', tamEtqCosto, 600) - 10, M.tam + 2, 18, 800)
    items.push(
      <div key="costo" style={{ marginTop: 10, opacity: clamp(kC * 3), display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, whiteSpace: 'nowrap', height: (M.tam + 2) * 1.2 }}>
          <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: tamEtqCosto, color: COLORES.suave }}>costo</span>
          <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamCosto, color: COLORES.ambar, fontVariantNumeric: 'tabular-nums' }}>{textoCosto}</span>
        </div>
        <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: tamParaAncho(`${entero(tk.entrada ?? 0)} entrada · ${entero(tk.salida ?? 0)} salida`, w, tamTok, 16, 600), color: COLORES.suave, whiteSpace: 'nowrap', lineHeight: 1.25 }}>
          <span style={{ color: COLORES.texto, fontWeight: 800 }}>{entero(tk.entrada ?? 0)}</span> entrada · <span style={{ color: COLORES.texto, fontWeight: 800 }}>{entero(tk.salida ?? 0)}</span> salida
        </div>
        {tk.razonamiento > 0 && (
          <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: tamParaAncho(`razonamiento interno: ${entero(tk.razonamiento)}`, w, tamTok, 16, 600), color: '#e7b9ff', whiteSpace: 'nowrap', lineHeight: 1.25 }}>
            razonamiento interno: <b>{entero(tk.razonamiento)}</b>
          </div>
        )}
        {tk.estimado && <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: tamTok * 0.85, color: COLORES.ambar, lineHeight: 1.25 }}>tokens estimados</div>}
      </div>,
    )
    if (esJev) {
      const kJ = prog(t, tRes + 0.35, 0.3)
      const filaH = M.tamChico * 1.32
      const filas = [
        ['sello', '#ff8a9a', c.accion],
        ['barrera', '#c9cfe0', c.pasa],
        ['mascara', '#c9b6ff', c.miente],
        ['peligro', '#ffc23d', c.peligro],
      ]
      const completo = resto >= filaH * 4 + M.tamSec * 1.3 + 12
      if (completo) {
        items.push(
          <div key="conf" style={{ marginTop: 10, opacity: clamp(kJ * 3) }}>
            <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: M.tamSec, color: COLORES.suave, lineHeight: 1.3 }}>probabilidad</div>
            {filas.map(([ic, col, val], k) => (
              <div key={ic} style={{ height: filaH, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icono nombre={ic} alto={M.tamChico * 0.75} color={col} claro="#141a2c" extra={{ R: '#e5383b', W: '#f5f5f5' }} />
                <div style={{ flex: 1, height: M.tamChico * 0.45, background: '#262d45', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(val ?? 0) * 100 * easeOutCubic(prog(t, tRes + 0.4 + k * 0.05, 0.4))}%`, background: p.color }} />
                </div>
                <div style={{ width: M.tamChico * 2.6, textAlign: 'right', fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: M.tamChico, color: k === 0 ? '#c4d4ff' : '#9db8ff', fontVariantNumeric: 'tabular-nums' }}>{val !== null && val !== undefined ? porcentaje(val) : '—'}</div>
              </div>
            ))}
          </div>,
        )
      } else if (resto >= M.tam * 1.3) {
        items.push(
          <div key="conf" style={{ marginTop: 8, opacity: clamp(kJ * 3), display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
            <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: M.tamSec, color: COLORES.suave }}>confianza</span>
            <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: M.tam + 2, color: '#9db8ff' }}>{c.accion !== null && c.accion !== undefined ? porcentaje(c.accion) : '—'}</span>
          </div>,
        )
      }
    } else if (r.salidaTexto) {
      const tamJ = L.formato === 'vertical' ? 22 : L.formato === 'horizontal' ? 22 : 20
      const porLinea = Math.max(8, Math.floor((w - 16) / (tamJ * 0.602)))
      const lineasMax = Math.max(1, Math.floor((resto - 22) / (tamJ * 1.25)))
      const kT = clamp((t - tRes - 0.15) / 0.35)
      let lineas = null
      let cortado = false
      // Con espacio, el JSON se muestra con sangría (como lo escribió el modelo, ordenado).
      try {
        const bonito = JSON.stringify(JSON.parse(r.salidaTexto), null, 1).split('\n')
        if (bonito.length <= lineasMax && bonito.every((x) => x.length <= porLinea)) lineas = bonito
      } catch {
        lineas = null
      }
      if (!lineas) {
        const texto = r.salidaTexto.replace(/\s+/g, '')
        lineas = []
        for (let k = 0; k < Math.min(lineasMax, Math.ceil(texto.length / porLinea)); k++) lineas.push(texto.slice(k * porLinea, (k + 1) * porLinea))
        cortado = texto.length > porLinea * lineasMax
        if (cortado) lineas[lineas.length - 1] = `${lineas[lineas.length - 1].slice(0, -1)}…`
      }
      const total = lineas.reduce((a, x) => a + x.length, 0)
      const visibles = Math.floor(kT * total)
      let n = 0
      items.push(
        <div key="json" style={{ marginTop: 10, padding: '5px 8px', background: '#05070d', boxShadow: bordePixel('#1f2a44', 3, false), fontFamily: FUENTE_MONO, fontSize: tamJ, lineHeight: 1.25, color: '#8ff0b5', opacity: t >= tRes + 0.15 ? 1 : 0 }}>
          {lineas.map((ln, k) => {
            const vis = clamp(visibles - n, 0, ln.length)
            n += ln.length
            return (
              <div key={k} style={{ whiteSpace: 'pre' }}>
                {ln.slice(0, vis)}
                <span style={{ color: 'transparent' }}>{ln.slice(vis)}</span>
              </div>
            )
          })}
        </div>,
      )
    }
  }
  // Destello rojo y "-1 vida" si fue un error grave
  const grave = revelado && paso.activo && ev?.errorGrave
  const kG = grave ? clamp((t - d.revela - 0.15) / 0.8) : 1
  return (
    <div style={{ position: 'relative', flex: 1, padding: `${M.pad}px ${M.pad}px 0`, overflow: 'hidden', opacity: opacidad }}>
      {items}
      {grave && kG < 1 && (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `rgba(255,40,60,${0.35 * (1 - kG)})` }} />
        </>
      )}
    </div>
  )
}

function Tablero({ m, p, t, w, h, M, indiceActual }) {
  const n = m.N
  const gap = 4
  let cols = 10
  let lado = 0
  for (let c = 4; c <= 15; c++) {
    const f = Math.ceil(n / c)
    const l = Math.floor(Math.min((w - gap * (c - 1)) / c, (h - gap * (f - 1)) / f))
    if (l > lado) {
      lado = l
      cols = c
    }
  }
  lado = Math.min(lado, 56)
  const filas = Math.ceil(n / cols)
  const anchoTotal = lado * cols + gap * (cols - 1)
  const celdas = []
  for (let i = 0; i < n; i++) {
    const c = casilla(m, p.id, i, t)
    const x = (i % cols) * (lado + gap)
    const y = Math.floor(i / cols) * (lado + gap)
    let fondo = '#141a2c'
    let borde = '#2c3552'
    let icono = null
    if (c.estado === 'bien') {
      fondo = '#1f9d4c'
      borde = '#0d4a22'
      icono = 'check'
    } else if (c.estado === 'mal') {
      fondo = '#e0453d'
      borde = '#6e1410'
      icono = 'cruz'
    } else if (c.estado === 'grave') {
      fondo = '#7a0f22'
      borde = '#ff9aa8'
      icono = 'cruz'
    } else if (c.estado === 'error') {
      fondo = '#555b70'
      borde = '#2a2d3a'
    } else if (c.estado === 'perdido') {
      fondo = '#22242c'
      borde = '#2e3038'
    }
    const pop = c.estado !== 'pendiente' && c.estado !== 'perdido' ? 1 + 0.5 * (1 - easeOutCubic(prog(t, c.t0, 0.2))) : 1
    const esActual = i === indiceActual && c.estado === 'pendiente'
    celdas.push(
      <div
        key={i}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: lado,
          height: lado,
          background: c.estado === 'perdido' ? `repeating-linear-gradient(135deg, #22242c 0 5px, #1a1b21 5px 10px)` : fondo,
          boxShadow: `inset 0 0 0 3px ${esActual ? COLORES.ambar : borde}`,
          transform: `scale(${pop})`,
          zIndex: pop > 1 ? 2 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icono && <Icono nombre={icono} alto={lado * 0.5} color="#fff" />}
      </div>,
    )
  }
  return <div style={{ position: 'relative', width: anchoTotal, height: filas * lado + (filas - 1) * gap, margin: '0 auto' }}>{celdas}</div>
}

function CuerpoRapido({ m, p, t, M, h, info, L }) {
  const i = info.indice
  const paso = m.sim.porProveedor[p.id].pasos[i]
  const tEv = m.tl.evento[p.id][i]
  const r = paso.activo ? paso.resultado : null
  const w = M.interior
  const filaH = Math.round(M.tam * 2.7)
  const v = m.viajeros[i]
  const ev = paso.evaluacion
  const tamRet = filaH - 8
  return (
    <div style={{ position: 'relative', flex: 1, padding: `${M.pad}px ${M.pad}px 0`, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ height: filaH, display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
        <div style={{ background: '#2a1f2e', boxShadow: bordePixel('#0b0d18', 3, false), padding: 2 }}>
          <Retrato semilla={v.semilla} tam={tamRet} t={t} />
        </div>
        <div style={{ position: 'relative', flex: 1, height: filaH * 0.82, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {r?.ok && t >= tEv && (
            <Sello accion={r.decision.accion} t={t} t0={tEv} ancho={(w - tamRet - 24) * 0.88} alto={filaH * 0.72} rot={-5 + azarFijo(`${p.id}r${i}`) * 7} clave={`${p.id}r${i}`} escalaInicial={1.25} dur={0.1} conParticulas={false} />
          )}
          {r && !r.ok && t >= tEv && (
            <div style={{ fontFamily: FUENTE_TITULO, fontSize: M.tamChico * 0.7, color: '#ff9aa8', paddingTop: 10 }}>ERROR</div>
          )}
          {r?.ok && t >= tEv + 0.06 && (
            <div style={{ position: 'absolute', right: -8, top: -10, transform: `scale(${easeOutBack(prog(t, tEv + 0.06, 0.18))})` }}>
              <div style={{ width: M.tam * 1.05, height: M.tam * 1.05, background: ev.aciertoAccion ? '#1f9d4c' : '#d62f33', boxShadow: bordePixel('#0b0d18', 2), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icono nombre={ev.aciertoAccion ? 'check' : 'cruz'} alto={M.tam * 0.6} color="#fff" />
              </div>
            </div>
          )}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Tablero m={m} p={p} t={t} w={w} h={Math.max(40, h - filaH - M.pad - 24)} M={M} indiceActual={i} />
      </div>
    </div>
  )
}

function GameOver({ go, t, m, M, L }) {
  const g = golpe(t, go.t, -4)
  const k = easeOutCubic(prog(t, go.t, 0.35))
  const motivo = go.motivo === 'sin_fondos' ? 'SIN PRESUPUESTO' : 'SIN VIDAS'
  const viajero = go.motivo === 'sin_fondos' ? go.indice + 1 : go.indice
  const detalle = go.motivo === 'sin_fondos' ? `no le alcanzó para el viajero ${viajero}/${m.N}` : `perdió la última vida en el viajero ${viajero}/${m.N}`
  const tamGO = tamParaAncho('GAME', M.interior * 0.9, Math.round(M.tam * 1.7), 16, 400, FUENTE_TITULO)
  const tamMot = tamParaAncho(motivo, M.interior, Math.round(M.tamChico * 0.95), 12, 400, FUENTE_TITULO)
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: M.tam * 0.5, background: `rgba(8,8,12,${0.82 * k})`, padding: M.pad }}>
      <div style={{ transform: `rotate(${g.rot}deg) scale(${g.escala})`, opacity: g.o, textAlign: 'center' }}>
        <div style={{ fontFamily: FUENTE_TITULO, fontSize: tamGO, lineHeight: 1.15, color: '#ff3b55', textShadow: '4px 4px 0 #3a0610' }}>GAME</div>
        <div style={{ fontFamily: FUENTE_TITULO, fontSize: tamGO, lineHeight: 1.15, color: '#ff3b55', textShadow: '4px 4px 0 #3a0610' }}>OVER</div>
      </div>
      <div style={{ opacity: clamp((t - go.t - 0.25) * 4), textAlign: 'center' }}>
        <div style={{ fontFamily: FUENTE_TITULO, fontSize: tamMot, color: COLORES.ambar, lineHeight: 1.4 }}>{motivo}</div>
        <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: M.tamSec, color: COLORES.texto, lineHeight: 1.25, marginTop: 6 }}>{detalle}</div>
      </div>
    </div>
  )
}

export function Columna({ m, p, caja, t, L, info, kEntrada = 1, k }) {
  const M = medidasColumna(L, caja.w)
  const e = estadoProveedor(m, p.id, t)
  const go = e.gameOver
  const apagado = go && t >= go.t + 0.2
  const bodyH = caja.h - M.cabH - M.contH
  const temblor = e.perdioVidaEn !== null ? sacudir(clamp(1 - (t - e.perdioVidaEn) / 0.4), t, 10) : { x: 0, y: 0 }
  return (
    <div
      style={{
        position: 'absolute',
        left: caja.x,
        top: caja.y,
        width: caja.w,
        height: caja.h,
        transform: `translate(${temblor.x}px, ${(1 - kEntrada) * (caja.h + 200) + temblor.y}px)`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(180deg, ${COLORES.panel2}, ${COLORES.panel})`,
          boxShadow: bordePixel(apagado ? '#3a3a44' : tono(p.color, -0.45), 4),
          display: 'flex',
          flexDirection: 'column',
          filter: apagado ? 'grayscale(1) brightness(0.75)' : 'none',
        }}
      >
        <Cabecera p={p} M={M} apagado={apagado} />
        <div style={{ position: 'relative', flex: 1, display: 'flex', minHeight: 0 }}>
          {info.modo === 'detalle' ? (
            <CuerpoDetalle m={m} p={p} i={info.indice} t={t} M={M} h={bodyH} L={L} info={info} />
          ) : (
            <CuerpoRapido m={m} p={p} t={t} M={M} h={bodyH} info={info} L={L} />
          )}
        </div>
        <Contadores p={p} M={M} e={e} t={t} L={L} />
      </div>
      {go && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: M.cabH, height: bodyH }}>
          <GameOver go={go} t={t} m={m} M={M} L={L} />
        </div>
      )}
    </div>
  )
}
