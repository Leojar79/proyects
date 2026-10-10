#!/usr/bin/env node
// Genera GUION.md (texto para grabar la voz, con tiempos, propuesta de publicación y checklist)
// y out/subtitulos.srt, con los números de la corrida.
//
// Uso: node render/guion.mjs [--run latest|demo|<nombre>]
//   --run   Corrida de public/runs/ (por defecto latest; si no existe, demo).

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { PUBLICACION } from '../shared/config.js'
import { entero, porcentaje, segundos, usd } from '../shared/formato.js'
import { contarPalabras, RITMO_MAXIMO, ritmoTramo, segmentosGuion } from '../shared/guion.js'
import { DURACION } from '../shared/timeline.js'
import {
  CARPETA_OUT,
  cargarCorrida,
  estadisticasDe,
  fechaCorta,
  parsearArgs,
  RAIZ,
  rel,
  salirConError,
  tiempoCorto,
  tiempoSRT,
} from './comun.mjs'

const ESCENA = {
  gancho: 'Gancho',
  presentacion: 'Presentación',
  detalle: 'Detalle',
  rapido: 'Avance rápido',
  resultados: 'Resultados',
  cierre: 'Cierre',
}

const ayuda = 'Uso: node render/guion.mjs [--run latest|demo|<nombre>]'

// ---------------------------------------------------------------------------
// Subtítulos: tramos de más de ~12 palabras se parten en subtítulos de 2 líneas de ~40 caracteres.

const MAX_PALABRAS = 12
const MAX_LINEA = 40

const CORTAS = new Set(['y', 'o', 'de', 'del', 'a', 'al', 'la', 'el', 'las', 'los', 'en', 'que', 'con', 'por', 'para', 'un', 'una', 'su', 'se', 'sin', 'tras', 'cada'])

// Costo de cortar una línea después de la palabra `p`: mejor tras un punto, peor tras un número o una
// palabra corta ("de", "la"...), para no separar "17 / dólares" ni dejar "cada / una".
function castigoCorte(p, siguiente) {
  if (/[.?!]$/.test(p)) return 0
  if (/[;:]$/.test(p)) return 2
  if (/,$/.test(p)) return 8
  if (/\d$/.test(p) || /^\d/.test(siguiente ?? '')) return 18
  if (CORTAS.has(p.toLowerCase())) return 16
  return 10
}

// Reparte el texto en 1 o 2 líneas de hasta MAX_LINEA caracteres (o null si no cabe en 2).
function dosLineas(texto) {
  if (texto.length <= MAX_LINEA) return [texto]
  const palabras = texto.split(' ')
  let mejor = null
  for (let i = 1; i < palabras.length; i++) {
    const a = palabras.slice(0, i).join(' ')
    const b = palabras.slice(i).join(' ')
    if (a.length > MAX_LINEA || b.length > MAX_LINEA) continue
    const costo = Math.max(a.length, b.length) + castigoCorte(palabras[i - 1], palabras[i])
    if (!mejor || costo < mejor.costo) mejor = { costo, lineas: [a, b] }
  }
  return mejor?.lineas ?? null
}

const cabe = (palabras) => palabras.length <= MAX_PALABRAS && dosLineas(palabras.join(' ')) !== null

// Corta una lista de palabras en grupos que quepan, primero después de la puntuación indicada.
function cortar(palabras, puntuacion) {
  const grupos = []
  let actual = []
  for (const p of palabras) {
    actual.push(p)
    if (puntuacion.test(p)) {
      grupos.push(actual)
      actual = []
    }
  }
  if (actual.length) grupos.push(actual)
  return grupos
}

