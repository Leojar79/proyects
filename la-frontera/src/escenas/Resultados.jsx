// Escena 5 (53-67 s): tabla comparativa que se construye por partes. Las coronas MEJOR salen de
// stats.ganadores (shared/juego.js, con empates honestos), las barras son proporcionales y los
// avisos son honestos. Debajo de la tabla: cuánto más barato es Jev que cada uno, con los precios
// por millón de tokens que se usaron.

import { usd, segundos, entero, factor } from '../../shared/formato.js'
import { EMPATE_ACIERTOS } from '../../shared/juego.js'
import { clamp, contar, easeOutBack, easeOutCubic, prog } from '../lib/anim.js'
import { ESC } from '../lib/datos.js'
import { FUENTE_TEXTO, FUENTE_TITULO, anchoTexto, tamParaAncho, tamParaCaja } from '../lib/medir.js'
import { COLORES, alfa, lista, precioCorto, tono } from '../lib/textos.js'
import { Icono } from '../componentes/Pixel.jsx'
import { bordePixel } from '../componentes/ui.jsx'

const T0 = ESC.resultados.inicio
const T_FILAS = (k) => T0 + 0.9 + k * 1.75
const T_BANNER = T0 + 9.7
const T_AVISOS = T0 + 10.6
const EPS = 1e-12
const MAX_AVISOS = 5

const sinRespuestas = (p) => !(p.respondidas > 0)
const SIN_RESPUESTAS = 'sin respuestas (API)'

function erroresGraves(n) {
  return `${entero(n)} ${n === 1 ? 'error grave' : 'errores graves'}`
}

function metricas(m) {
  const st = m.stats
  const ps = st.proveedores
  const N = m.N
  const G = st.ganadores ?? {}
  const maxCosto = Math.max(...ps.map((p) => p.costoPromedioUSD), EPS)
  const maxLat = Math.max(...ps.map((p) => p.latenciaPromedioMs), EPS)
  return [
    {
      id: 'duracion',
      etiqueta: 'Decisiones con el presupuesto',
      valor: (p, k) => (sinRespuestas(p) ? '—' : `${entero(p.decisionesEnJuego * k)}/${entero(N)}`),
      sub: (p) => (sinRespuestas(p) ? SIN_RESPUESTAS : p.llegoAlFinal ? '¡llegó al final!' : p.motivoFin === 'sin_fondos' ? 'sin presupuesto' : 'sin vidas'),
      colorSub: (p) => (sinRespuestas(p) ? COLORES.suave : p.llegoAlFinal ? COLORES.bien : '#ff8a9a'),
      // Lo que costó atender a TODOS los viajeros, sin límite de presupuesto (A2 de la auditoría).
      extra: (p) => usd(p.costoTotalUSD),
      frac: (p) => p.decisionesEnJuego / Math.max(1, N),
      mejores: new Set(G.duracion ?? []),
    },
    {
      id: 'costo',
      etiqueta: 'Costo por decisión',
      valor: (p, k) => (sinRespuestas(p) ? '—' : usd(p.costoPromedioUSD * k)),
      frac: (p) => p.costoPromedioUSD / maxCosto,
      mejores: new Set(G.costo ?? []),
    },
    {
      id: 'costo1000',
      etiqueta: 'Costo por mil decisiones',
      valor: (p, k) => (sinRespuestas(p) ? '—' : usd(p.costoPor1000USD * k)),
      frac: (p) => p.costoPromedioUSD / maxCosto,
      mejores: new Set(G.costo ?? []),
    },
    {
      id: 'velocidad',
      etiqueta: 'Velocidad promedio',
      valor: (p, k) => (sinRespuestas(p) ? '—' : segundos(p.latenciaPromedioMs * k)),
      sub: (p) => (sinRespuestas(p) ? SIN_RESPUESTAS : 'por decisión'),
      frac: (p) => p.latenciaPromedioMs / maxLat,
      mejores: new Set(G.velocidad ?? []),
    },
    {
      id: 'aciertos',
      // Solo se puntúa la acción (aprobar, rechazar, interrogar, arrestar), sobre todos los casos.
      etiqueta: `Aciertos en la acción (de ${entero(N)})`,
      valor: (p, k) => `${entero(p.aciertosAccion * k)}/${entero(p.casos)}`,
      sub: (p) => (sinRespuestas(p) ? SIN_RESPUESTAS : erroresGraves(p.erroresGraves)),
      colorSub: (p) => (!sinRespuestas(p) && p.erroresGraves > 0 ? '#ff8a9a' : COLORES.suave),
      frac: (p) => p.aciertosAccion / Math.max(1, p.casos),
      mejores: new Set(G.aciertos ?? []),
      nota: `diferencias de ${EMPATE_ACIERTOS} casos o menos = empate · una corrida, ${entero(N)} casos`,
    },
  ]
}

