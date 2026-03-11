# DesignAI — All Remaining Security & Quality Fixes
## Antigravity Agent Prompt

Copy everything below the line into your Antigravity agent.

---

Apply ALL of the following fixes to the DesignAI codebase. There are 7 tasks grouped by priority. Do NOT skip any. Do NOT modify files beyond what's specified.

---

## P0-A: Move Hardcoded IDs Out of wrangler.jsonc

The D1 database_id, KV namespace id, and zone_id are hardcoded in the public repo. Replace them with environment variable references.

### MODIFY: `wrangler.jsonc`

**Change 1 — D1 database (around line 76-84):**
Replace the hardcoded database_id:
```jsonc
// OLD
"database_id": "4abe6cbc-2058-4773-ba54-93b903c0e9f3",

// NEW — Wrangler will read from .env or CF dashboard
"database_id": "${D1_DATABASE_ID}",
```

**Change 2 — KV namespace (around line 108-114):**
```jsonc
// OLD
"id": "58552cc177b044a2aac33364a08789e9",

// NEW
"id": "${KV_NAMESPACE_ID}",
```

**Change 3 — Routes section (lines 133-143). Replace the entire routes block:**
```jsonc
// OLD
"routes": [
    {
        "pattern": "build.cloudflare.dev",
        "custom_domain": true
    },
    {
        "pattern": "*build-preview.cloudflare.dev/*",
        "custom_domain": false,
        "zone_id": "db01fac4261b2604aacad8410443a3e2"
    }
],

// NEW
"routes": [
    {
        "pattern": "designai.dev",
        "custom_domain": true
    }
],
```
NOTE: This also fixes P1-A (stale Cloudflare routes) simultaneously.

**Change 4 — Update vars section (lines 144-153):**
```jsonc
// OLD
"vars": {
    "TEMPLATES_REPOSITORY": "https://github.com/cloudflare/vibesdk-templates",
    "ALLOWED_EMAIL": "anyone can use it",
    "DISPATCH_NAMESPACE": "vibesdk-default-namespace",
    "ENABLE_READ_REPLICAS": "true",
    "CLOUDFLARE_AI_GATEWAY": "vibesdk-gateway",
    "CUSTOM_DOMAIN": "designai.dev",
    "MAX_SANDBOX_INSTANCES": "10",
    "SANDBOX_INSTANCE_TYPE": "standard-3"
},

// NEW
"vars": {
    "TEMPLATES_REPOSITORY": "https://github.com/Digital-platoon/designai-templates",
    "ALLOWED_EMAIL": "anyone can use it",
    "DISPATCH_NAMESPACE": "designai-default-namespace",
    "ENABLE_READ_REPLICAS": "true",
    "CLOUDFLARE_AI_GATEWAY": "designai-gateway",
    "CUSTOM_DOMAIN": "designai.dev",
    "MAX_SANDBOX_INSTANCES": "10",
    "SANDBOX_INSTANCE_TYPE": "standard-3"
},
```

### MODIFY: `.dev.vars.example`
Add these lines at the bottom:
```bash
# Wrangler Resource IDs (set these for deployment)
# D1_DATABASE_ID=""
# KV_NAMESPACE_ID=""
```

### MODIFY: `.gitignore`
Add this line at the end:
```
# Local wrangler overrides
wrangler.local.jsonc
```

---

## P0-B: Re-enable Error Monitoring (Sentry)

Sentry is fully implemented but entirely commented out. Uncomment it.

### MODIFY: `worker/index.ts`

**Change 1 — Uncomment the Sentry imports (lines 6-7):**
```typescript
// OLD (commented out)
// import * as Sentry from '@sentry/cloudflare';
// import { sentryOptions } from './observability/sentry';

// NEW (uncommented)
import * as Sentry from '@sentry/cloudflare';
import { sentryOptions } from './observability/sentry';
```

