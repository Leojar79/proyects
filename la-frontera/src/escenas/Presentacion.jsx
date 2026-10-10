// Escena 2 (4-14 s): (a) las 4 decisiones por viajero, (b) cómo responde cada cerebro,
// (c) reglas del juego. Cada parte entra y sale con movimiento calculado desde t.

import { JUEGO } from '../../shared/config.js'
import { usd, porcentaje } from '../../shared/formato.js'
import { ACCIONES } from '../../shared/preguntas.js'
import { clamp, easeInCubic, easeOutBack, easeOutCubic, prog } from '../lib/anim.js'
import { ESC } from '../lib/datos.js'
import { FUENTE_MONO, FUENTE_TEXTO, FUENTE_TITULO, tamParaAncho, tamParaCaja } from '../lib/medir.js'
import { COLORES, SELLO, alfa, siNo, tono } from '../lib/textos.js'
import { Icono } from '../componentes/Pixel.jsx'
import { bordePixel, TextoPixel } from '../componentes/ui.jsx'

const I = ESC.presentacion.inicio
const PARTES = [
  { id: 'a', inicio: I, fin: I + 3.4 },
  { id: 'b', inicio: I + 3.4, fin: I + 6.8 },
  { id: 'c', inicio: I + 6.8, fin: ESC.presentacion.fin },
]

function Panel({ t, parte, L, children }) {
  const kIn = easeOutCubic(prog(t, parte.inicio, 0.45))
  const kOut = parte.fin < ESC.presentacion.fin ? easeInCubic(prog(t, parte.fin - 0.3, 0.3)) : 0
  const c = L.contenido
  return (
    <div
      style={{
        position: 'absolute',
        left: c.x,
        top: c.y,
        width: c.w,
        height: c.h,
        transform: `translateX(${(1 - kIn) * c.w * 0.5 - kOut * c.w * 0.6}px)`,
        opacity: clamp(kIn * 1.6) * (1 - kOut),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: L.orientacion === 'horizontal' ? 30 : L.subs ? 22 : 36,
      }}
    >
      {children}
    </div>
  )
}

function TituloSeccion({ lineas, L, t, t0, color = COLORES.ambar }) {
  const c = L.contenido
  const tam = Math.min(...lineas.map((l) => tamParaAncho(l, c.w * 0.95, L.fs.titulo * 0.8, 18, 400, FUENTE_TITULO)))
  const k = easeOutBack(prog(t, t0, 0.4))
  return (
    <div style={{ textAlign: 'center', transform: `scale(${0.7 + 0.3 * k})`, opacity: clamp(k * 2) }}>
      {lineas.map((l) => (
        <div key={l} style={{ fontFamily: FUENTE_TITULO, fontSize: tam, lineHeight: 1.3, color, textShadow: `0 ${tam * 0.12}px 0 #000`, whiteSpace: 'nowrap' }}>
          <TextoPixel>{l}</TextoPixel>
        </div>
      ))}
    </div>
  )
}

function Pildora({ texto, color, tam, fondo }) {
  return (
    <div style={{ padding: `${tam * 0.25}px ${tam * 0.55}px`, background: fondo ?? alfa(color, 0.18), boxShadow: bordePixel(color, 3, false), fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tam, color: '#fff', whiteSpace: 'nowrap', lineHeight: 1.1 }}>
      {texto}
    </div>
  )
}

function TarjetaPregunta({ icono, colorIcono, pregunta, tipo, w, h, L, t, t0, children }) {
  const k = easeOutBack(prog(t, t0, 0.4))
  const tamP = tamParaAncho(pregunta, w - 40, L.fs.grande, 22, 800)
  return (
    <div
      style={{
        width: w,
        height: h,
        background: `linear-gradient(180deg, ${COLORES.panel2}, ${COLORES.panel})`,
        boxShadow: bordePixel('#3a4770', 4),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: h * 0.05,
        padding: 16,
        transform: `translateY(${(1 - k) * 120}px) scale(${0.85 + 0.15 * k})`,
        opacity: clamp(k * 2),
        flex: 'none',
      }}
    >
      <Icono nombre={icono} alto={Math.min(h * 0.2, 76)} color={colorIcono} claro="#141a2c" extra={{ R: '#e5383b', W: '#f5f5f5' }} />
      <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamP, color: '#fff', whiteSpace: 'nowrap' }}>{pregunta}</div>
      <div style={{ fontFamily: FUENTE_TITULO, fontSize: Math.round(L.fs.chico * 0.62), color: COLORES.tenue }}><TextoPixel>{tipo}</TextoPixel></div>
      {children}
    </div>
  )
}