function avisos(m) {
  const st = m.stats
  const ps = st.proveedores
  const out = []
  if (st.reglasRegistradas) out.push({ texto: `Presupuesto (${usd(st.presupuestoUSD)}) y vidas (${st.vidas}) fijados antes de correr.`, color: COLORES.suave })
  const sinVerificar = ps.filter((p) => p.precio && p.precio.verificado === false).map((p) => p.nombre)
  if (sinVerificar.length) out.push({ texto: `Precio sin verificar en la página oficial: ${lista(sinVerificar)}.` })
  const errores = ps.filter((p) => p.erroresApi > 0 || p.faltantes > 0).map((p) => `${p.nombre} (${p.erroresApi + p.faltantes})`)
  if (errores.length) out.push({ texto: `Errores de API, cuentan como fallo: ${lista(errores)}.` })
  const cero = ps.filter((p) => p.respondidas > 0 && p.costoPromedioUSD === 0).map((p) => p.nombre)
  if (cero.length) out.push({ texto: `Costo 0: la API informó 0 tokens (${lista(cero)}); no compite en costo.` })
  const estimados = ps.filter((p) => p.tokensEstimados).map((p) => p.nombre)
  if (estimados.length) out.push({ texto: `Tokens estimados (la API no los informó): ${lista(estimados)}.` })
  const salida = ps.filter((p) => p.respondidas > 0 && !p.salidaInformada).map((p) => p.nombre)
  if (salida.length) out.push({ texto: `Tokens de salida no informados por la API: ${lista(salida)}.` })
  const respaldo = ps.filter((p) => p.usoFallback).map((p) => p.nombre)
  if (respaldo.length) out.push({ texto: `Usó un modelo de respaldo en algunas llamadas: ${lista(respaldo)}.` })
  return out.slice(0, MAX_AVISOS)
}

