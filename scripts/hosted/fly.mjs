import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { databaseHost, generateSecret, readHostedEnv, required, writeHostedEnv } from './env-file.mjs'
import { commandExists, run } from './run.mjs'

const fly = (await commandExists('flyctl')) ? 'flyctl' : (await commandExists('fly')) ? 'fly' : ''
if (!fly) {
  console.error('flyctl is not installed. https://fly.io/docs/flyctl/install/')
  console.error('Connect the Fly MCP in Cursor Settings → MCP, then ask to continue.')
  process.exit(1)
}
try {
  await run(fly, ['auth', 'whoami'], { capture: true })
} catch {
  console.error('flyctl is not signed in. Run `fly auth login`, or connect the Fly MCP and ask to continue.')
  process.exit(1)
}

const env = await readHostedEnv()
const app = env.FLY_APP?.trim() || 'paint-with-me'
const region = env.FLY_REGION?.trim() || 'ams'
const databaseUrl = required(env, 'DATABASE_URL')
const sessionSecret = env.SESSION_SECRET?.trim() || generateSecret()
let publicOrigin = env.PUBLIC_ORIGIN?.trim() || ''
for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) {
  required(env, key)
}

const listed = await run(fly, ['apps', 'list', '--json'], { capture: true })
const apps = parseApps(listed.stdout)
if (!apps.some((item) => appName(item) === app)) {
  await run(fly, ['apps', 'create', app])
}

if (!publicOrigin) publicOrigin = `https://${app}.fly.dev`
await writeHostedEnv({
  FLY_APP: app,
  FLY_REGION: region,
  SESSION_SECRET: sessionSecret,
  PUBLIC_ORIGIN: publicOrigin,
})

await syncFlyToml(app, region)
const secrets = [
  `DATABASE_URL=${databaseUrl}`,
  `SESSION_SECRET=${sessionSecret}`,
  `PUBLIC_ORIGIN=${publicOrigin}`,
  `CLIENT_ORIGIN=${publicOrigin}`,
  `R2_ACCOUNT_ID=${required(env, 'R2_ACCOUNT_ID')}`,
  `R2_ACCESS_KEY_ID=${required(env, 'R2_ACCESS_KEY_ID')}`,
  `R2_SECRET_ACCESS_KEY=${required(env, 'R2_SECRET_ACCESS_KEY')}`,
  `R2_BUCKET=${required(env, 'R2_BUCKET')}`,
]
const googleClientId = env.GOOGLE_CLIENT_ID?.trim()
if (googleClientId) secrets.push(`GOOGLE_CLIENT_ID=${googleClientId}`)
await run(fly, ['secrets', 'set', '--app', app, '--stage', ...secrets])
await run(fly, ['deploy', '--ha=false', '--remote-only', '--app', app])
console.log(`Deployed ${app}. Public origin ${publicOrigin}. Database host ${databaseHost(databaseUrl)}.`)
console.log('Add that origin to the Google OAuth client, then set GOOGLE_CLIENT_ID in .env.hosted and run pnpm host:fly again.')

async function syncFlyToml(appName, regionName) {
  const file = path.resolve(process.cwd(), 'fly.toml')
  const text = await readFile(file, 'utf8')
  const next = text
    .replace(/^app = ".*"$/m, `app = "${appName}"`)
    .replace(/^primary_region = ".*"$/m, `primary_region = "${regionName}"`)
  if (next !== text) await writeFile(file, next)
}

function parseApps(stdout) {
  const start = stdout.indexOf('[')
  if (start === -1) return []
  const parsed = JSON.parse(stdout.slice(start))
  return Array.isArray(parsed) ? parsed : []
}

function appName(item) {
  if (!item || typeof item !== 'object') return ''
  if ('name' in item && typeof item.name === 'string') return item.name
  if ('Name' in item && typeof item.Name === 'string') return item.Name
  return ''
}
