import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const steps = [
  ['neon.mjs', 'Neon'],
  ['r2.mjs', 'Cloudflare R2'],
  ['fly.mjs', 'Fly'],
]

for (const [file, label] of steps) {
  console.log(`\n${label}`)
  const code = await runNode(path.join(here, file))
  if (code !== 0) process.exit(code)
}

function runNode(script) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { stdio: 'inherit' })
    child.on('close', (code) => resolve(code ?? 1))
  })
}