**Change 2 — Uncomment the Sentry-wrapped exports (lines 13-16):**
```typescript
// OLD
// export const CodeGeneratorAgent = Sentry.instrumentDurableObjectWithSentry(sentryOptions, SmartCodeGeneratorAgent);
// export const DORateLimitStore = Sentry.instrumentDurableObjectWithSentry(sentryOptions, BaseDORateLimitStore);
export const CodeGeneratorAgent = SmartCodeGeneratorAgent;
export const DORateLimitStore = BaseDORateLimitStore;

// NEW
export const CodeGeneratorAgent = Sentry.instrumentDurableObjectWithSentry(sentryOptions, SmartCodeGeneratorAgent);
export const DORateLimitStore = Sentry.instrumentDurableObjectWithSentry(sentryOptions, BaseDORateLimitStore);
```
Delete the two non-Sentry export lines that were there before.

**Change 3 — Uncomment the default export at the bottom (lines 163-166):**
```typescript
// OLD
export default worker;
// Wrap the entire worker with Sentry for comprehensive error monitoring.
// export default Sentry.withSentry(sentryOptions, worker);

// NEW (swap the comments)
// export default worker;
export default Sentry.withSentry(sentryOptions, worker);
```

### MODIFY: `worker/app.ts`

**Change 1 — Uncomment the Sentry import (line 12):**
```typescript
// OLD
// import { initHonoSentry } from './observability/sentry';

// NEW
import { initHonoSentry } from './observability/sentry';
```

**Change 2 — Uncomment initHonoSentry call inside createApp (line 18):**
```typescript
// OLD
// initHonoSentry(app);

// NEW
initHonoSentry(app);
```

### MODIFY: `.dev.vars.example`
Add this line in the "Security Configuration" section at the top:
```bash
#SENTRY_DSN=""
```

---

## P1-A: Fix Stale Routes (Already handled in P0-A above)

The routes section was already updated in P0-A. No additional changes needed.

---

## P1-B: Tighten Rate Limits

### MODIFY: `wrangler.jsonc`

Replace the rate limit bindings (lines 25-39):
```jsonc
// OLD
"unsafe": {
  "bindings": [
      {
          "name": "API_RATE_LIMITER",
          "type": "ratelimit",
          "namespace_id": "2101",
          "simple": { "limit": 10000, "period": 60 }
      },
      {
          "name": "AUTH_RATE_LIMITER",
          "type": "ratelimit",
          "namespace_id": "2102",
          "simple": { "limit": 1000, "period": 60 }
      }
  ]
},

// NEW
"unsafe": {
  "bindings": [
      {
          "name": "API_RATE_LIMITER",
          "type": "ratelimit",
          "namespace_id": "2101",
          "simple": { "limit": 200, "period": 60 }
      },
      {
          "name": "AUTH_RATE_LIMITER",
          "type": "ratelimit",
          "namespace_id": "2102",
          "simple": { "limit": 15, "period": 60 }
      }
  ]
},
```
This tightens API from 10,000→200 req/min and Auth from 1,000→15 req/min.

---

## P1-C: Add JWT_SECRET Empty-Check on Startup

### CREATE: `worker/utils/envGuard.ts`

