#!/usr/bin/env node
// Genera GUION.md (texto para grabar la voz, con tiempos, propuesta de publicación y checklist)
// y out/subtitulos.srt, con los números de la corrida.
//
// Arriba de GUION.md van TODOS los bloqueos y avisos de shared/publicable.js (la misma regla que usan
// la app y el render), con cómo resolver cada uno. El archivo se genera igual, para revisar.
//
// Uso: node render/guion.mjs [--run latest|demo|<nombre>]
//   --run   Corrida de public/runs/ (por defecto latest; si no existe, demo).

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { PUBLICACION } from '../shared/config.js'
import { entero, factor, porcentaje, segundos, usd } from '../shared/formato.js'
import { contarPalabras, FRASE_INSIGNIA, RITMO_MAXIMO, ritmoTramo, segmentosGuion } from '../shared/guion.js'
import { EMPATE_ACIERTOS } from '../shared/juego.js'
import { DURACION } from '../shared/timeline.js'
import {
  CARPETA_OUT,
  cargarCorrida,
  comoResolver,
  estadisticasDe,
  fechaCorta,
  parsearArgs,
  publicableDe,
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
// Textos para GUION.md. Toda afirmación de "ganó / el más X / empate" sale de est.ganadores
// (shared/juego.js), la misma regla que pone las coronas MEJOR en pantalla.

const sinVerificarEn = (fuente) =>
  String(fuente ?? '')
    .replace(/\.?\s*Verificar en \S+\.?/i, '')
    .replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, '')
    .trim()
