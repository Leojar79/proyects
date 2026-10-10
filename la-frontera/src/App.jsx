// La app ES el video. Dos modos:
//  - render=1: lienzo exacto al tamaño del formato; el tiempo lo controla Playwright con
//    window.__frontera.setTiempo(t) (dibujo síncrono con flushSync).
//  - vista previa: el lienzo escalado para caber en la ventana, con controles debajo.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { DURACION } from '../shared/timeline.js'
import { VIDEO } from '../shared/config.js'
import { cargarCorrida, prepararModelo } from './lib/datos.js'
import { crearLayout, normalizarFormato } from './lib/layout.js'
import { Escena } from './escenas/Escena.jsx'
import { Controles } from './componentes/Controles.jsx'

const params = new URLSearchParams(window.location.search)
const RENDER = params.get('render') === '1'

// Cualquier t dentro de [0, DURACION): el render puede pedir otros fps (p. ej. 60) y su último
// cuadro (DURACION - 1/60) no debe convertirse en una copia del penúltimo.
const limitarT = (x) => Math.min(Math.max(Number.isFinite(x) ? x : 0, 0), DURACION - 1e-6)

// API para el render. Existe desde el primer instante; se completa cuando todo está cargado.
let tiempoPendiente = null
const api = {
  listo: false,
  duracion: DURACION,
  fps: VIDEO.fps,
  // esDemo = el video NO se puede publicar (cualquier bloqueo de shared/publicable.js, no solo datos demo).
  esDemo: true,
  // { bloqueos: [{codigo, texto}], avisos: [{codigo, texto}] } de motivosNoPublicable.
  publicable: null,
  error: null,
  corrida: null,
  // Archivo de la corrida y huella sha256 de sus bytes (la misma que se muestra en el cierre).
  archivo: null,
  sha256: null,
  setTiempo(t) {
    tiempoPendiente = t
    return Promise.resolve()
  },
}
window.__frontera = api

// Carga TODAS las caras de Inter y Press Start 2P (todos los subconjuntos), para que ningún
// cuadro se dibuje con una fuente de respaldo mientras llega una letra nueva (ć, ñ, ¿...).
async function cargarFuentes() {
  let caras = []
  for (let intento = 0; intento < 20 && caras.length === 0; intento++) {
    caras = [...document.fonts].filter((f) => /Inter|Press Start 2P/.test(f.family))
    if (!caras.length) await new Promise((r) => setTimeout(r, 50))
  }
  await Promise.all(caras.map((f) => f.load().catch(() => null)))
  await document.fonts.ready
}

