import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

export function run(command, args, { capture = false } = {}) {
  const resolved = resolveCommand(command, args)
  return new Promise((resolve, reject) => {
    const child = spawn(resolved.command, resolved.args, {
      shell: false,
      windowsHide: true,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      env: process.env,
    })
    let stdout = ''
    let stderr = ''
    if (capture) {
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk) => {
        stdout += chunk
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk
      })
    }
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}\n${stderr}`.trim()))
    })
  })
}

function resolveCommand(command, args) {
  if (process.platform !== 'win32' || command.includes('\\') || command.includes('/')) {
    return { command, args }
  }
  if (command === 'npx') {
    const cli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')
    if (existsSync(cli)) return { command: process.execPath, args: [cli, ...args] }
  }
  const exe = path.join(path.dirname(process.execPath), `${command}.exe`)
  if (existsSync(exe)) return { command: exe, args }
  return { command, args }
}

export async function commandExists(command) {
  try {
    await run(command, ['--version'], { capture: true })
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    return false
  }
}
