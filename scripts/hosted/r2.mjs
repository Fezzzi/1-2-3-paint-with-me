import { readHostedEnv, required, writeHostedEnv } from './env-file.mjs'

const bucket = 'paint-with-me'
const env = await readHostedEnv()

if (!env.CLOUDFLARE_API_TOKEN?.trim() || !env.CLOUDFLARE_ACCOUNT_ID?.trim()) {
  console.error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are empty in .env.hosted.')
  console.error('Connect the Cloudflare MCP in Cursor Settings → MCP, then ask to continue,')
  console.error('or create a token with Cloudflare R2 edit permission.')
  process.exit(1)
}

const accountId = required(env, 'CLOUDFLARE_ACCOUNT_ID')
const token = required(env, 'CLOUDFLARE_API_TOKEN')
const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}`,
  {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ locationHint: 'weur' }),
  },
)
const body = await response.json().catch(() => ({}))
const already = response.status === 409 || errorCode(body) === 10004
if (!response.ok && !already) {
  const message = errorMessage(body) || response.statusText
  console.error(`Cloudflare did not create the R2 bucket (${response.status}): ${message}`)
  process.exit(1)
}

const updates = {
  CLOUDFLARE_ACCOUNT_ID: accountId,
  R2_ACCOUNT_ID: env.R2_ACCOUNT_ID?.trim() || accountId,
  R2_BUCKET: bucket,
}
await writeHostedEnv(updates)
console.log(`${already ? 'R2 bucket already exists' : 'Created R2 bucket'} ${bucket} in Western Europe.`)

if (!env.R2_ACCESS_KEY_ID?.trim() || !env.R2_SECRET_ACCESS_KEY?.trim()) {
  console.error('')
  console.error('The bucket is ready. R2 still needs S3 credentials in .env.hosted:')
  console.error('  R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY')
  console.error(`Create them at https://dash.cloudflare.com/${accountId}/r2/api-tokens`)
  console.error('Permission: Object Read & Write. Scope the token to this bucket.')
  console.error('R2_ACCOUNT_ID is already set to the Cloudflare account id.')
  process.exit(2)
}

function errorCode(body) {
  const errors = body && typeof body === 'object' && 'errors' in body ? body.errors : undefined
  if (!Array.isArray(errors) || !errors[0] || typeof errors[0] !== 'object') return undefined
  return errors[0].code
}

function errorMessage(body) {
  const errors = body && typeof body === 'object' && 'errors' in body ? body.errors : undefined
  if (!Array.isArray(errors) || !errors[0] || typeof errors[0] !== 'object') return ''
  return typeof errors[0].message === 'string' ? errors[0].message : ''
}
