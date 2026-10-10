#!/usr/bin/env node
// Valida data/viajeros.json: esquema, fechas, coherencia de textos y, sobre todo, que la
// respuesta correcta (verdad) se deduzca SIN AMBIGÜEDAD de las 6 reglas.
//
// La verdad se recalcula con una implementación independiente de la tabla de decisión, a
// partir de campos estructurados (nunca interpretando lenguaje natural):
//   - del "documento": nacionalidad, fecha de vencimiento, tipo de permiso y nombre del permiso;
//   - del campo "claves" de cada viajero (solo para validar; las IAs NO lo reciben):
//       buscado                 su nombre (pasaporte o lo que dice) está en la lista de buscados
//       armas                   la inspección encontró armas sin declarar
//       contrabandoNoDeclarado  la inspección encontró mercancía sin declarar
//       contradiccionMenor      la inspección encontró un objeto personal sin declarar y sin
//                               valor comercial, y el viajero había dicho que no traía nada más
//       motivoDicho             motivo que expresa el viajero: un tipo de permiso, "regreso"
//                               (ciudadano que vuelve) o null (no dice motivo)
//       otraMentira             null, o la mentira que dice además de las anteriores
//
// Tabla de decisión (en orden de prioridad):
//   a) arrestar   (peligro 4 si hay armas, si no 3): buscado, permiso a nombre distinto (falso),
//                 armas o contrabando sin declarar.
//   b) rechazar   (peligro 1 si miente, si no 0): pasaporte vencido, extranjero sin permiso.
//   c) interrogar (peligro 2 si el motivo no coincide con el permiso, si no 1): motivo distinto
//                 al permiso (regla 3) o contradicción menor.
//   d) aprobar    (peligro 0): todo en regla.
// miente = lo que dice contradice documentos o inspección: armas, contrabando o contradicción
//          menor (el viajero siempre lo niega), permiso falso (afirma que es suyo), motivo
//          distinto al permiso, u otraMentira.
//
// Uso:
//   node scripts/validar-viajeros.mjs                 valida e imprime la tabla resumen
//   node scripts/validar-viajeros.mjs --ver           además imprime lo que ve cada IA
//   node scripts/validar-viajeros.mjs --ver v02,v17   solo esos viajeros
//   node scripts/validar-viajeros.mjs --archivo otra/ruta.json
// Sale con código 1 si hay errores.

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACCIONES, BUSCADOS, FECHA_PUESTO, NIVELES_PELIGRO, PAIS, textoEstado } from '../shared/preguntas.js'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ---------------------------------------------------------------- parámetros de la línea de comandos

const args = process.argv.slice(2)
function valorArg(nombre) {
  const i = args.indexOf(nombre)
  if (i === -1) return undefined
  const sig = args[i + 1]
  return sig && !sig.startsWith('--') ? sig : true
}
const argArchivo = valorArg('--archivo')
const RUTA = typeof argArchivo === 'string' ? resolve(argArchivo) : join(RAIZ, 'data', 'viajeros.json')
const argVer = valorArg('--ver')
const VER = argVer === undefined ? null : argVer === true ? 'todos' : new Set(argVer.split(','))

// ---------------------------------------------------------------- constantes del contrato

const TOTAL_ESPERADO = 60
const TIPOS_PERMISO = ['turismo', 'trabajo', 'visita familiar', 'estudios', 'tránsito']
const DIFICULTADES = ['facil', 'media', 'dificil']
const NACIONALIDADES_EXTRANJERAS = ['Brenia', 'Ludovia', 'Marelia', 'Esterlia', 'Galvonia', 'Orsenia']
// Nombres del juego Papers, Please y otros que no deben aparecer.
const PROHIBIDOS = ['Arstotzka', 'Kolechia', 'Antegria', 'Impor', 'Obristan', 'Republia', 'Ostrava']

const DISTRIBUCION_ACCION = { aprobar: 24, rechazar: 13, interrogar: 10, arrestar: 13 }
const TOLERANCIA_ACCION = 3
const DISTRIBUCION_DIFICULTAD = { facil: 0.4, media: 0.4, dificil: 0.2 }
const TOLERANCIA_DIFICULTAD = 0.08
const RACHA_MAXIMA = 3
const MAX_PALABRAS_DICE = 25

