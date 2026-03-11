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
