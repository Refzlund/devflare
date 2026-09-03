import { defineConfig } from 'rolldown'

/**
 * Bundle every published entrypoint with rolldown.
 *
 * We use rolldown (already a runtime dependency) instead of `bun build` because
 * bun's bundler miscompiles pure re-export barrels: for an entry like
 * `src/runtime/index.ts` (which is only `export { x } from './a'` lines) bun
 * emits a file containing `export { x }` with no imports and no `from` clause,
 * so the symbols resolve to nothing and `node` import fails with
 * `Export 'x' is not defined in module`. That broke `devflare/runtime`,
 * `devflare/test`, and the bare `devflare` entry for every ESM consumer.
 *
 * The input-map keys bake the on-disk layout (`runtime/index` → `dist/runtime/index.js`)
 * so the output mirrors the old `--root ./src` behaviour. Bare specifiers
 * (node: builtins, node_modules) stay external — consumers install our
 * declared dependencies — exactly like the old `--packages=external`.
 */
export default defineConfig({
	input: {
		index: './src/index.ts',
		browser: './src/browser.ts',
		'config-entry': './src/config-entry.ts',
		'cli/index': './src/cli/index.ts',
		'runtime/index': './src/runtime/index.ts',
		'test/index': './src/test/index.ts',
		'vite/index': './src/vite/index.ts',
		'sveltekit/index': './src/sveltekit/index.ts',
		'cloudflare/index': './src/cloudflare/index.ts',
		'decorators/index': './src/decorators/index.ts',
		'utils/send-email': './src/utils/send-email.ts'
	},
	platform: 'node',
	// Bundle our own source (relative/absolute ids); externalize every bare
	// specifier so declared deps are resolved from the consumer's node_modules.
	external: (id) => !id.startsWith('.') && !id.startsWith('/') && !/^[A-Za-z]:/.test(id),
	output: {
		dir: './dist',
		format: 'esm',
		entryFileNames: '[name].js',
		chunkFileNames: '_chunks/[name]-[hash].js'
	}
})