const urlDe = (fuente) => /https?:\/\/\S+/.exec(String(fuente ?? ''))?.[0]?.replace(/[.)]+$/, '') ?? null
const celda = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')
const listaY = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`)
const divulgacionActual = () => String(PUBLICACION.divulgacion ?? '').trim()

// Precio de referencia de un modelo más barato que NO se probó (A3 de la auditoría).
const HAIKU = { nombre: 'Claude Haiku 5.5', entrada: 0.1, salida: 0.5, fuente: 'tabla de precios de la API de Anthropic', fecha: '2026-10-06' }

function valorOpcion(v) {
  if (v === null || v === undefined) return 'por defecto de la API'
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

// Opciones REALMENTE usadas en las llamadas (resultados[].opcionesUsadas), no las declaradas.
// Si hubo más de una combinación, se listan todas con cuántas llamadas usaron cada una.
function opcionesUsadasTexto(run, p) {
  const res = (run.resultados?.[p.id] ?? []).filter((r) => r.opcionesUsadas)
  if (!res.length) {
    const decl = Object.entries(p.opciones ?? {})
    return `la corrida no registró las opciones usadas; declaradas: ${decl.length ? decl.map(([k, v]) => `${k}: ${valorOpcion(v)}`).join(', ') : 'ninguna'}`
  }
  const conteo = new Map()
  for (const r of res) {
    const pares = Object.entries(r.opcionesUsadas).sort(([a], [b]) => a.localeCompare(b))
    const clave = pares.length ? pares.map(([k, v]) => `${k}: ${valorOpcion(v)}`).join(', ') : 'sin opciones especiales'
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1)
  }
  if (conteo.size === 1) return [...conteo.keys()][0]
  return [...conteo].map(([k, n]) => `${k} (${n} llamadas)`).join(' / ')
}

function modelosServidos(run, p) {
  return [...new Set((run.resultados?.[p.id] ?? []).map((r) => r.modeloServido).filter(Boolean))]
}

function estadoFinal(p, N) {
  if (!(p.respondidas > 0)) return 'sin respuestas (todas las llamadas fallaron)'
  if (p.llegoAlFinal) return `llegó al final (${p.decisionesEnJuego} decisiones)`
  if (p.motivoFin === 'sin_fondos') return `${p.decisionesEnJuego} decisiones; se quedó sin presupuesto en el viajero ${p.finIndice + 1}/${N}`
  return `${p.decisionesEnJuego} decisiones; perdió su última vida en el viajero ${p.finIndice}/${N}`
}

const graves = (n) => `${n} ${n === 1 ? 'error grave' : 'errores graves'}`

// A2: el presupuesto se fijó antes de correr; lo que costaba atender a todos; qué cuentan los aciertos.
function textoPresupuesto(est) {
  const N = est.totalViajeros
  const ps = est.proveedores
  const necesitaba = ps.map((p, i) => (i === 0 ? `${p.nombre} necesitaba ${usd(p.costoTotalUSD)}` : `${p.nombre}, ${usd(p.costoTotalUSD)}`))
  const inicio = est.reglasRegistradas
    ? `El presupuesto de ${usd(est.presupuestoUSD)} y las ${est.vidas} vidas se fijaron antes de correr.`
    : `OJO: esta corrida no registró el presupuesto (${usd(est.presupuestoUSD)}) ni las vidas (${est.vidas}) antes de correr; no se puede publicar así.`
  return `${inicio} Para atender a los ${N} viajeros, ${listaY(necesitaba)}. Los aciertos y errores graves cuentan los ${N} casos, sin límite de presupuesto.`
}

// Las cosas en las que Jev NO gana (o que hay que aclarar), dichas tal cual, según est.ganadores.
function loQueHayQueDecir(est, run) {
  const ps = est.proveedores
  const G = est.ganadores
  const porIds = (ids) => (ids ?? []).map((id) => ps.find((p) => p.id === id)).filter(Boolean)
  const nombres = (xs) => listaY(xs.map((p) => p.nombre))
  const jev = ps.find((p) => p.id === 'jev')
  const out = []
  if (jev) {
    const aci = porIds(G.aciertos)
    if (!G.aciertos.includes('jev')) {
      out.push(`En aciertos ganó ${nombres(aci)} (${aci.map((p) => `${p.aciertosAccion} de ${p.casos}`).join(', ')}), contra ${jev.aciertosAccion} de ${jev.casos} de Jev.`)
    } else if (aci.length > 1) {
      out.push(`En aciertos hubo empate (diferencias de ${EMPATE_ACIERTOS} casos o menos): ${aci.map((p) => `${p.nombre} ${p.aciertosAccion}/${p.casos}`).join(', ')}.`)
    }
    const dur = porIds(G.duracion)
    if (!G.duracion.includes('jev')) out.push(`En duración ganó ${nombres(dur)}; Jev: ${estadoFinal(jev, est.totalViajeros)}.`)
    else if (!jev.llegoAlFinal) out.push(`Jev duró más, pero tampoco llegó al final: ${estadoFinal(jev, est.totalViajeros)}.`)
    const vel = porIds(G.velocidad)
    if (!G.velocidad.includes('jev') && vel.length) {
      out.push(`En velocidad ganó ${nombres(vel)} (${segundos(vel[0].latenciaPromedioMs)} en promedio, contra ${segundos(jev.latenciaPromedioMs)} de Jev).`)
    }
    if (!G.costo.includes('jev') && G.costo.length) out.push(`El más barato por decisión fue ${nombres(porIds(G.costo))}, no Jev.`)
    if (jev.erroresGraves > 0) {
      out.push(`Jev cometió ${graves(jev.erroresGraves)} (dejar pasar una amenaza o arrestar a un inocente) en los ${jev.casos} casos.`)
    }
  }
  for (const p of ps) {
    if (p.erroresApi > 0 || p.faltantes > 0) {
      const n = p.erroresApi + p.faltantes
      out.push(`${p.nombre} tuvo ${n} ${n === 1 ? 'llamada' : 'llamadas'} con error o sin resultado (cuentan como fallo; si la API las cobró, su costo cuenta).`)
    }
    if (p.respondidas > 0 && p.costoPromedioUSD === 0) out.push(`${p.nombre}: la API informó 0 tokens, así que su costo sale 0 y no compite en costo.`)
    if (p.tokensEstimados) out.push(`${p.nombre}: algunos tokens se estimaron porque la API no los informó.`)
    if (p.respondidas > 0 && !p.salidaInformada) out.push(`${p.nombre}: la API no informó los tokens de salida de todas las llamadas (no se asume 0).`)
    if (p.usoFallback) out.push(`${p.nombre}: en algunas llamadas la API respondió con un modelo de respaldo.`)
  }
  const sinVerificar = ps.filter((p) => p.precio?.verificado === false)
  if (sinVerificar.length) out.push(`Precios sin verificar en la página oficial: ${nombres(sinVerificar)}.`)
  if (run.source !== 'live') out.unshift('ESTOS NÚMEROS SON DE LA DEMO (simulados): no se pueden publicar.')
  return out
}

// Alcance de la comparación, medición y marcas: va siempre en la publicación (A3, B2, M4, B4).
function loQueSiempreHayQueDecir(est, run) {
  const ps = est.proveedores
  const llms = ps.filter((p) => p.id !== 'jev')
  const opus = ps.find((p) => p.id === 'opus')
  const out = []
  if (llms.length) {
    const efectivo = (p) => {
      const usados = new Set((run.resultados?.[p.id] ?? []).filter((r) => r.ok && r.opcionesUsadas).map((r) => r.opcionesUsadas.reasoningEffort ?? r.opcionesUsadas.effort ?? null))
      return usados.size === 1 ? [...usados][0] : null
    }
    const todosLow = llms.every((p) => efectivo(p) === 'low')
    let veces = ''
    if (opus?.precio && opus.precio.entradaPorMTok / HAIKU.entrada === opus.precio.salidaPorMTok / HAIKU.salida) {
      veces = `, ${Math.round(opus.precio.entradaPorMTok / HAIKU.entrada)} veces menos que Opus`
    }
    out.push(
      `Comparé contra modelos insignia: ${listaY(llms.map((p) => p.nombre))}` +
        (todosLow ? `, con el esfuerzo de razonamiento en low${opus ? ' (en Claude Opus 5.5 es el mínimo; el razonamiento no se puede apagar)' : ''}` : '') +
        `. Hay modelos mucho más baratos que no probé: por ejemplo, ${HAIKU.nombre} cuesta US$ ${HAIKU.entrada.toFixed(2)} / ${HAIKU.salida.toFixed(2)} por millón de tokens` +
        `${veces} (${HAIKU.fuente}, ${fechaCorta(HAIKU.fecha)}). Con ellos, la diferencia de costo sería mucho menor.`,
    )
  }
  out.push('La latencia se midió desde mi red (la del autor), contando solo la petición que tuvo éxito; desde otro lugar puede variar.')
  out.push(`Es una sola corrida con ${est.totalViajeros} casos sintéticos (escritos para esta prueba); diferencias de ${EMPATE_ACIERTOS} casos o menos las trato como empate.`)
  out.push('Inspirado en Papers, Please (Lucas Pope). OpenAI, GPT, Anthropic, Claude, TypeSafe y Jev son marcas de sus dueños; las nombro solo para identificar los productos.')
  return out
}

function textoPublicacion({ est, run, segmentos, publicable, archivo, huella }) {
  const ps = est.proveedores
  const N = est.totalViajeros
  const G = est.ganadores
  const llms = ps.filter((p) => p.id !== 'jev')
  const jev = ps.find((p) => p.id === 'jev')
  const porIds = (ids) => (ids ?? []).map((id) => ps.find((p) => p.id === id)).filter(Boolean)
  const nombres = (xs) => listaY(xs.map((p) => p.nombre))
  const gancho = segmentos[0]?.texto ?? ''
  const desenlace = /\.\s*(.+)$/.exec(gancho)?.[1] ?? ''
  const div = divulgacionActual()
  const lineas = []
  // A6: la divulgación es la PRIMERA línea (antes del corte de "ver más").
  lineas.push(div ? `Divulgación: ${div.replace(/\.$/, '')}.` : '[FALTA LA DIVULGACIÓN: escribe tu relación con TypeSafe en PUBLICACION.divulgacion de shared/config.js. Sin eso no se publica.]')
  lineas.push('')
  lineas.push(`Le di ${usd(est.presupuestoUSD)} de presupuesto a ${ps.length} IAs para trabajar en una frontera. ${desenlace}`.trim())
  lineas.push('')
  lineas.push(
    `Hice «La Frontera», un juego estilo Papers, Please: ${N} viajeros llegan al puesto y cada IA decide qué hacer con cada uno. ` +
      `${ps.length === 3 ? 'Las tres' : `Las ${ps.length}`} reciben exactamente el mismo texto (reglas, documentos y lo que dice el viajero) y responden las mismas 4 preguntas: ` +
      '¿puede pasar?, ¿miente?, nivel de peligro (0 a 4) y qué hacer (aprobar, rechazar, interrogar o arrestar).',
  )
  lineas.push('')
  lineas.push(`Reglas: ${usd(est.presupuestoUSD)} para cada una y ${est.vidas} vidas (se pierde una al dejar pasar una amenaza o arrestar a un inocente). Gana la que dure más.`)
  lineas.push(textoPresupuesto(est))
  lineas.push('')
  lineas.push(`Resultados (corrida del ${fechaCorta(run.createdAt)}${run.source !== 'live' ? ', DATOS DEMO' : ''}; una corrida, ${N} casos sintéticos; diferencias de ${EMPATE_ACIERTOS} casos o menos las trato como empate):`)
  for (const p of ps) {
    lineas.push(
      `• ${p.nombre} (${p.empresa}): ${estadoFinal(p, N)} · ${p.respondidas > 0 ? `${usd(p.costoPromedioUSD)} por decisión · ${segundos(p.latenciaPromedioMs)} en promedio · ` : ''}` +
        `${p.aciertosAccion}/${p.casos} aciertos en la acción (${porcentaje(p.precisionAccion)}) · ${graves(p.erroresGraves)}`,
    )
  }
  // Conclusión: solo si los datos la sostienen (est.jevRecomendable, igual que el cierre del video).
  lineas.push('')
  if (est.jevRecomendable && jev) {
    lineas.push('Mi conclusión: los modelos generativos, para crear; Jev, para decidir.')
  } else {
    const A = porIds(G.aciertos)
    const B = porIds(G.costo)
    const partes = []
    if (A.length) partes.push(`Si cada acierto cuenta: ${nombres(A)}.`)
    if (B.length) partes.push(`Si manda el costo: ${nombres(B)}.`)
    lineas.push(partes.length ? partes.join(' ') : 'Los números, en la tabla de arriba.')
  }
  // ¿Por qué tanta diferencia de costo? Solo si Jev de verdad salió más barato (est.factoresJev).
  const factores = ps.filter((p) => est.factoresJev?.[p.id] > 0).sort((a, b) => est.factoresJev[b.id] - est.factoresJev[a.id])
  if (jev && llms.length && factores.length) {
    const conRazon = llms.filter((p) => p.tokensRazonamientoProm > 0)
    const jevNoEscribe = !(jev.tokensSalidaProm > 0)
    const conProbabilidad = (run.resultados?.jev ?? []).some((r) => r.ok && r.confianza)
    const salidaJev = jev.salidaInformada ? (jev.tokensSalidaProm === 0 ? ' (su API informó 0 tokens de salida)' : '') : ' (su API no informa tokens de salida)'
    lineas.push('')
    lineas.push(
      `¿Por qué tanta diferencia de costo? ${nombres(llms)} ${llms.length > 1 ? 'son modelos generativos: escriben' : 'es un modelo generativo: escribe'} su respuesta y se paga cada token` +
        (conRazon.length
          ? `; ${conRazon.length === llms.length ? 'además' : `${nombres(conRazon)} además`} ${conRazon.length > 1 ? 'razonan' : 'razona'} antes de responder, y ese razonamiento también se cobra como salida.`
          : '.') +
        (jevNoEscribe
          ? ` Jev, según la documentación de TypeSafe, no genera texto: devuelve la decisión${conProbabilidad ? ' con su probabilidad' : ''}${salidaJev}.`
          : ` Jev devuelve la decisión${conProbabilidad ? ' con su probabilidad' : ''}.`) +
        ` Por decisión, Jev salió ${factores.map((p) => `${factor(est.factoresJev[p.id])} más barato que ${p.nombre}`).join(' y ')}.` +
        ` Por cada mil decisiones: ${ps.filter((p) => p.respondidas > 0).map((p) => `${p.nombre} ${usd(p.costoPor1000USD)}`).join(' · ')}.`,
    )
  }
  lineas.push('')
  lineas.push('Lo que también hay que decir:')
  for (const x of loQueHayQueDecir(est, run).filter((x) => !x.startsWith('ESTOS NÚMEROS'))) lineas.push(`• ${x}`)
  for (const x of loQueSiempreHayQueDecir(est, run)) lineas.push(`• ${x}`)
  lineas.push('')
  lineas.push('Método (resumen):')
  lineas.push(
    `• El mismo texto y las mismas preguntas para todas, viajero por viajero${llms.length ? `; ${nombres(llms)} con salida JSON estructurada y sin pedir explicaciones` : ''}.`,
  )
  lineas.push(
    `• Configuración realmente usada (registrada en cada llamada): ${run.proveedores
      .map((p) => {
        const servidos = modelosServidos(run, p)
        return `${p.nombre} (modelo ${servidos.length ? servidos.join(', ') : p.modelo}; ${opcionesUsadasTexto(run, p)})`
      })
      .join(' · ')}.`,
  )
  lineas.push('• Costo = tokens que informa cada API × precio por millón de tokens (el razonamiento interno se cobra como salida). Las llamadas con error que la API cobró también cuentan.')
  lineas.push(`• Aciertos = la acción correcta sobre los ${N} casos, también los que ya no alcanzó el presupuesto; una llamada con error cuenta como fallo. Velocidad = tiempo de la petición que tuvo éxito.`)
  lineas.push('• Precios usados (US$ por millón de tokens, entrada / salida), con su fuente y la fecha de consulta:')
  for (const p of run.proveedores) {
    const pr = p.precio ?? {}
    lineas.push(
      `  · ${p.nombre}: ${pr.entradaPorMTok} / ${pr.salidaPorMTok} — ${sinVerificarEn(pr.fuente)} (${fechaCorta(pr.fecha)})` +
        `${pr.verificado === false ? ' [SIN VERIFICAR en la página oficial: no publicar así]' : ''}`,
    )
  }
  lineas.push(`• Datos de la corrida: public/runs/${archivo}${huella ? ` (sha256 ${huella.slice(0, 8)}…, el mismo que muestra el cierre del video)` : ''}.`)
  lineas.push('')
  lineas.push(`Código, datos y método: ${PUBLICACION.enlaceMetodo}`)
  lineas.push('')
  lineas.push(HASHTAGS)
  if (publicable.bloqueos.length) {
    lineas.unshift(`[NO PUBLICAR: ${publicable.bloqueos.length} ${publicable.bloqueos.length === 1 ? 'bloqueo' : 'bloqueos'} (ver arriba de GUION.md). Borra esta línea solo cuando no quede ninguno.]`, '')
  }
  return lineas.join('\n')
}

const HASHTAGS = '#InteligenciaArtificial #IA #LLM #Benchmark #CostosDeIA #IAGenerativa #Automatizacion #Tecnologia'

// Bloque de arriba de todo: bloqueos (con cómo resolverlos) y avisos de shared/publicable.js.
function bloquePublicable(publicable, run) {
  const md = []
  const { bloqueos, avisos } = publicable
  if (bloqueos.length) {
    md.push('> [!CAUTION]')
    md.push(`> # NO PUBLICAR: ${bloqueos.length} ${bloqueos.length === 1 ? 'bloqueo' : 'bloqueos'}`)
    md.push('>')
    md.push('> Según `shared/publicable.js` (la misma regla que usan la app y el render), un video hecho con esta corrida **no se puede publicar**.')
    md.push('> Mientras haya bloqueos, el video lleva marca de agua y `npm run video` nombra los archivos `-NO-PUBLICAR` (o `-demo`) y termina con error.')
    md.push('> Este guion y el texto de LinkedIn sirven solo para revisar.')
    md.push('>')
    bloqueos.forEach((b, i) => {
      md.push(`> ${i + 1}. **${b.texto}** (\`${b.codigo}\`).  `)
      md.push(`>    Cómo resolverlo: ${comoResolver(b, run)}`)
    })
    md.push('')
  }
  if (bloqueos.some((b) => b.codigo === 'divulgacion')) {
    md.push('> [!CAUTION]')
    md.push('> # FALTA LA DIVULGACIÓN')
    md.push('> Declara tu relación con TypeSafe en `PUBLICACION.divulgacion` de `shared/config.js`, aunque no haya ninguna')
    md.push('> («Sin relación comercial con TypeSafe»). Va en la primera línea del texto de LinkedIn, en la voz del cierre y en pantalla.')
    md.push('')
  }
  if (avisos.length) {
    md.push('> [!WARNING]')
    md.push('> ## Avisos de la corrida (no bloquean, pero hay que decirlos)')
    for (const a of avisos) md.push(`> - **${a.texto}** (\`${a.codigo}\`). ${comoResolver(a, run, true)}`)
    md.push('')
  }
  if (!bloqueos.length) {
    md.push('> [!NOTE]')
    md.push('> **Sin bloqueos** según `shared/publicable.js`. Igual revisa el checklist del final antes de publicar.')
    md.push('')
  }
  return md
}

