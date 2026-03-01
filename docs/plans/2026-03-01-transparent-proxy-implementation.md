# Gemini Transparent Proxy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current `/api/gemini` endpoint with a transparent catch-all proxy at `/v1beta/[...path]` that lets OpenClaw (Bob) bypass Gemini API geo-blocking by routing through Vercel.

**Architecture:** Catch-all Next.js route at `/v1beta/[...path]` validates a shared secret via `?key=` query param, then forwards the request body as-is to `generativelanguage.googleapis.com` with the real API key. Response is passed through unchanged.

**Tech Stack:** Next.js 14 App Router, TypeScript, Vercel deployment

---

### Task 1: Delete old endpoint

**Files:**
- Delete: `app/api/gemini/route.ts`

**Step 1: Delete the file**

```bash
rm "app/api/gemini/route.ts"
rmdir "app/api/gemini"
rmdir "app/api"
```

**Step 2: Verify deleted**

```bash
ls app/
```
Expected: only `layout.tsx`, `page.tsx`, `v1beta/` (after task 2)

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove old /api/gemini endpoint"
```

---

### Task 2: Create transparent catch-all route

**Files:**
- Create: `app/v1beta/[...path]/route.ts`

**Step 1: Create directory**

```bash
mkdir -p "app/v1beta/[...path]"
```

**Step 2: Write the route**

Create `app/v1beta/[...path]/route.ts` with this exact content:

```typescript
import { NextRequest, NextResponse } from 'next/server'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const PROXY_SECRET = process.env.PROXY_SECRET

const GOOGLE_BASE = 'https://generativelanguage.googleapis.com/v1beta'

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function checkSecret(req: NextRequest): boolean {
  if (!PROXY_SECRET) return false
  return req.nextUrl.searchParams.get('key') === PROXY_SECRET
}

async function proxyRequest(req: NextRequest, path: string[], method: string) {
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
    return new Response(responseBody, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
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
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

**Step 4: Commit**

```bash
git add "app/v1beta/[...path]/route.ts"
git commit -m "feat: add transparent Gemini proxy at /v1beta/[...path]"
```

---

### Task 3: Update next.config.js CORS

**Files:**
- Modify: `next.config.js`

**Step 1: Update source path**

Replace the `source` value in `next.config.js`:

Old:
```javascript
source: '/api/:path*',
```

New:
```javascript
source: '/v1beta/:path*',
```

Full file after change:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/v1beta/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
```

Note: removed `x-secret` from allowed headers (no longer used).

**Step 2: Verify TypeScript still clean**

```bash
npx tsc --noEmit
```
Expected: no errors

**Step 3: Commit**

```bash
git add next.config.js
git commit -m "chore: update CORS config for /v1beta path"
```

---

### Task 4: Update .env.example

**Files:**
- Modify: `.env.example`

**Step 1: Rewrite .env.example**

```
# Required: your Google Gemini API key
GEMINI_API_KEY=AIzaSy...

# Required: shared secret — OpenClaw sends this as ?key= param
# Must match the apiKey value in openclaw.json on the VPS
# Use any strong random string, e.g.: openssl rand -hex 32
PROXY_SECRET=your-strong-secret-here
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: update .env.example for transparent proxy"
```

---

### Task 5: Update homepage

**Files:**
- Modify: `app/page.tsx`

**Step 1: Update to reflect new endpoint**

```typescript
export default function Home() {
  return (
    <main>
      <h1>Gemini Proxy</h1>
      <p>Transparent proxy for Google Gemini API.</p>
      <p>Endpoint: <code>POST /v1beta/models/:model:generateContent?key=SECRET</code></p>
    </main>
  )
}
```

**Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "docs: update homepage with new endpoint info"
```

---

### Task 6: Push to GitHub

**Step 1: Push all commits**

```bash
git push origin main
```

Expected: all 5 commits pushed to `bobbiclow/gemini-proxy`

**Step 2: Verify on GitHub**

Check `https://github.com/bobbiclow/gemini-proxy` — confirm commits visible.

---

### Task 7: Configure Vercel (manual step — user does this)

> This task is performed by the user in Vercel Dashboard after connecting `bobbiclow/gemini-proxy`.

**Step 1:** Connect repo `bobbiclow/gemini-proxy` to Vercel project

**Step 2:** Add environment variables in Vercel Dashboard → Settings → Environment Variables:

| Name | Value |
|---|---|
| `GEMINI_API_KEY` | `AIzaSyDhM7mjGzD2B1p05prKBCmoR1ntvoTRnEk` |
| `PROXY_SECRET` | (choose a strong random string, e.g. 32 hex chars) |

**Step 3:** Trigger deploy (or it auto-deploys on push)

**Step 4:** Note the deployment URL: `https://gemini-proxy-xxx.vercel.app`

---

### Task 8: Configure Bob (openclaw.json on VPS)

**Files:**
- Modify: `/home/devops/.openclaw/openclaw.json` on VPS

**Step 1: Update google provider config**

Find the `google` section in openclaw.json and update:

```json
"google": {
  "baseUrl": "https://gemini-proxy-xxx.vercel.app/v1beta",
  "api": "google-generative-ai",
  "models": [...keep existing models list...],
  "apiKey": "YOUR_PROXY_SECRET"
}
```

Where:
- `baseUrl` = your Vercel deployment URL + `/v1beta`
- `apiKey` = the `PROXY_SECRET` value you set in Vercel

**Step 2: Sync local backup**

```bash
scp devops@212.109.195.59:/home/devops/.openclaw/openclaw.json "/Volumes/SSD Storage/BoB/openclaw.json"
```

**Step 3: Restart container**

```bash
ssh devops@212.109.195.59 'cd /home/devops/openclaw && docker compose up -d --force-recreate openclaw-gateway'
```

**Step 4: Verify container running**

```bash
ssh devops@212.109.195.59 'docker ps | grep openclaw'
```
Expected: `openclaw-openclaw-gateway-1` with status `Up`

---

### Task 9: End-to-end test

**Step 1: Test proxy directly**

```bash
curl -X POST \
  "https://gemini-proxy-xxx.vercel.app/v1beta/models/gemini-2.5-flash:generateContent?key=YOUR_PROXY_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Say hello"}]}]}'
```

Expected: JSON response with `candidates[0].content.parts[0].text` containing a greeting.

**Step 2: Test via Bob in Telegram**

Send to `@Clawd_Bob245_bot`:
```
/gemini привет, ты работаешь через прокси?
```

Expected: Bob responds using Gemini model without geo-block error.

**Step 3: Verify in logs**

```bash
ssh devops@212.109.195.59 'tail -20 /home/devops/.openclaw/logs/openclaw-$(date +%Y-%m-%d).log'
```

Expected: No "User location is not supported" errors.
