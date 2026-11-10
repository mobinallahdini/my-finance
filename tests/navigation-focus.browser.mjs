// Navigation focus in development Strict Mode and production. Node 24 + Chrome.
// Both servers and the browser profile are isolated; no user's browser data is used.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer, normalizePath, preview } from 'vite'

const profile = await mkdtemp(join(tmpdir(), 'my-finance-navigation-focus-'))
const chrome = process.env.CHROME_BIN ?? (process.platform === 'win32'
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome')
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0, launchError, development, production
const pending = new Map(), results = [], exceptions = []
browser.on('error', error => { launchError = error })

function send(method, params = {}) {
  return new Promise((resolvePromise, reject) => {
    const id = ++sequence
    pending.set(id, { resolve: resolvePromise, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
  return response.result.value
}
async function wait(expression) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await evaluate(expression)) return
    await delay(50)
  }
  throw new Error(`Timed out: ${expression}`)
}
async function settled() {
  await wait(`!!document.querySelector('.app-main h2') && !document.querySelector('[aria-busy="true"]')`)
  // Wait for rendering/effects without relying on an arbitrary post-navigation sleep.
  await evaluate(`new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))`)
}
async function check(expression, name) {
  assert.ok(await evaluate(expression), name)
  results.push(name)
  console.log(`PASS ${name}`)
}
async function pointer(selector) {
  const point = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) throw new Error('Missing pointer target')
    element.scrollIntoView({ block: 'center' })
    const box = element.getBoundingClientRect()
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  })()`)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point })
}
async function key(value) {
  const code = { Tab: 9, Enter: 13, Escape: 27 }[value]
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: value, code: value, windowsVirtualKeyCode: code,
    ...(value === 'Enter' ? { text: '\r' } : {}) })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: value, code: value, windowsVirtualKeyCode: code })
}
async function tabTo(selector) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await evaluate(`document.activeElement.matches(${JSON.stringify(selector)})`)) return
    await key('Tab')
  }
  throw new Error(`Could not reach ${selector} with Tab`)
}
async function screen(selector) {
  await wait(`!!document.querySelector(${JSON.stringify(selector)})`)
  await settled()
}
async function initial(url, hash, selector) {
  // A new document is required even when the previous test used the same hash.
  await send('Page.navigate', { url: 'about:blank' })
  await wait(`location.href === 'about:blank'`)
  await send('Page.navigate', { url: url + hash })
  await screen(selector)
}
const visibleFocus = `document.activeElement.matches(':focus-visible') &&
  getComputedStyle(document.activeElement).outlineStyle !== 'none' &&
  parseFloat(getComputedStyle(document.activeElement).outlineWidth) > 0`
const snapshot = `(() => new Promise((resolveSnapshot, reject) => {
  const request = indexedDB.open('my-finance')
  request.onerror = () => reject(request.error)
  request.onsuccess = () => {
    const database = request.result
    const names = Array.from(database.objectStoreNames).sort()
    const transaction = database.transaction(names, 'readonly')
    const data = {}
    for (const name of names) {
      const read = transaction.objectStore(name).getAll()
      read.onsuccess = () => { data[name] = read.result }
    }
    transaction.oncomplete = () => { database.close(); resolveSnapshot({ version: database.version, data }) }
    transaction.onabort = () => { database.close(); reject(transaction.error) }
  }
}))()`

try {
  development = await createServer({
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'navigation-test-strict-mode-probe', enforce: 'pre',
      transform(source, id) {
        if (id.split('?')[0] !== normalizePath(resolve('src/main.tsx'))) return
        // In-memory test instrumentation only: prove that the real development
        // entry point replays mount effects inside its existing StrictMode tree.
        return source.replace('import { StrictMode }', 'import { StrictMode, useEffect }')
          .replace('registerApplicationWorker()', `function NavigationFocusProbe() {
            useEffect(() => { window.__navigationStrictEffects = (window.__navigationStrictEffects ?? 0) + 1 }, [])
            return null
          }
          registerApplicationWorker()`)
          .replace('<StrictMode>', '<StrictMode><NavigationFocusProbe />')
      },
    }],
  })
  await development.listen()
  production = await preview({ preview: { host: '127.0.0.1', port: 0 } })
  const targets = [
    ['development', `http://127.0.0.1:${development.httpServer.address().port}/`],
    ['production', `http://127.0.0.1:${production.httpServer.address().port}/`],
  ]

  let port
  for (let attempt = 0; attempt < 200; attempt++) {
    if (launchError) throw launchError
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break }
    catch { await delay(50) }
  }
  assert.ok(port, 'Chrome exposes its debugging port')
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolveOpen, reject) => { socket.onopen = resolveOpen; socket.onerror = reject })
  socket.onmessage = ({ data }) => {
    const response = JSON.parse(data), promise = pending.get(response.id)
    if (promise) {
      pending.delete(response.id)
      if (response.error) promise.reject(new Error(JSON.stringify(response.error)))
      else promise.resolve(response.result)
    }
    if (response.method === 'Runtime.exceptionThrown') exceptions.push(response.params.exceptionDetails.text)
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__headingFocusCalls = []
    const originalFocus = HTMLElement.prototype.focus
    HTMLElement.prototype.focus = function (...args) {
      if (this.matches('h2')) window.__headingFocusCalls.push(this.id)
      return originalFocus.apply(this, args)
    }
  ` })

  for (const [mode, url] of targets) {
    await send('Page.navigate', { url })
    await wait(`!!document.querySelector('.finance-onboarding')`)
    // Complete setup in this disposable profile. No financial fixtures are needed.
    await evaluate(`(() => {
      for (const [field, value] of [['country', 'CA'], ['currency', 'CAD']]) {
        const select = document.querySelector('select[id$="-' + field + '"]')
        select.value = value
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })()`)
    await pointer('.finance-save')
    await screen('#dashboard-heading')
    await check(`!window.__headingFocusCalls.includes('dashboard-heading')`, `${mode}: setup completion does not focus Home`)
    const baseline = await evaluate(snapshot)

    for (const theme of ['sage', 'ocean', 'dark']) {
      await evaluate(`localStorage.setItem('my-finance-theme', ${JSON.stringify(theme)})`)
      const label = `${mode} ${theme}`
      for (const hash of ['', '#home']) {
        await initial(url, hash, '#dashboard-heading')
        await check(`document.documentElement.dataset.theme === ${JSON.stringify(theme)} &&
          document.activeElement === document.body && window.__headingFocusCalls.length === 0 &&
          !document.querySelector('#dashboard-heading:focus') && document.title === 'Home | My Finance'`,
        `${label}: initial ${hash || 'empty hash'} has no heading focus or rectangle`)
        if (mode === 'development') await check(`window.__navigationStrictEffects === 2`, `${label}: initial mount effects replay under Strict Mode (${hash || 'empty hash'})`)
      }

      const timeOrigin = await evaluate('performance.timeOrigin')
      await pointer('.app-navigation a[href="#accounts"]')
      await screen('#accounts-heading')
      await check(`document.activeElement.id === 'accounts-heading' && window.__headingFocusCalls.length === 1`, `${label}: pointer navigation focuses Accounts exactly once`)
      await pointer('.app-navigation a[href="#transactions"]')
      await screen('#transactions-heading')
      await check(`document.activeElement.id === 'transactions-heading' && document.title === 'Transactions | My Finance'`, `${label}: pointer navigation focuses Transactions`)

      await evaluate('history.back()')
      await screen('#accounts-heading')
      await check(`document.activeElement.id === 'accounts-heading'`, `${label}: browser Back focuses Accounts`)
      await evaluate('history.back()')
      await screen('#dashboard-heading')
      await check(`document.activeElement.id === 'dashboard-heading'`, `${label}: browser Back focuses Home`)
      await evaluate('history.forward()')
      await screen('#accounts-heading')
      await check(`document.activeElement.id === 'accounts-heading' && performance.timeOrigin === ${timeOrigin}`, `${label}: Forward preserves client-side navigation and heading focus`)

      await initial(url, '#home', '#dashboard-heading')
      await key('Tab')
      await check(`document.activeElement.matches('.skip-link') && ${visibleFocus} &&
        document.activeElement.getBoundingClientRect().top >= 0`, `${label}: first Tab reveals the skip link with visible focus`)
      await key('Enter')
      await check(`document.activeElement.id === 'dashboard-heading' && location.hash === '#home' && ${visibleFocus}`, `${label}: skip link focuses Home without changing the route`)
      await key('Tab')
      await check(`document.activeElement.matches('.dashboard-month-controls button') && ${visibleFocus}`, `${label}: Tab continues into Home controls with a visible indicator`)
      const focusCount = await evaluate('window.__headingFocusCalls.length')
      await key('Enter')
      await settled()
      await check(`document.activeElement.matches('.dashboard-month-controls button') &&
        window.__headingFocusCalls.length === ${focusCount}`, `${label}: changing month retains control focus`)

      await tabTo('.app-navigation a[href="#accounts"]')
      await check(visibleFocus, `${label}: keyboard navigation link has a visible indicator`)
      await key('Enter')
      await screen('#accounts-heading')
      await check(`document.activeElement.id === 'accounts-heading' && ${visibleFocus}`, `${label}: keyboard navigation focuses the destination visibly`)

      for (const [hash, heading] of [['#accounts', 'accounts-heading'], ['#transactions', 'transactions-heading'], ['#more/categories', 'categories-heading']]) {
        await initial(url, hash, `#${heading}`)
        await check(`document.activeElement === document.body && window.__headingFocusCalls.length === 0 &&
          location.hash === ${JSON.stringify(hash)}`, `${label}: initial deep link ${hash} does not auto-focus its route heading`)
        await pointer('.app-navigation a[href="#home"]')
        await screen('#dashboard-heading')
        await check(`document.activeElement.id === 'dashboard-heading' && window.__headingFocusCalls.length === 1`, `${label}: navigation from ${hash} focuses Home exactly once`)
      }

      await initial(url, '#transactions/new', '#transactions-heading')
      await wait(`document.activeElement.matches('dialog[open] input[id$="-amount"]')`)
      await check(`!window.__headingFocusCalls.includes('transactions-heading')`, `${label}: initial editor deep link retains Amount focus`)
      await key('Escape')
      await wait(`!document.querySelector('dialog[open]') && document.activeElement.matches('.transaction-add')`)
      await check(`document.activeElement.matches('.transaction-add') && ${visibleFocus}`, `${label}: editor Escape restores visible Add focus`)
      await key('Enter')
      await wait(`document.activeElement.matches('dialog[open] input[id$="-amount"]')`)
      await check(`!window.__headingFocusCalls.includes('transactions-heading')`, `${label}: same-screen editor reopening retains Amount focus`)
      await key('Escape')
      await wait(`!document.querySelector('dialog[open]')`)

      await initial(url, '#more/finance-settings', '.finance-settings')
      await check(`document.activeElement === document.querySelector('.finance-settings h2')`, `${label}: settings deep link retains its feature-owned focus`)
      assert.deepEqual(await evaluate(snapshot), baseline, `${label}: navigation leaves all stored records and schema unchanged`)
      results.push(`${label}: database unchanged`)
    }
  }
  assert.deepEqual(exceptions, [], 'No uncaught browser exceptions')
  console.log(`\n${results.length} navigation focus browser checks passed (development Strict Mode and production).`)
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) {
    console.error(await evaluate(`({ url: location.href, active: document.activeElement?.outerHTML,
      focusCalls: window.__headingFocusCalls, text: document.body?.textContent.slice(0, 1200) })`))
  }
  throw error
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ id: ++sequence, method: 'Browser.close' }))
    socket.close()
  }
  if (browser.exitCode === null) browser.kill()
  if (development) await development.close()
  if (production) {
    production.httpServer.closeAllConnections()
    await new Promise(resolveClose => production.httpServer.close(resolveClose))
  }
  const target = resolve(profile)
  assert.equal(dirname(target), resolve(tmpdir()))
  assert.ok(basename(target).startsWith('my-finance-navigation-focus-'))
  await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}
