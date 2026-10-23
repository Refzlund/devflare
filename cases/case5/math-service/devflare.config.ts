import { defineConfig } from 'devflare/config'
import type { Entrypoints } from './env'

// Use defineConfig<Entrypoints>() for type-safe entrypoint references
// Run `devflare types` to generate the Entrypoints type in env.d.ts
export default defineConfig<Entrypoints>({
	name: 'math-worker',
	compatibilityDate: '2026-04-26',

	// worker.ts is at root (not in src/), so we must specify it
	files: {
		fetch: 'worker.ts'
	}
	// Note: entrypoints are auto-discovered from **/ep.*.{ts,js} files
})
