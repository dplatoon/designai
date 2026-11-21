import { createLogger } from '../logger';

const logger = createLogger('RedirectValidation');

const DANGEROUS_SCHEMES = [
    'javascript:',
    'data:',
    'vbscript:',
    'blob:',
    'file:',
];

const AUTH_PATHS = [
    '/api/auth/',
    '/logout',
    '/login',
    '/register',
    '/callback',
];

interface ValidationOptions {
    request: Request;
    additionalAllowedOrigins?: string[];
    allowLocalhost?: boolean;
}

/**
 * Validates a redirect URL against several security controls.
 * Returns a reconstructed path (pathname + search + hash) if valid, or null otherwise.
 */
export function validateRedirectUrl(
    redirectUrl: string | null | undefined,
    options: ValidationOptions
): string | null {
    if (!redirectUrl) {
        return null;
    }

    // 1. Length check
    if (redirectUrl.length > 2048) {
        logger.warn('Redirect URL too long', { length: redirectUrl.length });
        return null;
    }

    // 2. Trim and basic sanity
    const trimmed = redirectUrl.trim();
    if (!trimmed) {
        return null;
    }

    // 3. Block backslashes (often used to bypass path validation)
    if (trimmed.includes('\\')) {
        logger.warn('Redirect URL contains backslashes', { trimmed });
        return null;
    }

    // 4. Block path traversal
    if (trimmed.includes('..')) {
        logger.warn('Redirect URL contains path traversal', { trimmed });
        return null;
    }

    // 5. Block protocol-relative URLs
    if (trimmed.startsWith('//')) {
        logger.warn('Protocol-relative redirect URL blocked', { trimmed });
        return null;
    }

    // 6. Check for dangerous schemes
    const lower = trimmed.toLowerCase();
    if (DANGEROUS_SCHEMES.some((scheme) => lower.startsWith(scheme))) {
        logger.warn('Dangerous scheme in redirect URL blocked', { trimmed });
        return null;
    }

    try {
        const requestUrl = new URL(options.request.url);
        const origin = requestUrl.origin;

        let parsed: URL;

        if (trimmed.startsWith('/')) {
            // Relative path, parse against the request origin
            parsed = new URL(trimmed, origin);
        } else {
            // Absolute URL, check if it's allowed
            parsed = new URL(trimmed);

            const allowedOrigins = [
                origin,
                ...(options.additionalAllowedOrigins || [])
            ];

            if (options.allowLocalhost !== false) {
                allowedOrigins.push('http://localhost', 'http://127.0.0.1');
            }

            // Same-origin enforcement or allowed origins
            if (!allowedOrigins.some(allowed => parsed.origin.startsWith(allowed))) {
                logger.warn('External redirect URL blocked', { trimmed, origin });
                return null;
            }

            // Enforce HTTPS-only in production (except localhost)
            const isProd = !origin.includes('localhost') && !origin.includes('127.0.0.1');
            const isTargetLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

            if (isProd && !isTargetLocal && parsed.protocol !== 'https:') {
                logger.warn('Insecure redirect URL blocked in production', { trimmed });
                return null;
            }
        }

        // 7. Prevent redirect loops to auth endpoints
        if (AUTH_PATHS.some(path => parsed.pathname.startsWith(path))) {
            logger.warn('Auth path loop blocked', { trimmed, path: parsed.pathname });
            return null;
        }

        // 8. Return RECONSTRUCTED path only
        return parsed.pathname + parsed.search + parsed.hash;
    } catch (e) {
        logger.warn('Failed to parse redirect URL', { trimmed, error: e });
        return null;
    }
}

/**
 * Re-validates a stored redirect URL at point-of-use.
 */
export function revalidateStoredRedirectUrl(
    storedUrl: string | null | undefined,
    request: Request
): string | null {
    if (!storedUrl) {
        return null;
    }

    // Additional check: explicitly reject callback URLs which might be stored maliciously
    if (storedUrl.toLowerCase().includes('/api/auth/callback')) {
        logger.warn('Stored redirect URL contains auth callback', { storedUrl });
        return null;
    }

    return validateRedirectUrl(storedUrl, { request });
}
