/**
 * Main Authentication Service
 * Orchestrates all auth operations including login, registration, and OAuth
 */

import * as schema from '../schema';
import { eq, and, sql, or, lt, isNull } from 'drizzle-orm';
import { JWTUtils } from '../../utils/jwtUtils';
import { generateSecureToken } from '../../utils/cryptoUtils';
import { SessionService } from './SessionService';
import { PasswordService } from '../../utils/passwordService';
import { GoogleOAuthProvider } from '../../services/oauth/google';
import { GitHubOAuthProvider } from '../../services/oauth/github';
import { BaseOAuthProvider } from '../../services/oauth/base';
import {
    SecurityError,
    SecurityErrorType
} from 'shared/types/errors';
import { AuthResult, AuthUserSession, OAuthUserInfo } from '../../types/auth-types';
import { generateId } from '../../utils/idGenerator';
import {
    AuthUser,
    OAuthProvider
} from '../../types/auth-types';
import { mapUserResponse } from '../../utils/authUtils';
import { createLogger } from '../../logger';
import { validateEmail, validatePassword } from '../../utils/validationUtils';
import { extractRequestMetadata } from '../../utils/authUtils';
import { BaseService } from './BaseService';
import { sendVerificationEmail, resendVerificationEmail, verifyEmailOTP, sendPasswordResetEmail } from '../../services/email/EmailService';

const logger = createLogger('AuthService');

/**
 * Login credentials
 */
export interface LoginCredentials {
    email: string;
    password: string;
}

/**
 * Registration data
 */
export interface RegistrationData {
    email: string;
    password: string;
    name?: string;
}


/**
 * Main Authentication Service
 */
export class AuthService extends BaseService {
    private readonly sessionService: SessionService;
    private readonly passwordService: PasswordService;

    constructor(
        env: Env,
    ) {
        super(env);
        this.sessionService = new SessionService(env);
        this.passwordService = new PasswordService();
    }

    /**
     * Register a new user
     */
    async register(data: RegistrationData, request: Request): Promise<AuthResult> {
        try {
            // Validate email format using centralized utility
            const emailValidation = validateEmail(data.email);
            if (!emailValidation.valid) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    emailValidation.error || 'Invalid email format',
                    400
                );
            }

