import type { SupabaseClient } from '@supabase/supabase-js'
import { evaluate } from 'mathjs'
import type { RangoFechas } from './periodos'

export type Agregacion = 'suma' | 'promedio' | 'conteo' | 'conteo_distinto' | 'minimo' | 'maximo'
export type FormatoNumero = 'moneda' | 'entero' | 'decimal' | 'porcentaje'
export type OperadorFiltro = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in'

export interface FiltroMedida {
  campo: string
  operador: OperadorFiltro
  valor: string
}

export interface Medida {
  id: string
  tenant_id: string
  nombre: string
  descripcion: string | null
  tabla: string
  campo: string | null
  agregacion: Agregacion
  campo_fecha: string | null
  filtros: FiltroMedida[]
  formato: FormatoNumero
  decimales: number
}

export interface VariableCalculada {
  id: string
  tenant_id: string
  nombre: string
  descripcion: string | null
  formula: string
  formato: FormatoNumero
  decimales: number
}

// ── Catálogo de tablas disponibles para armar medidas ──────────────────────
// Deliberadamente acotado a lo que ya se usa en los dashboards de Ventas de
// esta sesión — se puede ampliar más adelante a Servicio Técnico/Repuestos.
export const TABLAS_DISPONIBLES: Record<string, {
  label: string
  campos: { valor: string; label: string }[]
  camposFecha: { valor: string; label: string }[]
  camposFiltro: { valor: string; label: string }[]
}> = {
  clientes: {
    label: 'Clientes (Ventas)',
    campos: [
      { valor: 'valor_estimado_venta', label: 'Valor estimado de venta' },
      { valor: 'cuota_inicial', label: 'Cuota inicial' },
      { valor: 'cuota_deseada', label: 'Cuota mensual deseada' },
      { valor: 'probabilidad_venta', label: 'Probabilidad de venta (%)' },
    ],
    camposFecha: [
      { valor: 'created_at', label: 'Fecha de creación' },
      { valor: 'fecha_cierre', label: 'Fecha de cierre (venta)' },
    ],
    camposFiltro: [
      { valor: 'etapa_venta', label: 'Etapa de venta' },
      { valor: 'forma_pago', label: 'Forma de pago' },
      { valor: 'assigned_to', label: 'Asesor asignado (id)' },
      { valor: 'lead_source', label: 'Origen' },
    ],
  },
  clientes_pagos: {
    label: 'Pagos registrados (Ventas)',
    campos: [{ valor: 'monto', label: 'Monto' }],
    camposFecha: [{ valor: 'created_at', label: 'Fecha del pago' }],
    camposFiltro: [{ valor: 'metodo_pago', label: 'Método de pago' }],
  },
  clientes_creditos_desembolso: {
    label: 'Créditos / Desembolsos',
    campos: [
      { valor: 'credito_cliente', label: 'Crédito cliente' },
      { valor: 'desembolso', label: 'Desembolso' },
      { valor: 'plazo_meses', label: 'Plazo (meses)' },
    ],
    camposFecha: [{ valor: 'created_at', label: 'Fecha de creación' }],
    camposFiltro: [
      { valor: 'entidad_id', label: 'Entidad financiera (id)' },
      { valor: 'desembolsado', label: 'Desembolsado (true/false)' },
    ],
  },
  clientes_bonos: {
    label: 'Bonos aplicados',
    campos: [{ valor: 'monto', label: 'Valor del bono' }],
    camposFecha: [{ valor: 'created_at', label: 'Fecha de aplicación' }],
    camposFiltro: [{ valor: 'bono_id', label: 'Bono (id)' }],
  },
}

const AGREGACION_LABEL: Record<Agregacion, string> = {
  suma: 'Suma', promedio: 'Promedio', conteo: 'Conteo de filas',
  conteo_distinto: 'Conteo de valores distintos', minimo: 'Mínimo', maximo: 'Máximo',
}
export { AGREGACION_LABEL }

