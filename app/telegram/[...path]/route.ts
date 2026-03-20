import { NextRequest, NextResponse } from 'next/server'

const TARGET_BASE = 'https://api.telegram.org'

// Allow long-polling getUpdates (Telegram timeout can be up to 50s)
export const maxDuration = 60

async function handleRequest(req: NextRequest, params: { path: string[] }) {
    const path = params.path.join('/')
    const targetUrl = new URL(`${TARGET_BASE}/${path}`)

    // Forward query params (used in some Telegram API calls)
    req.nextUrl.searchParams.forEach((value, key) => {
        targetUrl.searchParams.set(key, value)
    })

    const headers = new Headers()
    const forwardHeaders = ['content-type', 'accept', 'user-agent']
    for (const header of forwardHeaders) {
        const value = req.headers.get(header)
        if (value) headers.set(header, value)
    }

    try {
        const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
        const body = hasBody ? await req.arrayBuffer() : undefined

        const response = await fetch(targetUrl.toString(), {
            method: req.method,
            headers,
            body: body ? body : undefined,
        })

        const responseHeaders: Record<string, string> = {}
        response.headers.forEach((value, key) => {
            const lower = key.toLowerCase()
            // Drop hop-by-hop headers; content-encoding causes truncation with fetch auto-decompress
            if (lower !== 'transfer-encoding' && lower !== 'content-encoding' && lower !== 'content-length') {
                responseHeaders[key] = value
            }
        })

        return new Response(response.body, {
            status: response.status,
            headers: responseHeaders,
        })
    } catch (err) {
        console.error(`[telegram-proxy] error forwarding /${path}:`, err)
        return NextResponse.json({ error: 'Proxy error' }, { status: 500 })
    }
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
    return handleRequest(req, params)
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
    return handleRequest(req, params)
}

export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 })
}
