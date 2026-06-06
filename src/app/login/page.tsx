'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { loginWithEmail } from '@/app/actions/auth'
import bcrypt from 'bcryptjs'

export default function LoginPage() {
  const supabase = createClient()

  const [mode, setMode] = useState<'email' | 'pin'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [pinEmail, setPinEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // Server action: hace login y setea cookie en servidor → redirect seguro
      const result = await loginWithEmail(email, password)
      if (result?.error) setError(result.error)
    } catch {
      setError('Error de conexión al servidor')
    } finally {
      setLoading(false)
    }
  }

  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('id, pin, rol, email')
        .eq('email', pinEmail)
        .single()

      if (!usuario || !usuario.pin) {
        setError('Este usuario no tiene PIN configurado')
        return
      }

      const valid = await bcrypt.compare(pin, usuario.pin)
      if (!valid) {
        setError('PIN incorrecto')
        return
      }

      // Login con email+contraseña usando la sesión de admin no es posible client-side
      // El PIN solo funciona en dispositivos donde ya existe sesión
      setError('Para usar PIN, primero inicia sesión con contraseña completa en este dispositivo')
    } catch {
      setError('Error al verificar PIN')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-8">
        {/* Logo / Título */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">OD</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">OptiDesk</h1>
          <p className="text-sm text-gray-500 mt-1">Gestión de servicio técnico</p>
        </div>

        {/* Toggle modo login */}
        <div className="flex rounded-lg border border-gray-200 p-1 mb-6">
          <button
            onClick={() => setMode('email')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === 'email' ? 'bg-blue-700 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Contraseña
          </button>
          <button
            onClick={() => setMode('pin')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === 'pin' ? 'bg-blue-700 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            PIN rápido
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {mode === 'email' ? (
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="tu@email.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-700 text-white rounded-lg font-medium text-sm hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        ) : (
          <form onSubmit={handlePinLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email del usuario</label>
              <input
                type="email"
                value={pinEmail}
                onChange={(e) => setPinEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="tu@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN de 4 dígitos</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center tracking-[0.5em] text-lg"
                placeholder="• • • •"
              />
            </div>
            <button
              type="submit"
              disabled={loading || pin.length !== 4}
              className="w-full py-3 bg-blue-700 text-white rounded-lg font-medium text-sm hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Verificando...' : 'Ingresar con PIN'}
            </button>
            <button
              type="button"
              onClick={() => setMode('email')}
              className="w-full text-sm text-blue-600 hover:underline"
            >
              Usar contraseña completa
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