function generarMarkdown({ est, run, corrida, segmentos, publicable, huella }) {
  const ps = est.proveedores
  const N = est.totalViajeros
  const esDemo = run.source !== 'live'
  const archivo = basename(corrida.ruta)
  const conteos = segmentos.map((s) => contarPalabras(s.texto))
  const totalPalabras = conteos.reduce((a, c) => a + c.habladas, 0)
  const ritmoMax = Math.max(...segmentos.map(ritmoTramo))
  const div = divulgacionActual()
  const md = []
  md.push('# Guion de voz · La Frontera')
  md.push('')
  md.push(...bloquePublicable(publicable, run))
  if (esDemo) {
    md.push('> [!WARNING]')
    md.push('> ## GENERADO CON DATOS DEMO')
    md.push('> **Vuelve a generarlo después de correr el benchmark real; los números cambiarán.**')
    md.push('> Pasos: `npm run benchmark` y luego `npm run guion`. Un video o una publicación con estos números')
    md.push('> NO se puede publicar: son simulados.')
    md.push('')
  }
  md.push(
    `Corrida: \`${rel(corrida.ruta)}\`${huella ? ` (sha256 \`${huella.slice(0, 8)}\`)` : ''} · fuente: **${esDemo ? 'demo (datos simulados)' : 'live (llamadas reales)'}** · ` +
      `fecha ${fechaCorta(run.createdAt)} · ${N} viajeros · presupuesto ${usd(est.presupuestoUSD)} y ${est.vidas} vidas ` +
      `${est.reglasRegistradas ? '(registrados en la corrida antes de correr)' : '(**la corrida no los registró**: se usan los de `shared/config.js`)'}`,
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
  if (!segmentos.some((s) => /modelos insignia/.test(s.texto))) {
    md.push(`> La aclaración «${FRASE_INSIGNIA}» no cupo en el ritmo de la voz: está en la pantalla del cierre y en el texto de LinkedIn.`)
    md.push('')
  }
  md.push('## Consejos para grabar')
  md.push('')
  md.push('- **Ritmo**: tono de creador de contenido, con energía pero claro. Cada tramo cabe leyéndolo a unas 2 o 2,5 palabras por segundo; el gancho es el más rápido.')
  md.push('- **Pausas**: respira entre tramos. Entre algunos tramos hay silencio a propósito (por ejemplo, cuando entra el avance rápido o la tabla de resultados).')
  md.push('- **Números**: léelos como están escritos («1.6 centavos» = «uno punto seis centavos»; «770 veces» = «setecientas setenta veces»). Los nombres: «GPT» (yi-pi-tí), «Opus», «Jev».')
  md.push('- **No cambies el texto**: cada frase se eligió porque es verdad con estos datos. Si quieres decirlo de otra forma, que siga diciendo lo mismo (y vuelve a mirar la tabla de resultados).')
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
  if (publicable.bloqueos.length) md.push(`**Hay ${publicable.bloqueos.length} ${publicable.bloqueos.length === 1 ? 'bloqueo' : 'bloqueos'} (arriba): este texto es solo para revisar. Vuelve a generarlo cuando no quede ninguno.**`, '')
  md.push('Revísalo y ajústalo a tu voz, sin quitar la divulgación (primera línea) ni «Lo que también hay que decir». Todos los números salen de la corrida.')
  md.push('')
  md.push('```text')
  md.push(textoPublicacion({ est, run, segmentos, publicable, archivo, huella }))
  md.push('```')
  md.push('')
  md.push('## Hashtags')
  md.push('')
  md.push(`${HASHTAGS} (si quieres, agrega #OpenAI #Anthropic #TypeSafe; con 3 a 5 hashtags basta en LinkedIn).`)
  md.push('')
  md.push('## Checklist antes de publicar')
  md.push('')
  md.push(
    `- [ ] **Sin bloqueos** de \`shared/publicable.js\`: ${publicable.bloqueos.length ? `quedan **${publicable.bloqueos.length}** (lista arriba de todo)` : 'ninguno'}. ` +
      'El render los muestra en consola y nombra los archivos `-NO-PUBLICAR` (o `-demo`) mientras exista alguno.',
  )
  md.push(`- [ ] **Corrida real**: el archivo debe decir \`"source": "live"\`. Esta dice **\`${run.source}\`**${esDemo ? ' → NO publicar; corre `npm run benchmark`, luego `npm run guion` y `npm run video`' : ''}.`)
  for (const p of run.proveedores) {
    const pr = p.precio ?? {}
    if (pr.verificado === false) {
      const url = urlDe(pr.fuente)
      md.push(
        `- [ ] **Precio de ${p.nombre} sin verificar** (entrada US$ ${pr.entradaPorMTok}, salida US$ ${pr.salidaPorMTok} por millón de tokens; fuente: ${sinVerificarEn(pr.fuente)}).` +
          ` Confírmalo${url ? ` en ${url}` : ' en la página oficial'}, corrígelo en \`shared/modelos.js\` con \`verificado: true\` y corre \`npm run recalcular\` (no hace falta repetir el benchmark).`,
      )
    }
  }
  const servidos = ps
    .map((p) => {
      const lista = modelosServidos(run, p)
      return `${p.nombre}: pedido \`${p.modelo}\`, servido ${lista.length ? lista.map((x) => `\`${x}\``).join(', ') : '(la API no lo informó)'}`
    })
    .join('; ')
  md.push(`- [ ] **Nombres exactos de los modelos** en el video, el texto y la descripción: ${servidos}.`)
  md.push(`- [ ] **Configuración realmente usada** (de cada llamada; debe coincidir con la declarada): ${run.proveedores.map((p) => `${p.nombre}: ${opcionesUsadasTexto(run, p)}`).join('; ')}.`)
  md.push(
    `- [ ] **Divulgación**: ${div ? `«${div}»` : '**VACÍA (bloquea la publicación)**'}. Debe decir tu relación real con TypeSafe (paga, créditos, trabajo o ninguna). ` +
      'Está en `PUBLICACION.divulgacion` de `shared/config.js`; va en la primera línea del texto de LinkedIn, en la voz y en pantalla.',
  )
  md.push(`- [ ] **Presupuesto y vidas sin tocar**: ${usd(est.presupuestoUSD)} y ${est.vidas} vidas ${est.reglasRegistradas ? 'registrados antes de correr' : '(**no registrados**)'}; no se cambian después de ver los resultados.`)
  const avisos = loQueHayQueDecir(est, run).filter((x) => /con error o sin resultado|se estimaron|no informó los tokens de salida|informó 0 tokens|respaldo/.test(x))
  md.push(`- [ ] **Avisos de la corrida** (errores de API, tokens estimados o no informados, modelo de respaldo): ${avisos.length ? avisos.join(' ') : 'ninguno.'}`)
  md.push('- [ ] **Mira el video completo** sin sonido: sin marca de agua (DEMO o NO PUBLICABLE), subtítulos legibles y sin tapar números, los tres formatos.')
  md.push('- [ ] **La voz coincide con la pantalla**: si cambiaste la corrida o la configuración, vuelve a generar este guion y el video (el texto se elige según los datos).')
  md.push(`- [ ] **Datos verificables**: sube \`public/runs/${archivo}\` al repositorio público; su sha256 (\`${huella ? huella.slice(0, 8) : '—'}…\`) es el que muestra el cierre del video.`)
  md.push(`- [ ] **El enlace del método funciona** y el repositorio es público: ${PUBLICACION.enlaceMetodo}`)
  md.push('- [ ] En LinkedIn, sube la versión **con subtítulos** (`-subs`): la mayoría lo ve sin sonido.')
  md.push('')
  md.push('## Lo que también hay que decir (según esta corrida)')
  md.push('')
  for (const x of loQueHayQueDecir(est, run)) md.push(`- ${x}`)
  for (const x of loQueSiempreHayQueDecir(est, run)) md.push(`- ${x}`)
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
  let publicable
  try {
    corrida = cargarCorrida(args.run ?? 'latest')
    est = estadisticasDe(corrida.run)
    publicable = publicableDe(corrida.run)
    segmentos = segmentosGuion(est)
  } catch (e) {
    salirConError(e.message)
  }
  if (corrida.cayoADemo) console.log('No hay public/runs/latest.json todavía: uso la corrida de demostración (demo.json).')
  const huella = createHash('sha256').update(readFileSync(corrida.ruta)).digest('hex')
  const rutaMd = join(RAIZ, 'GUION.md')
  const rutaSrt = join(CARPETA_OUT, 'subtitulos.srt')
  writeFileSync(rutaMd, generarMarkdown({ est, run: corrida.run, corrida, segmentos, publicable, huella }))
  mkdirSync(CARPETA_OUT, { recursive: true })
  const srt = generarSRT(segmentos)
  writeFileSync(rutaSrt, srt)

  const ritmoMax = Math.max(...segmentos.map(ritmoTramo))
  const palabras = segmentos.reduce((a, s) => a + contarPalabras(s.texto).habladas, 0)
  const nSubs = srt.trim().split(/\n\n+/).length
  console.log(`Corrida: ${rel(corrida.ruta)} (${corrida.run.source}, ${fechaCorta(corrida.run.createdAt)}, ${entero(est.totalViajeros)} viajeros, sha256 ${huella.slice(0, 8)})`)
  console.log(`Guion:   ${rel(rutaMd)} · ${segmentos.length} tramos · ${palabras} palabras · tramo más rápido ${ritmoMax.toFixed(2)} palabras/s (máximo ${RITMO_MAXIMO})`)
  console.log(`Subtítulos: ${rel(rutaSrt)} · ${nSubs} subtítulos`)
  const { bloqueos, avisos } = publicable
  if (bloqueos.length) {
    const lineas = [
      `NO PUBLICAR: ${bloqueos.length} ${bloqueos.length === 1 ? 'bloqueo' : 'bloqueos'} (shared/publicable.js). Detalle y cómo resolverlos, arriba de GUION.md.`,
      ...bloqueos.map((b, i) => `${i + 1}. ${b.texto}`),
    ]
    const ancho = Math.max(...lineas.map((l) => l.length)) + 2
    console.log(`\n${'!'.repeat(ancho + 4)}`)
    for (const l of lineas) console.log(`!! ${l.padEnd(ancho - 2)} !!`)
    console.log('!'.repeat(ancho + 4))
  } else console.log('\nSin bloqueos según shared/publicable.js. Revisa igual el checklist de GUION.md.')
  if (avisos.length) {
    console.log('Avisos (no bloquean; se dicen en pantalla y en el texto de LinkedIn):')
    for (const a of avisos) console.log(`  - ${a.texto}`)
  }
}

main()
