import { Readable } from 'node:stream'
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import type { R2Config } from '../config.js'

let client: S3Client | undefined
let clientKey = ''

function clientFor(settings: R2Config): S3Client {
  const key = `${settings.accountId}\n${settings.accessKeyId}`
  if (client && clientKey === key) return client
  clientKey = key
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${settings.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  return client
}

export async function putR2Object(settings: R2Config, key: string, bytes: Uint8Array, mimeType: string): Promise<void> {
  await clientFor(settings).send(
    new PutObjectCommand({
      Bucket: settings.bucket,
      Key: key,
      Body: bytes,
      ContentType: mimeType,
    }),
  )
}

export async function openR2Object(settings: R2Config, key: string): Promise<Readable> {
  const response = await clientFor(settings).send(
    new GetObjectCommand({
      Bucket: settings.bucket,
      Key: key,
    }),
  )
  if (!response.Body) {
    const missing = new Error('Missing object')
    missing.name = 'NotFound'
    throw missing
  }
  const bytes = await response.Body.transformToByteArray()
  return Readable.from([Buffer.from(bytes)])
}

export async function deleteR2Object(settings: R2Config, key: string): Promise<void> {
  await clientFor(settings).send(
    new DeleteObjectCommand({
      Bucket: settings.bucket,
      Key: key,
    }),
  )
}

export async function deleteR2Prefix(settings: R2Config, prefix: string): Promise<void> {
  const s3 = clientFor(settings)
  let token: string | undefined
  do {
    const listed = await s3.send(
      new ListObjectsV2Command({
        Bucket: settings.bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    )
    const objects = (listed.Contents ?? []).flatMap((item) => (item.Key ? [{ Key: item.Key }] : []))
    if (objects.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: settings.bucket,
          Delete: { Objects: objects },
        }),
      )
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined
  } while (token)
}

export async function assertR2Ready(settings: R2Config): Promise<void> {
  await clientFor(settings).send(new HeadBucketCommand({ Bucket: settings.bucket }))
}

export function isMissingR2Object(error: unknown): boolean {
  if (error instanceof NoSuchKey) return true
  return error instanceof Error && (error.name === 'NotFound' || error.name === 'NoSuchKey')
}
