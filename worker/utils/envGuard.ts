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
    if (env.JWT_SECRET && (env.JWT_SECRET as string).trim().length < 32) {
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
