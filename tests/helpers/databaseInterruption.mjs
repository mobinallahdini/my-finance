import assert from 'node:assert/strict'
import { fork, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function qualifyBrowserTermination(engine, url) {
  if (!process.env.FINANCE_PLAYWRIGHT_MODULE || process.platform !== 'win32') {
    return { classification: 'UNPROVEN', reason: 'Requires external Playwright driver and Windows owned-process-tree termination.' }
  }
  const profile = await mkdtemp(join(tmpdir(), 'my-finance-interruption-profile-'))
  const children = new Set()
  async function start(phase) {
    const child = fork(fileURLToPath(new URL('./databaseInterruptionChild.mjs', import.meta.url)), [], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
    children.add(child)
    let log = ''
    child.stdout.on('data', data => { log += data }); child.stderr.on('data', data => { log += data })
    const result = await new Promise((done, reject) => {
      const timer = setTimeout(() => reject(new Error('Interruption subprocess timed out: ' + log)), 45000)
      child.once('message', message => { clearTimeout(timer); message.error ? reject(new Error(message.error + '\n' + message.stack)) : done(message) })
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('exit', code => { clearTimeout(timer); reject(new Error('Interruption subprocess exited ' + code + ': ' + log)) })
      child.send({ engine, profile, url, phase })
    })
    return { child, ...result }
  }
  async function terminate(child) {
    // Only the exact subprocess created here and its descendants are terminated.
    assert.ok(children.has(child) && child.pid > 0)
    if(child.exitCode!==null||child.signalCode!==null){children.delete(child);throw new Error('Owned browser subprocess exited before abrupt termination')}
    const exited = new Promise(done => child.once('exit', done))
    await promisify(execFile)('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
    await exited
    children.delete(child)
  }
  try {
    const held = await start('hold'); await terminate(held.child)
    const committed = await start('commit'); await terminate(committed.child)
    const reopened = await start('reopen')
    await new Promise(done => reopened.child.exitCode !== null ? done() : reopened.child.once('exit', done))
    children.delete(reopened.child)
    return { classification: 'observed', beforeTermination: held.before, afterUncommittedTermination: committed.before,
      committedBeforeTermination: committed.after, afterCommittedTermination: reopened.before, afterRepeatedGate: reopened.after }
  } finally {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) await terminate(child).catch(()=>{})
    const target = resolve(profile)
    assert.equal(dirname(target), resolve(tmpdir())); assert.ok(basename(target).startsWith('my-finance-interruption-profile-'))
    await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
}
