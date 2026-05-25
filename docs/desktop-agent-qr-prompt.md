# Desktop Agent Prompt: Dynamic PrintQ QR

Build a desktop counter agent that displays a dynamic QR code for the PrintQ upload website. The QR must refresh every 5 minutes and must never be a static website URL.

Configuration:
- `PUBLIC_WEBSITE_URL`: the deployed website URL, for example `https://printq.example.com`
- `SHOP_ID`: the shop/counter id, for example `main-counter`
- `QR_ACCESS_SECRET`: a long random secret shared with the website server only

The website server must also have the same `QR_ACCESS_SECRET` environment variable. Do not put this secret in the customer website frontend, QR image, logs, or screenshots.

Generate each QR URL like this:

```js
import crypto from 'node:crypto'

const PUBLIC_WEBSITE_URL = process.env.PUBLIC_WEBSITE_URL
const SHOP_ID = process.env.SHOP_ID || 'main-counter'
const QR_ACCESS_SECRET = process.env.QR_ACCESS_SECRET

function base64Url(buffer) {
  return buffer
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function createQrUploadUrl() {
  const expires = Math.floor(Date.now() / 1000) + 5 * 60
  const nonce = crypto.randomBytes(16).toString('base64url')
  const payload = `${SHOP_ID}.${expires}.${nonce}`
  const qrSig = base64Url(
    crypto.createHmac('sha256', QR_ACCESS_SECRET).update(payload).digest()
  )

  const url = new URL(PUBLIC_WEBSITE_URL)
  url.searchParams.set('shop', SHOP_ID)
  url.searchParams.set('qr_expires', String(expires))
  url.searchParams.set('qr_nonce', nonce)
  url.searchParams.set('qr_sig', qrSig)
  return url.toString()
}
```

Agent behavior:
- On app start, generate a QR URL and display it as a QR code.
- Replace the displayed QR every 5 minutes. Rotating at 4 minutes 45 seconds is okay to avoid edge timing.
- Show a visible countdown like `New QR in 04:12`.
- Keep the computer clock synced with internet time. The website validates Unix seconds, so timezone does not matter.
- If any required config is missing, show a red setup error instead of a QR.
- Use HTTPS for `PUBLIC_WEBSITE_URL`.
- Do not print or save a permanent QR. Only the live rotating QR should be shown at the counter.

Customer flow:
- Customer scans the current QR at the counter.
- Website verifies `shop`, `qr_expires`, `qr_nonce`, and `qr_sig`.
- Upload form opens only while the QR is valid.
- If the QR expires before submit, the customer must scan the latest QR again.
