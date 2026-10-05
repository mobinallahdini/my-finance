// Build substitutes these two constants. No financial data enters Cache Storage.
const revision = '__BUILD_REVISION__'
const files = __PRECACHE_FILES__
const base = new URL('./', self.location.href)
const cachePrefix = `my-finance-assets:${base.pathname}:`
const cacheName = cachePrefix + revision
const shell = new URL('index.html', base).href
const assets = new Set(files.map(file => new URL(file, base).href))

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName)
    try { await cache.addAll([...assets].map(url => new Request(url, { cache: 'reload' }))) }
    catch (error) { await caches.delete(cacheName); throw error }
  })())
  // No skipWaiting: keep the current build while any old app window remains open.
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter(name => name.startsWith(cachePrefix) && name !== cacheName).map(name => caches.delete(name)))
  })())
  // Only application caches are managed. No reload, storage reset, or clients.claim.
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== base.origin) return
  const navigation = request.mode === 'navigate' && (url.pathname === base.pathname || url.pathname === new URL(shell).pathname)
  // Exact build allowlist: imports, exports, Blob URLs, and arbitrary URLs bypass us.
  if (!navigation && !assets.has(url.href)) return
  event.respondWith((async () => {
    const cache = await caches.open(cacheName)
    const cached = await cache.match(navigation ? shell : request)
    return cached ?? fetch(request)
  })())
})
