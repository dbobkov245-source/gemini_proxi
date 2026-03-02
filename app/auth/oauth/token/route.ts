import { NextRequest, NextResponse } from 'next/server'

const TARGET_URL = 'https://auth.openai.com/oauth/token'

export async function POST(req: NextRequest) {
    // We do not need our own authorization since we just forward 
    // the client_id and refresh_token from the request body.

    const headers = new Headers()
    headers.set('Content-Type', 'application/x-www-form-urlencoded')

    // Forward User-Agent if present, otherwise default to pi-ai
    const userAgent = req.headers.get('user-agent') || 'pi (darwin/25.3.0; arm64)'
    headers.set('User-Agent', userAgent)

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

        // Returns JSON response for OAuth token refresh
        return new Response(response.body, {
            status: response.status,
            headers: responseHeaders,
        })
    } catch (err) {
        console.error(`[auth-proxy] error:`, err)
        return NextResponse.json({ error: 'Proxy error' }, { status: 500 })
    }
}

export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 })
}