// Medidas de la escena. Se prueba con tamaños normales y, si no cabe (p. ej. con subtítulos),
// se compacta paso a paso sin bajar de los mínimos de legibilidad.
function medidas(m, L, mets, banner, lineasAvisos) {
  const c = L.contenido
  const horizontal = L.orientacion === 'horizontal'
  const vertical = L.formato === 'vertical'
  const minTexto = vertical ? 24 : 20
  for (let e = 1; e >= 0.7 - 1e-9; e -= 0.05) {
    const f = (x, min = minTexto) => Math.max(min, Math.round(x * e))
    const tamTitulo = Math.max(28, Math.round(L.fs.titulo * (0.6 + 0.4 * e)))
    const tituloH = Math.round(tamTitulo * 1.45)
    const coronaH = Math.round(L.fs.chico * 0.62)
    // En horizontal la primera fila de celdas va pegada a la cabecera: se deja lugar a su corona.
    const cabH = Math.round(L.fs.base * 1.65) + (horizontal ? Math.round(L.fs.chico * 0.62) : 0)
    const tamVal = f(L.fs.medio, 26)
    const tamSub = f(L.fs.chico * 0.9)
    const tamExtra = f(vertical ? 24 : 21)
    const tamNota = f(vertical ? 24 : 21)
    const tamEtq = horizontal ? L.fs.base : f(L.fs.chico)
    const pad = Math.round(8 * e)
    const barH = 8
    const gap = 3
    const celda = (met) => {
      let h = pad * 2 + tamVal * 1.08 + gap + barH
      if (met.id !== 'costo' && met.id !== 'costo1000') h += tamSub * 1.12 + gap
      if (met.extra) h += tamExtra * 1.15 + gap
      return Math.round(h)
    }
    // La corona MEJOR sobresale por encima de la celda: la etiqueta de la fila le deja lugar.
    const etqH = horizontal ? 0 : Math.round(tamEtq * 1.2 + coronaH + 2)
    // Entre filas cabe la corona de la fila de abajo sin tocar la celda de arriba.
    const sepFila = horizontal ? Math.max(Math.round(18 * e), coronaH + 6) : Math.round(12 * e)
    const filas = mets.map((met) => {
      const cH = celda(met)
      const alto = horizontal ? Math.max(cH, Math.round(L.fs.base * 2.6)) : etqH + cH
      const notaH = met.nota ? Math.round(tamNota * 1.3) : 0
      return { celdaH: cH, alto, notaH }
    })
    const bannerT = banner ? banner.medir(e) : null
    const tamAviso = f(L.fs.chico * 0.82)
    const avisosH = lineasAvisos ? Math.round(lineasAvisos * tamAviso * 1.2 + 6) : 0
    const total =
      tituloH +
      cabH +
      filas.reduce((a, x) => a + x.alto + x.notaH + sepFila, 0) +
      (bannerT ? bannerT.alto + 12 : 0) +
      avisosH +
      24
    if (total <= c.h || e <= 0.7 + 1e-9) {
      return { e, tamTitulo, tituloH, cabH, tamVal, tamSub, tamExtra, tamNota, tamEtq, pad, barH, gap, etqH, sepFila, filas, bannerT, tamAviso, avisosH, total }
    }
  }
  return null
}

function Celda({ p, met, t, t0, w, h, L, M, extraTexto }) {
  const k = easeOutBack(prog(t, t0, 0.4))
  const kNum = easeOutCubic(prog(t, t0 + 0.05, 0.8))
  const gana = met.mejores.has(p.id)
  const kGana = easeOutBack(prog(t, t0 + 0.9, 0.35))
  const texto = met.valor(p, kNum)
  const final = met.valor(p, 1)
  const tamV = tamParaAncho(final, w - 26, M.tamVal, 18, 800)
  const sub = met.sub ? met.sub(p) : null
  const frac = clamp(met.frac(p))
  const coronado = gana && t >= t0 + 0.9
  return (
    <div
      style={{
        position: 'relative',
        width: w,
        height: h,
        padding: `${M.pad}px 12px`,
        background: coronado ? alfa(COLORES.oro, 0.14 * clamp(kGana)) : 'rgba(10,12,22,0.75)',
        boxShadow: bordePixel(coronado ? COLORES.oro : '#2a3352', 3, false),
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: M.gap,
        transform: `scale(${0.8 + 0.2 * k})`,
        opacity: clamp(k * 2),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, whiteSpace: 'nowrap', height: M.tamVal * 1.08 }}>
        <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamV, color: coronado ? '#ffe9a8' : '#fff', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{texto}</span>
      </div>
      {met.id !== 'costo' && met.id !== 'costo1000' && (
        <div style={{ height: M.tamSub * 1.12, fontFamily: FUENTE_TEXTO, fontWeight: 700, fontSize: sub ? tamParaAncho(sub, w - 24, M.tamSub, 16, 700) : M.tamSub, color: met.colorSub ? met.colorSub(p) : COLORES.suave, whiteSpace: 'nowrap', lineHeight: 1.1 }}>{sub}</div>
      )}
      {met.extra && (
        <div style={{ height: M.tamExtra * 1.15, fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: M.tamExtra, color: COLORES.suave, whiteSpace: 'nowrap', lineHeight: 1.15 }}>
          {extraTexto.prefijo}
          <span style={{ color: COLORES.texto, fontWeight: 800 }}>{met.extra(p)}</span>
        </div>
      )}
      <div style={{ position: 'relative', height: M.barH, background: '#1c2238', flex: 'none' }}>
        {!sinRespuestas(p) && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `max(4px, ${frac * 100 * easeOutCubic(prog(t, t0 + 0.1, 0.8))}%)`, background: p.color }} />}
      </div>
      {coronado && (
        <div style={{ position: 'absolute', right: 10, top: -Math.round(L.fs.chico * 0.62), transform: `scale(${kGana})`, display: 'flex', alignItems: 'center', gap: 6, padding: '5px 9px', background: COLORES.oro, boxShadow: bordePixel('#6b4e00', 2, false) }}>
          <Icono nombre="corona" alto={L.fs.chico * 0.6} color="#6b4e00" extra={{ R: '#e5383b', B: '#4f7cff' }} />
          <span style={{ fontFamily: FUENTE_TITULO, fontSize: Math.round(L.fs.chico * 0.5), color: '#3a2a00', lineHeight: 1 }}>MEJOR</span>
        </div>
      )}
    </div>
  )
}

