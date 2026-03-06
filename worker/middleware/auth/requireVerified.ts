// src/middleware/requireVerified.ts - Note: This should likely be in worker/middleware/ to match project structure
import { Context, Next } from "hono";
import { AppEnv } from "../../types/appenv";
import { SecurityError, SecurityErrorType } from "shared/types/errors";

/**
 * Middleware to require email verification for protected routes.
 * Should be placed AFTER the authentication middleware.
 */
export const requireVerified = async (c: Context<AppEnv>, next: Next) => {
    const user = c.get("user");

    if (!user) {
        throw new SecurityError(
            SecurityErrorType.UNAUTHORIZED,
            "Authentication required",
            401
        );
    }

    if (!user.emailVerified) {
        return c.json({
            success: false,
            error: "EMAIL_UNVERIFIED",
            message: "Please verify your email address to access this feature.",
            userId: user.id,
            email: user.email
        }, 403);
    }

    await next();
};
