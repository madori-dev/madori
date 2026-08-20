import { access, chmod, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const emittedEntry = './packages/madori-cli/src/index.js'
const distRoot = resolve(packageRoot, 'dist')

async function rewriteWorkspaceAliases(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      await rewriteWorkspaceAliases(filePath)
      continue
    }
    if (!entry.isFile() || extname(entry.name) !== '.js') continue
    const source = await readFile(filePath, 'utf8')
    let rewritten = source.replace(/(['"])@\/lib\/([^'"]+)\1/g, (_match, quote, suffix) => {
      const target = resolve(
        distRoot,
        'src',
        'lib',
        suffix === 'mutations' ? 'mutations/index.js' : (suffix.endsWith('.js') ? suffix : `${suffix}.js`),
      )
      let importPath = relative(dirname(filePath), target).split(sep).join('/')
      if (!importPath.startsWith('.')) importPath = `./${importPath}`
      return `${quote}${importPath}${quote}`
    })
    const specifiers = [...rewritten.matchAll(/from\s*(['"])(\.[^'"]+)\1/g)]
    for (const [, quote, specifier] of specifiers) {
      if (/\.(?:c?m?js|json)$/.test(specifier)) continue
      try {
        await access(resolve(dirname(filePath), `${specifier}.js`))
      } catch {
        continue
      }
      rewritten = rewritten.replace(`${quote}${specifier}${quote}`, `${quote}${specifier}.js${quote}`)
    }
    if (rewritten !== source) await writeFile(filePath, rewritten, 'utf8')
  }
}

await rewriteWorkspaceAliases(distRoot)

// TypeScript currently emits shared workspace imports under dist/src and CLI
// sources under dist/packages/madori-cli/src. Keep package bin stable while
// retaining those files inside published dist.
await writeFile(
  resolve(packageRoot, 'dist/index.js'),
  `#!/usr/bin/env node\nimport '${emittedEntry}'\n`,
  'utf8',
)
// Shared workspace modules are emitted under dist/src, outside the CLI
// package's source package boundary. Mark that subtree ESM as well.
await writeFile(resolve(packageRoot, 'dist/src/package.json'), '{"type":"module"}\n', 'utf8')
await chmod(resolve(packageRoot, 'dist/index.js'), 0o755)