function partirEnSubtitulos(seg) {
  const palabras = seg.texto.split(/\s+/).filter(Boolean)
  let bloques
  if (cabe(palabras)) bloques = [palabras]
  else {
    // Unidades: oraciones; si una no cabe, sus cláusulas; si tampoco, trozos de palabras.
    const unidades = []
    for (const oracion of cortar(palabras, /[.?!]$/)) {
      if (cabe(oracion)) {
        unidades.push(oracion)
        continue
      }
      for (const clausula of cortar(oracion, /[,;:]$/)) {
        let resto = clausula
        while (!cabe(resto)) {
          let n = Math.min(resto.length - 1, MAX_PALABRAS)
          while (n > 1 && !cabe(resto.slice(0, n))) n--
          unidades.push(resto.slice(0, n))
          resto = resto.slice(n)
        }
        if (resto.length) unidades.push(resto)
      }
    }
    // Se juntan unidades seguidas mientras quepan en un subtítulo.
    bloques = []
    for (const u of unidades) {
      const ultimo = bloques.at(-1)
      if (ultimo && cabe([...ultimo, ...u])) bloques[bloques.length - 1] = [...ultimo, ...u]
      else bloques.push(u)
    }
  }
  // Tiempo proporcional a las palabras (como se leen).
  const pesos = bloques.map((b) => Math.max(1, contarPalabras(b.join(' ')).habladas))
  const total = pesos.reduce((a, b) => a + b, 0)
  const dur = seg.fin - seg.inicio
  let t = seg.inicio
  return bloques.map((b, i) => {
    const inicio = t
    const fin = i === bloques.length - 1 ? seg.fin : inicio + (dur * pesos[i]) / total
    t = fin
    return { inicio, fin, lineas: dosLineas(b.join(' ')) ?? [b.join(' ')] }
  })
}

function generarSRT(segmentos) {
  const subs = segmentos.flatMap(partirEnSubtitulos)
  return (
    subs
      .map((s, i) => `${i + 1}\n${tiempoSRT(s.inicio)} --> ${tiempoSRT(s.fin)}\n${s.lineas.join('\n')}\n`)
      .join('\n') + '\n'
  )
}

// ---------------------------------------------------------------------------
// Textos para GUION.md

const sinVerificarEn = (fuente) =>
  String(fuente ?? '')
    .replace(/\.?\s*Verificar en \S+\.?/i, '')
    .replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, '')
    .trim()
const urlDe = (fuente) => /https?:\/\/\S+/.exec(String(fuente ?? ''))?.[0]?.replace(/[.)]+$/, '') ?? null
const celda = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')

function opcionesTexto(opciones) {
  const pares = Object.entries(opciones ?? {})
  return pares.length ? pares.map(([k, v]) => `${k}: ${v}`).join(', ') : 'sin opciones especiales'
}

function estadoFinal(p, N) {
  if (p.llegoAlFinal) return `llegó al final (${p.decisionesEnJuego} decisiones)`
  if (p.motivoFin === 'sin_fondos') return `${p.decisionesEnJuego} decisiones; se quedó sin presupuesto en el viajero ${p.finIndice + 1}/${N}`
  return `${p.decisionesEnJuego} decisiones; perdió su última vida en el viajero ${p.finIndice}/${N}`
}

