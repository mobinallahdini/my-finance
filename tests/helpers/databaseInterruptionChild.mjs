// Owned subprocess for abrupt browser-process termination against synthetic data.
import { pathToFileURL } from 'node:url'
import { historical } from './installmentBaseline.mjs'

process.on('message', async ({ engine, profile, url, phase }) => {
  let context
  try {
    const playwright = await import(pathToFileURL(process.env.FINANCE_PLAYWRIGHT_MODULE).href)
    context = await playwright[engine].launchPersistentContext(profile, {
      headless: true,
      ...(engine === 'chromium' ? { executablePath: process.env.CHROME_BIN ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' } : {}),
    })
    const page = await context.newPage()
    await page.goto(url)
    await page.evaluate(`(async()=>{window.proto=await import('/__compat/prototype.mjs');return true})()`)
    if (phase === 'hold') {
      await page.evaluate(`(async()=>{window.old={...(await import('/src/persistence/database.ts')),...(await import('/src/persistence/dataBackup.ts'))};await old.replaceWorkspaceSnapshot(${JSON.stringify(historical.workspace)});return true})()`)
      const before = await page.evaluate('proto.readDatabase()')
      await page.evaluate(`(()=>{window.__migration=proto.upgrade({mode:'guarded',holdBeforeCommit:true}).catch(()=>false);return true})()`)
      await page.waitForFunction(`window.__prototypeEvents?.some(event=>event.type==='held-upgrade')`)
      process.send({ ready: true, before })
      // Parent kills this process tree, including the browser. No graceful close.
      return
    }
    const before = await page.evaluate('proto.readDatabase()')
    await page.evaluate(`proto.upgrade({mode:'guarded'})`)
    const after = await page.evaluate('proto.readDatabase()')
    if (phase === 'commit') {
      process.send({ ready: true, before, after })
      return
    }
    await context.close()
    process.send({ ready: true, before, after }, () => process.disconnect())
  } catch (error) {
    if (context) await context.close().catch(() => {})
    process.send({ error: String(error), stack: error.stack }, () => process.disconnect())
  }
})
