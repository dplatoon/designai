import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import path from 'path';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
	optimizeDeps: {
		exclude: ['format', 'editor.all'],
		include: ['monaco-editor/esm/vs/editor/editor.api'],
		force: true,
	},
	plugins: [
		react(),
		svgr(),
		cloudflare({
			configPath: 'wrangler.jsonc',
			remoteBindings: true,
		}),
		tailwindcss(),
	],
	resolve: {
		alias: {
			debug: 'debug/src/browser',
			'@': path.resolve(__dirname, './src'),
			'shared': path.resolve(__dirname, './shared'),
			'worker': path.resolve(__dirname, './worker'),
		},
	},
	define: {
		'process.env.NODE_ENV': JSON.stringify(
			process.env.NODE_ENV || 'development',
		),
		global: 'globalThis',
	},
	worker: {
		format: 'es',
	},
	server: {
		allowedHosts: true,
	},
	cacheDir: 'node_modules/.vite',
	build: {
		sourcemap: false,
		rollupOptions: {
			external: ['path', 'node:path', 'node:fs', 'node:os', 'node:crypto', 'node:stream', 'node:buffer', 'node:util', 'node:events', 'node:url', 'node:http', 'node:https', 'node:net', 'node:tls', 'node:zlib', 'node:child_process', 'node:worker_threads', 'ai'],
			output: {
				manualChunks(id) {
					if (id.includes('node_modules/monaco-editor')) {
						return 'monaco';
					}
					if (id.includes('@sentry')) {
						return 'sentry';
					}
					if (
						id.includes('node_modules/react/') ||
						id.includes('node_modules/react-dom/') ||
						id.includes('node_modules/react-router')
					) {
						return 'react-core';
					}
					if (id.includes('node_modules/@radix-ui/')) {
						return 'ui-radix';
					}
					if (id.includes('node_modules/lucide-react') || id.includes('node_modules/react-feather')) {
						return 'ui-icons';
					}
					if (id.includes('node_modules/rehype') || id.includes('node_modules/remark') || id.includes('node_modules/react-markdown')) {
						return 'parser-md';
					}
					if (id.includes('node_modules/framer-motion')) {
						return 'animation';
					}
					if (id.includes('node_modules/react-hook-form') || id.includes('node_modules/zod')) {
						return 'forms';
					}
					if (id.includes('node_modules/date-fns') || id.includes('node_modules/lodash') || id.includes('node_modules/clsx')) {
						return 'utils';
					}
					if (id.includes('node_modules')) {
						return 'vendor';
					}
				},
			},
		},
	},
});
