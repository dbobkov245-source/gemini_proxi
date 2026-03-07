import { NextRequest } from 'next/server';

// Proxy all /reddit/* requests to https://www.reddit.com/*
// Used by last30days skill to bypass Russian IP blocks on reddit.com
async function handler(request: NextRequest, { params }: { params: { path: string[] } }) {
    const pathArray = params.path || [];
    const pathname = pathArray.join('/');

    const url = new URL(request.url);
    const search = url.search;

    // Reconstruct Reddit URL: /reddit/search.json → https://www.reddit.com/search.json
    // /reddit/r/MachineLearning/search.json → https://www.reddit.com/r/MachineLearning/search.json
    const targetUrl = `https://www.reddit.com/${pathname}${search}`;

    const headers = new Headers();
    // Forward User-Agent (required by Reddit API)
    const ua = request.headers.get('user-agent');
    if (ua) headers.set('user-agent', ua);
    headers.set('accept', 'application/json');

    try {
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: headers,
            redirect: 'follow',
        });

        const responseHeaders = new Headers(response.headers);
        // fetch() auto-decompresses gzip — must remove these to avoid truncated JSON
        responseHeaders.delete('content-encoding');
        responseHeaders.delete('content-length');
        responseHeaders.set('Access-Control-Allow-Origin', '*');

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
        });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

export const GET = handler;
export const HEAD = handler;
export const OPTIONS = handler;
