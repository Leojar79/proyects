#!/usr/bin/env node
// Render del video a MP4, cuadro a cuadro: la app (dist/) se abre en Chromium en modo render, se
// fija el tiempo de cada cuadro con window.__frontera.setTiempo(t), se captura en JPEG y se envía
// por una tubería a ffmpeg (H.264, sin audio). Mismo resultado en cualquier máquina: cada cuadro es
// una función pura del tiempo y de los datos.
//
// Uso:
//   node render/render.mjs [--formato vertical|feed|horizontal|todos] [--run latest|demo|<nombre>]
//                          [--subtitulos] [--fps 30] [--desde S] [--hasta S] [--calidad 18]
//                          [--fotogramas 1,15.5,60] [--sin-build] [--en-serie] [--trabajos N]
//
//   --formato      vertical (por defecto), feed, horizontal o todos (en paralelo, un navegador por formato).
//   --run          Corrida de public/runs/ (por defecto latest; si no existe, demo).
//   --subtitulos   Dibuja los subtítulos del guion (shared/guion.js) dentro del video.
//   --fps          Cuadros por segundo (por defecto 30).
//   --desde/--hasta  Solo un tramo, en segundos (para pruebas). El archivo lleva el sufijo -tramo-D-H.
//   --calidad      CRF de x264: menor es mejor (18 por defecto; 14-23 es razonable).
//   --fotogramas   Solo guarda PNG de esos segundos en out/fotogramas/ (no hace video).
//   --sin-build    No ejecuta "vite build" (usa el dist/ que ya existe).
//   --en-serie     Con --formato todos, uno después del otro en vez de en paralelo.
//   --trabajos N   Navegadores por formato (por defecto: 3 con un solo formato o con --en-serie;
//                  1 con "todos" en paralelo). Cada uno hace un trozo de cuadros y se unen sin recomprimir.
//
// Salida: out/la-frontera-<formato>[-subs][-demo|-NO-PUBLICAR].mp4
//
// ¿Se puede publicar? Lo decide shared/publicable.js (la app lo expone en window.__frontera.publicable).
// Con cualquier bloqueo, el video y los fotogramas llevan marca de agua, su nombre termina en -demo
// (datos simulados) o -NO-PUBLICAR (cualquier otro motivo), la consola lista los motivos y el
// proceso termina con código 1. El archivo se genera igual, para revisarlo.

import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { cpus } from 'node:os'
import { join } from 'node:path'

import { VIDEO } from '../shared/config.js'
import { DURACION } from '../shared/timeline.js'
import { CARPETA_OUT, CARPETA_RUNS, cargarCorrida, comoResolver, parsearArgs, RAIZ, rel, salirConError, sufijoPublicable } from './comun.mjs'

const FORMATOS = Object.keys(VIDEO.formatos)
const CHROMIUM_RESPALDO = '/opt/pw-browsers/chromium'
const DIST = join(RAIZ, 'dist')
const ES_TTY = process.stdout.isTTY

const AYUDA = `Uso: node render/render.mjs [--formato vertical|feed|horizontal|todos] [--run latest|demo|<nombre>]
                        [--subtitulos] [--fps 30] [--desde S] [--hasta S] [--calidad 18]
                        [--fotogramas 1,15.5,60] [--sin-build] [--en-serie] [--trabajos N]`

// ---------------------------------------------------------------------------
// Argumentos