function ParteA({ L, t, parte }) {
  const c = L.contenido
  const horizontal = L.orientacion === 'horizontal'
  const gap = 24
  const w = horizontal ? (c.w - gap * 3) / 4 : (c.w - gap) / 2
  const h = horizontal ? Math.min(460, c.h - 220) : Math.min(430, (c.h - 260) / 2)
  const tamChip = L.fs.chico
  const t0 = parte.inicio + 0.35
  const niveles = ['#3ddc84', '#a5d63f', '#ffc23d', '#ff8a3d', '#ff3b55']
  const tamEsc = Math.min(w / 6.4, 58)
  const tarjetas = [
    <TarjetaPregunta key="pasa" icono="barrera" colorIcono="#c9cfe0" pregunta="¿Puede pasar?" tipo="SÍ / NO" w={w} h={h} L={L} t={t} t0={t0}>
      <div style={{ display: 'flex', gap: 14 }}>
        <Pildora texto="SÍ" color="#3ddc84" tam={tamChip} />
        <Pildora texto="NO" color="#ff4d5e" tam={tamChip} />
      </div>
    </TarjetaPregunta>,
    <TarjetaPregunta key="miente" icono="mascara" colorIcono="#c9b6ff" pregunta="¿Miente?" tipo="SÍ / NO" w={w} h={h} L={L} t={t} t0={t0 + 0.15}>
      <div style={{ display: 'flex', gap: 14 }}>
        <Pildora texto="SÍ" color="#3ddc84" tam={tamChip} />
        <Pildora texto="NO" color="#ff4d5e" tam={tamChip} />
      </div>
    </TarjetaPregunta>,
    <TarjetaPregunta key="peligro" icono="peligro" colorIcono="#ffc23d" pregunta="Peligro" tipo="ESCALA 0-4" w={w} h={h} L={L} t={t} t0={t0 + 0.3}>
      <div style={{ display: 'flex', gap: 6 }}>
        {niveles.map((col, i) => {
          const k = easeOutBack(prog(t, t0 + 0.5 + i * 0.08, 0.25))
          return (
            <div key={i} style={{ width: tamEsc, height: tamEsc, background: col, boxShadow: bordePixel(tono(col, -0.5), 3, false), display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamEsc * 0.55, color: '#111', transform: `scale(${k})` }}>
              {i}
            </div>
          )
        })}
      </div>
    </TarjetaPregunta>,
    <TarjetaPregunta key="accion" icono="sello" colorIcono="#ff8a9a" pregunta="¿Qué hacer?" tipo="4 OPCIONES" w={w} h={h} L={L} t={t} t0={t0 + 0.45}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%' }}>
        {ACCIONES.map((a, i) => {
          const s = SELLO[a]
          const k = easeOutBack(prog(t, t0 + 0.65 + i * 0.08, 0.25))
          const tamA = tamParaAncho(s.verbo, (w - 60) / 2 - 16, Math.round(L.fs.chico * 0.62), 10, 400, FUENTE_TITULO)
          return (
            <div
              key={a}
              style={{
                padding: '8px 4px',
                textAlign: 'center',
                fontFamily: FUENTE_TITULO,
                fontSize: tamA,
                color: a === 'arrestar' ? '#ffe4e8' : s.color,
                background: a === 'arrestar' ? 'repeating-linear-gradient(90deg, rgba(0,0,0,0.38) 0 4px, transparent 4px 14px), #8a1128' : alfa(s.color, 0.14),
                boxShadow: `inset 0 0 0 3px ${a === 'arrestar' ? '#c2193a' : s.color}`,
                transform: `scale(${k})`,
                whiteSpace: 'nowrap',
              }}
            >
              {s.verbo}
            </div>
          )
        })}
      </div>
    </TarjetaPregunta>,
  ]
  return (
    <Panel t={t} parte={parte} L={L}>
      <TituloSeccion lineas={horizontal ? ['CADA VIAJERO, 4 DECISIONES'] : ['CADA VIAJERO,', '4 DECISIONES']} L={L} t={t} t0={parte.inicio + 0.05} />
      <div style={{ display: 'grid', gridTemplateColumns: horizontal ? `repeat(4, ${w}px)` : `repeat(2, ${w}px)`, gap }}>{tarjetas}</div>
    </Panel>
  )
}

