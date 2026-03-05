declare namespace Cloudflare {
    interface Env {
        // --- Infrastructure Bindings ---
        DB: D1Database;
        AI: any; // Using any for AI to avoid complex type import if not available
        TEMPLATES_BUCKET: R2Bucket;
        VibecoderStore: KVNamespace;
        ASSETS: Fetcher;

        // --- Durable Objects ---
        CodeGenObject: DurableObjectNamespace;
        Sandbox: DurableObjectNamespace;
        DORateLimitStore: DurableObjectNamespace;

        // --- Rate Limiters (Unstable) ---
        API_RATE_LIMITER: any;
        AUTH_RATE_LIMITER: any;

        // --- Auth & Secrets ---
        JWT_SECRET?: string;
        SECRETS_ENCRYPTION_KEY?: string;
        GOOGLE_CLIENT_ID?: string;
        GOOGLE_CLIENT_SECRET?: string;
        GITHUB_CLIENT_ID?: string;
        GITHUB_CLIENT_SECRET?: string;
        GITHUB_EXPORTER_CLIENT_ID?: string;
        GITHUB_EXPORTER_CLIENT_SECRET?: string;

        // --- AI Provider Keys ---
        OPENROUTER_API_KEY?: string;
        GOOGLE_AI_STUDIO_API_KEY?: string;
        ANTHROPIC_API_KEY?: string;
        SERPAPI_KEY?: string;

        // --- Sentry & Observability ---
        SENTRY_DSN?: string;
        CF_ACCESS_ID?: string;
        CF_ACCESS_SECRET?: string;
        ENVIRONMENT?: string;

        // --- Cloudflare API & Account ---
        CLOUDFLARE_API_TOKEN?: string;
        CLOUDFLARE_ACCOUNT_ID?: string;
        CLOUDFLARE_AI_GATEWAY_URL?: string;
        CLOUDFLARE_AI_GATEWAY_TOKEN?: string;

        // --- Sandbox & Services ---
        SANDBOX_SERVICE_TYPE?: string;
        SANDBOX_SERVICE_URL?: string;
        SANDBOX_SERVICE_API_KEY?: string;
        ALLOCATION_STRATEGY?: string;
        USE_TUNNEL_FOR_PREVIEW?: string;
        CUSTOM_PREVIEW_DOMAIN?: string;
        CUSTOM_DOMAIN?: string;

        // --- Variables ---
        ENABLE_READ_REPLICAS?: string;
        RESEND_API_KEY?: string;
    }
}

// Ensure global Env also has these
interface Env extends Cloudflare.Env { }