function leerOpciones() {
  let a
  try {
    a = parsearArgs(process.argv.slice(2), {
      formato: 'texto',
      run: 'texto',
      subtitulos: 'bandera',
      fps: 'numero',
      desde: 'numero',
      hasta: 'numero',
      fotogramas: 'texto',
      'sin-build': 'bandera',
      calidad: 'numero',
      'en-serie': 'bandera',
      trabajos: 'numero',
      ayuda: 'bandera',
      help: 'bandera',
    })
  } catch (e) {
    salirConError(`${e.message}\n\n${AYUDA}`)
  }
  if (a.ayuda || a.help) {
    console.log(AYUDA)
    process.exit(0)
  }
  const formato = a.formato ?? 'vertical'
  if (formato !== 'todos' && !FORMATOS.includes(formato)) salirConError(`Formato no válido: "${formato}". Usa ${FORMATOS.join(', ')} o todos.`)
  const fps = a.fps ?? VIDEO.fps
  if (!Number.isInteger(fps) || fps < 1 || fps > 120) salirConError('--fps debe ser un entero entre 1 y 120.')
  const desde = a.desde ?? 0
  const hasta = a.hasta ?? DURACION
  if (desde < 0 || hasta > DURACION || desde >= hasta) salirConError(`--desde y --hasta deben cumplir 0 ≤ desde < hasta ≤ ${DURACION}.`)
  const calidad = a.calidad ?? 18
  if (!Number.isInteger(calidad) || calidad < 0 || calidad > 51) salirConError('--calidad (CRF) debe ser un entero entre 0 y 51.')
  if (a.trabajos !== undefined && (!Number.isInteger(a.trabajos) || a.trabajos < 1 || a.trabajos > 8)) {
    salirConError('--trabajos debe ser un entero entre 1 y 8.')
  }
  let fotogramas = null
  if (a.fotogramas !== undefined) {
    fotogramas = String(a.fotogramas)
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map(Number)
    if (!fotogramas.length || fotogramas.some((t) => !Number.isFinite(t) || t < 0 || t >= DURACION)) {
      salirConError(`--fotogramas debe ser una lista de segundos entre 0 y ${DURACION} (sin incluir ${DURACION}), por ejemplo 1,15.5,60.`)
    }
  }
  return {
    formatos: formato === 'todos' ? FORMATOS : [formato],
    run: a.run ?? 'latest',
    subs: Boolean(a.subtitulos),
    fps,
    desde,
    hasta,
    calidad,
    fotogramas,
    sinBuild: Boolean(a['sin-build']),
    enSerie: Boolean(a['en-serie']),
    esTramo: desde > 0 || hasta < DURACION,
    // Navegadores por formato. Con un solo formato se reparte en varios (cada uno hace un trozo
    // seguido de cuadros y al final se unen sin recomprimir); con "todos", uno por formato.
    trabajos: a.trabajos ?? (formato === 'todos' && !a['en-serie'] ? 1 : Math.max(1, Math.min(3, cpus().length - 1))),
  }
}

// ---------------------------------------------------------------------------
// Utilidades

const ahora = () => performance.now()

function duracionTexto(seg) {
  if (!Number.isFinite(seg)) return '—'
  const s = Math.max(0, Math.round(seg))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return `${m} min ${String(s % 60).padStart(2, '0')} s`
}

function numeroArchivo(x) {
  return String(Math.round(x * 1000) / 1000)
}

