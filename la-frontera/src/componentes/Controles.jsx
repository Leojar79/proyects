// Controles de la vista previa: reproducir/pausa, línea de tiempo con marcas de escena,
// formato, corrida y subtítulos. (No aparecen en el modo render.)

import { useState } from 'react'
import { DURACION, ESCENAS } from '../../shared/timeline.js'
import { VIDEO } from '../../shared/config.js'

const NOMBRES_ESCENA = {
  gancho: 'Gancho',
  presentacion: 'Presentación',
  detalle: 'Detalle',
  rapido: 'Avance rápido',
  resultados: 'Resultados',
  cierre: 'Cierre',
}

const CORRIDAS = ['latest', 'demo', 'prueba-ui']

export function Controles({ t, setT, reproduciendo, alternar, formato, setFormato, runNombre, setRunNombre, corridaUsada, subs, setSubs, esDemo }) {
  const [otra, setOtra] = useState('')
  const opciones = CORRIDAS.includes(runNombre) ? CORRIDAS : [...CORRIDAS, runNombre]
  return (
    <div className="controles">
      <div className="controles-fila">
        <button type="button" onClick={alternar}>
          {reproduciendo ? '❚❚ Pausa' : '▶ Reproducir'}
        </button>
        <span className="reloj-vista">
          {t.toFixed(2).replace('.', ',')} s / {DURACION} s
        </span>
        <label>
          Formato{' '}
          <select value={formato} onChange={(e) => setFormato(e.target.value)}>
            {Object.entries(VIDEO.formatos).map(([id, f]) => (
              <option key={id} value={id}>
                {f.nombre} — {f.ancho}×{f.alto}
              </option>
            ))}
          </select>
        </label>
        <label>
          Corrida{' '}
          <select value={runNombre} onChange={(e) => setRunNombre(e.target.value)}>
            {opciones.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (otra.trim()) setRunNombre(otra.trim())
          }}
        >
          <input type="text" placeholder="otra corrida (nombre sin .json)" value={otra} onChange={(e) => setOtra(e.target.value)} />
        </form>
        <label>
          <input type="checkbox" checked={subs} onChange={(e) => setSubs(e.target.checked)} /> Subtítulos
        </label>
        {corridaUsada && (
          <span style={{ color: esDemo ? '#ffc23d' : '#3ddc84' }}>
            usando «{corridaUsada}» {esDemo ? '(demo: datos simulados)' : '(corrida real)'}
          </span>
        )}
      </div>
      <div className="linea-tiempo">
        <input type="range" min={0} max={DURACION} step={1 / VIDEO.fps} value={t} onChange={(e) => setT(parseFloat(e.target.value))} />
        {ESCENAS.map((e) => (
          <span key={e.id} className="marca-escena" style={{ left: `${(e.inicio / DURACION) * 100}%` }} onClick={() => setT(e.inicio)}>
            {NOMBRES_ESCENA[e.id] ?? e.id}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 12, color: '#7d87a3' }}>Barra espaciadora: reproducir / pausa. Clic en una escena para saltar a ella.</div>
    </div>
  )
}
