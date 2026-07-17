import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { hostname, userInfo, platform } from 'node:os'

export interface EncBlob {
  v: number
  salt: string
  iv: string
  tag: string
  data: string
}

export function machineMaterial(): string {
  return `${hostname()}\0${userInfo().username}\0${platform()}`
}

export function encrypt(plain: string, material: string = machineMaterial()): EncBlob {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = scryptSync(material, salt, 32)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    v: 1,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: data.toString('base64'),
  }
}

export function decrypt(blob: EncBlob, material: string = machineMaterial()): string {
  const key = scryptSync(material, Buffer.from(blob.salt, 'base64'), 32)
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'))
  const out = Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()])
  return out.toString('utf8')
}