// Texto del costo de los N casos que cabe en las tres celdas (el más completo posible).
function prefijoCostoTotal(m, w, tam) {
  const N = entero(m.N)
  const ps = m.stats.proveedores.slice(0, 3)
  const opciones = [`Los ${N} casos costaron: `, `${N} casos costaron: `, `Los ${N} casos: `, `${N} casos: `]
  for (const pre of opciones) {
    if (ps.every((p) => anchoTexto(pre, tam, 600) + anchoTexto(usd(p.costoTotalUSD), tam, 800) <= w - 24)) return { prefijo: pre }
  }
  return { prefijo: opciones[opciones.length - 1] }
}

// Banner "Jev: N veces más barato que X y M veces más que Y, por decisión" + precios usados.
function datosBanner(m, L) {
  const st = m.stats
  const jev = st.proveedores.find((p) => p.id === 'jev')
  const factores = st.proveedores.filter((p) => st.factoresJev?.[p.id] > 0).map((p) => ({ p, veces: st.factoresJev[p.id] }))
  if (!jev || !factores.length) return null
  const c = L.contenido
  const horizontal = L.orientacion === 'horizontal'
  const vertical = L.formato === 'vertical'
  const anchoUtil = c.w - (horizontal ? 120 : 48)
  // Líneas grandes: una por comparación (en horizontal, juntas si caben).
  const partes = factores.map(({ p, veces }, i) =>
    i === 0
      ? { pre: `${jev.nombre}: `, veces, post: ` más barato que ${p.nombre}` }
      : { pre: 'y ', veces, post: ` más que ${p.nombre}` },
  )
  partes[partes.length - 1].post += ', por decisión'
  const textoParte = (x) => `${x.pre}${factor(x.veces)}${x.post}`
  const precios = st.proveedores.slice(0, 3).map(precioCorto).join(' · ')
  const preciosTitulo = 'Precios en US$ por millón de tokens (entrada/salida):'
  return {
    jev,
    partes,
    textoParte,
    medir(e) {
      const minGrande = vertical ? 28 : 24
      const minChico = vertical ? 24 : 20
      const maxGrande = Math.round(L.fs.grande * (0.85 + 0.15 * e))
      const unaLinea = horizontal && partes.length > 1 && tamParaAncho(partes.map(textoParte).join(' '), anchoUtil, maxGrande, minGrande, 800) >= Math.round(maxGrande * 0.8)
      const lineasGrandes = unaLinea ? [partes] : partes.map((x) => [x])
      const tamGrande = Math.min(...lineasGrandes.map((ln) => tamParaAncho(ln.map(textoParte).join(' '), anchoUtil, maxGrande, minGrande, 800)))
      const maxChico = Math.max(minChico, Math.round(L.fs.chico * 0.85 * (0.9 + 0.1 * e)))
      const juntos = `${preciosTitulo} ${precios}`
      const lineasChicas = tamParaAncho(juntos, anchoUtil, maxChico, minChico, 600) >= maxChico ? [juntos] : [preciosTitulo, precios]
      const tamChico = Math.min(...lineasChicas.map((x) => tamParaAncho(x, anchoUtil, maxChico, minChico, 600)))
      const padV = Math.round(12 * e)
      const alto = Math.round(padV * 2 + lineasGrandes.length * tamGrande * 1.18 + 6 + lineasChicas.length * tamChico * 1.2)
      return { lineasGrandes, tamGrande, lineasChicas, tamChico, alto, padV }
    },
  }
}

