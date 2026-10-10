// Escena 5 (53-67 s): tabla comparativa que se construye por partes. Cada métrica marca a
// su propio ganador (con empates), las barras son proporcionales y los avisos son honestos.

import { usd, segundos, porcentaje, entero, factor } from '../../shared/formato.js'
import { vecesMasBarato } from '../../shared/juego.js'
import { clamp, contar, easeOutBack, easeOutCubic, prog } from '../lib/anim.js'
import { ESC } from '../lib/datos.js'
import { FUENTE_TEXTO, FUENTE_TITULO, tamParaAncho, tamParaCaja } from '../lib/medir.js'
import { COLORES, alfa, tono } from '../lib/textos.js'
import { Icono } from '../componentes/Pixel.jsx'
import { bordePixel } from '../componentes/ui.jsx'

const T0 = ESC.resultados.inicio
const T_FILAS = (k) => T0 + 0.9 + k * 1.75
const T_BANNER = T0 + 9.7
const T_AVISOS = T0 + 10.6
const EPS = 1e-12

function ganadores(ps, valor, menorEsMejor, valido = () => true) {
  const candidatos = ps.filter(valido)
  if (!candidatos.length) return new Set()
  const vals = candidatos.map(valor)
  const mejor = menorEsMejor ? Math.min(...vals) : Math.max(...vals)
  return new Set(candidatos.filter((p) => Math.abs(valor(p) - mejor) <= Math.max(EPS, Math.abs(mejor) * 1e-9)).map((p) => p.id))
}

function metricas(m) {
  const ps = m.stats.proveedores
  const N = m.N
  const conRespuestas = (p) => p.respondidas > 0
  const maxCosto = Math.max(...ps.map((p) => p.costoPromedioUSD), EPS)
  const maxLat = Math.max(...ps.map((p) => p.latenciaPromedioMs), EPS)
  return [
    {
      id: 'duracion',
      etiqueta: 'Decisiones con el presupuesto',
      valor: (p, k) => `${entero(p.decisionesEnJuego * k)}/${entero(N)}`,
      sub: (p) => (p.llegoAlFinal ? '¡llegó al final!' : p.motivoFin === 'sin_fondos' ? 'sin presupuesto' : 'sin vidas'),
      colorSub: (p) => (p.llegoAlFinal ? COLORES.bien : '#ff8a9a'),
      frac: (p) => p.decisionesEnJuego / Math.max(1, N),
      mejores: ganadores(ps, (p) => (p.llegoAlFinal ? 1e9 : 0) + p.decisionesEnJuego, false),
    },
    {
      id: 'costo',
      etiqueta: 'Costo por decisión',
      valor: (p, k) => usd(p.costoPromedioUSD * k),
      frac: (p) => p.costoPromedioUSD / maxCosto,
      mejores: ganadores(ps, (p) => p.costoPromedioUSD, true, conRespuestas),
    },
    {
      id: 'costo1000',
      etiqueta: 'Costo por mil decisiones',
      valor: (p, k) => usd(p.costoPor1000USD * k),
      frac: (p) => p.costoPromedioUSD / maxCosto,
      mejores: ganadores(ps, (p) => p.costoPor1000USD, true, conRespuestas),
    },
    {
      id: 'velocidad',
      etiqueta: 'Velocidad promedio',
      valor: (p, k) => segundos(p.latenciaPromedioMs * k),
      sub: () => 'por decisión',
      frac: (p) => p.latenciaPromedioMs / maxLat,
      mejores: ganadores(ps, (p) => p.latenciaPromedioMs, true, conRespuestas),
    },
    {
      id: 'aciertos',
      etiqueta: `Aciertos (sobre los ${entero(N)} casos)`,
      valor: (p, k) => `${entero(p.aciertosAccion * k)}/${entero(p.casos)}`,
      sub: (p) => porcentaje(p.precisionAccion),
      frac: (p) => p.precisionAccion,
      mejores: ganadores(ps, (p) => p.precisionAccion, false),
    },
  ]
}