/** Calcula el valor de una medida contra Supabase, respetando el rango de fechas y sus filtros propios. */
export async function calcularMedida(supabase: SupabaseClient, tenantId: string, medida: Medida, rango: RangoFechas): Promise<number> {
  const columnaSelect = medida.agregacion === 'conteo' ? 'id' : (medida.campo ?? 'id')
  let q = supabase.from(medida.tabla).select(columnaSelect).eq('tenant_id', tenantId).limit(5000)

  if (medida.campo_fecha) {
    q = q.gte(medida.campo_fecha, rango.desdeISO).lte(medida.campo_fecha, rango.hastaISO)
  }
  for (const f of medida.filtros) {
    const valor: string | boolean = f.valor === 'true' ? true : f.valor === 'false' ? false : f.valor
    if (f.operador === 'eq') q = q.eq(f.campo, valor)
    else if (f.operador === 'neq') q = q.neq(f.campo, valor)
    else if (f.operador === 'gt') q = q.gt(f.campo, valor)
    else if (f.operador === 'gte') q = q.gte(f.campo, valor)
    else if (f.operador === 'lt') q = q.lt(f.campo, valor)
    else if (f.operador === 'lte') q = q.lte(f.campo, valor)
    else if (f.operador === 'in') q = q.in(f.campo, f.valor.split(',').map(v => v.trim()).filter(Boolean))
  }

  const { data, error } = await q
  if (error || !data) return 0
  const rows = data as unknown as Record<string, unknown>[]

  if (medida.agregacion === 'conteo') return rows.length
  if (medida.agregacion === 'conteo_distinto') {
    return new Set(rows.map(r => r[columnaSelect])).size
  }
  const valores = rows.map(r => Number(r[columnaSelect]) || 0)
  if (medida.agregacion === 'suma') return valores.reduce((s, v) => s + v, 0)
  if (medida.agregacion === 'promedio') return valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : 0
  if (medida.agregacion === 'minimo') return valores.length ? Math.min(...valores) : 0
  if (medida.agregacion === 'maximo') return valores.length ? Math.max(...valores) : 0
  return 0
}

export async function calcularTodasLasMedidas(supabase: SupabaseClient, tenantId: string, medidas: Medida[], rango: RangoFechas): Promise<Record<string, number>> {
  const entradas = await Promise.all(medidas.map(async m => [m.nombre, await calcularMedida(supabase, tenantId, m, rango)] as const))
  return Object.fromEntries(entradas)
}

// ── Variables calculadas — fórmulas tipo Excel sobre medidas/otras variables ──
// Sintaxis: [Nombre de la medida o variable] + operadores/funciones de mathjs
// (+ - * / ^ > < >= <= == != and or not, SI(cond, si, no), round, abs, min, max...).
function sanitizarNombre(nombre: string): string {
  return 'v_' + nombre.replace(/[^a-zA-Z0-9_]/g, '_')
}

function prepararFormula(formula: string): string {
  return formula.replace(/\[([^\]]+)\]/g, (_, nombre: string) => sanitizarNombre(nombre.trim()))
}

/** Evalúa todas las variables calculadas, permitiendo que unas referencien a otras (en cualquier orden). */
export function evaluarVariables(valoresMedidas: Record<string, number>, variables: VariableCalculada[]): Record<string, number | null> {
  const scope: Record<string, number> = {}
  for (const [nombre, valor] of Object.entries(valoresMedidas)) scope[sanitizarNombre(nombre)] = valor
  scope.SI = ((cond: boolean, siVal: number, noVal: number) => (cond ? siVal : noVal)) as unknown as number

  const resultado: Record<string, number | null> = {}
  const pendientes = new Set(variables.map(v => v.nombre))
  let progreso = true

  while (pendientes.size > 0 && progreso) {
    progreso = false
    for (const variable of variables) {
      if (!pendientes.has(variable.nombre)) continue
      try {
        const expr = prepararFormula(variable.formula)
        const valor = evaluate(expr, scope)
        if (typeof valor !== 'number' || Number.isNaN(valor)) throw new Error('No numérico')
        scope[sanitizarNombre(variable.nombre)] = valor
        resultado[variable.nombre] = valor
        pendientes.delete(variable.nombre)
        progreso = true
      } catch {
        // puede depender de otra variable que aún no se ha resuelto — se reintenta
      }
    }
  }
  for (const nombre of pendientes) resultado[nombre] = null // fórmula inválida o dependencia circular
  return resultado
}

export function formatValor(valor: number | null, formato: FormatoNumero, decimales: number): string {
  if (valor === null) return '—'
  if (formato === 'moneda') {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: decimales }).format(valor)
  }
  if (formato === 'porcentaje') {
    return `${valor.toFixed(decimales)}%`
  }
  if (formato === 'entero') {
    return Math.round(valor).toLocaleString('es-CO')
  }
  return valor.toLocaleString('es-CO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
}
