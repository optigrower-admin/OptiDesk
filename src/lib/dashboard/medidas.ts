import type { SupabaseClient } from '@supabase/supabase-js'
import { evaluate } from 'mathjs'
import type { RangoFechas } from './periodos'

export type Agregacion = 'suma' | 'promedio' | 'conteo' | 'conteo_distinto' | 'minimo' | 'maximo'
export type FormatoNumero = 'moneda' | 'entero' | 'decimal' | 'porcentaje'
export type OperadorFiltro = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in'
export type OperadorTermino = '+' | '-' | '*' | '/'

export interface FiltroMedida {
  campo: string
  operador: OperadorFiltro
  valor: string
}

/** Un "término" de una medida: una agregación (tabla+campo+agregación, con
 * filtros y campo de fecha propios) que se combina con los demás términos
 * de la medida mediante +, -, * o /. Con un solo término, una medida es una
 * agregación simple; con varios, se pueden restar/sumar/dividir campos
 * distintos (ej. Ganancia = [Precio] - [Costo]). */
export interface TerminoMedida {
  tabla: string
  campo: string | null
  agregacion: Agregacion
  campo_fecha: string | null
  filtros: FiltroMedida[]
  operador: OperadorTermino // se ignora para el primer término
}

export interface Medida {
  id: string
  tenant_id: string
  nombre: string
  descripcion: string | null
  terminos: TerminoMedida[]
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
  motos_catalogo: {
    label: 'Catálogo de motos',
    campos: [
      { valor: 'precio', label: 'Precio' },
      { valor: 'costo_documentos', label: 'Costo documentos' },
      { valor: 'costo_prenda', label: 'Costo prenda' },
    ],
    camposFecha: [{ valor: 'created_at', label: 'Fecha de creación' }],
    camposFiltro: [{ valor: 'activa', label: 'Activa (true/false)' }],
  },
  ordenes: {
    label: 'Órdenes (Servicio Técnico)',
    campos: [
      { valor: 'valor_total', label: 'Valor total de la orden' },
      { valor: 'valor_abono', label: 'Valor abonado' },
      { valor: 'duracion_estimada_horas', label: 'Duración estimada (horas)' },
    ],
    camposFecha: [
      { valor: 'created_at', label: 'Fecha de creación' },
      { valor: 'fecha_finalizacion', label: 'Fecha de finalización' },
      { valor: 'fecha_programada', label: 'Fecha programada' },
    ],
    camposFiltro: [
      { valor: 'estado', label: 'Estado' },
      { valor: 'estado_pago', label: 'Estado de pago' },
      { valor: 'tipo_orden', label: 'Tipo de orden (servicio/venta_repuestos)' },
      { valor: 'tipo_servicio', label: 'Tipo de servicio (uma/terceros)' },
      { valor: 'mecanico_id', label: 'Mecánico (id)' },
      { valor: 'metodo_pago_id', label: 'Método de pago (id)' },
    ],
  },
  items_orden: {
    label: 'Repuestos/mano de obra vendidos (por orden)',
    campos: [
      { valor: 'cantidad', label: 'Cantidad' },
      { valor: 'costo', label: 'Costo' },
      { valor: 'precio_venta', label: 'Precio de venta' },
    ],
    camposFecha: [{ valor: 'created_at', label: 'Fecha' }],
    camposFiltro: [
      { valor: 'origen', label: 'Origen (uma/externo/mano_obra/insumo)' },
      { valor: 'estado_repuesto', label: 'Estado (pedido/ok)' },
      { valor: 'metodo_pago_id', label: 'Método de pago (id)' },
    ],
  },
  repuestos_uma: {
    label: 'Inventario UMA',
    campos: [
      { valor: 'precio_publico_iva', label: 'Precio público con IVA' },
      { valor: 'precio_publico_sin_iva', label: 'Precio público sin IVA' },
      { valor: 'precio_distribuidor_sin_iva', label: 'Precio distribuidor sin IVA' },
      { valor: 'descuento', label: 'Descuento' },
      { valor: 'cantidad', label: 'Cantidad en stock' },
    ],
    camposFecha: [{ valor: 'created_at', label: 'Fecha de creación' }],
    camposFiltro: [
      { valor: 'tipo', label: 'Tipo (repuesto/lubricante)' },
      { valor: 'activo', label: 'Activo (true/false)' },
    ],
  },
  repuestos_externos: {
    label: 'Inventario externos',
    campos: [
      { valor: 'ultimo_costo', label: 'Último costo' },
      { valor: 'ultimo_precio_venta', label: 'Último precio de venta' },
      { valor: 'cantidad', label: 'Cantidad en stock' },
    ],
    camposFecha: [{ valor: 'created_at', label: 'Fecha de creación' }],
    camposFiltro: [
      { valor: 'proveedor_id', label: 'Proveedor (id)' },
      { valor: 'subgrupo', label: 'Subgrupo' },
    ],
  },
  pagos_orden: {
    label: 'Pagos de clientes (Servicio Técnico)',
    campos: [{ valor: 'monto', label: 'Monto' }],
    camposFecha: [{ valor: 'fecha', label: 'Fecha del pago' }],
    camposFiltro: [{ valor: 'metodo_pago_id', label: 'Método de pago (id)' }],
  },
  pagos_proveedor: {
    label: 'Pagos a proveedor (Servicio Técnico)',
    campos: [{ valor: 'monto', label: 'Monto' }],
    camposFecha: [{ valor: 'fecha', label: 'Fecha del pago' }],
    camposFiltro: [{ valor: 'metodo_pago_id', label: 'Método de pago (id)' }],
  },
  gastos_caja: {
    label: 'Gastos de caja',
    campos: [{ valor: 'monto', label: 'Monto' }],
    camposFecha: [{ valor: 'fecha', label: 'Fecha' }],
    camposFiltro: [{ valor: 'metodo_pago_id', label: 'Método de pago (id)' }],
  },
  ingresos_caja: {
    label: 'Ingresos de caja',
    campos: [{ valor: 'monto', label: 'Monto' }],
    camposFecha: [{ valor: 'fecha', label: 'Fecha' }],
    camposFiltro: [{ valor: 'metodo_pago_id', label: 'Método de pago (id)' }],
  },
  pagos_colaborador_caja: {
    label: 'Pagos a colaboradores (caja)',
    campos: [{ valor: 'monto', label: 'Monto' }],
    camposFecha: [{ valor: 'fecha', label: 'Fecha' }],
    camposFiltro: [
      { valor: 'metodo_pago_id', label: 'Método de pago (id)' },
      { valor: 'usuario_pagado_id', label: 'Colaborador pagado (id)' },
    ],
  },
  comisiones_venta: {
    label: 'Comisiones por venta (config. por cilindraje)',
    campos: [
      { valor: 'comision_valor', label: 'Valor de la comisión' },
      { valor: 'cilindrada_min', label: 'Cilindraje mínimo' },
      { valor: 'cilindrada_max', label: 'Cilindraje máximo' },
    ],
    camposFecha: [{ valor: 'updated_at', label: 'Última actualización' }],
    camposFiltro: [],
  },
}

