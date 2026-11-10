// Optional, external test driver. Never imported by production or installed at runtime.
import { pathToFileURL } from 'node:url'

export async function launchPlaywrightCompatibilityBrowser(engine) {
  const driver = process.env.FINANCE_PLAYWRIGHT_MODULE
  const playwright = driver ? await import(pathToFileURL(driver).href) : await import('playwright')
  if (!['firefox', 'webkit'].includes(engine)) throw new Error('Unsupported compatibility engine: ' + engine)
  const browser = await playwright[engine].launch({ headless: true })
  const contexts = new Map(), pages = new Map(), events = []
  let sequence = 0
  const admin = { async send(method, params = {}) {
    if (method === 'Browser.getVersion') return { product: engine + '/' + browser.version(), driver: 'playwright', executable: playwright[engine].executablePath() }
    if (method === 'Target.closeTarget') { await pages.get(params.targetId).close(); return { success: true } }
    throw new Error('Unsupported browser command: ' + method)
  } }
  return { admin, events, engine, supportsForcedWorkerActivation: false,
    async context() {
      const id = String(++sequence)
      contexts.set(id, await browser.newContext({ timezoneId: 'America/Toronto' }))
      return id
    },
    async page(url, contextId) {
      const context = contexts.get(contextId), page = await context.newPage(), targetId = String(++sequence)
      pages.set(targetId, page)
      // Keep the existing Chromium harness expressions unchanged across engines.
      const client = { targetId,
        async evaluate(expression) { return page.evaluate(expression) },
        async run(script) { return page.evaluate('(async()=>{' + script + ';return true})()') },
        async send(method, params = {}) {
          if (['Page.enable', 'Runtime.enable', 'Network.enable', 'Emulation.setTimezoneOverride'].includes(method)) return {}
          if (method === 'Page.navigate') return page.goto(params.url)
          if (method === 'Page.reload') return page.reload()
          if (method === 'Page.addScriptToEvaluateOnNewDocument') return page.addInitScript(params.source)
          if (method === 'Network.emulateNetworkConditions') return context.setOffline(params.offline)
          throw new Error('Unsupported page command: ' + method)
        },
      }
      await page.goto(url)
      return client
    },
    async wait(client, expression) {
      const page = pages.get(client.targetId)
      await page.waitForFunction(expression, undefined, { timeout: 20000 })
    },
    async dispose(contextId) { await contexts.get(contextId).close(); contexts.delete(contextId) },
    async close() { await browser.close() },
  }
}
