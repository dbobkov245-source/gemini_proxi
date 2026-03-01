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

async function proxyRequest(req: NextRequest, path: string[], method: string) {
  console.log(`[proxy] ${method} /${path.join('/')} auth=${checkSecret(req) ? 'ok' : 'FAIL'} header=${!!req.headers.get('x-goog-api-key')} query=${!!req.nextUrl.searchParams.get('key')}`)

  if (!checkSecret(req)) return unauthorized()

  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  }

  const googleUrl = `${GOOGLE_BASE}/${path.join('/')}?key=${GEMINI_API_KEY}`

  try {
    const body = method === 'POST' ? await req.text() : undefined

    const response = await fetch(googleUrl, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    const responseBody = await response.text()
    console.log(`[proxy] response status=${response.status} len=${responseBody.length}`)
    return new Response(responseBody, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
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