// Las cosas en las que Jev NO gana (o que hay que aclarar), dichas tal cual.
function loQueHayQueDecir(est, run) {
  const ps = est.proveedores
  const jev = ps.find((p) => p.id === 'jev')
  const out = []
  const mejor = (valor, menor, valido = () => true) => {
    const c = ps.filter(valido)
    if (!c.length) return []
    const v = c.map(valor)
    const m = menor ? Math.min(...v) : Math.max(...v)
    return c.filter((p) => Math.abs(valor(p) - m) <= Math.max(1e-12, Math.abs(m) * 1e-9))
  }
  if (jev) {
    const aci = mejor((p) => p.precisionAccion, false)
    if (!aci.includes(jev)) {
      out.push(
        `En aciertos ganó ${aci.map((p) => p.nombre).join(' y ')} (${aci[0].aciertosAccion} de ${aci[0].casos}, contra ${jev.aciertosAccion} de ${jev.casos} de Jev).`,
      )
    } else if (aci.length > 1) out.push(`En aciertos hubo empate: ${aci.map((p) => `${p.nombre} ${p.aciertosAccion}/${p.casos}`).join(', ')}.`)
    const dur = mejor((p) => (p.llegoAlFinal ? 1e9 : 0) + p.decisionesEnJuego, false)
    if (!dur.includes(jev)) out.push(`En duración ganó ${dur.map((p) => p.nombre).join(' y ')}; Jev: ${estadoFinal(jev, est.totalViajeros)}.`)
    else if (!jev.llegoAlFinal) out.push(`Jev duró más, pero tampoco llegó al final: ${estadoFinal(jev, est.totalViajeros)}.`)
    const vel = mejor((p) => p.latenciaPromedioMs, true, (p) => p.respondidas > 0)
    if (!vel.includes(jev)) out.push(`En velocidad ganó ${vel.map((p) => p.nombre).join(' y ')} (${segundos(vel[0].latenciaPromedioMs)} contra ${segundos(jev.latenciaPromedioMs)} de Jev).`)
    if (est.masBarato && est.masBarato.id !== 'jev') out.push(`El más barato por decisión fue ${est.masBarato.nombre}, no Jev.`)
    if (jev.erroresGraves > 0) {
      out.push(`Jev cometió ${jev.erroresGraves} ${jev.erroresGraves === 1 ? 'error grave' : 'errores graves'} (dejar pasar una amenaza o arrestar a un inocente) en los ${jev.casos} casos.`)
    }
  }
  const sinVerificar = ps.filter((p) => p.precio?.verificado === false)
  if (sinVerificar.length) out.push(`Precios sin verificar en la página oficial: ${sinVerificar.map((p) => p.nombre).join(', ')}.`)
  for (const p of ps) {
    if (p.erroresApi > 0) out.push(`${p.nombre} tuvo ${p.erroresApi} ${p.erroresApi === 1 ? 'error' : 'errores'} de API (cuentan como fallo).`)
    if (p.tokensEstimados) out.push(`${p.nombre}: algunos tokens se estimaron porque la API no los informó.`)
    if (p.usoFallback) out.push(`${p.nombre}: en algunas llamadas la API respondió con un modelo de respaldo.`)
  }
  if (run.source !== 'live') out.unshift('ESTOS NÚMEROS SON DE LA DEMO (simulados): no se pueden publicar.')
  return out
}

