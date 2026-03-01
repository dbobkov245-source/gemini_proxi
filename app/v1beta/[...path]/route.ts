import { NextRequest, NextResponse } from 'next/server'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const PROXY_SECRET = process.env.PROXY_SECRET

const GOOGLE_BASE = 'https://generativelanguage.googleapis.com/v1beta'

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
    // Gemini returns: "Please retry in 12.834193377s"
    const match = text.match(/retry in ([\d.]+)s/i)
    if (match) return Math.ceil(parseFloat(match[1])) + 1
  } catch {}
  return 15 // default 15s if can't parse
}

async function proxyRequest(req: NextRequest, path: string[], method: string) {
  if (!checkSecret(req)) return unauthorized()

  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  }

  // Preserve ?alt=sse and other query params from the original request
  const googleUrl = new URL(`${GOOGLE_BASE}/${path.join('/')}`)
  googleUrl.searchParams.set('key', GEMINI_API_KEY)
  // Forward any extra query params (like alt=sse) except our auth key
  req.nextUrl.searchParams.forEach((v, k) => {
    if (k !== 'key') googleUrl.searchParams.set(k, v)
  })

  try {
    const body = method === 'POST' ? await req.text() : undefined

    // First attempt
    let response = await fetch(googleUrl.toString(), {
      method,
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    // If rate limited (429), wait the suggested delay and retry once
    // Only retry if the wait is short enough (≤ 25s) to avoid OpenClaw timeouts
    if (response.status === 429) {
      const waitSec = await parseRetryAfter(response.clone())
      if (waitSec <= 25) {
        console.log(`[proxy] 429 rate limit — waiting ${waitSec}s before retry`)
        await new Promise(resolve => setTimeout(resolve, waitSec * 1000))
        response = await fetch(googleUrl.toString(), {
          method,
          headers: { 'Content-Type': 'application/json' },
          body,
        })
        console.log(`[proxy] retry result: ${response.status}`)
      } else {
        console.log(`[proxy] 429 rate limit — wait too long (${waitSec}s), passing through`)
      }
    }

    // Stream the response body through directly (supports SSE and large responses)
    const responseHeaders: Record<string, string> = {}
    const ct = response.headers.get('Content-Type')
    if (ct) responseHeaders['Content-Type'] = ct

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
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
