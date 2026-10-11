// Composición "simulación" (sim.html): el video con la voz grabada del autor. Dos modos:
//  - render=1: lienzo exacto al tamaño del formato; el tiempo lo controla Playwright con
//    window.__frontera.setTiempo(t) (dibujo síncrono con flushSync). Sin audio (el render lo mezcla).
//  - vista previa: lienzo escalado con controles; en `npm run dev` reproduce la voz sincronizada
//    (servida solo por el servidor de desarrollo desde audio/voz.m4a; nunca se copia a dist/ ni public/).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { VIDEO } from '../../shared/config.js'
import { crearLayoutSim, normalizarFormato } from './layout.js'
import { prepararModeloSim } from './modelo.js'
import { EscenaSim } from './EscenaSim.jsx'
import { ControlesSim } from './ControlesSim.jsx'

const params = new URLSearchParams(window.location.search)
const RENDER = params.get('render') === '1'
// La voz solo existe en el servidor de desarrollo (vite.config.js, /__sim/voz.m4a).
const URL_VOZ = import.meta.env.DEV ? '/__sim/voz.m4a' : null

let modelo = null
let errorModelo = null
try {
  modelo = prepararModeloSim()
} catch (e) {
  console.error(e)
  errorModelo = e?.message ?? String(e)
}
const DURACION = modelo?.duracion ?? 0
const limitarT = (x) => Math.min(Math.max(Number.isFinite(x) ? x : 0, 0), Math.max(0, DURACION - 1e-6))

// API para el render (mismo contrato que la composición principal).
let tiempoPendiente = null
const api = {
  composicion: 'simulacion',
  listo: false,
  duracion: DURACION,
  fps: VIDEO.fps,
  // No son datos de demostración: es una simulación rotulada en todo el video.
  esDemo: false,
  publicable: modelo?.publicable ?? null,
  error: errorModelo,
  setTiempo(t) {
    tiempoPendiente = t
    return Promise.resolve()
  },
}
window.__frontera = api

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

export default function AppSim() {
  const [formato, setFormato] = useState(normalizarFormato(params.get('formato')))
  const [subs, setSubs] = useState(params.get('subs') === '1')
  const [t, setT] = useState(() => limitarT(parseFloat(params.get('t') ?? '0')))
  const [cuadro, setCuadro] = useState(0)
  const [fuentes, setFuentes] = useState(false)
  const [reproduciendo, setReproduciendo] = useState(false)
  const [audioEstado, setAudioEstado] = useState(URL_VOZ ? 'cargando' : 'sin-audio')
  const audio = useRef(null)
  const ventanaTam = useTamVentana()

  useEffect(() => {
    if (RENDER) document.body.classList.add('modo-render')
    cargarFuentes().then(() => setFuentes(true))
  }, [])

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

  const listo = fuentes && Boolean(modelo)
  useEffect(() => {
    api.listo = listo
  }, [listo])

  const L = useMemo(() => crearLayoutSim(formato, subs), [formato, subs])

  // --- Vista previa: audio y reloj.
  useEffect(() => {
    if (RENDER || !URL_VOZ) return
    const a = new Audio()
    a.preload = 'auto'
    a.src = URL_VOZ
    const ok = () => setAudioEstado('listo')
    const mal = () => setAudioEstado('sin-audio')
    a.addEventListener('canplaythrough', ok)
    a.addEventListener('error', mal)
    audio.current = a
    return () => {
      a.pause()
      a.removeEventListener('canplaythrough', ok)
      a.removeEventListener('error', mal)
      audio.current = null
    }
  }, [])

  const conAudio = audioEstado === 'listo'
  const tRef = useRef(t)
  tRef.current = t

  useEffect(() => {
    if (RENDER || !reproduciendo) return
    const a = audio.current
    if (conAudio && a) {
      a.currentTime = tRef.current
      a.play().catch(() => setAudioEstado('bloqueado'))
    }
    let id
    let ultimo = null
    const paso = (ahora) => {
      if (conAudio && a && !a.paused) {
        // El reloj es el audio: la imagen sigue a la voz.
        setT(limitarT(a.currentTime))
        if (a.ended || a.currentTime >= DURACION - 0.01) setReproduciendo(false)
      } else if (ultimo !== null) {
        const dt = (ahora - ultimo) / 1000
        setT((x) => {
          if (x + dt >= DURACION) {
            setReproduciendo(false)
            return limitarT(DURACION)
          }
          return x + dt
        })
      }
      ultimo = ahora
      id = requestAnimationFrame(paso)
    }
    id = requestAnimationFrame(paso)
    return () => {
      cancelAnimationFrame(id)
      if (a) a.pause()
    }
  }, [reproduciendo, conAudio])

  const buscar = useCallback((x) => {
    const nuevo = limitarT(x)
    setT(nuevo)
    if (audio.current && audio.current.readyState > 0) audio.current.currentTime = nuevo
  }, [])

  const alternar = useCallback(() => {
    setReproduciendo((r) => {
      if (!r && tRef.current >= DURACION - 0.05) buscar(0)
      return !r
    })
  }, [buscar])

  useEffect(() => {
    if (RENDER) return
    const f = (e) => {
      if (e.code === 'Space') {
        e.preventDefault()
        alternar()
      }
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [alternar])

  useEffect(() => {
    if (RENDER) return
    const p = new URLSearchParams(window.location.search)
    p.set('formato', formato)
    if (subs) p.set('subs', '1')
    else p.delete('subs')
    p.delete('t')
    window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`)
  }, [formato, subs])

  if (!modelo) {
    return (
      <div className="aviso-carga">
        <h2 style={{ marginTop: 0 }}>No pude preparar la simulación</h2>
        <p>{errorModelo}</p>
      </div>
    )
  }

  if (RENDER) {
    if (!listo) return <div style={{ width: L.W, height: L.H, background: '#07080f' }} />
    return <EscenaSim key={cuadro} m={modelo} L={L} t={t} subs={subs} />
  }

  const altoControles = 190
  const escala = Math.min((ventanaTam.w - 32) / L.W, (ventanaTam.h - altoControles - 48) / L.H, 1)
  return (
    <div className="vista">
      <div className="lienzo-marco" style={{ width: L.W * escala, height: L.H * escala }}>
        <div style={{ width: L.W, height: L.H, transform: `scale(${escala})`, transformOrigin: '0 0' }}>
          {listo ? <EscenaSim m={modelo} L={L} t={t} subs={subs} /> : <div style={{ width: L.W, height: L.H, background: '#07080f' }} />}
        </div>
      </div>
      <ControlesSim
        t={t}
        duracion={DURACION}
        setT={buscar}
        reproduciendo={reproduciendo}
        alternar={alternar}
        formato={formato}
        setFormato={setFormato}
        subs={subs}
        setSubs={setSubs}
        secciones={modelo.secciones}
        publicable={modelo.publicable}
        audioEstado={audioEstado}
      />
    </div>
  )
}