const CLAVES_VIAJERO = ['id', 'nombre', 'semilla', 'documento', 'dice', 'verdad', 'porque', 'dificultad', 'claves']
const CLAVES_DOCUMENTO = ['nombre', 'nacionalidad', 'vence', 'permiso', 'permisoNombre', 'equipajeDeclarado', 'inspeccion']
const CLAVES_VERDAD = ['pasa', 'miente', 'peligro', 'accion']
const CLAVES_BANDERAS = ['buscado', 'armas', 'contrabandoNoDeclarado', 'contradiccionMenor']
const CLAVES_CLAVES = [...CLAVES_BANDERAS, 'motivoDicho', 'otraMentira']

const PALABRAS_ARMA = [
  'arma', 'armas', 'pistola', 'pistolas', 'revólver', 'revolver', 'rifle', 'rifles', 'escopeta', 'fusil',
  'munición', 'municiones', 'bala', 'balas', 'granada', 'granadas', 'cuchillo', 'cuchillos', 'navaja', 'puñal',
]
const RE_SIN_DECLARAR = /sin declarar|no declarad/i
const RE_SIN_VALOR = /sin valor comercial/i
const RE_LIMPIA = /Nada irregular\./

// ---------------------------------------------------------------- utilidades

const errores = []
const avisos = []
const error = (id, msg) => errores.push(`${id}: ${msg}`)
const aviso = (id, msg) => avisos.push(`${id}: ${msg}`)

// Fecha DD/MM/AAAA -> número AAAAMMDD (comparable), o null si no es una fecha real.
function fecha(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto ?? '')
  if (!m) return null
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const f = new Date(Date.UTC(a, mes - 1, d))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) return null
  return a * 10000 + mes * 100 + d
}

const HOY = fecha(FECHA_PUESTO)

