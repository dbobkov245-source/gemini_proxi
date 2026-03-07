import { NextRequest } from 'next/server';

// Proxy all /scrapecreators/* requests to https://api.scrapecreators.com/*
async function handler(request: NextRequest, { params }: { params: { path: string[] } }) {
    const pathArray = params.path || [];
    const pathname = pathArray.join('/');

    const url = new URL(request.url);
    const search = url.search;

    const targetUrl = `https://api.scrapecreators.com/${pathname}${search}`;

    const headers = new Headers();
    request.headers.forEach((value, key) => {
        if (key.startsWith('x-forwarded-') || key.startsWith('cf-') || key === 'host') return;
        headers.append(key, value);
    });

    const bodyData = request.method !== 'GET' && request.method !== 'HEAD'
        ? await request.blob()
        : undefined;

    try {
        const response = await fetch(targetUrl, {
            method: request.method,
            headers: headers,
            body: bodyData,
            redirect: 'manual',
        });

        const responseHeaders = new Headers(response.headers);
        responseHeaders.delete('content-encoding');
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
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;
