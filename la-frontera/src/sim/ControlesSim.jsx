// Controles de la vista previa de la simulación: reproducir/pausa, línea de tiempo con las secciones
// de la voz, formato, subtítulos y estado del audio. (No aparecen en el modo render.)

import { VIDEO } from '../../shared/config.js'

const NOMBRES = {
  gancho: 'Gancho',
  quees: 'Qué es',
  decisiones: 'Decisiones',
  comoresponde: 'Cómo responde',
  juego: 'El juego',
  numeros: 'Números',
  aclaracion: 'Aclaración',
  cierre: 'Cierre',
}

const TEXTO_AUDIO = {
  cargando: 'cargando la voz…',
  listo: 'con voz (audio/voz.m4a)',
  bloqueado: 'el navegador bloqueó el audio: pulsa reproducir otra vez',
  'sin-audio': import.meta.env.DEV
    ? 'sin voz: falta audio/voz.m4a o este navegador no reproduce AAC (prueba en Chrome, Safari o Firefox)'
    : 'sin voz (solo se oye con npm run dev y audio/voz.m4a)',
}

export function ControlesSim({ t, duracion, setT, reproduciendo, alternar, formato, setFormato, subs, setSubs, secciones, publicable, audioEstado }) {
  return (
    <div className="controles">
      <div className="controles-fila">
        <button type="button" onClick={alternar}>
          {reproduciendo ? '❚❚ Pausa' : '▶ Reproducir'}
        </button>
        <span className="reloj-vista">
          {t.toFixed(2).replace('.', ',')} s / {duracion} s
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
          <input type="checkbox" checked={subs} onChange={(e) => setSubs(e.target.checked)} /> Subtítulos
        </label>
        <span style={{ color: audioEstado === 'listo' ? '#3ddc84' : '#ffc23d' }}>{TEXTO_AUDIO[audioEstado] ?? audioEstado}</span>
        <span style={{ color: publicable?.bloqueos.length ? '#ff8a9a' : '#3ddc84' }}>{publicable?.bloqueos.length ? 'NO PUBLICABLE' : 'publicable'}</span>
      </div>
      {publicable && (publicable.bloqueos.length > 0 || publicable.avisos.length > 0) && (
        <div style={{ fontSize: 13, lineHeight: 1.4 }}>
          {publicable.bloqueos.map((b, i) => (
            <div key={`b${i}`} style={{ color: '#ff8a9a' }}>
              Bloquea la publicación: {b.texto}
            </div>
          ))}
          {publicable.avisos.map((a, i) => (
            <div key={`a${i}`} style={{ color: '#ffc23d' }}>
              Aviso: {a.texto}
            </div>
          ))}
        </div>
      )}
      <div className="linea-tiempo">
        <input type="range" min={0} max={duracion} step={1 / VIDEO.fps} value={t} onChange={(e) => setT(parseFloat(e.target.value))} />
        {secciones.map((s) => (
          <span key={s.id} className="marca-escena" style={{ left: `${(s.inicio / duracion) * 100}%` }} onClick={() => setT(s.inicio)}>
            {NOMBRES[s.id] ?? s.id}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 12, color: '#7d87a3' }}>Barra espaciadora: reproducir / pausa. Clic en una sección para saltar a ella.</div>
    </div>
  )
}