```typescript
/**
 * Environment Variable Guards
 *
 * Validates critical environment variables on startup.
 * Fails fast with clear error messages instead of silently
 * running with broken authentication.
 */

import { createLogger } from '../logger';

const logger = createLogger('EnvGuard');

export interface EnvValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Critical secrets that MUST be set for the app to function securely.
 * If any of these are missing or empty, the worker should refuse to start.
 */
const REQUIRED_SECRETS: Array<{ key: keyof Env; label: string }> = [
    { key: 'JWT_SECRET', label: 'JWT signing secret' },
    { key: 'CUSTOM_DOMAIN', label: 'Custom domain' },
];

/**
 * Secrets that SHOULD be set but won't prevent startup.
 * Logged as warnings.
 */
const RECOMMENDED_SECRETS: Array<{ key: keyof Env; label: string }> = [
    { key: 'SENTRY_DSN', label: 'Sentry DSN (error monitoring disabled)' },
];

/**
 * Validates that all critical environment variables are properly configured.
 * Call this at the top of the worker's fetch handler.
 *
 * @returns Validation result with errors and warnings
 */
export function validateEnv(env: Env): EnvValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required secrets
    for (const { key, label } of REQUIRED_SECRETS) {
        const value = env[key];
        if (!value || (typeof value === 'string' && value.trim() === '')) {
            errors.push(`FATAL: ${key} is not set. ${label} is required for secure operation.`);
        }
    }

    // JWT_SECRET minimum length check (short secrets are brute-forceable)
    if (env.JWT_SECRET && env.JWT_SECRET.trim().length < 32) {
        errors.push(
            'FATAL: JWT_SECRET is too short. Must be at least 32 characters for adequate security.'
        );
    }

    // Check recommended secrets
    for (const { key, label } of RECOMMENDED_SECRETS) {
        const value = env[key];
        if (!value || (typeof value === 'string' && value.trim() === '')) {
            warnings.push(`WARNING: ${key} is not set. ${label}.`);
        }
    }

    // Check OAuth provider completeness (if one part is set, both must be)
    const oauthPairs: Array<[keyof Env, keyof Env, string]> = [
        ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'Google OAuth'],
        ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GitHub OAuth'],
    ];

    for (const [idKey, secretKey, providerName] of oauthPairs) {
        const hasId = env[idKey] && (env[idKey] as string).trim() !== '';
        const hasSecret = env[secretKey] && (env[secretKey] as string).trim() !== '';
        if (hasId !== hasSecret) {
            warnings.push(
                `WARNING: ${providerName} partially configured. Both ${idKey} and ${secretKey} must be set.`
            );
        }
    }

    // Log results
    for (const error of errors) {
        logger.error(error);
    }
    for (const warning of warnings) {
        logger.warn(warning);
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Validates environment and returns an error Response if validation fails.
 * Returns null if everything is OK.
 *
 * Usage in worker fetch handler:
 *   const envError = guardEnv(env);
 *   if (envError) return envError;
 */
export function guardEnv(env: Env): Response | null {
    const result = validateEnv(env);

    if (!result.valid) {
        const message = [
            'Server configuration error: Critical environment variables are missing or invalid.',
            '',
            ...result.errors,
        ].join('\n');

        console.error(message);

        return new Response(
            JSON.stringify({
                error: 'Server configuration error',
                message: 'The server is not properly configured. Please contact the administrator.',
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        );
    }

    return null;
}
```

### MODIFY: `worker/index.ts`

Add import at the top (with other imports):
```typescript
import { guardEnv } from './utils/envGuard';
```

Then inside the `worker` object's `fetch` method, add the env guard right after the `console.log` line and BEFORE the CUSTOM_DOMAIN check:

```typescript
// ADD THIS right after: console.log(`Received request: ${request.method} ${request.url}`);
// AND BEFORE: const previewDomain = getPreviewDomain(env);

// 0. Validate critical environment variables
const envError = guardEnv(env);
if (envError) return envError;
```

### CREATE: `worker/utils/__tests__/envGuard.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { validateEnv } from '../envGuard';

function createMockEnv(overrides: Partial<Record<string, string>> = {}): Env {
    return {
        JWT_SECRET: 'a-very-long-secret-key-that-is-at-least-32-characters-long',
        CUSTOM_DOMAIN: 'designai.dev',
        SENTRY_DSN: 'https://example@sentry.io/123',
        GOOGLE_CLIENT_ID: '',
        GOOGLE_CLIENT_SECRET: '',
        GITHUB_CLIENT_ID: '',
        GITHUB_CLIENT_SECRET: '',
        ...overrides,
    } as unknown as Env;
}