function puertoLibre() {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

function verificarHerramientas() {
  for (const bin of ['ffmpeg', 'ffprobe']) {
    const r = spawnSync(bin, ['-version'], { encoding: 'utf8' })
    if (r.error || r.status !== 0) salirConError(`No encontré ${bin}. Instálalo (por ejemplo, "sudo apt install ffmpeg") y vuelve a intentar.`)
  }
}

function archivosMasNuevos(dir, limite) {
  if (!existsSync(dir)) return []
  const out = []
  for (const f of readdirSync(dir, { recursive: true })) {
    const ruta = join(dir, String(f))
    try {
      const st = statSync(ruta)
      if (st.isFile() && st.mtimeMs > limite) out.push(ruta)
    } catch {
      /* archivo que desapareció mientras se listaba */
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Build y servidor

async function construir(sinBuild) {
  const vite = await import('vite')
  const indice = join(DIST, 'index.html')
  if (sinBuild) {
    if (!existsSync(indice)) salirConError('No existe dist/index.html. Quita --sin-build para construir la app primero.')
    const limite = statSync(indice).mtimeMs
    const nuevos = [
      ...archivosMasNuevos(join(RAIZ, 'src'), limite),
      ...archivosMasNuevos(join(RAIZ, 'shared'), limite),
      ...archivosMasNuevos(join(RAIZ, 'data'), limite),
    ]
    if (nuevos.length) {
      console.warn(
        `Aviso: --sin-build, pero ${nuevos.length} archivo(s) cambiaron después del último build ` +
          `(por ejemplo ${rel(nuevos[0])}). El video usará la versión anterior de la app; quita --sin-build para incluirlos.`,
      )
    }
  } else {
    const t0 = ahora()
    process.stdout.write('Construyendo la app (vite build)... ')
    await vite.build({ root: RAIZ, logLevel: 'error', configFile: join(RAIZ, 'vite.config.js') })
    console.log(`listo en ${duracionTexto((ahora() - t0) / 1000)}.`)
  }
  // Las corridas se copian siempre: así una corrida nueva del benchmark se usa aunque no haya build.
  if (existsSync(CARPETA_RUNS)) cpSync(CARPETA_RUNS, join(DIST, 'runs'), { recursive: true, filter: (f) => !f.endsWith('.tmp') })
  return vite
}

async function servir(vite) {
  const port = await puertoLibre()
  const servidor = await vite.preview({
    root: RAIZ,
    configFile: join(RAIZ, 'vite.config.js'),
    logLevel: 'silent',
    preview: { port, strictPort: true, host: '127.0.0.1', open: false },
  })
  return { servidor, url: `http://127.0.0.1:${port}/` }
}

// ---------------------------------------------------------------------------
// Navegador

async function lanzarNavegador() {
  const { chromium } = await import('playwright')
  const args = ['--disable-dev-shm-usage', '--hide-scrollbars', '--mute-audio']
  try {
    return await chromium.launch({ args })
  } catch (e) {
    if (!existsSync(CHROMIUM_RESPALDO)) throw e
    try {
      return await chromium.launch({ args, executablePath: CHROMIUM_RESPALDO })
    } catch (e2) {
      throw new Error(`No pude abrir Chromium.\n  Playwright: ${e.message.split('\n')[0]}\n  ${CHROMIUM_RESPALDO}: ${e2.message.split('\n')[0]}`)
    }
  }
}

// Abre la app en modo render y espera a que esté lista. Devuelve { page, cdp, info, errores }.
async function abrirApp(navegador, url, formato, opciones) {
  const { ancho, alto } = VIDEO.formatos[formato]
  const page = await navegador.newPage({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1 })
  const errores = []
  page.on('pageerror', (e) => errores.push(`error de la página: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(`consola: ${m.text()}`)
  })
  const params = new URLSearchParams({ render: '1', formato, run: opciones.run })
  if (opciones.subs) params.set('subs', '1')
  await page.goto(`${url}?${params}`, { waitUntil: 'load', timeout: 60_000 })
  try {
    await page.waitForFunction(() => window.__frontera && (window.__frontera.listo || window.__frontera.error), null, {
      timeout: 60_000,
      polling: 50,
    })
  } catch {
    throw new Error(
      `[${formato}] La app no quedó lista en 60 s (window.__frontera.listo sigue en false).` +
        (errores.length ? `\n  ${errores.slice(0, 5).join('\n  ')}` : ''),
    )
  }
  const info = await page.evaluate(async () => {
    await document.fonts.ready
    const f = window.__frontera
    return {
      listo: f.listo,
      error: f.error,
      esDemo: f.esDemo,
      publicable: f.publicable,
      corrida: f.corrida,
      archivo: f.archivo,
      sha256: f.sha256,
      duracion: f.duracion,
      fps: f.fps,
    }
  })
  if (info.error || !info.listo) {
    throw new Error(`[${formato}] La app no pudo cargar la corrida "${opciones.run}": ${info.error ?? 'error desconocido'}`)
  }
  if (!info.publicable || !Array.isArray(info.publicable.bloqueos)) {
    throw new Error(
      `[${formato}] La app no informó si la corrida se puede publicar (window.__frontera.publicable). ` +
        'Reconstruye la app (quita --sin-build).',
    )
  }
  if (Math.abs(info.duracion - DURACION) > 1e-9) {
    throw new Error(`[${formato}] La app dura ${info.duracion} s y shared/timeline.js dice ${DURACION} s: reconstruye la app (sin --sin-build).`)
  }
  const cdp = await page.context().newCDPSession(page)
  return { page, cdp, info, errores }
}

async function fijarTiempo(page, t) {
  await page.evaluate((x) => window.__frontera.setTiempo(x), t)
}

async function capturarJPEG(cdp) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95, captureBeyondViewport: false })
  return Buffer.from(data, 'base64')
}

// ---------------------------------------------------------------------------
// ffmpeg

function argumentosFfmpeg(fps, calidad, salida) {
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-f', 'image2pipe',
    '-framerate', String(fps),
    '-c:v', 'mjpeg',
    '-i', '-',
    // Chromium entrega JPEG en BT.601 de rango completo; el MP4 va en BT.709 de rango limitado y
    // etiquetado, para que los colores se vean igual en LinkedIn, Instagram, TikTok y YouTube.
    // (Mismos primarios y curva: solo cambian la matriz y el rango; el filtro colorspace es exacto y rápido.)
    '-vf', 'colorspace=ispace=bt470bg:irange=pc:iprimaries=bt709:itrc=bt709:space=bt709:range=tv:primaries=bt709:trc=bt709:format=yuv420p',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', String(calidad),
    '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709',
    '-color_primaries', 'bt709',
    '-color_trc', 'bt709',
    '-color_range', 'tv',
    '-movflags', '+faststart',
    '-an',
    '-f', 'mp4',
    salida,
  ]
}

function abrirFfmpeg(fps, calidad, salida) {
  const proc = spawn('ffmpeg', argumentosFfmpeg(fps, calidad, salida), { stdio: ['pipe', 'ignore', 'pipe'] })
  let stderr = ''
  proc.stderr.on('data', (d) => {
    stderr = (stderr + d).slice(-4000)
  })
  const fin = new Promise((resolve) => {
    proc.on('close', (code, signal) => resolve({ code, signal }))
    proc.on('error', (e) => resolve({ code: -1, signal: null, error: e }))
  })
  // Un EPIPE al escribir significa que ffmpeg se cerró: el error real se informa con su stderr.
  proc.stdin.on('error', () => {})
  return { proc, fin, stderr: () => stderr.trim() }
}

async function escribir(ff, buffer) {
  if (ff.proc.exitCode !== null || ff.proc.stdin.destroyed) {
    throw new Error(`ffmpeg se cerró antes de tiempo:\n${ff.stderr() || '(sin mensaje)'}`)
  }
  if (!ff.proc.stdin.write(buffer)) {
    const r = await Promise.race([once(ff.proc.stdin, 'drain').then(() => 'drain'), ff.fin.then(() => 'cerrado')])
    if (r === 'cerrado') throw new Error(`ffmpeg se cerró antes de tiempo:\n${ff.stderr() || '(sin mensaje)'}`)
  }
}

function sondear(ruta) {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-count_packets',
      '-show_entries', 'stream=codec_name,width,height,r_frame_rate,pix_fmt,nb_read_packets,color_space',
      '-show_entries', 'format=duration,size', '-of', 'json', ruta],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`ffprobe no pudo leer ${rel(ruta)}: ${r.stderr}`)
  const j = JSON.parse(r.stdout)
  const s = j.streams?.[0] ?? {}
  const [num, den] = String(s.r_frame_rate ?? '0/1').split('/').map(Number)
  return {
    codec: s.codec_name,
    ancho: s.width,
    alto: s.height,
    fps: den ? num / den : 0,
    pixFmt: s.pix_fmt,
    cuadros: Number(s.nb_read_packets),
    espacioColor: s.color_space,
    duracion: Number(j.format?.duration),
    bytes: Number(j.format?.size),
  }
}

// ---------------------------------------------------------------------------
// Progreso (una línea por formato)

function crearProgreso(trabajos) {
  const estado = new Map(trabajos.map((t) => [t.formato, { hechos: 0, total: t.total, t0: null, fin: null }]))
  let ultimaLinea = 0
  const linea = () =>
    [...estado]
      .map(([f, e]) => {
        if (e.fin) return `${f}: listo`
        if (!e.t0 || !e.hechos) return `${f}: preparando`
        const seg = (ahora() - e.t0) / 1000
        const velocidad = e.hechos / seg
        const faltan = (e.total - e.hechos) / velocidad
        return `${f}: ${e.hechos}/${e.total} cuadros (${Math.floor((100 * e.hechos) / e.total)} %, ${velocidad.toFixed(1)}/s, faltan ~${duracionTexto(faltan)})`
      })
      .join(' · ')
  // En una terminal interactiva, una línea corta que se reescribe (sin saltos de línea).
  const lineaCorta = () => {
    const partes = [...estado].map(([f, e]) => `${f} ${e.fin ? 'listo' : `${Math.floor((100 * e.hechos) / e.total)} %`}`)
    const activos = [...estado.values()].filter((e) => e.t0 && e.hechos && !e.fin)
    const faltan = Math.max(0, ...activos.map((e) => (e.total - e.hechos) / (e.hechos / ((ahora() - e.t0) / 1000))))
    const vel = activos.reduce((a, e) => a + e.hechos / ((ahora() - e.t0) / 1000), 0)
    const extra = activos.length ? ` · ${vel.toFixed(1)} cuadros/s · faltan ~${duracionTexto(faltan)}` : ''
    return `${partes.join(' · ')}${extra}`.slice(0, Math.max(20, (process.stdout.columns || 100) - 1))
  }
  const imprimir = (forzar = false) => {
    const t = ahora()
    if (ES_TTY) {
      process.stdout.write(`\r\x1b[K${lineaCorta()}`)
    } else if (forzar || t - ultimaLinea > 10_000) {
      console.log(linea())
      ultimaLinea = t
    }
  }
  const timer = setInterval(() => imprimir(), ES_TTY ? 500 : 2000)
  return {
    empezar: (f) => (estado.get(f).t0 = ahora()),
    avanzar: (f, n) => (estado.get(f).hechos = n),
    terminar: (f) => {
      estado.get(f).fin = ahora()
      imprimir(true)
    },
    cerrar: () => {
      clearInterval(timer)
      if (ES_TTY) process.stdout.write('\n')
    },
  }
}

// ---------------------------------------------------------------------------
// Trabajos

function nombreSalida(formato, opciones, info) {
  let n = `la-frontera-${formato}`
  if (opciones.subs) n += '-subs'
  n += sufijoPublicable(info.publicable)
  if (opciones.esTramo) n += `-tramo-${numeroArchivo(opciones.desde)}-${numeroArchivo(opciones.hasta)}`
  return join(CARPETA_OUT, `${n}.mp4`)
}

// Un trozo de cuadros [desde, hasta) en su propio navegador y su propio ffmpeg.
async function renderTrozo(formato, contexto, opciones, desde, hasta, salida, avanzar, limpieza) {
  const navegador = await lanzarNavegador()
  limpieza.add(() => navegador.close().catch(() => {}))
  const { page, cdp, info, errores } = await abrirApp(navegador, contexto.url, formato, opciones)
  const ff = abrirFfmpeg(opciones.fps, opciones.calidad, salida)
  limpieza.add(() => {
    if (ff.proc.exitCode === null) ff.proc.kill('SIGKILL')
  })
  for (let i = desde; i < hasta; i++) {
    if (contexto.detener) throw new Error(contexto.cancelado ? 'cancelado' : 'detenido porque otro trabajo falló')
    await fijarTiempo(page, opciones.desde + i / opciones.fps)
    await escribir(ff, await capturarJPEG(cdp))
    avanzar()
  }
  ff.proc.stdin.end()
  const { code, signal, error } = await ff.fin
  if (code !== 0) throw new Error(`[${formato}] ffmpeg terminó con error (${error?.message ?? signal ?? `código ${code}`}):\n${ff.stderr()}`)
  await navegador.close()
  return { info, errores }
}

// Une los trozos sin recomprimir (mismo códec y parámetros).
function unirTrozos(trozos, salida) {
  const lista = salida.replace(/\.mp4$/, '.lista.txt')
  writeFileSync(lista, trozos.map((t) => `file '${t.replace(/'/g, "'\\''")}'`).join('\n') + '\n')
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', salida], {
    encoding: 'utf8',
  })
  rmSync(lista, { force: true })
  if (r.status !== 0) throw new Error(`ffmpeg no pudo unir los trozos:\n${r.stderr}`)
}

async function renderVideo(formato, contexto, opciones, progreso, limpieza) {
  const total = Math.round((opciones.hasta - opciones.desde) * opciones.fps)
  const n = Math.max(1, Math.min(opciones.trabajos, Math.floor(total / 30) || 1))
  // El nombre depende de si la corrida es demo: se sabe al abrir la app, así que los trozos van a
  // nombres provisionales y el archivo final se nombra al terminar.
  const base = join(CARPETA_OUT, `.render-${formato}-${process.pid}`)
  const trozos = Array.from({ length: n }, (_, k) => ({
    desde: Math.round((k * total) / n),
    hasta: Math.round(((k + 1) * total) / n),
    ruta: n === 1 ? `${base}.parcial.mp4` : `${base}.trozo${k}.mp4`,
  }))
  limpieza.add(() => trozos.forEach((t) => rmSync(t.ruta, { force: true })))
  let hechos = 0
  const avanzar = () => progreso.avanzar(formato, ++hechos)
  const t0 = ahora()
  progreso.empezar(formato)
  const res = await Promise.all(
    trozos.map((t) =>
      renderTrozo(formato, contexto, opciones, t.desde, t.hasta, t.ruta, avanzar, limpieza).catch((e) => {
        contexto.detener = true
        throw e
      }),
    ),
  )
  const info = res[0].info
  const firma = (x) => JSON.stringify([x.corrida, x.sha256, x.publicable])
  if (res.some((r) => firma(r.info) !== firma(info))) {
    throw new Error(`[${formato}] Los navegadores cargaron corridas distintas; vuelve a intentar.`)
  }
  const salida = nombreSalida(formato, opciones, info)
  if (n === 1) renameSync(trozos[0].ruta, salida)
  else {
    const parcial = `${base}.parcial.mp4`
    limpieza.add(() => rmSync(parcial, { force: true }))
    unirTrozos(trozos.map((t) => t.ruta), parcial)
    renameSync(parcial, salida)
    for (const t of trozos) rmSync(t.ruta, { force: true })
  }
  progreso.terminar(formato)
  return { formato, salida, total, trabajos: n, segundos: (ahora() - t0) / 1000, info, errores: res.flatMap((r) => r.errores) }
}

async function renderFotogramas(formato, contexto, opciones, limpieza) {
  const navegador = await lanzarNavegador()
  limpieza.add(() => navegador.close().catch(() => {}))
  const { page, info, errores } = await abrirApp(navegador, contexto.url, formato, opciones)
  const carpeta = join(CARPETA_OUT, 'fotogramas')
  mkdirSync(carpeta, { recursive: true })
  const rutas = []
  for (const t of opciones.fotogramas) {
    await fijarTiempo(page, t)
    const ruta = join(carpeta, `${formato}-${numeroArchivo(t)}${opciones.subs ? '-subs' : ''}${sufijoPublicable(info.publicable)}.png`)
    await page.screenshot({ path: ruta, type: 'png' })
    rutas.push(ruta)
  }
  await navegador.close()
  return { formato, rutas, info, errores }
}

// Aviso grande en consola con TODOS los bloqueos (y avisos) de shared/publicable.js.
// Devuelve true si hay bloqueos (el proceso debe terminar con código 1).
function avisoNoPublicable(infos, corrida, queSalio) {
  const publicable = infos[0]?.publicable ?? { bloqueos: [], avisos: [] }
  const { bloqueos, avisos } = publicable
  if (!bloqueos.length) {
    console.log('\nSin bloqueos según shared/publicable.js: se puede publicar (revisa igual el checklist de GUION.md).')
    if (avisos.length) {
      console.log('Avisos (no bloquean; la pantalla y el texto de LinkedIn los dicen):')
      for (const a of avisos) console.log(`  - ${a.texto}`)
    }
    return false
  }
  const sufijo = sufijoPublicable(publicable)
  const lineas = [
    `NO PUBLICAR: ${bloqueos.length} ${bloqueos.length === 1 ? 'bloqueo' : 'bloqueos'} (shared/publicable.js).`,
    `${queSalio} marca de agua y el sufijo "${sufijo}" en el nombre. Se generaron igual, solo para revisar.`,
    '',
    ...bloqueos.flatMap((b, i) => [`${i + 1}. ${b.texto}`, `   Cómo resolverlo: ${comoResolver(b, corrida.run)}`]),
  ]
  if (avisos.length) lineas.push('', 'Avisos (no bloquean):', ...avisos.map((a) => `  - ${a.texto}`))
  const ancho = Math.min(110, Math.max(...lineas.map((l) => l.length)) + 2)
  const partir = (l) => {
    const out = []
    let resto = l
    while (resto.length > ancho - 2) {
      let k = resto.lastIndexOf(' ', ancho - 2)
      if (k <= 0) k = ancho - 2
      out.push(resto.slice(0, k))
      resto = '      ' + resto.slice(k).trimStart()
    }
    out.push(resto)
    return out
  }
  console.log(`\n${'!'.repeat(ancho + 4)}`)
  for (const l of lineas.flatMap(partir)) console.log(`!! ${l.padEnd(ancho - 2)} !!`)
  console.log(`${'!'.repeat(ancho + 4)}\n`)
  return true
}

// ---------------------------------------------------------------------------

async function main() {
  const opciones = leerOpciones()
  verificarHerramientas()
  let corrida
  try {
    corrida = cargarCorrida(opciones.run)
  } catch (e) {
    salirConError(e.message)
  }
  if (corrida.cayoADemo) console.log('No hay public/runs/latest.json todavía: se usa la corrida de demostración (demo.json).')
  mkdirSync(CARPETA_OUT, { recursive: true })

  const limpieza = new Set()
  const contexto = { url: null, cancelado: false, detener: false }
  const limpiar = async () => {
    for (const f of [...limpieza].reverse()) await f()
    limpieza.clear()
  }
  process.on('SIGINT', () => {
    if (contexto.cancelado) process.exit(130)
    contexto.cancelado = true
    contexto.detener = true
    console.log('\nCancelando (Ctrl+C otra vez para salir de inmediato)...')
  })

  const t0 = ahora()
  try {
    const vite = await construir(opciones.sinBuild)
    const { servidor, url } = await servir(vite)
    limpieza.add(() => servidor.close().catch(() => {}))
    contexto.url = url

    if (opciones.fotogramas) {
      const resultados = await Promise.all(opciones.formatos.map((f) => renderFotogramas(f, contexto, opciones, limpieza)))
      for (const r of resultados) {
        const sufijo = sufijoPublicable(r.info.publicable)
        console.log(`[${r.formato}] ${r.rutas.length} fotogramas (corrida ${r.info.corrida}${sufijo ? `, ${sufijo.slice(1)}` : ''}):`)
        for (const ruta of r.rutas) console.log(`  ${rel(ruta)}`)
        for (const e of r.errores) console.warn(`  Aviso: ${e}`)
      }
      if (avisoNoPublicable(resultados.map((r) => r.info), corrida, 'Estos fotogramas llevan')) process.exitCode = 1
      return
    }

    const total = Math.round((opciones.hasta - opciones.desde) * opciones.fps)
    console.log(
      `Render: ${opciones.formatos.join(', ')} · corrida ${corrida.nombre} · ${opciones.desde}-${opciones.hasta} s · ` +
        `${opciones.fps} cuadros/s (${total} cuadros por formato) · CRF ${opciones.calidad}${opciones.subs ? ' · con subtítulos' : ''}` +
        `${opciones.formatos.length > 1 ? (opciones.enSerie ? ' · en serie' : ' · en paralelo') : ''} · ${opciones.trabajos} navegador(es) por formato`,
    )
    const progreso = crearProgreso(opciones.formatos.map((formato) => ({ formato, total })))
    let resultados
    try {
      if (opciones.enSerie) {
        resultados = []
        for (const f of opciones.formatos) resultados.push(await renderVideo(f, contexto, opciones, progreso, limpieza))
      } else {
        resultados = await Promise.all(
          opciones.formatos.map((f) =>
            renderVideo(f, contexto, opciones, progreso, limpieza).catch((e) => {
              contexto.detener = true
              throw e
            }),
          ),
        )
      }
    } finally {
      progreso.cerrar()
    }

    console.log('')
    let todoBien = true
    for (const r of resultados) {
      const { ancho, alto } = VIDEO.formatos[r.formato]
      const p = sondear(r.salida)
      const esperado = r.total / opciones.fps
      const problemas = []
      if (p.ancho !== ancho || p.alto !== alto) problemas.push(`resolución ${p.ancho}x${p.alto} (se esperaba ${ancho}x${alto})`)
      if (Math.abs(p.fps - opciones.fps) > 1e-6) problemas.push(`${p.fps} cuadros/s (se esperaba ${opciones.fps})`)
      if (p.cuadros !== r.total) problemas.push(`${p.cuadros} cuadros (se esperaban ${r.total})`)
      if (Math.abs(p.duracion - esperado) > 1 / opciones.fps + 1e-3) problemas.push(`duración ${p.duracion} s (se esperaba ${esperado} s)`)
      if (problemas.length) todoBien = false
      console.log(
        `[${r.formato}] ${problemas.length ? 'REVISAR' : 'OK'}: ${rel(r.salida)} · ${p.ancho}x${p.alto} · ${p.fps} cuadros/s · ` +
          `${p.cuadros} cuadros · ${p.duracion.toFixed(3)} s · ${p.codec} ${p.pixFmt} · ${(p.bytes / 1e6).toFixed(1)} MB · ` +
          `render en ${duracionTexto(r.segundos)} (${(r.total / r.segundos).toFixed(1)} cuadros/s, ${r.trabajos} ${r.trabajos === 1 ? 'navegador' : 'navegadores'})` +
          (problemas.length ? `\n  Problemas: ${problemas.join('; ')}` : ''),
      )
      for (const e of r.errores.slice(0, 5)) console.warn(`  Aviso de la app: ${e}`)
    }
    console.log(`\nTiempo total: ${duracionTexto((ahora() - t0) / 1000)}`)
    const bloqueado = avisoNoPublicable(resultados.map((r) => r.info), corrida, resultados.length > 1 ? 'Estos videos llevan' : 'Este video lleva')
    if (!todoBien || bloqueado) process.exitCode = 1
  } catch (e) {
    if (contexto.cancelado) {
      console.error('\nRender cancelado; se borraron los archivos parciales.')
      process.exitCode = 130
    } else {
      console.error(`\nERROR: ${e.message}\n`)
      process.exitCode = 1
    }
  } finally {
    await limpiar()
  }
}

main()
