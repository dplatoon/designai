import { describe, it, expect } from 'vitest';
import { validateRedirectUrl, revalidateStoredRedirectUrl } from '../redirectValidation';

describe('Redirect Validation Utility', () => {
    const createMockRequest = (url: string) => {
        return { url } as Request;
    };

    describe('validateRedirectUrl', () => {
        const request = createMockRequest('https://designai.dev/api/auth/login');

        it('accepts relative paths', () => {
            expect(validateRedirectUrl('/dashboard', { request })).toBe('/dashboard');
            expect(validateRedirectUrl('/', { request })).toBe('/');
        });

        it('accepts paths with query and hash', () => {
            expect(validateRedirectUrl('/dashboard?tab=projects#top', { request }))
                .toBe('/dashboard?tab=projects#top');
        });

        it('accepts same-origin absolute URLs', () => {
            expect(validateRedirectUrl('https://designai.dev/home', { request }))
                .toBe('/home');
        });

        it('accepts localhost in development/allowed contexts', () => {
            const localReq = createMockRequest('http://localhost:3000/login');
            expect(validateRedirectUrl('http://localhost:3000/dashboard', { request: localReq }))
                .toBe('/dashboard');
        });

        it('rejects different origins', () => {
            expect(validateRedirectUrl('https://evil.com/phish', { request })).toBeNull();
        });

        it('rejects dangerous schemes', () => {
            expect(validateRedirectUrl('javascript:alert(1)', { request })).toBeNull();
            expect(validateRedirectUrl('JAVASCRIPT:alert(1)', { request })).toBeNull();
            expect(validateRedirectUrl('data:text/html,<html>', { request })).toBeNull();
            expect(validateRedirectUrl('vbscript:msgbox', { request })).toBeNull();
            expect(validateRedirectUrl('blob:https://designai.dev/xyz', { request })).toBeNull();
            expect(validateRedirectUrl('file:///etc/passwd', { request })).toBeNull();
        });

        it('rejects protocol-relative URLs', () => {
            expect(validateRedirectUrl('//evil.com/phish', { request })).toBeNull();
        });

        it('rejects null, undefined, and empty strings', () => {
            expect(validateRedirectUrl(null, { request })).toBeNull();
            expect(validateRedirectUrl(undefined, { request })).toBeNull();
            expect(validateRedirectUrl('', { request })).toBeNull();
            expect(validateRedirectUrl('   ', { request })).toBeNull();
        });

        it('rejects over-length URLs', () => {
            const longUrl = '/' + 'a'.repeat(2050);
            expect(validateRedirectUrl(longUrl, { request })).toBeNull();
        });

        it('rejects auth loop paths', () => {
            expect(validateRedirectUrl('/api/auth/callback', { request })).toBeNull();
            expect(validateRedirectUrl('/logout', { request })).toBeNull();
            expect(validateRedirectUrl('/login', { request })).toBeNull();
            expect(validateRedirectUrl('/register', { request })).toBeNull();
            expect(validateRedirectUrl('/callback', { request })).toBeNull();
        });

        it('rejects path traversal with backslashes and dots', () => {
            expect(validateRedirectUrl('/dashboard/..', { request })).toBeNull();
            expect(validateRedirectUrl('/dashboard/src\\..', { request })).toBeNull();
            expect(validateRedirectUrl('..\\..\\config', { request })).toBeNull();
        });

        it('rejects HTTP in production', () => {
            const prodReq = createMockRequest('https://designai.dev/login');
            expect(validateRedirectUrl('http://designai.dev/dashboard', { request: prodReq })).toBeNull();
        });

        it('supports additional allowed origins', () => {
            expect(validateRedirectUrl('https://trusted.com/page', {
                request,
                additionalAllowedOrigins: ['https://trusted.com']
            })).toBe('/page');
        });
    });

    describe('revalidateStoredRedirectUrl', () => {
        const request = createMockRequest('https://designai.dev/api/auth/callback');

        it('accepts clean paths', () => {
            expect(revalidateStoredRedirectUrl('/welcome', request)).toBe('/welcome');
        });

        it('rejects null or missing', () => {
            expect(revalidateStoredRedirectUrl(null, request)).toBeNull();
        });

        it('rejects URLs containing auth callback', () => {
            expect(revalidateStoredRedirectUrl('/something?next=/api/auth/callback', request)).toBeNull();
        });

        it('rejects external URLs', () => {
            expect(revalidateStoredRedirectUrl('https://evil.co/phish', request)).toBeNull();
        });
    });
});