// ¿Aparece `palabra` como palabra completa (sin letras pegadas) dentro de `texto`?
function contienePalabra(texto, palabra) {
  const esc = palabra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<!\\p{L})${esc}(?!\\p{L})`, 'iu').test(texto ?? '')
}

const contarPalabras = (t) => t.trim().split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p)).length
const contarOraciones = (t) => (t.match(/[.!?…]+(?=\s|$)/g) ?? []).length
const esTextoNoVacio = (x) => typeof x === 'string' && x.trim() !== '' && x === x.trim()

// ---------------------------------------------------------------- tabla de decisión independiente

function decidir(v) {
  const d = v.documento
  const c = v.claves
  const ciudadano = d.nacionalidad === PAIS
  const tienePermiso = TIPOS_PERMISO.includes(d.permiso)
  const vencido = fecha(d.vence) < HOY
  const permisoFalso = tienePermiso && d.permisoNombre !== d.nombre
  const sinPermiso = !ciudadano && d.permiso === 'ninguno'
  const motivoNoCoincide = tienePermiso && c.motivoDicho !== null && c.motivoDicho !== d.permiso

  const causas = { arrestar: [], rechazar: [], interrogar: [] }
  if (c.buscado) causas.arrestar.push('buscado (r5)')
  if (permisoFalso) causas.arrestar.push('permiso falso (r6)')
  if (c.armas) causas.arrestar.push('armas (r4)')
  if (c.contrabandoNoDeclarado) causas.arrestar.push('contrabando (r4)')
  if (vencido) causas.rechazar.push('vencido (r1)')
  if (sinPermiso) causas.rechazar.push('sin permiso (r2)')
  if (motivoNoCoincide) causas.interrogar.push(`motivo ${c.motivoDicho} ≠ permiso (r3)`)
  if (c.contradiccionMenor) causas.interrogar.push('contradicción menor')

  const accion = causas.arrestar.length
    ? 'arrestar'
    : causas.rechazar.length
      ? 'rechazar'
      : causas.interrogar.length
        ? 'interrogar'
        : 'aprobar'

  const miente = Boolean(
    c.armas || c.contrabandoNoDeclarado || c.contradiccionMenor || permisoFalso || motivoNoCoincide || c.otraMentira,
  )

  let peligro = 0
  if (accion === 'arrestar') peligro = c.armas ? 4 : 3
  else if (accion === 'rechazar') peligro = miente ? 1 : 0
  else if (accion === 'interrogar') peligro = motivoNoCoincide ? 2 : 1

  const causa = causas[accion]?.join(' + ') || 'todo en regla'
  return {
    verdad: { pasa: accion === 'aprobar', miente, peligro, accion },
    causa,
    causas,
    hechos: { ciudadano, tienePermiso, vencido, permisoFalso, sinPermiso, motivoNoCoincide },
  }
}

// ---------------------------------------------------------------- lectura

let crudo
let datos
try {
  crudo = readFileSync(RUTA, 'utf8')
  datos = JSON.parse(crudo)
} catch (e) {
  console.error(`ERROR: no pude leer ${RUTA}: ${e.message}`)
  process.exit(1)
}

if (datos.version !== 1) error('archivo', `"version" debe ser 1 (es ${JSON.stringify(datos.version)})`)
for (const k of Object.keys(datos)) {
  if (!['version', 'viajeros'].includes(k)) error('archivo', `campo de primer nivel inesperado: "${k}"`)
}
const viajeros = Array.isArray(datos.viajeros) ? datos.viajeros : []
if (!Array.isArray(datos.viajeros)) error('archivo', '"viajeros" debe ser una lista')
if (viajeros.length !== TOTAL_ESPERADO) error('archivo', `hay ${viajeros.length} viajeros; se esperan ${TOTAL_ESPERADO}`)

for (const nombre of PROHIBIDOS) {
  if (contienePalabra(crudo, nombre)) error('archivo', `aparece el nombre prohibido "${nombre}"`)
}

// ---------------------------------------------------------------- validación por viajero

const ids = new Set()
const semillas = new Set()
const nombres = new Set()
const filas = []

viajeros.forEach((v, i) => {
  const idEsperado = `v${String(i + 1).padStart(2, '0')}`
  const id = v?.id ?? idEsperado
  if (v?.id !== idEsperado) error(id, `id fuera de orden: se esperaba ${idEsperado}`)
  if (ids.has(id)) error(id, 'id repetido')
  ids.add(id)

  // --- esquema de primer nivel
  for (const k of Object.keys(v)) if (!CLAVES_VIAJERO.includes(k)) error(id, `campo inesperado "${k}"`)
  for (const k of CLAVES_VIAJERO) if (!(k in v)) error(id, `falta el campo "${k}"`)
  if (!esTextoNoVacio(v.nombre)) error(id, '"nombre" debe ser texto no vacío y sin espacios sobrantes')
  if (nombres.has(v.nombre)) error(id, `nombre repetido: ${v.nombre}`)
  nombres.add(v.nombre)
  if (!Number.isSafeInteger(v.semilla) || v.semilla < 0) error(id, '"semilla" debe ser un entero no negativo')
  if (semillas.has(v.semilla)) error(id, `semilla repetida: ${v.semilla}`)
  semillas.add(v.semilla)
  if (!DIFICULTADES.includes(v.dificultad)) error(id, `dificultad inválida: ${v.dificultad}`)

  // --- documento
  const d = v.documento
  if (!d || typeof d !== 'object') {
    error(id, 'falta "documento"')
    return
  }
  for (const k of Object.keys(d)) if (!CLAVES_DOCUMENTO.includes(k)) error(id, `documento: campo inesperado "${k}"`)
  for (const k of ['nombre', 'nacionalidad', 'vence', 'equipajeDeclarado', 'inspeccion']) {
    if (!esTextoNoVacio(d[k])) error(id, `documento.${k} debe ser texto no vacío y sin espacios sobrantes`)
  }
  if (v.nombre !== d.nombre) error(id, `"nombre" (${v.nombre}) no coincide con documento.nombre (${d.nombre})`)
  const ciudadano = d.nacionalidad === PAIS
  if (!ciudadano && !NACIONALIDADES_EXTRANJERAS.includes(d.nacionalidad)) {
    error(id, `nacionalidad desconocida: ${d.nacionalidad}`)
  }
  const fv = fecha(d.vence)
  if (fv === null) error(id, `documento.vence no es una fecha DD/MM/AAAA válida: ${d.vence}`)
  else {
    if (fv === HOY) error(id, `el pasaporte vence justo hoy (${FECHA_PUESTO}): lectura ambigua de la regla 1`)
    if (fv < 19700101 || fv > 19951231) aviso(id, `fecha de vencimiento poco realista: ${d.vence}`)
  }
  if (ciudadano && d.permiso !== null) error(id, 'un ciudadano debe tener permiso null')
  if (!ciudadano && d.permiso === null) error(id, 'un extranjero no puede tener permiso null (usa "ninguno")')
  if (d.permiso !== null && d.permiso !== 'ninguno' && !TIPOS_PERMISO.includes(d.permiso)) {
    error(id, `tipo de permiso inválido: ${d.permiso}`)
  }
  const tienePermiso = TIPOS_PERMISO.includes(d.permiso)
  if (tienePermiso && !esTextoNoVacio(d.permisoNombre)) error(id, 'falta documento.permisoNombre')
  if (!tienePermiso && 'permisoNombre' in d) error(id, 'permisoNombre debe omitirse si el permiso es null o "ninguno"')
  for (const p of PALABRAS_ARMA) {
    if (contienePalabra(d.equipajeDeclarado, p)) error(id, `el equipaje declarado menciona "${p}": la regla 4 sería ambigua`)
  }

  // --- dice / porque
  if (!esTextoNoVacio(v.dice)) error(id, '"dice" debe ser texto no vacío')
  else {
    const palabras = contarPalabras(v.dice)
    if (palabras > MAX_PALABRAS_DICE) error(id, `"dice" tiene ${palabras} palabras (máximo ${MAX_PALABRAS_DICE})`)
    const oraciones = contarOraciones(v.dice)
    if (oraciones < 1 || oraciones > 2) error(id, `"dice" debe tener 1 o 2 frases (tiene ${oraciones})`)
  }
  if (!esTextoNoVacio(v.porque)) error(id, '"porque" debe ser texto no vacío')
  else {
    if (!/reglas?\s+\d/i.test(v.porque)) error(id, '"porque" debe citar la regla (p. ej. "regla 1")')
    if (contarOraciones(v.porque) > 1) aviso(id, '"porque" tiene más de una frase')
  }

  // --- verdad
  const vd = v.verdad
  if (!vd || typeof vd !== 'object') {
    error(id, 'falta "verdad"')
    return
  }
  for (const k of Object.keys(vd)) if (!CLAVES_VERDAD.includes(k)) error(id, `verdad: campo inesperado "${k}"`)
  if (typeof vd.pasa !== 'boolean') error(id, 'verdad.pasa debe ser booleano')
  if (typeof vd.miente !== 'boolean') error(id, 'verdad.miente debe ser booleano')
  if (!Number.isInteger(vd.peligro) || vd.peligro < 0 || vd.peligro >= NIVELES_PELIGRO.length) {
    error(id, `verdad.peligro debe ser un entero de 0 a ${NIVELES_PELIGRO.length - 1}`)
  }
  if (!ACCIONES.includes(vd.accion)) error(id, `verdad.accion inválida: ${vd.accion}`)
  if (vd.pasa !== (vd.accion === 'aprobar')) error(id, 'verdad.pasa debe ser true solo si la acción es "aprobar"')
  const rangos = { aprobar: [0, 0], rechazar: [0, 1], interrogar: [1, 2], arrestar: [3, 4] }
  const rango = rangos[vd.accion]
  if (rango && (vd.peligro < rango[0] || vd.peligro > rango[1])) {
    error(id, `peligro ${vd.peligro} fuera del rango de "${vd.accion}" (${rango[0]}-${rango[1]})`)
  }

  // --- claves
  const c = v.claves
  if (!c || typeof c !== 'object') {
    error(id, 'falta "claves" (el validador lo necesita para recalcular la verdad)')
    return
  }
  for (const k of Object.keys(c)) if (!CLAVES_CLAVES.includes(k)) error(id, `claves: campo inesperado "${k}"`)
  for (const k of CLAVES_BANDERAS) if (typeof c[k] !== 'boolean') error(id, `claves.${k} debe ser booleano`)
  if (!(c.otraMentira === null || esTextoNoVacio(c.otraMentira))) error(id, 'claves.otraMentira debe ser null o texto')
  const motivosValidos = ciudadano ? [null, 'regreso'] : [null, ...TIPOS_PERMISO]
  if (!motivosValidos.includes(c.motivoDicho)) {
    error(id, `claves.motivoDicho inválido para ${ciudadano ? 'un ciudadano' : 'un extranjero'}: ${JSON.stringify(c.motivoDicho)}`)
    return
  }
  if (fv === null) return

  // --- coherencia de las claves con los textos
  const textoPersona = [d.nombre, v.dice].join(' \n ')
  const buscadosNombrados = BUSCADOS.filter((b) => textoPersona.toLowerCase().includes(b.toLowerCase()))
  if (c.buscado && buscadosNombrados.length === 0) {
    error(id, 'claves.buscado=true pero ni el pasaporte ni lo que dice contienen un nombre de BUSCADOS')
  }
  if (!c.buscado) {
    const apellidos = BUSCADOS.map((b) => b.split(' ').at(-1))
    for (const texto of [d.nombre, d.permisoNombre ?? '', v.dice]) {
      for (const ap of apellidos) {
        if (contienePalabra(texto, ap)) error(id, `menciona "${ap}" (apellido de un buscado) sin ser buscado: caso ambiguo`)
      }
    }
  }
  const hallazgo = c.armas || c.contrabandoNoDeclarado || c.contradiccionMenor
  if (hallazgo && !RE_SIN_DECLARAR.test(d.inspeccion)) {
    error(id, 'hay un hallazgo en las claves pero la inspección no dice "sin declarar"')
  }
  if (!hallazgo && RE_SIN_DECLARAR.test(d.inspeccion)) {
    error(id, 'la inspección dice "sin declarar" pero ninguna clave de hallazgo está en true')
  }
  if (hallazgo === RE_LIMPIA.test(d.inspeccion)) {
    error(id, hallazgo ? 'hay hallazgo pero la inspección dice "Nada irregular."' : 'inspección limpia sin "Nada irregular."')
  }
  const armaEnInspeccion = PALABRAS_ARMA.some((p) => contienePalabra(d.inspeccion, p))
  if (c.armas !== armaEnInspeccion) {
    error(id, c.armas ? 'claves.armas=true pero la inspección no nombra un arma' : 'la inspección nombra un arma pero claves.armas=false')
  }
  if (c.contradiccionMenor && !RE_SIN_VALOR.test(d.inspeccion)) {
    error(id, 'contradicción menor: la inspección debe aclarar "sin valor comercial"')
  }
  if ((c.contrabandoNoDeclarado || c.armas) && RE_SIN_VALOR.test(d.inspeccion)) {
    error(id, 'contrabando/armas con "sin valor comercial" en la inspección: contradictorio')
  }
  if (c.contradiccionMenor && (c.contrabandoNoDeclarado || c.armas)) {
    error(id, 'contradicción menor y contrabando/armas a la vez: caso ambiguo')
  }

  // --- recalcular la verdad
  const r = decidir(v)
  const { causas, hechos } = r
  if (causas.arrestar.length === 0 && causas.rechazar.length && causas.interrogar.length) {
    error(id, `combinación ambigua de rechazo (${causas.rechazar.join(', ')}) e interrogatorio (${causas.interrogar.join(', ')})`)
  }
  if (hechos.tienePermiso && c.motivoDicho === null && causas.arrestar.length === 0 && causas.rechazar.length === 0) {
    error(id, 'extranjero con permiso que no dice su motivo: la regla 3 no se puede evaluar')
  }
  for (const k of CLAVES_VERDAD) {
    if (vd[k] !== r.verdad[k]) {
      error(id, `verdad.${k}=${JSON.stringify(vd[k])} pero la tabla de decisión da ${JSON.stringify(r.verdad[k])} (${r.causa})`)
    }
  }

  // --- lo que ven las IAs no depende de claves, verdad ni porque
  const estado = textoEstado(v)
  const estadoMinimo = textoEstado({ documento: v.documento, dice: v.dice })
  if (estado !== estadoMinimo) error(id, 'textoEstado usa campos además de "documento" y "dice"')
  const fugas = ['claves', 'motivoDicho', 'otraMentira', 'contrabandoNoDeclarado', 'contradiccionMenor', v.porque, c.otraMentira]
  for (const f of fugas) if (f && estado.includes(f)) error(id, `textoEstado filtra información de validación: "${f.slice(0, 40)}"`)

  filas.push({ v, r, estado })
})

// ---------------------------------------------------------------- reglas del conjunto completo

const conteoAccion = Object.fromEntries(ACCIONES.map((a) => [a, 0]))
const conteoDificultad = Object.fromEntries(DIFICULTADES.map((d) => [d, 0]))
for (const v of viajeros) {
  if (v?.verdad?.accion in conteoAccion) conteoAccion[v.verdad.accion]++
  if (v?.dificultad in conteoDificultad) conteoDificultad[v.dificultad]++
}
for (const [a, esperado] of Object.entries(DISTRIBUCION_ACCION)) {
  if (Math.abs(conteoAccion[a] - esperado) > TOLERANCIA_ACCION) {
    error('distribución', `${a}: ${conteoAccion[a]} (se esperan ${esperado} ± ${TOLERANCIA_ACCION})`)
  }
}
for (const [d, prop] of Object.entries(DISTRIBUCION_DIFICULTAD)) {
  const real = viajeros.length ? conteoDificultad[d] / viajeros.length : 0
  if (Math.abs(real - prop) > TOLERANCIA_DIFICULTAD) {
    error('distribución', `dificultad ${d}: ${Math.round(real * 100)} % (se espera ${Math.round(prop * 100)} % ± ${Math.round(TOLERANCIA_DIFICULTAD * 100)})`)
  }
}

let racha = 1
for (let i = 1; i < viajeros.length; i++) {
  racha = viajeros[i]?.verdad?.accion === viajeros[i - 1]?.verdad?.accion ? racha + 1 : 1
  if (racha > RACHA_MAXIMA) error(viajeros[i].id, `racha de ${racha} viajeros seguidos con "${viajeros[i].verdad.accion}"`)
}

// Los tres primeros se ven en detalle en el video.
const [v1, v2, v3] = viajeros
if (v1 && !(v1.verdad?.accion === 'aprobar' && v1.dificultad === 'facil')) error('v01', 'debe ser "aprobar" y fácil (abre el video)')
if (v2 && !(v2.verdad?.accion === 'arrestar' && v2.verdad?.miente && v2.claves?.contrabandoNoDeclarado)) {
  error('v02', 'debe ser un mentiroso con contrabando escondido (arrestar)')
}
if (v3 && !(v3.verdad?.accion === 'rechazar' && fecha(v3.documento?.vence) < HOY)) {
  error('v03', 'debe ser un rechazo por pasaporte vencido (súplica emocional)')
}

// ---------------------------------------------------------------- salida

const corto = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t).padEnd(n)
const sn = (b) => (b ? 'sí' : 'no')

if (VER) {
  for (const { v, estado } of filas) {
    if (VER !== 'todos' && !VER.has(v.id)) continue
    console.log(`\n==================== ${v.id} · ${v.dificultad} ====================`)
    // Las reglas son iguales para todos: se imprime desde los documentos.
    const lineas = estado.split('\n')
    console.log(lineas.slice(Math.max(0, lineas.indexOf('DOCUMENTOS DEL VIAJERO'))).join('\n'))
    console.log(`--> ${v.verdad.accion.toUpperCase()} · pasa=${v.verdad.pasa} · miente=${v.verdad.miente} · peligro=${v.verdad.peligro}`)
    console.log(`    ${v.porque}`)
  }
  console.log('')
}

console.log(`Viajeros: ${RUTA}`)
console.log(`Puesto: ${PAIS}, ${FECHA_PUESTO} · Buscados: ${BUSCADOS.join(', ')}\n`)
console.log(`${'id'.padEnd(4)} ${'acción'.padEnd(10)} ${'pasa'.padEnd(4)} ${'miente'.padEnd(6)} pel ${'dific.'.padEnd(7)} ${'nombre'.padEnd(20)} causa`)
console.log('-'.repeat(100))
for (const { v, r } of filas) {
  console.log(
    `${v.id.padEnd(4)} ${v.verdad.accion.padEnd(10)} ${sn(v.verdad.pasa).padEnd(4)} ${sn(v.verdad.miente).padEnd(6)} ${String(v.verdad.peligro).padEnd(3)} ${v.dificultad.padEnd(7)} ${corto(v.nombre, 20)} ${r.causa}`,
  )
}
console.log('-'.repeat(100))
const pct = (n) => `${Math.round((n / Math.max(1, viajeros.length)) * 100)} %`
console.log(`Acciones:    ${ACCIONES.map((a) => `${a} ${conteoAccion[a]} (${pct(conteoAccion[a])})`).join(' · ')}`)
console.log(`Dificultad:  ${DIFICULTADES.map((d) => `${d} ${conteoDificultad[d]} (${pct(conteoDificultad[d])})`).join(' · ')}`)
const mienten = viajeros.filter((v) => v?.verdad?.miente).length
const ciudadanos = viajeros.filter((v) => v?.documento?.nacionalidad === PAIS).length
console.log(`Mienten:     ${mienten} · Ciudadanos de ${PAIS}: ${ciudadanos} · Total: ${viajeros.length}`)

if (avisos.length) {
  console.log(`\nAvisos (${avisos.length}):`)
  for (const a of avisos) console.log(`  - ${a}`)
}
if (errores.length) {
  console.log(`\nERRORES (${errores.length}):`)
  for (const e of errores) console.log(`  - ${e}`)
  process.exit(1)
}
console.log('\nOK: el conjunto de viajeros es válido y cada respuesta correcta se deduce de las reglas.')