function useTamVentana() {
  const [tam, setTam] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const f = () => setTam({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  return tam
}

function AvisoSinCorrida({ pedido, error, soloError = false }) {
  if (soloError) {
    return (
      <div className="aviso-carga">
        <h2 style={{ marginTop: 0 }}>No pude preparar el video con la corrida «{pedido}»</h2>
        <p>{error}</p>
      </div>
    )
  }
  return (
    <div className="aviso-carga">
      {error ? (
        <>
          <h2 style={{ marginTop: 0 }}>No pude usar la corrida «{pedido}»</h2>
          <p>{error}</p>
        </>
      ) : (
        <>
          <h2 style={{ marginTop: 0 }}>No encontré ninguna corrida</h2>
          <p>
            Busqué <code>public/runs/{pedido}.json</code>
            {pedido === 'latest' ? (
              <>
                {' '}y <code>public/runs/demo.json</code>
              </>
            ) : null}
            .
          </p>
        </>
      )}
      <p>Genera una con:</p>
      <p>
        <code>npm run demo</code> — corrida de demostración (datos simulados, con marca de agua).
        <br />
        <code>npm run benchmark</code> — corrida real con las APIs (necesita las claves).
      </p>
      <p>Luego recarga esta página.</p>
    </div>
  )
}

export default function App() {
  const [formato, setFormato] = useState(normalizarFormato(params.get('formato')))
  const [runNombre, setRunNombre] = useState(params.get('run') || 'latest')
  const [subs, setSubs] = useState(params.get('subs') === '1')
  const [t, setT] = useState(() => limitarT(parseFloat(params.get('t') ?? '0')))
  // En modo render cada setTiempo vuelve a montar el lienzo: cada cuadro se pinta desde cero
  // y el resultado no depende de qué cuadros se dibujaron antes (determinismo exacto).
  const [cuadro, setCuadro] = useState(0)
  const [fuentes, setFuentes] = useState(false)
  const [carga, setCarga] = useState({ estado: 'cargando' })
  const [reproduciendo, setReproduciendo] = useState(false)
  const ventanaTam = useTamVentana()

  useEffect(() => {
    if (RENDER) document.body.classList.add('modo-render')
    cargarFuentes().then(() => setFuentes(true))
  }, [])

  useEffect(() => {
    let vivo = true
    api.listo = false
    setCarga({ estado: 'cargando' })
    cargarCorrida(runNombre).then((res) => {
      if (!vivo) return
      if (!res) {
        api.error = `No hay corrida: ${runNombre}`
        setCarga({ estado: 'sin-corrida' })
        return
      }
      try {
        const modelo = prepararModelo(res.run, { archivo: res.archivo, sha256: res.sha256 })
        api.esDemo = modelo.esDemo
        api.publicable = modelo.publicable
        api.corrida = res.nombre
        api.archivo = modelo.archivo
        api.sha256 = modelo.sha256
        api.error = null
        setCarga({ estado: 'ok', modelo, nombre: res.nombre })
      } catch (e) {
        console.error(e)
        api.error = e.message
        setCarga({ estado: 'error', error: e.message })
      }
    })
    return () => {
      vivo = false
    }
  }, [runNombre])

  // setTiempo síncrono para el render.
  useLayoutEffect(() => {
    api.setTiempo = (nuevo) => {
      flushSync(() => {
        setT(limitarT(Number(nuevo)))
        setCuadro((c) => c + 1)
      })
      return Promise.resolve()
    }
    if (tiempoPendiente !== null) {
      setT(limitarT(Number(tiempoPendiente)))
      tiempoPendiente = null
    }
  }, [])

  // Con subtítulos, un guion que falla es un error (no un video que sale mudo sin avisar).
  const errorSubs =
    subs && carga.estado === 'ok' && carga.modelo.errorGuion ? `No pude generar los subtítulos (shared/guion.js): ${carga.modelo.errorGuion}` : null
  const listo = fuentes && carga.estado === 'ok' && !errorSubs
  useEffect(() => {
    if (errorSubs) api.error = errorSubs
    else if (carga.estado === 'ok') api.error = null
    api.listo = listo
  }, [listo, errorSubs, carga.estado])

  // Con marca de agua y divulgación a la vez, la etiqueta de divulgación va bajo la franja.
  const avisoBajoFranja = carga.estado === 'ok' && carga.modelo.esDemo && Boolean(carga.modelo.divulgacion)
  const L = useMemo(() => crearLayout(formato, subs, avisoBajoFranja), [formato, subs, avisoBajoFranja])

  // Reloj de la vista previa (solo fuera del modo render).
  const ultimo = useRef(null)
  useEffect(() => {
    if (RENDER || !reproduciendo) return
    let id
    const paso = (ahora) => {
      if (ultimo.current !== null) {
        const dt = (ahora - ultimo.current) / 1000
        setT((x) => (x + dt >= DURACION ? 0 : x + dt))
      }
      ultimo.current = ahora
      id = requestAnimationFrame(paso)
    }
    id = requestAnimationFrame(paso)
    return () => {
      cancelAnimationFrame(id)
      ultimo.current = null
    }
  }, [reproduciendo])

  const alternar = useCallback(() => setReproduciendo((r) => !r), [])
  useEffect(() => {
    if (RENDER) return
    const f = (e) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement && e.target.type === 'text')) {
        e.preventDefault()
        alternar()
      }
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [alternar])

  // Mantiene la URL al día en la vista previa.
  useEffect(() => {
    if (RENDER) return
    const p = new URLSearchParams(window.location.search)
    p.set('formato', formato)
    p.set('run', runNombre)
    if (subs) p.set('subs', '1')
    else p.delete('subs')
    p.delete('t')
    window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`)
  }, [formato, runNombre, subs])

  const conError = carga.estado === 'sin-corrida' || carga.estado === 'error' || errorSubs
  if (RENDER) {
    if (conError) {
      return (
        <div style={{ width: L.W, height: L.H, background: '#07080f', overflow: 'hidden' }}>
          <AvisoSinCorrida pedido={runNombre} error={carga.error ?? errorSubs} soloError={!carga.error && Boolean(errorSubs)} />
        </div>
      )
    }
    if (!listo) return <div style={{ width: L.W, height: L.H, background: '#07080f' }} />
    return <Escena key={cuadro} m={carga.modelo} L={L} t={t} subs={subs} />
  }

  const altoControles = 170
  const escala = Math.min((ventanaTam.w - 32) / L.W, (ventanaTam.h - altoControles - 48) / L.H, 1)
  return (
    <div className="vista">
      {conError ? (
        <AvisoSinCorrida pedido={runNombre} error={carga.error ?? errorSubs} soloError={!carga.error && Boolean(errorSubs)} />
      ) : (
        <div className="lienzo-marco" style={{ width: L.W * escala, height: L.H * escala }}>
          <div style={{ width: L.W, height: L.H, transform: `scale(${escala})`, transformOrigin: '0 0' }}>
            {listo ? <Escena m={carga.modelo} L={L} t={t} subs={subs} /> : <div style={{ width: L.W, height: L.H, background: '#07080f' }} />}
          </div>
        </div>
      )}
      <Controles
        t={t}
        setT={(x) => setT(limitarT(x))}
        reproduciendo={reproduciendo}
        alternar={alternar}
        formato={formato}
        setFormato={setFormato}
        runNombre={runNombre}
        setRunNombre={setRunNombre}
        corridaUsada={carga.nombre}
        subs={subs}
        setSubs={setSubs}
        esDemo={carga.modelo?.esDemo}
        publicable={carga.modelo?.publicable}
      />
    </div>
  )
}
