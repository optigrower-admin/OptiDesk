'use client'
import { useEffect, useState } from 'react'

export default function GlobalLoadingOverlay() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      setVisible((e as CustomEvent<{ show: boolean }>).detail.show)
    }
    window.addEventListener('global-loading', handler)
    return () => window.removeEventListener('global-loading', handler)
  }, [])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
      <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
