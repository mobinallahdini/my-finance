import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

/** Derive the worker's allowlist and revision from the actual production output. */
export function applicationWorker(): Plugin {
  let root = ''
  let publicDirectory = ''
  return {
    name: 'my-finance-application-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(config) { root = config.root; publicDirectory = config.publicDir },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const files = Object.keys(bundle).filter((file) => file === 'index.html' || /^assets\/.*\.(js|css|woff2?|png|svg)$/.test(file)).sort()
        if (!files.includes('index.html')) throw new Error('PWA build requires a generated index.html.')
        const publicFiles = ['manifest.webmanifest', 'icons/finance.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png']
        const template = readFileSync(resolve(root, 'src/pwa/service-worker.js'), 'utf8')
        const revision = createHash('sha256').update(template)
        for (const file of files) {
          const output = bundle[file]
          revision.update(file).update(output.type === 'chunk' ? output.code : output.source)
        }
        for (const file of publicFiles) revision.update(file).update(readFileSync(resolve(publicDirectory, file)))
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: template
          .replace('__BUILD_REVISION__', revision.digest('hex').slice(0, 20))
          .replace('__PRECACHE_FILES__', JSON.stringify([...files, ...publicFiles])) })
      },
    },
  }
}