function textoPublicacion(est, run, segmentos) {
  const ps = est.proveedores
  const N = est.totalViajeros
  const llms = ps.filter((p) => p.id !== 'jev')
  const jev = ps.find((p) => p.id === 'jev')
  const gancho = segmentos[0]?.texto ?? ''
  const desenlace = /\.\s*(.+)$/.exec(gancho)?.[1] ?? ''
  const lineas = []
  lineas.push(`Le di ${usd(est.presupuestoUSD)} de presupuesto a ${ps.length} IAs para trabajar en una frontera. ${desenlace}`.trim())
  lineas.push('')
  lineas.push(
    `Hice «La Frontera», un juego estilo Papers, Please: ${N} viajeros llegan al puesto y cada IA decide qué hacer con cada uno. ` +
      `${ps.length === 3 ? 'Las tres' : `Las ${ps.length}`} reciben exactamente el mismo texto (reglas, documentos y lo que dice el viajero) y responden las mismas 4 preguntas: ` +
      '¿puede pasar?, ¿miente?, nivel de peligro (0 a 4) y qué hacer (aprobar, rechazar, interrogar o arrestar).',
  )
  lineas.push('')
  lineas.push(
    `Reglas: ${usd(est.presupuestoUSD)} para cada una y ${est.vidas} vidas (se pierde una al dejar pasar una amenaza o arrestar a un inocente). Gana la que dure más.`,
  )
  lineas.push('')
  lineas.push(`Resultados (corrida del ${fechaCorta(run.createdAt)}${run.source !== 'live' ? ', DATOS DEMO' : ''}):`)
  for (const p of ps) {
    lineas.push(
      `• ${p.nombre} (${p.empresa}): ${estadoFinal(p, N)} · ${usd(p.costoPromedioUSD)} por decisión · ` +
        `${segundos(p.latenciaPromedioMs)} en promedio · ${p.aciertosAccion}/${p.casos} aciertos (${porcentaje(p.precisionAccion)})`,
    )
  }
  const honestas = loQueHayQueDecir(est, run).filter((x) => !x.startsWith('ESTOS NÚMEROS'))
  if (honestas.length) {
    lineas.push('')
    lineas.push('Lo que también hay que decir:')
    for (const h of honestas) lineas.push(`• ${h}`)
  }
  if (llms.length && jev) {
    lineas.push('')
    lineas.push(
      `¿Por qué tanta diferencia de costo? ${llms.map((p) => p.nombre).join(' y ')} son modelos de lenguaje: razonan y escriben su respuesta, ` +
        'y se paga cada token, también el razonamiento interno. Jev no escribe: devuelve la decisión con su probabilidad. ' +
        `Por cada mil decisiones: ${ps.map((p) => `${p.nombre} ${usd(p.costoPor1000USD)}`).join(' · ')}.`,
    )
    lineas.push('')
    lineas.push('Mi conclusión: los modelos de lenguaje, para crear; Jev, para decidir.')
  }
  lineas.push('')
  lineas.push('Método (resumen):')
  lineas.push(
    `• El mismo texto y las mismas preguntas para todas, viajero por viajero${llms.length ? `; ${llms.map((p) => p.nombre).join(' y ')} con salida JSON estructurada y sin pedir explicaciones` : ''}.`,
  )
  lineas.push(`• Configuración: ${run.proveedores.map((p) => `${p.nombre} (${p.modelo}; ${opcionesTexto(p.opciones)})`).join(' · ')}.`)
  lineas.push('• Costo = tokens que informa cada API × precio público por millón de tokens (el razonamiento interno se cobra como salida).')
  lineas.push(`• Aciertos = la acción correcta sobre los ${N} casos, también los que ya no alcanzó el presupuesto. Velocidad = tiempo de la petición que tuvo éxito.`)
  lineas.push('• Precios usados (US$ por millón de tokens, entrada / salida):')
  for (const p of run.proveedores) {
    const pr = p.precio ?? {}
    lineas.push(
      `  · ${p.nombre}: ${pr.entradaPorMTok} / ${pr.salidaPorMTok} — ${sinVerificarEn(pr.fuente)} (${fechaCorta(pr.fecha)})` +
        `${pr.verificado === false ? ' [sin verificar en la página oficial]' : ''}`,
    )
  }
  lineas.push('')
  lineas.push(`Código, datos y método: ${PUBLICACION.enlaceMetodo}`)
  if ((PUBLICACION.divulgacion ?? '').trim()) {
    lineas.push('')
    lineas.push(`Divulgación: ${PUBLICACION.divulgacion.trim()}`)
  }
  lineas.push('')
  lineas.push(HASHTAGS)
  return lineas.join('\n')
}

const HASHTAGS = '#InteligenciaArtificial #IA #LLM #Benchmark #CostosDeIA #IAGenerativa #Automatizacion #Tecnologia'