function Celda({ p, met, t, t0, w, h, L }) {
  const k = easeOutBack(prog(t, t0, 0.4))
  const kNum = easeOutCubic(prog(t, t0 + 0.05, 0.8))
  const gana = met.mejores.has(p.id)
  const kGana = easeOutBack(prog(t, t0 + 0.9, 0.35))
  const texto = met.valor(p, kNum)
  const final = met.valor(p, 1)
  const tamV = tamParaAncho(final, w - 26, L.fs.medio, 18, 800)
  const sub = met.sub ? met.sub(p) : null
  const frac = clamp(met.frac(p))
  return (
    <div
      style={{
        position: 'relative',
        width: w,
        height: h,
        padding: '8px 12px',
        background: gana && t >= t0 + 0.9 ? alfa(COLORES.oro, 0.14 * clamp(kGana)) : 'rgba(10,12,22,0.75)',
        boxShadow: bordePixel(gana && t >= t0 + 0.9 ? COLORES.oro : '#2a3352', 3, false),
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 4,
        transform: `scale(${0.8 + 0.2 * k})`,
        opacity: clamp(k * 2),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, whiteSpace: 'nowrap' }}>
        <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamV, color: gana && t >= t0 + 0.9 ? '#ffe9a8' : '#fff', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{texto}</span>
      </div>
      {sub && (
        <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: tamParaAncho(sub, w - 24, L.fs.chico * 0.9, 16, 700), color: met.colorSub ? met.colorSub(p) : COLORES.suave, whiteSpace: 'nowrap', lineHeight: 1.1 }}>{sub}</div>
      )}
      <div style={{ position: 'relative', height: Math.max(8, h * 0.1), background: '#1c2238', marginTop: 2 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `max(4px, ${frac * 100 * easeOutCubic(prog(t, t0 + 0.1, 0.8))}%)`, background: p.color }} />
      </div>
      {gana && t >= t0 + 0.9 && (
        <div style={{ position: 'absolute', right: 10, top: -Math.round(L.fs.chico * 0.62), transform: `scale(${kGana})`, display: 'flex', alignItems: 'center', gap: 6, padding: '5px 9px', background: COLORES.oro, boxShadow: bordePixel('#6b4e00', 2, false) }}>
          <Icono nombre="corona" alto={L.fs.chico * 0.6} color="#6b4e00" extra={{ R: '#e5383b', B: '#4f7cff' }} />
          <span style={{ fontFamily: FUENTE_TITULO, fontSize: Math.round(L.fs.chico * 0.5), color: '#3a2a00', lineHeight: 1 }}>MEJOR</span>
        </div>
      )}
    </div>
  )
}

function avisos(m) {
  const ps = m.stats.proveedores
  const out = []
  const sinVerificar = ps.filter((p) => p.precio && p.precio.verificado === false).map((p) => p.nombre)
  if (sinVerificar.length) out.push(`Precio sin verificar en la página oficial: ${sinVerificar.join(', ')}.`)
  const estimados = ps.filter((p) => p.tokensEstimados).map((p) => p.nombre)
  if (estimados.length) out.push(`Tokens estimados (la API no los reportó): ${estimados.join(', ')}.`)
  const respaldo = ps.filter((p) => p.usoFallback).map((p) => p.nombre)
  if (respaldo.length) out.push(`Usó un modelo de respaldo en algunas llamadas: ${respaldo.join(', ')}.`)
  const errores = ps.filter((p) => p.erroresApi > 0).map((p) => `${p.nombre} (${p.erroresApi})`)
  if (errores.length) out.push(`Errores de API, cuentan como fallo: ${errores.join(', ')}.`)
  return out
}

