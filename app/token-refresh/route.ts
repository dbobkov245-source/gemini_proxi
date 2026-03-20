import { NextRequest, NextResponse } from 'next/server'

// Fetches a fresh ChatGPT accessToken using the long-lived session cookie
// stored in Vercel env. Protected by PROXY_SECRET.
// Called by VPS host cron (token_refresh.py) every 7 days.

export async function GET(req: NextRequest) {
    const secret = req.headers.get('x-proxy-secret')
    if (!secret || secret !== process.env.PROXY_SECRET) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const sessionCookie = process.env.OPENAI_SESSION_COOKIE
    if (!sessionCookie) {
        return NextResponse.json({ error: 'OPENAI_SESSION_COOKIE not configured' }, { status: 500 })
    }

    try {
        const response = await fetch('https://chatgpt.com/api/auth/session', {
            method: 'GET',
            headers: {
                'Cookie': `__Secure-next-auth.session-token=${sessionCookie}`,
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://chatgpt.com/',
            },
        })

        if (!response.ok) {
            return NextResponse.json(
                { error: `upstream returned ${response.status}` },
                { status: response.status }
            )
        }

        const data = await response.json()

        if (!data?.accessToken) {
            // Session cookie is likely expired — user must log in again manually
            return NextResponse.json(
                { error: 'no accessToken in response — session cookie may be expired', raw: data },
                { status: 502 }
            )
        }

        return NextResponse.json({
            accessToken: data.accessToken,
            accountId: data.user?.id ?? null,
        })

    } catch (err: any) {
        console.error('[token-refresh] error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