function generarMarkdown({ est, run, corrida, segmentos }) {
  const ps = est.proveedores
  const N = est.totalViajeros
  const esDemo = run.source !== 'live'
  const conteos = segmentos.map((s) => contarPalabras(s.texto))
  const totalPalabras = conteos.reduce((a, c) => a + c.habladas, 0)
  const ritmoMax = Math.max(...segmentos.map(ritmoTramo))
  const md = []
  md.push('# Guion de voz · La Frontera')
  md.push('')
  if (esDemo) {
    md.push('> [!WARNING]')
    md.push('> ## GENERADO CON DATOS DEMO')
    md.push('> **Vuelve a generarlo después de correr el benchmark real; los números cambiarán.**')
    md.push('> Pasos: `npm run benchmark` y luego `npm run guion`. Un video o una publicación con estos números')
    md.push('> NO se puede publicar: son simulados.')
    md.push('')
  }
  md.push(
    `Corrida: \`${rel(corrida.ruta)}\` · fuente: **${esDemo ? 'demo (datos simulados)' : 'live (llamadas reales)'}** · ` +
      `fecha ${fechaCorta(run.createdAt)} · ${N} viajeros · presupuesto ${usd(est.presupuestoUSD)} · ${est.vidas} vidas`,
  )
  md.push('')
  md.push(
    `Video de ${DURACION} s · ${segmentos.length} tramos · ${totalPalabras} palabras · ritmo máximo permitido ` +
      `${String(RITMO_MAXIMO).replace('.', ',')} palabras por segundo (el tramo más rápido de este guion: ${ritmoMax.toFixed(2).replace('.', ',')}).`,
  )
  md.push('')
  md.push(`Archivo generado por \`npm run guion\` (render/guion.mjs). Si cambias la corrida, vuelve a generarlo: el texto se elige según los datos.`)
  md.push('')
  md.push('## Tramos')
  md.push('')
  md.push('- **Tiempo**: segundo del video en que empieza el tramo y el último momento en que puede terminar.')
  md.push('- **Palabras**: como se leen en voz alta (los números cuentan como se pronuncian: «35» = «treinta y cinco» = 3).')
  md.push('')
  md.push('| # | Tiempo | Escena | Texto a grabar | Palabras | Lo que se ve |')
  md.push('|---|---|---|---|---|---|')
  segmentos.forEach((s, i) => {
    const r = ritmoTramo(s).toFixed(1).replace('.', ',')
    md.push(
      `| ${i + 1} | ${tiempoCorto(s.inicio)}–${tiempoCorto(s.fin)} | ${ESCENA[s.escena] ?? s.escena} | ${celda(s.texto)} | ` +
        `${conteos[i].habladas} (${r}/s) | ${celda(s.enPantalla)} |`,
    )
  })
  md.push('')
  md.push('## Texto corrido (para leer de una vez)')
  md.push('')
  let escena = null
  let parrafo = []
  for (const s of segmentos) {
    if (s.escena !== escena && parrafo.length) {
      md.push(parrafo.join(' '))
      md.push('')
      parrafo = []
    }
    escena = s.escena
    parrafo.push(s.texto)
  }
  if (parrafo.length) md.push(parrafo.join(' '), '')
  md.push('## Consejos para grabar')
  md.push('')
  md.push('- **Ritmo**: tono de creador de contenido, con energía pero claro. Cada tramo cabe leyéndolo a unas 2 o 2,5 palabras por segundo; el gancho es el más rápido.')
  md.push('- **Pausas**: respira entre tramos. Entre algunos tramos hay silencio a propósito (por ejemplo, cuando entra el avance rápido o la tabla de resultados).')
  md.push('- **Números**: léelos como están escritos («1.6 centavos» = «uno punto seis centavos»; «770 veces» = «setecientas setenta veces»). Los nombres: «GPT» (yi-pi-tí), «Opus», «Jev».')
  md.push('- **Equipo**: cualquier micrófono sirve en un cuarto chico con cortinas o ropa alrededor; a un palmo de la boca. Graba en WAV o M4A a 48 kHz.')
  md.push('- **Forma más fácil de sincronizar**: graba **cada tramo como un archivo aparte** (01.wav, 02.wav…) y colócalo en el editor en su tiempo de inicio. La voz empieza en 0:00 y cada tramo empieza en su tiempo de la tabla.')
  md.push('  - **CapCut**: importa el video y los audios; arrastra cada audio a la pista de sonido y muévelo hasta que el cabezal marque su tiempo de inicio (acerca la línea de tiempo para ver décimas).')
  md.push('  - **Premiere Pro**: pon el cabezal en el tiempo (haz clic en el contador de tiempo y escribe, por ejemplo, 00:00:19:21 para 0:19.7 a 30 cuadros por segundo) y arrastra el audio hasta que se pegue al cabezal.')
  md.push('  - **DaVinci Resolve**: en la página Edit, escribe el tiempo en el contador del visor, coloca el cabezal y usa «Place on top» o arrastra el audio hasta el cabezal.')
  md.push('- **Si un tramo te queda largo**: acelera ese audio hasta un 110 % o quita una muletilla; **nunca lo adelantes** a su tiempo de inicio (la voz contaría algo antes de que aparezca en pantalla).')
  md.push('- **Alternativa**: graba todo de corrido mirando el video sin sonido (el que tiene subtítulos sirve de teleprompter) y después corta y ajusta.')
  md.push(`- **Subtítulos**: \`out/la-frontera-<formato>-subs.mp4\` ya los trae dibujados. Si prefieres ponerlos en el editor, importa \`out/subtitulos.srt\` (mismos tramos, partidos en líneas de unos ${MAX_LINEA} caracteres).`)
  md.push('- **Música**: opcional y bajita (unos 20 dB por debajo de la voz). Exporta en 30 cuadros por segundo con audio AAC a 48 kHz.')
  md.push('')
  md.push('## Propuesta de texto para LinkedIn')
  md.push('')
  if (esDemo) md.push('**Con datos DEMO: este texto es solo de ejemplo. Vuelve a generarlo con la corrida real antes de usarlo.**', '')
  md.push('Revísalo y ajústalo a tu voz. Todos los números salen de la corrida.')
  md.push('')
  md.push('```text')
  md.push(textoPublicacion(est, run, segmentos))
  md.push('```')
  md.push('')
  md.push(
    '> **Recordatorio para el autor:** declara si TypeSafe te paga, te dio créditos o tiene alguna relación contigo. ' +
      'Escríbelo en `PUBLICACION.divulgacion` de `shared/config.js` (sale en el cierre del video y en este texto) y en la publicación.' +
      ((PUBLICACION.divulgacion ?? '').trim() ? ` Divulgación actual: «${PUBLICACION.divulgacion.trim()}».` : ' Ahora está vacía.'),
  )
  md.push('')
  md.push('## Hashtags')
  md.push('')
  md.push(`${HASHTAGS} (si quieres, agrega #OpenAI #Anthropic #TypeSafe; con 3 a 5 hashtags basta en LinkedIn).`)
  md.push('')
  md.push('## Checklist antes de publicar')
  md.push('')
  md.push(`- [ ] **Corrida real**: el archivo debe decir \`"source": "live"\`. Esta dice **\`${run.source}\`**${esDemo ? ' → NO publicar; corre `npm run benchmark`, luego `npm run guion` y `npm run video`' : ''}.`)
  for (const p of run.proveedores) {
    const pr = p.precio ?? {}
    if (pr.verificado === false) {
      const url = urlDe(pr.fuente)
      md.push(
        `- [ ] **Precio de ${p.nombre} sin verificar** (entrada US$ ${pr.entradaPorMTok}, salida US$ ${pr.salidaPorMTok} por millón de tokens; fuente: ${sinVerificarEn(pr.fuente)}).` +
          ` Confírmalo${url ? ` en ${url}` : ' en la página oficial'}. Si cambia, corrígelo en \`shared/modelos.js\` (y pon \`verificado: true\`) y vuelve a correr el benchmark: cada corrida guarda el precio con el que calculó el costo.`,
      )
    }
  }
  const servidos = ps
    .map((p) => {
      const lista = [...new Set((run.resultados[p.id] ?? []).map((r) => r.modeloServido).filter(Boolean))]
      return `${p.nombre}: pedido \`${p.modelo}\`, servido ${lista.length ? lista.map((x) => `\`${x}\``).join(', ') : '(la API no lo informó)'}`
    })
    .join('; ')
  md.push(`- [ ] **Nombres exactos de los modelos** en el video, el texto y la descripción: ${servidos}.`)
  md.push(
    `- [ ] **Divulgación**: ${(PUBLICACION.divulgacion ?? '').trim() ? `«${PUBLICACION.divulgacion.trim()}»` : 'vacía'}. Si TypeSafe te paga o te dio créditos, escríbelo en \`PUBLICACION.divulgacion\` y vuelve a generar el guion y el video.`,
  )
  const avisos = loQueHayQueDecir(est, run).filter((x) => /errores? de API|se estimaron|modelo de respaldo/.test(x))
  md.push(`- [ ] **Avisos de la corrida** (errores de API, tokens estimados, modelo de respaldo): ${avisos.length ? avisos.join(' ') : 'ninguno.'}`)
  md.push('- [ ] **Mira el video completo** sin sonido: sin marca de agua DEMO, subtítulos legibles y sin tapar números, los tres formatos.')
  md.push('- [ ] **La voz coincide con la pantalla**: si cambiaste la corrida o la configuración, vuelve a generar este guion y el video (el texto se elige según los datos).')
  md.push(`- [ ] **El enlace del método funciona** y el repositorio es público: ${PUBLICACION.enlaceMetodo}`)
  md.push('- [ ] En LinkedIn, sube la versión **con subtítulos** (`-subs`): la mayoría lo ve sin sonido.')
  md.push('')
  md.push('## Lo que también hay que decir (según esta corrida)')
  md.push('')
  for (const x of loQueHayQueDecir(est, run)) md.push(`- ${x}`)
  md.push('')
  return md.join('\n')
}

