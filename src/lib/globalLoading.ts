let activeCount = 0

export function showGlobalLoading() {
  activeCount++
  if (activeCount === 1) {
    window.dispatchEvent(new CustomEvent('global-loading', { detail: { show: true } }))
  }
}

export function hideGlobalLoading() {
  activeCount = Math.max(0, activeCount - 1)
  if (activeCount === 0) {
    window.dispatchEvent(new CustomEvent('global-loading', { detail: { show: false } }))
  }
}
