import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export default async function teardown() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  await rm(path.join(projectRoot, 'tests/e2e/.madori'), { recursive: true, force: true })
}
