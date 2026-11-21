import { createLogger } from './logger';
import { SmartCodeGeneratorAgent } from './agents/core/smartGeneratorAgent';
import { proxyToSandbox } from '@cloudflare/sandbox';
import { isDispatcherAvailable } from './utils/dispatcherUtils';
import { createApp } from './app';
import * as Sentry from '@sentry/cloudflare';
import { sentryOptions } from './observability/sentry';
import { DORateLimitStore as BaseDORateLimitStore } from './services/rate-limit/DORateLimitStore';
import { getPreviewDomain } from './utils/urls';
// Durable Object and Service exports
export { UserAppSandboxService, DeployerService } from './services/sandbox/sandboxSdkClient';

export const CodeGeneratorAgent = Sentry.instrumentDurableObjectWithSentry(sentryOptions, SmartCodeGeneratorAgent);
export const DORateLimitStore = Sentry.instrumentDurableObjectWithSentry(sentryOptions, BaseDORateLimitStore);

// Logger for the main application and handlers
const logger = createLogger('App');

function setOriginControl(env: Env, request: Request, currentHeaders: Headers): Headers {
	const previewDomain = env.CUSTOM_DOMAIN
	const origin = request.headers.get('Origin');

	const allowedOrigin = `https://${previewDomain}`;
	if (origin === allowedOrigin) {
		currentHeaders.set('Access-Control-Allow-Origin', allowedOrigin);
	} else if (origin?.startsWith('http://localhost')) {
		currentHeaders.set('Access-Control-Allow-Origin', origin);
	}
	return currentHeaders;
}

/**
 * Handles requests for user-deployed applications on subdomains.
 * It first attempts to proxy to a live development sandbox. If that fails,
 * it dispatches the request to a permanently deployed worker via namespaces.
 * This function will NOT fall back to the main worker.
 *
 * @param request The incoming Request object.
 * @param env The environment bindings.
 * @returns A Response object from the sandbox, the dispatched worker, or an error.
 */
async function handleUserAppRequest(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const { hostname } = url;
	logger.info(`Handling user app request for: ${hostname}`);

	// 1. Attempt to proxy to a live development sandbox.
	// proxyToSandbox doesn't consume the request body on a miss, so no clone is needed here.
	const sandboxResponse = await proxyToSandbox(request, env);
	if (sandboxResponse) {
		logger.info(`Serving response from sandbox for: ${hostname}`);

		// Add headers to identify this as a sandbox response
		let headers = new Headers(sandboxResponse.headers);

		if (sandboxResponse.status === 500) {
			headers.set('X-Preview-Type', 'sandbox-error');
		} else {
			headers.set('X-Preview-Type', 'sandbox');
		}
		headers = setOriginControl(env, request, headers);
		headers.append('Vary', 'Origin');
		headers.set('Access-Control-Expose-Headers', 'X-Preview-Type');

		return new Response(sandboxResponse.body, {
			status: sandboxResponse.status,
			statusText: sandboxResponse.statusText,
			headers,
		});
	}

	// 2. If sandbox misses, attempt to dispatch to a deployed worker.
	logger.info(`Sandbox miss for ${hostname}, attempting dispatch to permanent worker.`);
	if (!isDispatcherAvailable(env)) {
		logger.warn(`Dispatcher not available, cannot serve: ${hostname}`);
		return new Response(JSON.stringify({
			success: false,
			error: {
				message: 'This application is not currently available.',
				type: 'NOT_FOUND'
			}
		}), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Extract the app name (e.g., "xyz" from "xyz.designai.dev").
	const appName = hostname.split('.')[0];
	const dispatcher = env['DISPATCHER'];

	try {
		const worker = dispatcher.get(appName);
		const dispatcherResponse = await worker.fetch(request);

		// Add headers to identify this as a dispatcher response
		let headers = new Headers(dispatcherResponse.headers);

		headers.set('X-Preview-Type', 'dispatcher');
		headers = setOriginControl(env, request, headers);
		headers.append('Vary', 'Origin');
		headers.set('Access-Control-Expose-Headers', 'X-Preview-Type');

		return new Response(dispatcherResponse.body, {
			status: dispatcherResponse.status,
			statusText: dispatcherResponse.statusText,
			headers,
		});
	} catch (error: any) {
		// This block catches errors if the binding doesn't exist or if worker.fetch() fails.
		logger.warn(`Error dispatching to worker '${appName}': ${error.message}`);
		return new Response(JSON.stringify({
			success: false,
			error: {
				message: 'An error occurred while loading this application.',
				type: 'DISPATCH_ERROR',
				details: error.message
			}
		}), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
}

/**
 * Main Worker fetch handler with robust, secure routing.
 */
const worker = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		try {
			console.log(`Received request: ${request.method} ${request.url}`);
			// --- Pre-flight Checks ---

			// 1. Critical configuration check: Ensure custom domain is set.
			const previewDomain = getPreviewDomain(env);
			if (!previewDomain || previewDomain.trim() === '') {
				console.error('FATAL: env.CUSTOM_DOMAIN is not configured in wrangler.toml or the Cloudflare dashboard.');
				return new Response(JSON.stringify({
					success: false,
					error: {
						message: 'Server configuration error: Application domain is not set.',
						type: 'CONFIG_ERROR'
					}
				}), {
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				});
			}

			const url = new URL(request.url);
			const { hostname, pathname } = url;

			// 2. Security: Immediately reject any requests made via an IP address.
			const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
			if (ipRegex.test(hostname)) {
				return new Response(JSON.stringify({
					success: false,
					error: {
						message: 'Access denied. Please use the assigned domain name.',
						type: 'ACCESS_DENIED'
					}
				}), {
					status: 403,
					headers: { 'Content-Type': 'application/json' }
				});
			}

			// --- Domain-based Routing ---

			// Normalize hostnames for both local development (localhost) and production.
			const isMainDomainRequest =
				hostname === env.CUSTOM_DOMAIN ||
				hostname === 'localhost' ||
				hostname.endsWith('.workers.dev');

			const isSubdomainRequest =
				hostname.endsWith(`.${previewDomain}`) ||
				(hostname.endsWith('.localhost') && hostname !== 'localhost');

			// Route 1: Main Platform Request (e.g., designai.dev or localhost)
			if (isMainDomainRequest) {
				// Serve static assets for all non-API routes from the ASSETS binding.
				if (!pathname.startsWith('/api/')) {
					const response = await env.ASSETS.fetch(request);

					// If asset not found (404), fallback to index.html for SPA routing
					if (response.status === 404 && !pathname.includes('.')) {
						const indexRequest = new Request(new URL('/', request.url), request);
						return env.ASSETS.fetch(indexRequest);
					}

					return response;
				}
				// Handle all API requests with the main Hono application.
				logger.info(`Handling API request for: ${url}`);
				const app = createApp(env);
				return app.fetch(request, env, ctx);
			}

			// Route 2: User App Request (e.g., xyz.designai.dev or test.localhost)
			if (isSubdomainRequest) {
				return handleUserAppRequest(request, env);
			}

			return new Response(JSON.stringify({
				success: false,
				error: {
					message: 'Not Found',
					type: 'NOT_FOUND'
				}
			}), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			});
		} catch (error: any) {
			console.error('FATAL WORKER ERROR:', error);
			return new Response(JSON.stringify({
				success: false,
				error: {
					message: error.message || 'Fatal worker error',
					stack: env.ENVIRONMENT === 'dev' ? error.stack : undefined
				}
			}), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}
} satisfies ExportedHandler<Env>;

export default Sentry.withSentry(sentryOptions, worker);