function primerResultado(m, pid, condicion) {
  const lista = m.run.resultados[pid] ?? []
  for (const id of m.run.viajeros) {
    const r = lista.find((x) => x.viajeroId === id)
    if (r && r.ok && condicion(r)) return { r, indice: m.run.viajeros.indexOf(id) }
  }
  return null
}

function ParteB({ m, L, t, parte }) {
  const c = L.contenido
  const horizontal = L.orientacion === 'horizontal'
  const gap = 24
  const w = horizontal ? (c.w - gap) / 2 : c.w
  const h = horizontal ? Math.min(c.h - 170, 640) : (c.h - 230 - gap) / 2
  const llms = m.proveedores.filter((p) => p.id !== 'jev')
  const jev = m.proveedores.find((p) => p.id === 'jev')
  const ejLLM = primerResultado(m, llms[0]?.id, (r) => typeof r.salidaTexto === 'string' && r.salidaTexto.length > 0)
  const ejJev = jev ? primerResultado(m, jev.id, (r) => r.confianza) : null
  const t0 = parte.inicio + 0.3
  const tamTxt = L.fs.base
  const pad = 22
  const kA = easeOutBack(prog(t, t0, 0.4))
  const kB = easeOutBack(prog(t, t0 + 0.25, 0.4))
  // Terminal que escribe el JSON del ejemplo (texto que de verdad devolvió el modelo en esta corrida).
  const json = ejLLM ? ejLLM.r.salidaTexto : ''
  const tamJ = horizontal ? 30 : L.subs ? 24 : L.formato === 'vertical' ? 28 : 26
  const kTipeo = clamp((t - t0 - 0.6) / 1.8)
  const textoLLM = 'Razonan y escriben la respuesta (JSON). Se paga cada token, incluido el razonamiento interno.'
  const textoJev = 'No escribe: devuelve la decisión con su probabilidad.'
  const anchoTexto = w - pad * 2
  const tamLLM = tamParaCaja(textoLLM, anchoTexto, horizontal ? 3 : 3, tamTxt, 20, 600)
  const tamJev = tamParaCaja(textoJev, anchoTexto, 2, tamTxt, 20, 600)
  const lineasJson = lineasJSON(json, anchoTexto - 30, tamJ)
  const totalJson = lineasJson.reduce((a, x) => a + x.length, 0)
  const escritos = Math.floor(kTipeo * totalJson)
  const monedas = Math.floor(escritos / 6)
  let n = 0
  const conf = ejJev?.r.confianza ?? {}
  const dec = ejJev?.r.decision ?? {}
  const filasJev = [
    ['barrera', '#c9cfe0', siNo(dec.pasa), conf.pasa],
    ['mascara', '#c9b6ff', siNo(dec.miente), conf.miente],
    ['peligro', '#ffc23d', `${dec.peligro ?? '—'}/4`, conf.peligro],
    ['sello', '#ff8a9a', SELLO[dec.accion]?.verbo ?? '—', conf.accion],
  ]
  const kJevFilas = (i) => easeOutBack(prog(t, t0 + 0.9 + i * 0.06, 0.25))
  const tamFila = horizontal ? L.fs.chico : L.fs.chico
  const panelLLM = (
    <div style={{ width: w, height: horizontal ? h : 'auto', padding: pad, background: `linear-gradient(180deg, ${COLORES.panel2}, ${COLORES.panel})`, boxShadow: bordePixel('#3a4770', 4), display: 'flex', flexDirection: 'column', gap: 12, transform: `translateY(${(1 - kA) * 100}px)`, opacity: clamp(kA * 2), overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {llms.map((p) => (
          <Pildora key={p.id} texto={p.nombre} color={p.color} tam={L.fs.chico} />
        ))}
      </div>
      <div style={{ fontFamily: FUENTE_TITULO, fontSize: tamParaAncho('MODELOS DE LENGUAJE', anchoTexto, L.fs.medio * 0.75, 14, 400, FUENTE_TITULO), color: '#fff', lineHeight: 1.3 }}>MODELOS DE LENGUAJE</div>
      <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: tamLLM, color: COLORES.suave, lineHeight: 1.25 }}>{textoLLM}</div>
      {json && (
        <div style={{ position: 'relative', flex: horizontal ? 1 : 'none', minHeight: 0, background: '#05070d', boxShadow: bordePixel('#1f2a44', 3, false), padding: '10px 14px 40px', fontFamily: FUENTE_MONO, fontSize: tamJ, lineHeight: 1.3, color: '#8ff0b5' }}>
          {lineasJson.map((ln, k) => {
            const vis = clamp(escritos - n, 0, ln.length)
            n += ln.length
            return (
              <div key={k} style={{ whiteSpace: 'pre' }}>
                {ln.slice(0, vis)}
                <span style={{ color: 'transparent' }}>{ln.slice(vis)}</span>
              </div>
            )
          })}
          <div style={{ position: 'absolute', right: 12, top: 10, display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '34%' }}>
            {Array.from({ length: monedas }, (_, i) => (
              <div key={i} style={{ transform: `translateY(${(1 - easeOutBack(prog(t, t0 + 0.6 + (((i + 1) * 6) / Math.max(1, totalJson)) * 1.8, 0.2))) * -30}px)` }}>
                <Icono nombre="moneda" alto={tamJ * 0.9} color="#7a5600" />
              </div>
            ))}
          </div>
          <div style={{ position: 'absolute', left: 14, bottom: 8, fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: Math.max(18, tamJ * 0.8), color: COLORES.tenue }}>
            lo que escribió {llms[0]?.nombre} · viajero {ejLLM.indice + 1} de esta corrida
          </div>
        </div>
      )}
    </div>
  )
  const panelJev = jev && (
    <div style={{ width: w, height: horizontal ? h : 'auto', padding: pad, background: `linear-gradient(180deg, ${COLORES.panel2}, ${COLORES.panel})`, boxShadow: bordePixel('#3a4770', 4), display: 'flex', flexDirection: 'column', gap: 12, transform: `translateY(${(1 - kB) * 100}px)`, opacity: clamp(kB * 2), overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <Pildora texto={jev.nombre} color={jev.color} tam={L.fs.chico} />
      </div>
      <div style={{ fontFamily: FUENTE_TITULO, fontSize: tamParaAncho('MODELO DE DECISIÓN', anchoTexto, L.fs.medio * 0.75, 14, 400, FUENTE_TITULO), color: '#fff', lineHeight: 1.3 }}><TextoPixel>MODELO DE DECISIÓN</TextoPixel></div>
      <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: tamJev, color: COLORES.suave, lineHeight: 1.25 }}>{textoJev}</div>
      {ejJev && (
        <div style={{ flex: horizontal ? 1 : 'none', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', gap: L.subs ? 4 : 10 }}>
          {filasJev.map(([ic, col, val, p], i) => {
            const k = kJevFilas(i)
            return (
              <div key={ic} style={{ display: 'flex', alignItems: 'center', gap: 14, transform: `scale(${k})`, transformOrigin: 'left center', opacity: clamp(k * 2) }}>
                <Icono nombre={ic} alto={tamFila} color={col} claro="#141a2c" extra={{ R: '#e5383b', W: '#f5f5f5' }} />
                <div style={{ width: tamFila * 5.6, fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamFila, color: '#fff', whiteSpace: 'nowrap' }}>{val}</div>
                <div style={{ flex: 1, height: tamFila * 0.55, background: '#262d45', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(p ?? 0) * 100 * easeOutCubic(prog(t, t0 + 1.0 + i * 0.06, 0.5))}%`, background: jev.color }} />
                </div>
                <div style={{ width: tamFila * 3, textAlign: 'right', fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamFila, color: '#9db8ff', fontVariantNumeric: 'tabular-nums' }}>{p !== null && p !== undefined ? porcentaje(p) : '—'}</div>
              </div>
            )
          })}
          <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: Math.max(18, tamJ * 0.8), color: COLORES.tenue }}>lo que devolvió {jev.nombre} · viajero {ejJev.indice + 1} de esta corrida</div>
        </div>
      )}
    </div>
  )
  return (
    <Panel t={t} parte={parte} L={L}>
      <TituloSeccion lineas={horizontal ? ['¿CÓMO RESPONDE CADA CEREBRO?'] : ['¿CÓMO RESPONDE', 'CADA CEREBRO?']} L={L} t={t} t0={parte.inicio + 0.05} />
      <div style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', gap }}>
        {panelLLM}
        {panelJev}
      </div>
    </Panel>
  )
}

// Muestra el JSON con sangría si se puede leer; si no, el texto tal cual, cortado por ancho.
function lineasJSON(texto, ancho, tam) {
  const porLinea = Math.max(8, Math.floor(ancho / (tam * 0.602)))
  let base
  try {
    base = JSON.stringify(JSON.parse(texto), null, 2).split('\n')
  } catch {
    base = [String(texto).replace(/\s+/g, ' ')]
  }
  const out = []
  for (const linea of base) for (let i = 0; i < Math.max(1, linea.length); i += porLinea) out.push(linea.slice(i, i + porLinea))
  return out.slice(0, 8)
}

function ParteC({ L, t, parte }) {
  const c = L.contenido
  const horizontal = L.orientacion === 'horizontal'
  const gap = 24
  const w = horizontal ? (c.w - gap * 2) / 3 : c.w
  const h = horizontal ? Math.min(520, c.h - 200) : Math.min(250, (c.h - 200 - gap * 2) / 3)
  const t0 = parte.inicio + 0.35
  const reglas = [
    {
      icono: <Icono nombre="moneda" alto={Math.min(84, h * 0.4)} color="#7a5600" />,
      titulo: 'Mismo presupuesto',
      grande: `${usd(JUEGO.presupuestoUSD)} para cada uno`,
      texto: '',
    },
    {
      icono: (
        <div style={{ display: 'flex', gap: 8 }}>
          {Array.from({ length: JUEGO.vidas }, (_, i) => (
            <Icono key={i} nombre="corazon" alto={Math.min(60, h * 0.3)} color="#ff3b55" claro="#ffc2cb" />
          ))}
        </div>
      ),
      titulo: `${JUEGO.vidas} vidas`,
      grande: '',
      texto: 'Pierdes una si dejas pasar a una amenaza o arrestas a un inocente.',
    },
    {
      icono: <Icono nombre="trofeo" alto={Math.min(84, h * 0.4)} color={COLORES.oro} claro="#fff6c8" />,
      titulo: 'Gana quien dure más',
      grande: '',
      texto: 'con el mismo dinero y las mismas reglas.',
    },
  ]
  return (
    <Panel t={t} parte={parte} L={L}>
      <TituloSeccion lineas={['REGLAS DEL JUEGO']} L={L} t={t} t0={parte.inicio + 0.05} />
      <div style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', gap }}>
        {reglas.map((r, i) => {
          const k = easeOutBack(prog(t, t0 + i * 0.35, 0.4))
          const anchoTxt = horizontal ? w - 48 : w - 48 - 220
          const tamT = tamParaAncho(r.titulo, anchoTxt, L.fs.grande, 22, 800)
          const tamTexto = tamParaCaja(r.texto || '-', anchoTxt, 2, L.fs.base, 20, 600)
          return (
            <div
              key={i}
              style={{
                width: w,
                height: h,
                padding: 24,
                background: `linear-gradient(90deg, ${COLORES.panel2}, ${COLORES.panel})`,
                boxShadow: bordePixel(i === 1 ? '#7a2335' : i === 0 ? '#7a5a12' : '#3a4770', 4),
                display: 'flex',
                flexDirection: horizontal ? 'column' : 'row',
                alignItems: 'center',
                justifyContent: horizontal ? 'center' : 'flex-start',
                textAlign: horizontal ? 'center' : 'left',
                gap: 24,
                transform: `translateX(${(1 - k) * 300}px)`,
                opacity: clamp(k * 2),
              }}
            >
              <div style={{ width: horizontal ? 'auto' : 196, display: 'flex', justifyContent: 'center', flex: 'none' }}>{r.icono}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamT, color: '#fff', lineHeight: 1.15, whiteSpace: 'nowrap' }}>{r.titulo}</div>
                {r.grande && <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 800, fontSize: tamParaAncho(r.grande, anchoTxt, L.fs.medio, 20, 800), color: COLORES.ambar, marginTop: 6, whiteSpace: 'nowrap' }}>{r.grande}</div>}
                {r.texto && <div style={{ fontFamily: FUENTE_TEXTO, fontWeight: 600, fontSize: tamTexto, color: COLORES.suave, marginTop: 6, lineHeight: 1.25 }}>{r.texto}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

export function Presentacion({ m, L, t }) {
  const parte = PARTES.find((p) => t >= p.inicio && t < p.fin) ?? PARTES[PARTES.length - 1]
  if (parte.id === 'a') return <ParteA L={L} t={t} parte={parte} />
  if (parte.id === 'b') return <ParteB m={m} L={L} t={t} parte={parte} />
  return <ParteC L={L} t={t} parte={parte} />
}
