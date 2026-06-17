import { cn } from '@/lib/utils'

type BadgeVariant = 'blue' | 'amber' | 'green' | 'red' | 'gray' | 'purple' | 'teal'

const variants: Record<BadgeVariant, string> = {
  blue:   'bg-blue-100 text-blue-800',
  amber:  'bg-amber-100 text-amber-800',
  green:  'bg-green-100 text-green-800',
  red:    'bg-red-100 text-red-800',
  gray:   'bg-gray-100 text-gray-700',
  purple: 'bg-purple-100 text-purple-800',
  teal:   'bg-teal-100 text-teal-700',
}

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

export function Badge({ variant = 'gray', children, className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
      variants[variant],
      className
    )}>
      {children}
    </span>
  )
}
