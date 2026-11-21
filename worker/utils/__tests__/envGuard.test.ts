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
