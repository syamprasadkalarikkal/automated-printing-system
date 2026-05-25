import crypto from 'node:crypto'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const MAX_FUTURE_SECONDS = 30 * 60
const SHOP_ID_PATTERN = /^[a-zA-Z0-9_-]{2,64}$/
const NONCE_PATTERN = /^[a-zA-Z0-9_-]{8,96}$/
const UNIX_SECONDS_PATTERN = /^[0-9]{1,16}$/

const json = (body, status = 200) => {
  const response = NextResponse.json(body, { status })
  response.headers.set('Cache-Control', 'no-store')
  return response
}

const base64Url = (buffer) =>
  buffer
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')

const signPayload = (payload, secret) =>
  base64Url(crypto.createHmac('sha256', secret).update(payload).digest())

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) return false
  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export async function GET(request) {
  const secret = process.env.QR_ACCESS_SECRET

  if (!secret) {
    return json({
      ok: false,
      reason: 'setup',
      message: 'QR access is not configured. Add QR_ACCESS_SECRET on the website server.',
    }, 500)
  }

  const params = request.nextUrl.searchParams
  const shop = params.get('shop') || ''
  const qrExpires = params.get('qr_expires') || ''
  const nonce = params.get('qr_nonce') || ''
  const signature = params.get('qr_sig') || ''

  if (!shop || !qrExpires || !nonce || !signature) {
    return json({
      ok: false,
      reason: 'missing',
      message: 'Scan the latest QR code at the shop counter to open uploads.',
    }, 400)
  }

  if (!SHOP_ID_PATTERN.test(shop)) {
    return json({
      ok: false,
      reason: 'invalid',
      message: 'This QR code has an invalid shop id.',
    }, 400)
  }

  if (!UNIX_SECONDS_PATTERN.test(qrExpires) || !NONCE_PATTERN.test(nonce)) {
    return json({
      ok: false,
      reason: 'invalid',
      message: 'This QR code is invalid. Please scan the latest QR at the counter.',
    }, 400)
  }

  const expires = Number(qrExpires)

  if (!Number.isSafeInteger(expires) || expires < 1) {
    return json({
      ok: false,
      reason: 'invalid',
      message: 'This QR code is invalid. Please scan the latest QR at the counter.',
    }, 400)
  }

  const payload = `${shop}.${qrExpires}.${nonce}`
  const expectedSignature = signPayload(payload, secret)

  if (!safeEqual(signature, expectedSignature)) {
    return json({
      ok: false,
      reason: 'invalid',
      message: 'This QR code could not be verified. Please scan the latest QR at the counter.',
    }, 401)
  }

  const now = Math.floor(Date.now() / 1000)

  if (now > expires) {
    return json({
      ok: false,
      reason: 'expired',
      message: 'This QR has expired. Please scan the latest counter QR again.',
    }, 410)
  }

  if (expires - now > MAX_FUTURE_SECONDS) {
    return json({
      ok: false,
      reason: 'invalid',
      message: 'This QR code expiry is too far ahead. Please scan the latest QR at the counter.',
    }, 400)
  }

  return json({
    ok: true,
    shop,
    expires,
    expiresAt: new Date(expires * 1000).toISOString(),
    secondsRemaining: expires - now,
  })
}