export function Resultados({ m, L, t }) {
  const c = L.contenido
  const horizontal = L.orientacion === 'horizontal'
  const ps = m.stats.proveedores.slice(0, 3)
  const mets = metricas(m)
  const cols = L.juego.columnas
  const tamTitulo = tamParaAncho('RESULTADOS', c.w * 0.8, L.fs.titulo, 20, 400, FUENTE_TITULO)
  const kT = easeOutBack(prog(t, T0 + 0.1, 0.4))
  const lista = avisos(m)
  const masBarato = m.stats.masBarato
  const masCaro = m.stats.masCaro
  const veces = masBarato?.id === 'jev' && masCaro && masCaro.id !== masBarato.id ? vecesMasBarato(masBarato, masCaro) : null
  // Medidas
  const tituloH = tamTitulo * 1.5
  const cabH = L.fs.base * 1.7
  const etqH = horizontal ? 0 : L.fs.chico * 1.3 + 18
  const bannerH = veces ? L.fs.grande * 2.1 : 0
  const avisosH = lista.length ? Math.min(lista.length, 4) * L.fs.chico * 0.95 + 10 : 0
  const libre = c.h - tituloH - cabH - bannerH - avisosH - 30
  const filaH = Math.min(horizontal ? 118 : 150, libre / mets.length)
  const celdaH = filaH - etqH - (horizontal ? 18 : 12)
  let y = c.y
  const yTitulo = y
  y += tituloH
  const yCab = y
  y += cabH
  const filas = mets.map((met, k) => {
    const yy = y + k * filaH
    return { met, k, y: yy }
  })
  y += mets.length * filaH + 10
  const yBanner = y
  y += bannerH + (bannerH ? 10 : 0)
  const yAvisos = y
  const xEtq = c.x
  const wEtq = horizontal ? cols[0].x - c.x - 24 : c.w
  const tamEtq = horizontal ? tamParaCaja('Decisiones con el presupuesto', wEtq, 2, L.fs.base, 18, 800) : L.fs.chico
  const kFondo = easeOutCubic(prog(t, T0 + 0.2, 0.4))
  return (
    <>
      <div style={{ position: 'absolute', left: c.x - 14, top: yCab - 14, width: c.w + 28, height: yAvisos + avisosH - yCab + 24, background: 'rgba(7,9,18,0.72)', boxShadow: bordePixel('#1d2440', 4, false), opacity: kFondo }} />
      <div style={{ position: 'absolute', left: c.x, top: yTitulo, width: c.w, height: tituloH, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${0.6 + 0.4 * kT})`, opacity: clamp(kT * 2) }}>
        <div style={{ fontFamily: FUENTE_TITULO, fontSize: tamTitulo, color: COLORES.ambar, textShadow: `0 ${tamTitulo * 0.12}px 0 #000` }}>RESULTADOS</div>
      </div>
      {ps.map((p, i) => {
        const k = easeOutBack(prog(t, T0 + 0.35 + i * 0.1, 0.4))
        const tam = tamParaAncho(p.nombre, cols[i].w - 20, L.fs.base, 18, 800)
        return (
          <div key={p.id} style={{ position: 'absolute', left: cols[i].x, top: yCab, width: cols[i].w, height: cabH - 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: alfa(p.color, 0.22), boxShadow: bordePixel(p.color, 3, false), transform: `translateY(${(1 - k) * -40}px)`, opacity: clamp(k * 2) }}>
            <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tam, color: '#fff', whiteSpace: 'nowrap' }}>{p.nombre}</span>
          </div>
        )
      })}
      {filas.map(({ met, k, y: yy }) => {
        const t0 = T_FILAS(k)
        const kE = easeOutCubic(prog(t, t0 - 0.15, 0.35))
        if (t < t0 - 0.15) return null
        return (
          <div key={met.id}>
            <div
              style={{
                position: 'absolute',
                left: xEtq,
                top: yy,
                width: wEtq,
                height: horizontal ? filaH - 18 : etqH - 18,
                display: 'flex',
                alignItems: 'center',
                fontFamily: FUENTE_TEXTO,
                fontWeight: 800,
                fontSize: tamEtq,
                lineHeight: 1.15,
                color: COLORES.texto,
                opacity: kE,
                transform: `translateX(${(1 - kE) * -40}px)`,
                gap: 12,
              }}
            >
              <div style={{ width: 10, alignSelf: 'stretch', background: COLORES.ambar, flex: 'none', margin: horizontal ? '10px 0' : '4px 0' }} />
              <span>{met.etiqueta}</span>
            </div>
            {ps.map((p, i) => (
              <div key={p.id} style={{ position: 'absolute', left: cols[i].x, top: yy + etqH, width: cols[i].w }}>
                <Celda p={p} met={met} t={t} t0={t0 + i * 0.12} w={cols[i].w} h={celdaH} L={L} />
              </div>
            ))}
          </div>
        )
      })}
      {veces && t >= T_BANNER && (
        <BannerVeces m={m} L={L} t={t} y={yBanner} h={bannerH} veces={veces} masBarato={masBarato} masCaro={masCaro} />
      )}
      {lista.length > 0 && t >= T_AVISOS && (
        <div style={{ position: 'absolute', left: c.x, top: yAvisos, width: c.w, opacity: clamp((t - T_AVISOS) * 3), fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: tamParaAncho(lista.reduce((a, b) => (a.length > b.length ? a : b)), c.w - 20, L.fs.chico * 0.82, 16, 600), lineHeight: 1.18, color: COLORES.suave }}>
          {lista.slice(0, 4).map((a) => (
            <div key={a} style={{ whiteSpace: 'nowrap' }}>* {a}</div>
          ))}
        </div>
      )}
    </>
  )
}

function BannerVeces({ L, t, y, h, veces, masBarato, masCaro }) {
  const c = L.contenido
  const k = easeOutBack(prog(t, T_BANNER, 0.45))
  // Cuenta desde un valor pequeño hasta el factor real (nunca muestra "1 veces").
  const valor = contar(t, T_BANNER + 0.1, 1.0, Math.min(veces, Math.max(2, veces * 0.05)), veces)
  const texto1 = `${masBarato.nombre}: `
  const texto2 = factor(valor)
  const texto3 = ` más barato que ${masCaro.nombre}`
  const final = `${texto1}${factor(veces)}${texto3}`
  const tam = tamParaAncho(final, c.w - 120, L.fs.grande, 18, 800)
  return (
    <div
      style={{
        position: 'absolute',
        left: c.x,
        top: y,
        width: c.w,
        height: h,
        background: `linear-gradient(90deg, ${alfa(masBarato.color, 0.4)}, ${alfa(masBarato.color, 0.12)})`,
        boxShadow: bordePixel(masBarato.color, 4),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `scale(${0.7 + 0.3 * k})`,
        opacity: clamp(k * 2),
      }}
    >
      <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tam, color: '#fff', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {texto1}
        <span style={{ color: tono(masBarato.color, 0.5) }}>{texto2}</span>
        {texto3}
      </div>
      <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: L.fs.chico * 0.85, color: COLORES.suave }}>por decisión, con los precios públicos de cada API</div>
    </div>
  )
}
