'use client'
import { useEffect, useState } from 'react'

export default function PopupCompletePage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const success = params.get('success') === 'true'
    const error   = params.get('error') ?? ''
    const phone   = params.get('phone') ?? ''

    const errorMessages: Record<string, string> = {
      sin_waba:     'No se encontró una cuenta de WhatsApp Business. Agrega tu número en Meta Business Manager.',
      sin_numeros:  'No hay números registrados en tu cuenta de WhatsApp Business.',
      no_code:      'No se recibió autorización de Meta.',
      oauth_denied: 'Acceso denegado. Intenta de nuevo.',
      sin_perfil:   'Error de sesión. Recarga OptiDesk e intenta de nuevo.',
      token_error:  'Error al obtener el token de Meta. Intenta de nuevo.',
    }

    if (success) {
      setStatus('success')
      setMessage(phone ? `Número ${phone} conectado` : 'WhatsApp conectado correctamente')
    } else {
      setStatus('error')
      setMessage(errorMessages[error] ?? `Error al conectar (${error})`)
    }

    // Enviar resultado al padre y cerrar el popup
    if (window.opener) {
      window.opener.postMessage({
        type: 'META_OAUTH_COMPLETE',
        success,
        error,
        phone,
      }, window.location.origin)
      setTimeout(() => window.close(), success ? 1500 : 3000)
    }
  }, [])

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center">
        {status === 'loading' && (
          <>
            <div className="w-12 h-12 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600 text-sm">Conectando con Meta...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="font-bold text-gray-900 text-lg mb-1">¡Conectado!</h2>
            <p className="text-sm text-gray-500">{message}</p>
            <p className="text-xs text-gray-400 mt-3">Esta ventana se cerrará sola...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="font-bold text-gray-900 text-lg mb-1">Error al conectar</h2>
            <p className="text-sm text-gray-500 mb-4">{message}</p>
            <button onClick={() => window.close()} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm">
              Cerrar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