export function Resultados({ m, L, t }) {
  const c = L.contenido
  const horizontal = L.orientacion === 'horizontal'
  const ps = m.stats.proveedores.slice(0, 3)
  const mets = metricas(m)
  const cols = L.juego.columnas
  const notas = avisos(m)
  const banner = datosBanner(m, L)
  const M = medidas(m, L, mets, banner, notas.length)
  const tamTitulo = tamParaAncho('RESULTADOS', c.w * 0.8, M.tamTitulo, 20, 400, FUENTE_TITULO)
  const kT = easeOutBack(prog(t, T0 + 0.1, 0.4))
  const extraTexto = prefijoCostoTotal(m, cols[0].w, M.tamExtra)
  // Posiciones
  let y = c.y
  const yTitulo = y
  y += M.tituloH
  const yCab = y
  y += M.cabH
  const filas = mets.map((met, k) => {
    const f = M.filas[k]
    const fila = { met, k, y, ...f }
    y += f.alto + f.notaH + M.sepFila
    return fila
  })
  y += 2
  const yBanner = y
  if (M.bannerT) y += M.bannerT.alto + 12
  const yAvisos = y
  const xEtq = c.x
  const wEtq = horizontal ? cols[0].x - c.x - 24 : c.w
  const tamEtq = horizontal
    ? Math.min(...mets.map((met) => tamParaCaja(met.etiqueta, wEtq - 22, 2, M.tamEtq, 18, 800)))
    : Math.min(...mets.map((met) => tamParaAncho(met.etiqueta, wEtq - 22, M.tamEtq, 18, 800)))
  const kFondo = easeOutCubic(prog(t, T0 + 0.2, 0.4))
  const anchoAvisos = c.w - 20
  const tamAvisos = notas.length ? Math.min(M.tamAviso, ...notas.map((a) => tamParaAncho(`* ${a.texto}`, anchoAvisos, M.tamAviso, 16, 600))) : M.tamAviso
  const fondoAlto = yAvisos + M.avisosH - yCab + 20
  return (
    <>
      <div style={{ position: 'absolute', left: c.x - 14, top: yCab - 14, width: c.w + 28, height: fondoAlto, background: 'rgba(7,9,18,0.72)', boxShadow: bordePixel('#1d2440', 4, false), opacity: kFondo }} />
      <div style={{ position: 'absolute', left: c.x, top: yTitulo, width: c.w, height: M.tituloH, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${0.6 + 0.4 * kT})`, opacity: clamp(kT * 2) }}>
        <div style={{ fontFamily: FUENTE_TITULO, fontSize: tamTitulo, color: COLORES.ambar, textShadow: `0 ${tamTitulo * 0.12}px 0 #000` }}>RESULTADOS</div>
      </div>
      {ps.map((p, i) => {
        const k = easeOutBack(prog(t, T0 + 0.35 + i * 0.1, 0.4))
        const tam = tamParaAncho(p.nombre, cols[i].w - 20, L.fs.base, 18, 800)
        return (
          <div key={p.id} style={{ position: 'absolute', left: cols[i].x, top: yCab, width: cols[i].w, height: Math.round(L.fs.base * 1.65) - 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: alfa(p.color, 0.22), boxShadow: bordePixel(p.color, 3, false), transform: `translateY(${(1 - k) * -40}px)`, opacity: clamp(k * 2) }}>
            <span style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tam, color: '#fff', whiteSpace: 'nowrap' }}>{p.nombre}</span>
          </div>
        )
      })}
      {filas.map(({ met, k, y: yy, alto, celdaH, notaH }) => {
        const t0 = T_FILAS(k)
        const kE = easeOutCubic(prog(t, t0 - 0.15, 0.35))
        if (t < t0 - 0.15) return null
        const yCelda = horizontal ? yy + (alto - celdaH) / 2 : yy + M.etqH
        const kNota = easeOutCubic(prog(t, t0 + 0.9, 0.35))
        return (
          <div key={met.id}>
            <div
              style={{
                position: 'absolute',
                left: xEtq,
                top: yy,
                width: wEtq,
                // En vertical la etiqueta va arriba de su caja: debajo queda lugar para las coronas.
                height: horizontal ? alto : Math.round(tamEtq * 1.2) + 2,
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
                whiteSpace: horizontal ? 'normal' : 'nowrap',
              }}
            >
              <div style={{ width: 10, alignSelf: 'stretch', background: COLORES.ambar, flex: 'none', margin: horizontal ? '10px 0' : '4px 0' }} />
              <span>{met.etiqueta}</span>
            </div>
            {ps.map((p, i) => (
              <div key={p.id} style={{ position: 'absolute', left: cols[i].x, top: yCelda, width: cols[i].w }}>
                <Celda p={p} met={met} t={t} t0={t0 + i * 0.12} w={cols[i].w} h={celdaH} L={L} M={M} extraTexto={extraTexto} />
              </div>
            ))}
            {met.nota && (
              <div
                style={{
                  position: 'absolute',
                  left: horizontal ? cols[0].x : c.x,
                  top: yy + alto + 4,
                  width: horizontal ? cols[2].x + cols[2].w - cols[0].x : c.w,
                  height: notaH,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: horizontal ? 'flex-start' : 'center',
                  fontFamily: FUENTE_TEXTO,
                  fontWeight: 600,
                  fontSize: tamParaAncho(met.nota, (horizontal ? cols[2].x + cols[2].w - cols[0].x : c.w) - 8, M.tamNota, 16, 600),
                  color: COLORES.suave,
                  whiteSpace: 'nowrap',
                  opacity: kNota,
                }}
              >
                {met.nota}
              </div>
            )}
          </div>
        )
      })}
      {banner && M.bannerT && t >= T_BANNER && <BannerVeces L={L} t={t} y={yBanner} b={banner} B={M.bannerT} />}
      {notas.length > 0 && t >= T_AVISOS && (
        <div style={{ position: 'absolute', left: c.x, top: yAvisos, width: c.w, opacity: clamp((t - T_AVISOS) * 3), fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: tamAvisos, lineHeight: 1.2, color: COLORES.suave }}>
          {notas.map((a) => (
            <div key={a.texto} style={{ whiteSpace: 'nowrap', color: a.color ?? COLORES.suave }}>
              * {a.texto}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function BannerVeces({ L, t, y, b, B }) {
  const c = L.contenido
  const k = easeOutBack(prog(t, T_BANNER, 0.45))
  const color = b.jev.color
  // Cada factor cuenta desde un valor pequeño hasta el real (nunca muestra "1 veces").
  const valor = (veces) => contar(t, T_BANNER + 0.1, 1.0, Math.min(veces, Math.max(2, veces * 0.05)), veces)
  return (
    <div
      style={{
        position: 'absolute',
        left: c.x,
        top: y,
        width: c.w,
        height: B.alto,
        padding: `${B.padV}px 0`,
        background: `linear-gradient(90deg, ${alfa(color, 0.4)}, ${alfa(color, 0.12)})`,
        boxShadow: bordePixel(color, 4),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `scale(${0.7 + 0.3 * k})`,
        opacity: clamp(k * 2),
      }}
    >
      {B.lineasGrandes.map((ln, i) => (
        <div key={i} style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: B.tamGrande, lineHeight: 1.18, color: '#fff', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {ln.map((x, j) => (
            <span key={j}>
              {j > 0 ? ' ' : ''}
              {x.pre}
              <span style={{ color: tono(color, 0.5) }}>{factor(valor(x.veces))}</span>
              {x.post}
            </span>
          ))}
        </div>
      ))}
      <div style={{ height: 6 }} />
      {B.lineasChicas.map((x) => (
        <div key={x} style={{ fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: B.tamChico, lineHeight: 1.2, color: COLORES.suave, whiteSpace: 'nowrap' }}>
          {x}
        </div>
      ))}
    </div>
  )
}