// ---------------------------------------------------------------------------

function main() {
  let args
  try {
    args = parsearArgs(process.argv.slice(2), { run: 'texto', ayuda: 'bandera', help: 'bandera' })
  } catch (e) {
    salirConError(`${e.message}\n${ayuda}`)
  }
  if (args.ayuda || args.help) {
    console.log(ayuda)
    return
  }
  let corrida
  let est
  let segmentos
  try {
    corrida = cargarCorrida(args.run ?? 'latest')
    est = estadisticasDe(corrida.run)
    segmentos = segmentosGuion(est)
  } catch (e) {
    salirConError(e.message)
  }
  if (corrida.cayoADemo) console.log('No hay public/runs/latest.json todavía: uso la corrida de demostración (demo.json).')
  const rutaMd = join(RAIZ, 'GUION.md')
  const rutaSrt = join(CARPETA_OUT, 'subtitulos.srt')
  writeFileSync(rutaMd, generarMarkdown({ est, run: corrida.run, corrida, segmentos }))
  mkdirSync(CARPETA_OUT, { recursive: true })
  const srt = generarSRT(segmentos)
  writeFileSync(rutaSrt, srt)

  const ritmoMax = Math.max(...segmentos.map(ritmoTramo))
  const palabras = segmentos.reduce((a, s) => a + contarPalabras(s.texto).habladas, 0)
  const nSubs = srt.trim().split(/\n\n+/).length
  console.log(`Corrida: ${rel(corrida.ruta)} (${corrida.run.source}, ${fechaCorta(corrida.run.createdAt)}, ${entero(est.totalViajeros)} viajeros)`)
  console.log(`Guion:   ${rel(rutaMd)} · ${segmentos.length} tramos · ${palabras} palabras · tramo más rápido ${ritmoMax.toFixed(2)} palabras/s (máximo ${RITMO_MAXIMO})`)
  console.log(`Subtítulos: ${rel(rutaSrt)} · ${nSubs} subtítulos`)
  if (corrida.run.source !== 'live') {
    console.log('\n' + '!'.repeat(72))
    console.log('!!  AVISO: guion generado con datos DEMO (simulados). No lo publiques.     !!')
    console.log('!!  Corre el benchmark real y vuelve a generarlo: los números cambiarán.  !!')
    console.log('!'.repeat(72))
  }
}

main()