export const AGREGACION_LABEL: Record<Agregacion, string> = {
  suma: 'Suma', promedio: 'Promedio', conteo: 'Conteo de filas',
  conteo_distinto: 'Conteo de valores distintos', minimo: 'Mínimo', maximo: 'Máximo',
}

export const OPERADOR_TERMINO_LABEL: Record<OperadorTermino, string> = {
  '+': '+ Sumar', '-': '− Restar', '*': '× Multiplicar', '/': '÷ Dividir',
}

/** Calcula el valor de un solo término contra Supabase, respetando el rango de fechas y sus filtros propios. */
async function calcularTermino(supabase: SupabaseClient, tenantId: string, t: TerminoMedida, rango: RangoFechas): Promise<number> {
  const columnaSelect = t.agregacion === 'conteo' ? 'id' : (t.campo ?? 'id')
  let q = supabase.from(t.tabla).select(columnaSelect).eq('tenant_id', tenantId).limit(5000)

  if (t.campo_fecha) {
    q = q.gte(t.campo_fecha, rango.desdeISO).lte(t.campo_fecha, rango.hastaISO)
  }
  for (const f of t.filtros) {
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

  if (t.agregacion === 'conteo') return rows.length
  if (t.agregacion === 'conteo_distinto') return new Set(rows.map(r => r[columnaSelect])).size
  const valores = rows.map(r => Number(r[columnaSelect]) || 0)
  if (t.agregacion === 'suma') return valores.reduce((s, v) => s + v, 0)
  if (t.agregacion === 'promedio') return valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : 0
  if (t.agregacion === 'minimo') return valores.length ? Math.min(...valores) : 0
  if (t.agregacion === 'maximo') return valores.length ? Math.max(...valores) : 0
  return 0
}

/** Calcula una medida completa: cada término por separado, combinados en orden con +,-,*,/. */
export async function calcularMedida(supabase: SupabaseClient, tenantId: string, medida: Medida, rango: RangoFechas): Promise<number> {
  if (medida.terminos.length === 0) return 0
  const valores = await Promise.all(medida.terminos.map(t => calcularTermino(supabase, tenantId, t, rango)))
  let total = valores[0]
  for (let i = 1; i < valores.length; i++) {
    const op = medida.terminos[i].operador
    if (op === '+') total += valores[i]
    else if (op === '-') total -= valores[i]
    else if (op === '*') total *= valores[i]
    else if (op === '/') total = valores[i] !== 0 ? total / valores[i] : 0
  }
  return total
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
  const scope: Record<string, unknown> = {}
  for (const [nombre, valor] of Object.entries(valoresMedidas)) scope[sanitizarNombre(nombre)] = valor
  scope.SI = (cond: boolean, siVal: number, noVal: number) => (cond ? siVal : noVal)

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
