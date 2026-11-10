import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'

export async function launchCompatibilityBrowser() {
  const engine=process.env.FINANCE_COMPATIBILITY_ENGINE??'chromium'
  if(engine!=='chromium')return (await import('./compatibilityPlaywright.mjs')).launchPlaywrightCompatibilityBrowser(engine)
  const profile=await mkdtemp(join(tmpdir(),'my-finance-compatibility-profile-'))
  const executable=process.env.CHROME_BIN??(process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':'google-chrome')
  const processHandle=spawn(executable,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'})
  let launchError,port;processHandle.on('error',error=>{launchError=error})
  for(let index=0;index<200;index++){if(launchError)throw launchError;try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break}catch{await delay(50)}}
  assert.ok(port,'Disposable Chrome debugging endpoint')
  const endpoint=`http://127.0.0.1:${port}`,clients=[],events=[]
  function connect(url) {
    const socket=new WebSocket(url),pending=new Map();let sequence=0
    const opened=new Promise((done,reject)=>{socket.onopen=done;socket.onerror=reject})
    socket.onmessage=({data})=>{const message=JSON.parse(data),promise=pending.get(message.id);if(promise){pending.delete(message.id);if(message.error)promise.reject(new Error(JSON.stringify(message.error)));else promise.resolve(message.result)}else if(message.method)events.push(message)}
    const client={socket,async send(method,params={}){await opened;return new Promise((done,reject)=>{const id=++sequence;pending.set(id,{resolve:done,reject});socket.send(JSON.stringify({id,method,params}))})},async evaluate(expression){const result=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result.value},async run(script){return this.evaluate('(async()=>{'+script+';return true})()')}}
    clients.push(client);return client
  }
  const admin=connect((await(await fetch(endpoint+'/json/version')).json()).webSocketDebuggerUrl)
  async function wait(client,expression){for(let index=0;index<300;index++){if(await client.evaluate(expression))return;await delay(50)}throw new Error('Timed out: '+expression)}
  return {admin,events,wait,engine,supportsForcedWorkerActivation:true,async context(){return (await admin.send('Target.createBrowserContext')).browserContextId},
    async page(url,contextId){const {targetId}=await admin.send('Target.createTarget',{url,browserContextId:contextId});let page;for(let index=0;index<100;index++){page=(await(await fetch(endpoint+'/json/list')).json()).find(page=>page.id===targetId);if(page?.webSocketDebuggerUrl)break;await delay(20)}const client=connect(page.webSocketDebuggerUrl);client.targetId=targetId;await client.send('Page.enable');await client.send('Runtime.enable');await wait(client,`location.href===${JSON.stringify(url)}&&document.readyState==='complete'`);return client},
    async dispose(contextId){await admin.send('Target.disposeBrowserContext',{browserContextId:contextId})},
    async close(){try{await admin.send('Browser.close')}catch{}for(const client of clients)client.socket.close();if(processHandle.exitCode===null)processHandle.kill();const target=resolve(profile);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('my-finance-compatibility-profile-'));await rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100})}}
}
