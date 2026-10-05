/** Production only; unavailable/blocked service workers leave the ordinary app usable. */
export function registerApplicationWorker() {
  // Follow the existing theme state without introducing another saved preference.
  const updateChrome = () => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--color-canvas').trim()
  }
  new MutationObserver(updateChrome).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  updateChrome()
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return
  const register = () => {
    const base = new URL(import.meta.env.BASE_URL, document.baseURI)
    void navigator.serviceWorker.register(new URL('sw.js', base), {
      scope: base.pathname,
      updateViaCache: 'none',
    }).catch(() => {
      // Offline first visits or disabled workers cannot provide offline installation.
      // Records and preferences continue using their existing browser storage.
    })
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}
