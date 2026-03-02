import { NextRequest, NextResponse } from 'next/server'

const TARGET_URL = 'https://chatgpt.com/backend-api/codex/responses'

export async function POST(req: NextRequest) {
    // We don't need a PROXY_SECRET for this route because the user provides 
    // their own valid OpenAI Bearer token. We just forward it.

    const headers = new Headers()

    // Forward explicit headers required by pi-ai and ChatGPT backend
    const forwardHeaders = [
        'authorization',
        'chatgpt-account-id',
        'openai-beta',
        'originator',
        'user-agent',
        'accept',
        'content-type'
    ]

    for (const header of forwardHeaders) {
        const value = req.headers.get(header)
        if (value) {
            headers.set(header, value)
        }
    }

    // Ensure content-type is set if missing but body exists
    if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json')
    }

    try {
        const body = await req.text()

        const response = await fetch(TARGET_URL, {
            method: 'POST',
            headers,
            body,
        })

        const responseHeaders: Record<string, string> = {}
        const ct = response.headers.get('Content-Type')
        if (ct) responseHeaders['Content-Type'] = ct

        // Stream the SSE response directly back to the client
        return new Response(response.body, {
            status: response.status,
            headers: responseHeaders,
        })
    } catch (err) {
        console.error(`[codex-proxy] error:`, err)
        return NextResponse.json({ error: 'Proxy error' }, { status: 500 })
    }
}

export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 })
}