describe('validateEnv', () => {
    it('passes with all required vars set', () => {
        const result = validateEnv(createMockEnv());
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('fails when JWT_SECRET is empty', () => {
        const result = validateEnv(createMockEnv({ JWT_SECRET: '' }));
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('JWT_SECRET'))).toBe(true);
    });

    it('fails when JWT_SECRET is too short', () => {
        const result = validateEnv(createMockEnv({ JWT_SECRET: 'short' }));
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('too short'))).toBe(true);
    });

    it('fails when CUSTOM_DOMAIN is missing', () => {
        const result = validateEnv(createMockEnv({ CUSTOM_DOMAIN: '' }));
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('CUSTOM_DOMAIN'))).toBe(true);
    });

    it('warns when SENTRY_DSN is missing', () => {
        const result = validateEnv(createMockEnv({ SENTRY_DSN: '' }));
        expect(result.valid).toBe(true); // warnings dont fail
        expect(result.warnings.some(w => w.includes('SENTRY_DSN'))).toBe(true);
    });

    it('warns on partial OAuth config', () => {
        const result = validateEnv(createMockEnv({
            GOOGLE_CLIENT_ID: 'some-id',
            GOOGLE_CLIENT_SECRET: '',
        }));
        expect(result.warnings.some(w => w.includes('Google OAuth'))).toBe(true);
    });
});
```

---

## P2-A: Fix SEO (Title, Meta Tags, OG Tags, Sitemap)

### MODIFY: `index.html`

Replace the entire file contents with:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <!-- Primary Meta Tags -->
    <title>DesignAI — AI-Powered Web App Builder</title>
    <meta name="title" content="DesignAI — AI-Powered Web App Builder" />
    <meta name="description" content="Build and deploy web applications using natural language. Describe your idea and let AI generate, preview, and ship your app in minutes." />
    <meta name="keywords" content="AI web builder, vibe coding, AI app generator, no-code AI, design AI, build apps with AI" />
    <meta name="author" content="Digital Platoon" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://designai.dev/" />

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://designai.dev/" />
    <meta property="og:title" content="DesignAI — AI-Powered Web App Builder" />
    <meta property="og:description" content="Build and deploy web applications using natural language. Describe your idea and let AI generate, preview, and ship your app in minutes." />
    <meta property="og:image" content="https://designai.dev/og-image.png" />
    <meta property="og:site_name" content="DesignAI" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="https://designai.dev/" />
    <meta name="twitter:title" content="DesignAI — AI-Powered Web App Builder" />
    <meta name="twitter:description" content="Build and deploy web applications using natural language. Describe your idea and let AI generate, preview, and ship your app in minutes." />
    <meta name="twitter:image" content="https://designai.dev/og-image.png" />

    <!-- Structured Data (JSON-LD) -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": "DesignAI",
      "url": "https://designai.dev",
      "description": "AI-powered platform to build and deploy web applications from natural language descriptions.",
      "applicationCategory": "DeveloperApplication",
      "operatingSystem": "Web",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      },
      "creator": {
        "@type": "Organization",
        "name": "Digital Platoon",
        "url": "https://github.com/Digital-platoon"
      }
    }
    </script>

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Gloria+Hallelujah&family=Caveat:wght@600&display=swap" rel="stylesheet" />
  </head>
  <body>
    <!-- Fallback content for search engine crawlers (SPA renders over this) -->
    <div id="root">
      <noscript>
        <h1>DesignAI — AI-Powered Web App Builder</h1>
        <p>Build and deploy web applications using natural language. Enable JavaScript to use DesignAI.</p>
      </noscript>
    </div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### CREATE: `public/robots.txt`

```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /settings/

Sitemap: https://designai.dev/sitemap.xml
```

### CREATE: `public/sitemap.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://designai.dev/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://designai.dev/discover</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
```

NOTE: You will also need to create an OG image at `public/og-image.png` (1200x630px recommended). This is a design task — create a simple branded image with the DesignAI logo and tagline, or use a placeholder for now.

---

## P2-B: Custom README for DesignAI Branding

### MODIFY: `README.md`

Replace the ENTIRE file contents with:

````markdown
# DesignAI

> **AI-powered web app builder** — Describe your idea in natural language and let AI build, preview, and deploy it.

🌐 **Live:** [designai.dev](https://designai.dev)

---

## What is DesignAI?

DesignAI is an AI-powered platform that turns natural language descriptions into fully functional web applications. Built on Cloudflare's infrastructure, it provides:

- **Natural language to code** — Describe what you want, the AI agent generates it
- **Live preview** — See your app running in a sandboxed environment instantly
- **One-click deploy** — Ship to production on Cloudflare's global network
- **Multiple AI models** — Powered by Anthropic Claude, OpenAI, Google Gemini, and more
- **OAuth authentication** — Sign in with Google or GitHub

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS, Vite |
| Backend | Cloudflare Workers, Hono framework |
| Database | Cloudflare D1 (SQLite), Drizzle ORM |
| AI | Multi-provider (Anthropic, OpenAI, Google, Groq) |
| Sandboxing | Cloudflare Containers + Durable Objects |
| Storage | R2 (templates), KV (state) |
| Auth | OAuth 2.0 + PKCE (Google, GitHub) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Bun](https://bun.sh/) runtime
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) CLI
- Cloudflare account with Workers Paid plan

### Setup

```bash
# Clone the repository
git clone https://github.com/Digital-platoon/designai.git
cd designai

