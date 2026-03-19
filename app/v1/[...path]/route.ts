import { NextRequest, NextResponse } from 'next/server'

const PROXY_SECRET = process.env.PROXY_SECRET

// Load all available Gemini API keys (up to 8), filter out undefined/empty
const GEMINI_KEYS: string[] = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
  process.env.GEMINI_API_KEY_6,
  process.env.GEMINI_API_KEY_7,
  process.env.GEMINI_API_KEY_8,
].filter((k): k is string => Boolean(k))

const GOOGLE_BASE = 'https://generativelanguage.googleapis.com/v1'

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function checkSecret(req: NextRequest): boolean {
  if (!PROXY_SECRET) return false
  return (
    req.nextUrl.searchParams.get('key') === PROXY_SECRET ||
    req.headers.get('x-goog-api-key') === PROXY_SECRET
  )
}

// Parse retry-after delay from Gemini 429 response body (seconds)
async function parseRetryAfter(response: Response): Promise<number> {
  try {
    const text = await response.text()
    // Format 1: "Please retry in 12.834193377s"
    const matchText = text.match(/retry in ([\d.]+)s/i)
    if (matchText) return Math.ceil(parseFloat(matchText[1])) + 1
    // Format 2: JSON {"details":[{"retryDelay":"22s"}]}
    const matchJson = text.match(/"retryDelay"\s*:\s*"([\d.]+)s"/)
    if (matchJson) return Math.ceil(parseFloat(matchJson[1])) + 1
  } catch {}
  return 15 // default 15s if can't parse
}

async function proxyRequest(req: NextRequest, path: string[], method: string) {
  if (!checkSecret(req)) return unauthorized()

  if (GEMINI_KEYS.length === 0) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  }

  // Build base URL, forwarding extra query params (like alt=sse) except our auth key
  const googleUrl = new URL(`${GOOGLE_BASE}/${path.join('/')}`)
  req.nextUrl.searchParams.forEach((v, k) => {
    if (k !== 'key') googleUrl.searchParams.set(k, v)
  })

  try {
    const body = method === 'POST' ? await req.text() : undefined

    // Try each key in order — on 429, move to next key immediately
    const responses429: Response[] = []
    for (let i = 0; i < GEMINI_KEYS.length; i++) {
      const url = new URL(googleUrl.toString())
      url.searchParams.set('key', GEMINI_KEYS[i])

      const response = await fetch(url.toString(), {
        method,
        headers: { 'Content-Type': 'application/json' },
        body,
      })

      if (response.status !== 429) {
        if (i > 0) console.log(`[proxy] key ${i + 1}/${GEMINI_KEYS.length} succeeded`)
        const ct = response.headers.get('Content-Type')
        return new Response(response.body, {
          status: response.status,
          headers: ct ? { 'Content-Type': ct } : {},
        })
      }

      console.log(`[proxy] key ${i + 1}/${GEMINI_KEYS.length} hit 429, trying next`)
      responses429.push(response)
    }

    // All keys rate-limited — find shortest retry delay across all keys
    const waitSecs = await Promise.all(responses429.map(r => parseRetryAfter(r.clone())))
    const waitSec = Math.min(...waitSecs)
    if (waitSec <= 25) {
      console.log(`[proxy] all ${GEMINI_KEYS.length} keys 429 — waiting ${waitSec}s before retry pass`)
      await new Promise(r => setTimeout(r, waitSec * 1000))
      // Retry all keys again — some may have recovered (rate-limited vs quota-exhausted)
      for (let i = 0; i < GEMINI_KEYS.length; i++) {
        const url = new URL(googleUrl.toString())
        url.searchParams.set('key', GEMINI_KEYS[i])
        const retryResponse = await fetch(url.toString(), {
          method,
          headers: { 'Content-Type': 'application/json' },
          body,
        })
        console.log(`[proxy] retry key ${i + 1}: ${retryResponse.status}`)
        if (retryResponse.status !== 429) {
          const ct = retryResponse.headers.get('Content-Type')
          return new Response(retryResponse.body, {
            status: retryResponse.status,
            headers: ct ? { 'Content-Type': ct } : {},
          })
        }
      }
    }

    // All failed — pass through last 429
    console.log(`[proxy] all keys still 429 after retry, passing through`)
    const lastResponse = responses429[responses429.length - 1]
    const ct = lastResponse.headers.get('Content-Type')
    return new Response(lastResponse.body, {
      status: 429,
      headers: ct ? { 'Content-Type': ct } : {},
    })
  } catch (err) {
    console.error(`[proxy] error:`, err)
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(req, params.path, 'POST')
}

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(req, params.path, 'GET')
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 })
}
