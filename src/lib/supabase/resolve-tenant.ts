// Resuelve el tenant efectivo según el entorno.
// En staging, si el usuario tiene sandbox_tenant_id asignado, lo usa en lugar del tenant real.
// Así los datos de prueba quedan completamente aislados de producción.

export const IS_STAGING = process.env.APP_ENV === 'staging'

export function resolveTenantId(profile: {
  tenant_id: string
  sandbox_tenant_id?: string | null
}): string {
  if (IS_STAGING && profile.sandbox_tenant_id) {
    return profile.sandbox_tenant_id
  }
  return profile.tenant_id
}