            // Validate password using centralized utility
            const passwordValidation = validatePassword(data.password, undefined, {
                email: data.email,
                name: data.name
            });
            if (!passwordValidation.valid) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    passwordValidation.errors!.join(', '),
                    400
                );
            }

            // Check if user already exists
            const existingUser = await this.database
                .select()
                .from(schema.users)
                .where(eq(schema.users.email, data.email.toLowerCase()))
                .get();

            if (existingUser) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'Email already registered',
                    400
                );
            }

            // Hash password
            const passwordHash = await this.passwordService.hash(data.password);

            // Create user
            const userId = generateId();
            const now = new Date();

            // Store user as unverified initially
            await this.database.insert(schema.users).values({
                id: userId,
                email: data.email.toLowerCase(),
                passwordHash,
                displayName: data.name || data.email.split('@')[0],
                emailVerified: false, // Set as unverified by default
                provider: 'email',
                providerId: userId,
                createdAt: now,
                updatedAt: now
            });

            // Send verification email after user is created
            await sendVerificationEmail(this.env as any, userId, data.email.toLowerCase());

            // Get the created user
            const newUser = await this.database
                .select()
                .from(schema.users)
                .where(eq(schema.users.id, userId))
                .get();

            if (!newUser) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'Failed to retrieve created user',
                    500
                );
            }

            // Log successful registration
            await this.logAuthAttempt(data.email, 'register', true, request);
            logger.info('User registered and logged in directly', { userId, email: data.email });

            // Create session and tokens immediately (log user in after registration)
            const { accessToken, session } = await this.sessionService.createSession(
                userId,
                request
            );

            return {
                user: mapUserResponse(newUser),
                sessionId: session.sessionId,
                expiresAt: session.expiresAt,
                accessToken,
            };
        } catch (error) {
            await this.logAuthAttempt(data.email, 'register', false, request);

            if (error instanceof SecurityError) {
                throw error;
            }

            logger.error('Registration error', error);
            throw new SecurityError(
                SecurityErrorType.INVALID_INPUT,
                'Registration failed',
                500
            );
        }
    }

    /**
     * Login with email and password
     */
    async login(credentials: LoginCredentials, request: Request): Promise<AuthResult> {
        try {
            // Find user
            const user = await this.database
                .select()
                .from(schema.users)
                .where(
                    and(
                        eq(schema.users.email, credentials.email.toLowerCase()),
                        sql`${schema.users.deletedAt} IS NULL`
                    )
                )
                .get();

            if (!user || !user.passwordHash) {
                await this.logAuthAttempt(credentials.email, 'login', false, request);
                throw new SecurityError(
                    SecurityErrorType.UNAUTHORIZED,
                    'Invalid email or password',
                    401
                );
            }

            // Verify password
            const passwordValid = await this.passwordService.verify(
                credentials.password,
                user.passwordHash
            );

            if (!passwordValid) {
                await this.logAuthAttempt(credentials.email, 'login', false, request);
                throw new SecurityError(
                    SecurityErrorType.UNAUTHORIZED,
                    'Invalid email or password',
                    401
                );
            }

            // Create session
            const { accessToken, session } = await this.sessionService.createSession(
                user.id,
                request
            );

            // Log successful attempt
            await this.logAuthAttempt(credentials.email, 'login', true, request);

            logger.info('User logged in', { userId: user.id, email: user.email });

            return {
                user: mapUserResponse(user),
                accessToken,
                sessionId: session.sessionId,
                expiresAt: session.expiresAt,
            };
        } catch (error) {
            if (error instanceof SecurityError) {
                throw error;
            }

            logger.error('Login error', error);
            throw new SecurityError(
                SecurityErrorType.UNAUTHORIZED,
                'Login failed',
                500
            );
        }
    }

    /**
     * Logout
     */
    async logout(sessionId: string): Promise<void> {
        try {
            await this.sessionService.revokeSessionId(sessionId);
            logger.info('User logged out', { sessionId });
        } catch (error) {
            logger.error('Logout error', error);
            throw new SecurityError(
                SecurityErrorType.UNAUTHORIZED,
                'Logout failed',
                500
            );
        }
    }

    async getOauthProvider(provider: OAuthProvider, request: Request): Promise<BaseOAuthProvider> {
        const url = new URL(request.url).origin;

        switch (provider) {
            case 'google':
                return GoogleOAuthProvider.create(this.env, url);
            case 'github':
                return GitHubOAuthProvider.create(this.env, url);
            default:
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    `OAuth provider ${provider} not configured`,
                    400
                );
        }
    }

    /**
     * Get OAuth authorization URL
     */
    async getOAuthAuthorizationUrl(
        provider: OAuthProvider,
        request: Request,
        intendedRedirectUrl?: string
    ): Promise<string> {
        const oauthProvider = await this.getOauthProvider(provider, request);
        if (!oauthProvider) {
            throw new SecurityError(
                SecurityErrorType.INVALID_INPUT,
                `OAuth provider ${provider} not configured`,
                400
            );
        }

        // Clean up expired OAuth states first
        await this.cleanupExpiredOAuthStates();

        // Validate and sanitize intended redirect URL
        let validatedRedirectUrl: string | null = null;
        if (intendedRedirectUrl) {
            validatedRedirectUrl = this.validateRedirectUrl(intendedRedirectUrl, request);
        }

        // Generate state for CSRF protection
        const state = generateSecureToken();

        // Generate PKCE code verifier
        const codeVerifier = BaseOAuthProvider.generateCodeVerifier();

        // Store OAuth state with intended redirect URL
        await this.database.insert(schema.oauthStates).values({
            id: generateId(),
            state,
            provider,
            codeVerifier,
            redirectUri: validatedRedirectUrl || oauthProvider['redirectUri'],
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 600000), // 10 minutes
            isUsed: false,
            scopes: [],
            userId: null,
            nonce: null
        });

        // Get authorization URL
        const authUrl = await oauthProvider.getAuthorizationUrl(state, codeVerifier);

        logger.info('OAuth authorization initiated', { provider });

        return authUrl;
    }

    /**
     * Clean up expired OAuth states
     */
    private async cleanupExpiredOAuthStates(): Promise<void> {
        try {
            const now = new Date();
            await this.database
                .delete(schema.oauthStates)
                .where(
                    or(
                        lt(schema.oauthStates.expiresAt, now),
                        eq(schema.oauthStates.isUsed, true)
                    )
                );

            logger.debug('Cleaned up expired OAuth states');
        } catch (error) {
            logger.error('Error cleaning up OAuth states', error);
        }
    }

    /**
     * Handle OAuth callback
     */
    async handleOAuthCallback(
        provider: OAuthProvider,
        code: string,
        state: string,
        request: Request
    ): Promise<AuthResult> {
        try {
            const oauthProvider = await this.getOauthProvider(provider, request);
            if (!oauthProvider) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    `OAuth provider ${provider} not configured`,
                    400
                );
            }

            // Verify state
            const now = new Date();
            const oauthState = await this.database
                .select()
                .from(schema.oauthStates)
                .where(
                    and(
                        eq(schema.oauthStates.state, state),
                        eq(schema.oauthStates.provider, provider),
                        eq(schema.oauthStates.isUsed, false)
                    )
                )
                .get();

            if (!oauthState || new Date(oauthState.expiresAt) < now) {
                throw new SecurityError(
                    SecurityErrorType.CSRF_VIOLATION,
                    'Invalid or expired OAuth state',
                    400
                );
            }

            // Mark state as used
            await this.database
                .update(schema.oauthStates)
                .set({ isUsed: true })
                .where(eq(schema.oauthStates.id, oauthState.id));

            // Exchange code for tokens
            const tokens = await oauthProvider.exchangeCodeForTokens(
                code,
                oauthState.codeVerifier || undefined
            );

            // Get user info
            const oauthUserInfo = await oauthProvider.getUserInfo(tokens.accessToken);

            // Find or create user
            const user = await this.findOrCreateOAuthUser(provider, oauthUserInfo);

            // Create session
            const { accessToken: sessionAccessToken, session } = await this.sessionService.createSession(
                user.id,
                request
            );

            // Log auth attempt
            await this.logAuthAttempt(user.email, `oauth_${provider}`, true, request);

            logger.info('OAuth login successful', { userId: user.id, provider });

            return {
                user: mapUserResponse(user),
                accessToken: sessionAccessToken,
                sessionId: session.sessionId,
                expiresAt: session.expiresAt,
                redirectUrl: oauthState.redirectUri || undefined
            };
        } catch (error) {
            await this.logAuthAttempt('', `oauth_${provider}`, false, request);

            if (error instanceof SecurityError) {
                throw error;
            }

            logger.error('OAuth callback error', error);
            throw new SecurityError(
                SecurityErrorType.UNAUTHORIZED,
                'OAuth authentication failed',
                500
            );
        }
    }

    /**
     * Find or create OAuth user
     */
    private async findOrCreateOAuthUser(
        provider: OAuthProvider,
        oauthUserInfo: OAuthUserInfo
    ): Promise<schema.User> {
        // Check if user exists with this email
        let user = await this.database
            .select()
            .from(schema.users)
            .where(eq(schema.users.email, oauthUserInfo.email.toLowerCase()))
            .get();

        if (!user) {
            // Create new user
            const userId = generateId();
            const now = new Date();

            await this.database.insert(schema.users).values({
                id: userId,
                email: oauthUserInfo.email.toLowerCase(),
                displayName: oauthUserInfo.name || oauthUserInfo.email.split('@')[0],
                avatarUrl: oauthUserInfo.picture,
                emailVerified: oauthUserInfo.emailVerified || false,
                provider: provider,
                providerId: oauthUserInfo.id,
                createdAt: now,
                updatedAt: now
            });

            user = await this.database
                .select()
                .from(schema.users)
                .where(eq(schema.users.id, userId))
                .get();
        } else {
            // Always update OAuth info and user data on login
            await this.database
                .update(schema.users)
                .set({
                    displayName: oauthUserInfo.name || user.displayName,
                    avatarUrl: oauthUserInfo.picture || user.avatarUrl,
                    provider: provider,
                    providerId: oauthUserInfo.id,
                    emailVerified: oauthUserInfo.emailVerified || user.emailVerified,
                    updatedAt: new Date()
                })
                .where(eq(schema.users.id, user.id));

            // Refresh user data after updates
            user = await this.database
                .select()
                .from(schema.users)
                .where(eq(schema.users.id, user.id))
                .get();
        }

        return user!;
    }

    /**
     * Log authentication attempt
     */
    private async logAuthAttempt(
        identifier: string,
        attemptType: string,
        success: boolean,
        request: Request
    ): Promise<void> {
        try {
            const requestMetadata = extractRequestMetadata(request);

            await this.database.insert(schema.authAttempts).values({
                identifier: identifier.toLowerCase(),
                attemptType: attemptType as 'login' | 'register' | 'oauth_google' | 'oauth_github' | 'refresh' | 'reset_password',
                success: success,
                ipAddress: requestMetadata.ipAddress
            });
        } catch (error) {
            logger.error('Failed to log auth attempt', error);
        }
    }

    /**
     * Validate and sanitize redirect URL to prevent open redirect attacks
     */
    private validateRedirectUrl(redirectUrl: string, request: Request): string | null {
        try {
            const requestUrl = new URL(request.url);

            // Handle relative URLs by constructing absolute URL with same origin
            const redirectUrlObj = redirectUrl.startsWith('/')
                ? new URL(redirectUrl, requestUrl.origin)
                : new URL(redirectUrl);

            // Only allow same-origin redirects for security
            if (redirectUrlObj.origin !== requestUrl.origin) {
                logger.warn('OAuth redirect URL rejected: different origin', {
                    redirectUrl: redirectUrl,
                    requestOrigin: requestUrl.origin,
                    redirectOrigin: redirectUrlObj.origin
                });
                return null;
            }

            // Prevent redirecting to authentication endpoints to avoid loops
            const authPaths = ['/api/auth/', '/logout'];
            if (authPaths.some(path => redirectUrlObj.pathname.startsWith(path))) {
                logger.warn('OAuth redirect URL rejected: auth endpoint', {
                    redirectUrl: redirectUrl,
                    pathname: redirectUrlObj.pathname
                });
                return null;
            }

            return redirectUrl;
        } catch (error) {
            logger.warn('Invalid OAuth redirect URL format', { redirectUrl, error });
            return null;
        }
    }

    /**
     * Verify email with OTP
     */
    async verifyEmailWithOtp(email: string, otp: string, request: Request): Promise<AuthResult> {
        try {
            // Find the user by email first to get their ID
            const user = await this.database
                .select()
                .from(schema.users)
                .where(eq(schema.users.email, email.toLowerCase()))
                .get();

            if (!user) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'User not found',
                    404
                );
            }

            // Use the new verification logic from EmailService
            const verifyResult = await verifyEmailOTP(this.env as any, user.id, otp);

            if (!verifyResult.success) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    verifyResult.error || 'Verification failed',
                    400
                );
            }

            // Create session for the now-verified user
            const { accessToken, session } = await this.sessionService.createSession(
                user.id,
                request
            );

            // Log successful verification
            await this.logAuthAttempt(email, 'email_verification', true, request);
            logger.info('Email verified successfully', { email, userId: user.id });

            return {
                user: mapUserResponse({ ...user, emailVerified: true }),
                accessToken,
                sessionId: session.sessionId,
                expiresAt: session.expiresAt,
            };
        } catch (error) {
            await this.logAuthAttempt(email, 'email_verification', false, request);

            if (error instanceof SecurityError) {
                throw error;
            }

            logger.error('Email verification error', error);
            throw new SecurityError(
                SecurityErrorType.INVALID_INPUT,
                'Email verification failed',
                500
            );
        }
    }

    /**
     * Get user for authentication (for middleware)
     */
    async getUserForAuth(userId: string): Promise<AuthUser | null> {
        try {
            const user = await this.database
                .select({
                    id: schema.users.id,
                    email: schema.users.email,
                    displayName: schema.users.displayName,
                    username: schema.users.username,
                    avatarUrl: schema.users.avatarUrl,
                    bio: schema.users.bio,
                    timezone: schema.users.timezone,
                    provider: schema.users.provider,
                    emailVerified: schema.users.emailVerified,
                    createdAt: schema.users.createdAt,
                })
                .from(schema.users)
                .where(
                    and(
                        eq(schema.users.id, userId),
                        isNull(schema.users.deletedAt)
                    )
                )
                .get()
                .catch((error: unknown) => {
                    logger.error('getUserForAuth query failed', {
                        errorMessage: error instanceof Error ? error.message : String(error),
                        errorName: error instanceof Error ? error.name : 'UnknownError',
                        errorCause: (error as any)?.cause,
                        errorStack: error instanceof Error ? error.stack?.split('\n').slice(0, 5).join('\n') : undefined,
                        userId
                    });
                    throw error;
                });

            if (!user) {
                logger.debug('User not found for auth', { userId });
                return null;
            }

            return mapUserResponse(user);
        } catch (error: unknown) {
            logger.error('Error getting user for auth', {
                errorMessage: error instanceof Error ? error.message : String(error),
                errorName: error instanceof Error ? error.name : 'UnknownError',
                errorCause: (error as any)?.cause,
                userId
            });
            return null;
        }
    }

    /**
     * Validate token and return user (for middleware)
     */
    async validateTokenAndGetUser(token: string, _env: Env): Promise<AuthUserSession | null> {
        try {
            const jwtUtils = JWTUtils.getInstance(this.env as any);
            const payload = await jwtUtils.verifyToken(token);

            if (!payload || payload.type !== 'access') {
                return null;
            }

            // Check if token is expired
            if (payload.exp * 1000 < Date.now()) {
                logger.debug('Token expired', { exp: payload.exp });
                return null;
            }

            // Get user from database
            const user = await this.getUserForAuth(payload.sub);
            if (!user) {
                return null;
            }

            return {
                user,
                sessionId: payload.sessionId,
            };
        } catch (error) {
            logger.error('Token validation error', error);
            return null;
        }
    }

    /**
     * Resend verification OTP
     */
    async resendVerificationOtp(email: string): Promise<void> {
        try {
            // Check if user exists and is unverified
            const user = await this.database
                .select()
                .from(schema.users)
                .where(eq(schema.users.email, email.toLowerCase()))
                .get();

            if (!user) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'No account found with this email',
                    404
                );
            }

            if (user.emailVerified) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'Email is already verified',
                    400
                );
            }

            // Use the new resend logic from EmailService
            const resendResult = await resendVerificationEmail(this.env as any, user.id, email.toLowerCase());

            if (!resendResult.success) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    resendResult.error || 'Failed to resend verification code',
                    429
                );
            }

            logger.info('Verification OTP resent', { email });
        } catch (error) {
            if (error instanceof SecurityError) {
                throw error;
            }

            logger.error('Resend verification OTP error', error);
            throw new SecurityError(
                SecurityErrorType.INVALID_INPUT,
                'Failed to resend verification code',
                500
            );
        }
    }

    /**
     * Send password reset email
     */
    async forgotPassword(email: string): Promise<void> {
        try {
            const user = await this.database
                .select()
                .from(schema.users)
                .where(eq(schema.users.email, email.toLowerCase()))
                .get();

            if (!user || user.provider !== 'email') {
                // For security, don't reveal if user exists or uses OAuth
                // Just log it internally
                logger.info('Password reset requested for non-existent or OAuth user', { email });
                return;
            }

            await sendPasswordResetEmail(this.env as any, user.id, email.toLowerCase());

            logger.info('Password reset email sent', { email, userId: user.id });
        } catch (error) {
            logger.error('Forgot password error', error);
            // Don't throw for security reasons, just log and return
        }
    }

    /**
     * Reset password using OTP
     */
    async resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
        try {
            const user = await this.database
                .select()
                .from(schema.users)
                .where(eq(schema.users.email, email.toLowerCase()))
                .get();

            if (!user || user.provider !== 'email') {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'User not found',
                    404
                );
            }

            // Verify OTP from password_resets table
            const record = await this.env.DB.prepare(
                `SELECT otp, expires_at FROM password_resets WHERE user_id = ?`
            )
                .bind(user.id)
                .first<{ otp: string; expires_at: string }>();

            if (!record) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'Password reset request timed out or was not requested. Please try again.',
                    400
                );
            }

            if (new Date(record.expires_at) < new Date()) {
                await this.env.DB.prepare(`DELETE FROM password_resets WHERE user_id = ?`)
                    .bind(user.id)
                    .run();
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'Password reset code expired. Please request a new one.',
                    400
                );
            }

            if (record.otp !== otp.trim()) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'Invalid password reset code.',
                    400
                );
            }

            // Validation of new password
            const validation = validatePassword(newPassword);
            if (!validation.valid) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    validation.errors?.[0] || 'Invalid password',
                    400
                );
            }

            // Hash and update password
            const passwordHash = await this.passwordService.hash(newPassword);
            await this.database
                .update(schema.users)
                .set({
                    passwordHash,
                    updatedAt: new Date(),
                    passwordChangedAt: new Date(),
                    failedLoginAttempts: 0,
                    lockedUntil: null
                })
                .where(eq(schema.users.id, user.id));

            // Clean up reset record
            await this.env.DB.prepare(`DELETE FROM password_resets WHERE user_id = ?`)
                .bind(user.id)
                .run();

            logger.info('Password reset successfully', { email, userId: user.id });
        } catch (error) {
            if (error instanceof SecurityError) {
                throw error;
            }
            logger.error('Reset password error', error);
            throw new SecurityError(
                SecurityErrorType.INVALID_INPUT,
                'Failed to reset password. Please try again later.',
                500
            );
        }
    }
}
