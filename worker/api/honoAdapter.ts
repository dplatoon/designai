import { Context } from 'hono';
import { RouteContext } from './types/route-context';
import { AppEnv } from '../types/appenv';
import { BaseController } from './controllers/baseController';
import { enforceAuthRequirement } from '../middleware/auth/routeAuth';
/*
* This is a simple adapter to convert Hono context to our base controller's expected arguments
*/

type ControllerMethod<T extends BaseController> = (
    this: T,
    request: Request,
    env: Env,
    ctx: ExecutionContext,
    context: RouteContext
) => Promise<Response>;

export interface AdaptOptions {
    requireVerified?: boolean;
}

export function adaptController<T extends BaseController>(
    controller: T,
    method: ControllerMethod<T>,
    options: AdaptOptions = {}
) {
    return async (c: Context<AppEnv>): Promise<Response> => {
        const authResult = await enforceAuthRequirement(c);
        if (authResult) {
            return authResult;
        }

        // Handle email verification if required
        if (options.requireVerified) {
            const user = c.get('user');
            if (user && !user.emailVerified) {
                return c.json({
                    success: false,
                    error: "EMAIL_UNVERIFIED",
                    message: "Please verify your email address to access this feature.",
                    userId: user.id,
                    email: user.email
                }, 403);
            }
        }

        const routeContext: RouteContext = {
            user: c.get('user'),
            sessionId: c.get('sessionId'),
            config: c.get('config'),
            pathParams: c.req.param(),
            queryParams: new URL(c.req.url).searchParams,
        };
        return await method.call(
            controller,
            c.req.raw,
            c.env,
            c.executionCtx,
            routeContext
        );
    };
}

