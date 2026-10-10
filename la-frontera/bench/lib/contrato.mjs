// Chequeo del contrato de corrida (ARQUITECTURA.md, "Contrato: corrida").
// Devuelve una lista de problemas; vacía si el archivo cumple.

import { calcularEstadisticas } from '../../shared/juego.js'
import { JUEGO } from '../../shared/config.js'
import { calcularCosto } from '../../shared/modelos.js'
import { problemasDecision } from './decision.mjs'

export const NOTA_DEMO = 'Datos simulados para probar el diseño del video. NO son resultados reales.'

const esNumero = (x) => typeof x === 'number' && Number.isFinite(x)
const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)

export function problemasCorrida(run, viajerosDataset, { exigirCompleta = false } = {}) {
  const p = []
  if (!esObjeto(run)) return ['la corrida no es un objeto JSON']
  if (run.version !== 1) p.push(`version debe ser 1 (llegó ${JSON.stringify(run.version)})`)
  if (run.source !== 'live' && run.source !== 'demo') p.push(`source debe ser "live" o "demo" (llegó ${JSON.stringify(run.source)})`)
  if (typeof run.createdAt !== 'string' || Number.isNaN(Date.parse(run.createdAt)) || !run.createdAt.endsWith('Z')) {
    p.push('createdAt debe ser una fecha ISO (UTC)')
  }
  if (run.source === 'demo' && run.nota !== NOTA_DEMO) p.push(`una corrida demo debe llevar la nota "${NOTA_DEMO}"`)
  if (run.nota !== undefined && typeof run.nota !== 'string') p.push('nota debe ser texto')

  const idsDataset = new Set(viajerosDataset.map((v) => v.id))
  if (!Array.isArray(run.viajeros) || run.viajeros.length === 0) {
    p.push('viajeros debe ser una lista no vacía de ids')
    return p
  }
  if (new Set(run.viajeros).size !== run.viajeros.length) p.push('viajeros tiene ids repetidos')
  for (const id of run.viajeros) if (!idsDataset.has(id)) p.push(`el viajero ${id} no existe en data/viajeros.json`)
  if (exigirCompleta && run.viajeros.length !== viajerosDataset.length) {
    p.push(`la corrida tiene ${run.viajeros.length} viajeros y el conjunto ${viajerosDataset.length}`)
  }
  const idsRun = new Set(run.viajeros)

  if (!Array.isArray(run.proveedores) || run.proveedores.length === 0) {
    p.push('proveedores debe ser una lista no vacía')
    return p
  }
  for (const prov of run.proveedores) {
    const q = `proveedor ${prov?.id ?? '?'}`
    for (const campo of ['id', 'nombre', 'empresa', 'modelo']) {
      if (typeof prov?.[campo] !== 'string' || !prov[campo]) p.push(`${q}: falta "${campo}"`)
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(prov?.color ?? '')) p.push(`${q}: color debe ser #rrggbb`)
    const pr = prov?.precio
    if (!esObjeto(pr)) p.push(`${q}: falta precio`)
    else {
      for (const campo of ['entradaPorMTok', 'entradaCacheadaPorMTok', 'salidaPorMTok']) {
        if (!esNumero(pr[campo]) || pr[campo] < 0) p.push(`${q}: precio.${campo} debe ser un número >= 0`)
      }
      if (typeof pr.fuente !== 'string' || !pr.fuente) p.push(`${q}: precio.fuente vacío`)
      if (typeof pr.verificado !== 'boolean') p.push(`${q}: precio.verificado debe ser booleano`)
      if (typeof pr.fecha !== 'string') p.push(`${q}: precio.fecha debe ser texto`)
    }
    if (!esObjeto(prov?.opciones)) p.push(`${q}: opciones debe ser un objeto`)
  }
  if (!esObjeto(run.resultados)) {
    p.push('resultados debe ser un objeto')
    return p
  }
  const idsProv = new Set(run.proveedores.map((x) => x.id))
  for (const k of Object.keys(run.resultados)) if (!idsProv.has(k)) p.push(`resultados.${k} no corresponde a ningún proveedor`)

  for (const prov of run.proveedores) {
    const lista = run.resultados[prov.id]
    const q = `resultados.${prov.id}`
    if (!Array.isArray(lista)) {
      p.push(`${q} debe ser una lista`)
      continue
    }
    const vistos = new Set()
    for (const r of lista) {
      const qr = `${q}[${r?.viajeroId ?? '?'}]`
      if (!idsRun.has(r?.viajeroId)) p.push(`${qr}: viajeroId no está en "viajeros"`)
      if (vistos.has(r?.viajeroId)) p.push(`${qr}: resultado repetido`)
      vistos.add(r?.viajeroId)
      if (typeof r?.ok !== 'boolean') {
        p.push(`${qr}: ok debe ser booleano`)
        continue
      }
      if (r.ok) {
        if (r.error !== null) p.push(`${qr}: error debe ser null si ok`)
        for (const x of problemasDecision(r.decision)) p.push(`${qr}: ${x}`)
        const t = r.tokens
        if (!esObjeto(t)) p.push(`${qr}: faltan tokens`)
        else {
          for (const campo of ['entrada', 'entradaCacheada', 'salida']) {
            if (!esNumero(t[campo]) || t[campo] < 0) p.push(`${qr}: tokens.${campo} debe ser un número >= 0`)
          }
          if (t.razonamiento !== null && !(esNumero(t.razonamiento) && t.razonamiento >= 0)) p.push(`${qr}: tokens.razonamiento debe ser número o null`)
          if (typeof t.estimado !== 'boolean') p.push(`${qr}: tokens.estimado debe ser booleano`)
          if (esObjeto(prov.precio) && esNumero(r.costoUSD)) {
            const esperado = calcularCosto(prov.precio, t)
            if (Math.abs(esperado - r.costoUSD) > 1e-9) p.push(`${qr}: costoUSD ${r.costoUSD} no coincide con calcularCosto (${esperado})`)
          }
        }
        if (!esNumero(r.costoUSD) || r.costoUSD < 0) p.push(`${qr}: costoUSD debe ser un número >= 0`)
        if (!esNumero(r.latenciaMs) || r.latenciaMs <= 0) p.push(`${qr}: latenciaMs debe ser un número > 0`)
        if (typeof r.salidaTexto !== 'string') p.push(`${qr}: salidaTexto debe ser texto`)
      } else {
        if (r.decision !== null) p.push(`${qr}: decision debe ser null si hubo error`)
        if (typeof r.error !== 'string' || !r.error) p.push(`${qr}: error debe ser un mensaje`)
        if (r.costoUSD !== 0) p.push(`${qr}: costoUSD debe ser 0 si hubo error`)
      }
      if (r.confianza !== null) {
        if (!esObjeto(r.confianza)) p.push(`${qr}: confianza debe ser objeto o null`)
        else {
          for (const campo of ['pasa', 'miente', 'peligro', 'accion']) {
            const c = r.confianza[campo]
            if (c !== null && !(esNumero(c) && c >= 0 && c <= 1)) p.push(`${qr}: confianza.${campo} debe estar entre 0 y 1 o ser null`)
          }
        }
      }
      if (r.crudo !== null && typeof r.crudo !== 'string') p.push(`${qr}: crudo debe ser texto o null`)
      if (r.crudo && r.crudo.length > 4100) p.push(`${qr}: crudo supera 4000 caracteres`)
      if (r.modeloServido !== null && typeof r.modeloServido !== 'string') p.push(`${qr}: modeloServido debe ser texto o null`)
      if (typeof r.fallback !== 'boolean') p.push(`${qr}: fallback debe ser booleano`)
    }
    if (exigirCompleta) {
      for (const id of run.viajeros) if (!vistos.has(id)) p.push(`${q}: falta el resultado de ${id}`)
    }
  }

  if (!p.length) {
    try {
      calcularEstadisticas(run, viajerosDataset, JUEGO)
    } catch (e) {
      p.push(`calcularEstadisticas falló con esta corrida: ${e.message}`)
    }
  }
  return p
}
