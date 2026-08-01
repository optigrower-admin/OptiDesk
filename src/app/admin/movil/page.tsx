'use client'
export const dynamic = 'force-dynamic'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'

export default function AdminMovilHome() {
  const router = useRouter()
  const { profile } = useAuth()
  const supabase = createClient()

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-blue-700 text-white px-4 py-3 flex items-center justify-between shadow">
        <div>
          <span className="font-bold text-lg">OptiDesk</span>
          <span className="text-blue-300 text-xs ml-2">{profile?.nombre ?? ''}</span>
        </div>
        <button onClick={cerrarSesion} className="text-blue-200 hover:text-white text-sm transition-colors">
          Salir
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
        <button
          onClick={() => router.push('/mecanico/recepcion/nueva')}
          className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all p-6 flex flex-col items-center gap-3 text-center"
        >
          <span className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-3xl">🔧</span>
          <div>
            <p className="text-base font-bold text-gray-900">Registrar Entrada</p>
            <p className="text-sm font-semibold text-blue-700">Servicio Técnico</p>
          </div>
        </button>

        <button
          onClick={() => router.push('/admin/movil/prospecto')}
          className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all p-6 flex flex-col items-center gap-3 text-center"
        >
          <span className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-3xl">🏍️</span>
          <div>
            <p className="text-base font-bold text-gray-900">Registrar</p>
            <p className="text-sm font-semibold text-indigo-700">Prospecto Venta</p>
          </div>
        </button>
      </div>
    </div>
  )
}
