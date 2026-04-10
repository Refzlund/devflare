// =============================================================================
// Case 18: Full SvelteKit Application - Devflare Configuration
// =============================================================================
// Comprehensive example demonstrating ALL major Cloudflare bindings:
// - R2 bucket for image storage
// - Durable Objects for realtime chat and PDF rendering
// - KV namespace for key-value storage
// - D1 database for relational data
//
// ✅ ARCHITECTURE:
// - DOs are auto-discovered via `files.durableObjects` glob pattern
// - devflare compiles everything to .devflare/wrangler.jsonc
// - `devflare dev --vite` runs Vite + auxiliaryWorkers for DOs
// - No manual worker files needed!
// =============================================================================

import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'case18-sveltekit-full',
	// compatibilityDate is optional - defaults to current date
	// compatibilityFlags is optional - nodejs_compat and nodejs_als are always forced

	// File-based conventions
	files: {
		// SvelteKit build output - required for SvelteKit integration
		fetch: '.svelte-kit/cloudflare/_worker.js',
		// Auto-discover DO classes from src/do.*.ts files
		durableObjects: 'src/do.*.ts',
		// Transport for RPC serialization (SvelteKit signature)
		transport: 'src/transport.ts'
	},

	bindings: {
		// R2 bucket for image uploads
		r2: {
			IMAGES: 'images-bucket'
		},

		// KV namespace for key-value storage
		kv: {
			CACHE: 'cache-kv'
		},

		// D1 database for relational data
		d1: {
			DB: 'main-db'
		},

		// Durable Objects - className only, no scriptName needed
		// The classes are auto-discovered from files.durableObjects
		durableObjects: {
			CHAT_ROOM: {
				className: 'ChatRoom'
			},
			PDF_RENDERER: {
				className: 'PdfRenderer'
			}
		},

		// Browser Rendering for PDF generation
		browser: {
			binding: 'BROWSER'
		}
	},

	// Migrations for Durable Objects
	migrations: [
		{
			tag: 'v1',
			new_classes: ['ChatRoom', 'PdfRenderer']
		}
	],

	// WebSocket routes for dev mode DO proxying
	// These bypass SvelteKit and go directly to DOs for WebSocket connections
	wsRoutes: [
		{
			pattern: '/chat/api',
			doNamespace: 'CHAT_ROOM',
			idParam: 'roomId',
			forwardPath: '/websocket'
		}
	]
})

