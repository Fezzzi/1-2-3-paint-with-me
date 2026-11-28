import { commandExists, run } from './run.mjs'
import { databaseHost, readHostedEnv, writeHostedEnv } from './env-file.mjs'

const projectName = 'paint-with-me'
const region = 'aws-eu-central-1'
const database = 'paint_with_me'

const env = await readHostedEnv()
if (!env.NEON_API_KEY?.trim()) {
  console.error('NEON_API_KEY is empty in .env.hosted.')
  console.error('Connect the Neon MCP in Cursor Settings → MCP, then ask to continue,')
  console.error('or create a key at https://console.neon.tech/app/settings/api-keys')
  process.exit(1)
}
process.env.NEON_API_KEY = env.NEON_API_KEY.trim()

if (!(await commandExists('npx'))) {
  console.error('npx is not on PATH.')
  process.exit(1)
}

const neon = ['--yes', 'neon@latest']
let projectId = env.NEON_PROJECT_ID?.trim() ?? ''
if (!projectId) {
  const listed = await run('npx', [...neon, 'projects', 'list', '--output', 'json'], { capture: true })
  projectId = findProjectId(listed.stdout, projectName) ?? ''
}
if (!projectId) {
  const created = await run(
    'npx',
    [
      ...neon,
      'projects',
      'create',
      '--name',
      projectName,
      '--region-id',
      region,
      '--database',
      database,
      '--pg-version',
      '16',
      '--no-secrets',
      '--output',
      'json',
    ],
    { capture: true },
  )
  projectId = findProjectId(created.stdout, projectName) ?? ''
  if (!projectId) {
    console.error('Neon created a project, but the id was not in the JSON. Re-run after checking `npx neon projects list`.')
    process.exit(1)
  }
}

const connection = await run(
  'npx',
  [
    ...neon,
    'connection-string',
    '--project-id',
    projectId,
    '--database-name',
    database,
    '--pooled',
    '--ssl',
    'require',
  ],
  { capture: true },
)
const databaseUrl = stripChannelBinding(connection.stdout.trim())
if (!databaseUrl.startsWith('postgres')) {
  console.error('Neon did not return a connection string.')
  process.exit(1)
}

await writeHostedEnv({ NEON_PROJECT_ID: projectId, DATABASE_URL: databaseUrl })
console.log(`Neon project ${projectId} in ${region}. Wrote DATABASE_URL for ${databaseHost(databaseUrl)} to .env.hosted.`)

function stripChannelBinding(value) {
  const query = value.indexOf('?')
  if (query === -1) return value
  const params = value
    .slice(query + 1)
    .split('&')
    .filter((part) => part.length > 0 && !part.startsWith('channel_binding='))
  return params.length > 0 ? `${value.slice(0, query)}?${params.join('&')}` : value.slice(0, query)
}

function findProjectId(stdout, name) {
  const json = parseJson(stdout)
  const projects = Array.isArray(json) ? json : projectsOf(json)
  const match = projects.find((project) => project.name === name || project.id === name)
  if (match?.id) return String(match.id)
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const project = json.project
    if (project && typeof project === 'object' && 'id' in project && project.id) return String(project.id)
    if ('id' in json && json.id) return String(json.id)
  }
  return null
}

function projectsOf(json) {
  if (!json || typeof json !== 'object') return []
  if (Array.isArray(json.projects)) return json.projects
  return []
}

function parseJson(stdout) {
  const start = stdout.indexOf('{')
  const list = stdout.indexOf('[')
  const cut = start === -1 ? list : list === -1 ? start : Math.min(start, list)
  if (cut === -1) throw new Error('Neon CLI did not return JSON')
  return JSON.parse(stdout.slice(cut))
}
