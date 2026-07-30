'use client'
import { useState, useEffect } from 'react'

function formatDisplay(raw: string): string {
  const n = parseFloat(raw.replace(/[^0-9]/g, ''))
  if (isNaN(n) || n === 0) return ''
  return '$' + n.toLocaleString('es-CO')
}

interface MoneyInputProps {
  value: string
  onChange: (raw: string) => void
  onCommit?: (raw: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export default function MoneyInput({ value, onChange, onCommit, placeholder = '$0', className = '', disabled = false }: MoneyInputProps) {
  const [focused, setFocused] = useState(false)
  const [display, setDisplay] = useState(() => formatDisplay(value))

  useEffect(() => { if (!focused) setDisplay(formatDisplay(value)) }, [value, focused])

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={() => { setFocused(true); setDisplay(value) }}
      onChange={e => {
        const raw = e.target.value.replace(/[^0-9]/g, '')
        setDisplay(raw)
        onChange(raw)
      }}
      onBlur={() => {
        setFocused(false)
        setDisplay(formatDisplay(value))
        onCommit?.(value)
      }}
      className={className}
    />
  )
}