# Install dependencies
bun install

# Copy environment template and fill in your secrets
cp .dev.vars.example .dev.vars

# Run database migrations
bun run db:migrate:local

# Start development server
bun run dev
```

### Required Environment Variables

Copy `.dev.vars.example` to `.dev.vars` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | ✅ | Min 32 chars. Used for session signing |
| `CUSTOM_DOMAIN` | ✅ | Your deployment domain |
| `GOOGLE_CLIENT_ID` | For OAuth | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | For OAuth | Google OAuth app secret |
| `GITHUB_CLIENT_ID` | For OAuth | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | For OAuth | GitHub OAuth app secret |
| `SENTRY_DSN` | Recommended | Error monitoring |

At least one AI provider API key is required:
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_STUDIO_API_KEY`, `OPENROUTER_API_KEY`, or `GROQ_API_KEY`

### Deploy

```bash
# Set production secrets in Cloudflare dashboard or via wrangler
bun run deploy
```

## Project Structure

```
designai/
├── src/                    # React frontend
│   ├── components/         # UI components (shadcn/ui)
│   ├── contexts/           # Auth, theme providers
│   ├── hooks/              # Custom React hooks
│   ├── routes/             # Page routes
│   └── utils/              # Frontend utilities
├── worker/                 # Cloudflare Worker backend
│   ├── agents/             # AI code generation agents
│   ├── api/                # Hono API routes & controllers
│   ├── config/             # Security & app configuration
│   ├── database/           # Drizzle schema & services
│   ├── middleware/          # Auth, CSRF, rate limiting
│   ├── services/           # Business logic services
│   └── utils/              # Backend utilities
├── migrations/             # D1 database migrations
├── public/                 # Static assets
└── docs/                   # API documentation
```

## Security

DesignAI implements defense-in-depth security:

- **Authentication** — OAuth 2.0 + PKCE, JWT sessions with secure cookies
- **CSRF Protection** — Double-submit cookie pattern
- **Rate Limiting** — Per-user API and auth endpoint limits
- **Security Headers** — CSP, HSTS, X-Frame-Options, COEP/CORP/COOP
- **Input Validation** — Zod schemas on all API inputs
- **Redirect Validation** — Centralized open-redirect prevention
- **IP Blocking** — Direct IP access rejected

## License

[MIT](LICENSE)

## Credits

Built on top of [Cloudflare VibeSDK](https://github.com/cloudflare/vibesdk) (open source).

Developed by [Digital Platoon](https://github.com/Digital-platoon).
````

---

## Summary of ALL Changes

| File | Action | Fix |
|------|--------|-----|
| `wrangler.jsonc` | MODIFY | Remove hardcoded IDs, fix routes, tighten rate limits |
| `.dev.vars.example` | MODIFY | Add D1_DATABASE_ID, KV_NAMESPACE_ID, SENTRY_DSN placeholders |
| `.gitignore` | MODIFY | Add wrangler.local.jsonc |
| `worker/index.ts` | MODIFY | Uncomment Sentry, add envGuard |
| `worker/app.ts` | MODIFY | Uncomment Sentry Hono init |
| `worker/utils/envGuard.ts` | CREATE | Startup env validation utility |
| `worker/utils/__tests__/envGuard.test.ts` | CREATE | Tests for env guard |
| `index.html` | MODIFY | Full SEO overhaul with OG/Twitter/JSON-LD |
| `public/robots.txt` | CREATE | Crawler directives |
| `public/sitemap.xml` | CREATE | Sitemap for SEO |
| `README.md` | MODIFY | Complete DesignAI-branded README |

After applying all changes, run:
```bash
npx vitest run
```

Do NOT modify any other files. Keep all existing functionality intact.
