// Subtítulos del guion: el texto del tramo activo, en páginas de máximo 2 líneas,
// con las palabras apareciendo de forma progresiva (función pura de t).

import { FUENTE_TEXTO, anchoTexto, partirLineas } from '../lib/medir.js'
import { clamp } from '../lib/anim.js'

const cachePaginas = new Map()

function paginar(texto, ancho, tam) {
  const clave = `${ancho}|${tam}|${texto}`
  let v = cachePaginas.get(clave)
  if (v) return v
  const lineas = partirLineas(texto, ancho, tam, 700)
  const nPaginas = Math.ceil(lineas.length / 2)
  // Reparte las palabras en páginas de largo parecido (evita una última página con una sola palabra).
  const palabras = texto.split(/\s+/).filter(Boolean)
  const totalChars = texto.length
  v = []
  let i = 0
  for (let pag = 0; pag < nPaginas; pag++) {
    const objetivo = (totalChars * (pag + 1)) / nPaginas
    let trozo = []
    let usados = palabras.slice(0, i).join(' ').length
    while (i < palabras.length) {
      const prueba = [...trozo, palabras[i]]
      const cabe = partirLineas(prueba.join(' '), ancho, tam, 700).length <= 2
      const ultima = pag === nPaginas - 1
      if (!cabe || (!ultima && trozo.length && usados + palabras[i].length / 2 > objetivo)) break
      trozo = prueba
      usados += palabras[i].length + 1
      i++
    }
    v.push(partirLineas(trozo.join(' '), ancho, tam, 700))
  }
  // Si algo no cupo (caso raro), se agrega en páginas extra.
  while (i < palabras.length) {
    const resto = partirLineas(palabras.slice(i).join(' '), ancho, tam, 700).slice(0, 2)
    v.push(resto)
    i += resto.join(' ').split(/\s+/).length
  }
  cachePaginas.set(clave, v)
  return v
}

export function Subtitulos({ L, segmentos, t }) {
  const caja = L.subs
  if (!caja) return null
  const seg = segmentos.find((s) => t >= s.inicio && t < s.fin && s.texto)
  if (!seg) return null
  const tam = L.formato === 'vertical' ? 36 : L.formato === 'feed' ? 32 : 32
  const anchoUtil = caja.w - 48
  const paginas = paginar(seg.texto.trim(), anchoUtil, tam)
  const palabrasPorPagina = paginas.map((p) => p.join(' ').split(/\s+/).length)
  const total = palabrasPorPagina.reduce((a, b) => a + b, 0)
  // El habla ocupa ~92 % del tramo; las palabras se reparten de forma pareja.
  const dur = (seg.fin - seg.inicio) * 0.92
  const leidas = clamp((t - seg.inicio) / dur) * total
  let acumulado = 0
  let pagina = 0
  for (let i = 0; i < paginas.length; i++) {
    if (leidas >= acumulado + palabrasPorPagina[i] && i < paginas.length - 1) {
      acumulado += palabrasPorPagina[i]
      pagina = i + 1
    } else {
      pagina = i
      break
    }
  }
  const visibles = Math.floor(leidas - acumulado) + 1
  const enPagina = leidas - acumulado
  let n = 0
  const anchoMax = Math.max(...paginas[pagina].map((l) => anchoTexto(l, tam, 700)))
  return (
    <div
      style={{
        position: 'absolute',
        left: caja.x + (caja.w - anchoMax - 48) / 2,
        top: caja.y,
        width: anchoMax + 48,
        height: caja.h,
        zIndex: 40,
        background: 'rgba(6, 7, 14, 0.86)',
        boxShadow: '0 0 0 4px #000, 0 0 0 7px rgba(255,255,255,0.18)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: FUENTE_TEXTO,
        fontWeight: 700,
        fontSize: tam,
        lineHeight: 1.22,
        color: '#fff',
      }}
    >
      {paginas[pagina].map((linea, i) => (
        <div key={i} style={{ whiteSpace: 'nowrap' }}>
          {linea.split(' ').map((p, j) => {
            n++
            // Palabras ya dichas en blanco; la que se está diciendo en ámbar; las que vienen, tenues.
            const dicha = n <= visibles
            const actual = n === visibles && enPagina - (n - 1) < 1
            return (
              <span key={j} style={{ color: actual ? '#ffd25e' : '#ffffff', opacity: dicha ? 1 : 0.3 }}>
                {j > 0 ? ' ' : ''}
                {p}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}
