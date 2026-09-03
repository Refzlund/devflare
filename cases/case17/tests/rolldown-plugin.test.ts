// =============================================================================
// Case 17: Plugin Namespace Example - Tests
// =============================================================================
// These are unit-style tests for plugin-shaped transform logic. They are not an
// end-to-end proof that the main worker pipeline currently wires those plugins.
// =============================================================================

import { describe, expect, it } from 'bun:test'

/**
 * Simulated transform function for testing
 */
type TransformFn = (code: string, id: string) => string | null

/**
 * Creates a build metadata transform
 */
function createBuildMetadataTransform(buildTime: string): TransformFn {
	return (code: string, id: string) => {
		if (id.endsWith('.ts') && code.includes('__BUILD_TIME__')) {
			return code.replace(/__BUILD_TIME__/g, JSON.stringify(buildTime))
		}
		return null
	}
}

/**
 * Creates an env info transform
 */
function createEnvInfoTransform(env: { mode: string, nodeVersion: string }): TransformFn {
	return (code: string, id: string) => {
		if (id.endsWith('.ts')) {
			return code
				.replace(/__ENV_MODE__/g, JSON.stringify(env.mode))
				.replace(/__NODE_VERSION__/g, JSON.stringify(env.nodeVersion))
		}
		return null
	}
}

/**
 * Simulated virtual modules resolver for testing
 */
function createVirtualModulesResolver() {
	const virtualModuleId = 'virtual:config'
	const resolvedVirtualModuleId = '\0' + virtualModuleId

	return {
		resolveId(id: string): string | null {
			if (id === virtualModuleId) {
				return resolvedVirtualModuleId
			}
			return null
		},
		load(id: string): string | null {
			if (id === resolvedVirtualModuleId) {
				return `export const config = { name: 'test', version: '1.0.0' }`
			}
			return null
		}
	}
}

describe('Case 17: Plugin Namespace Example', () => {
	describe('Build Metadata Transform', () => {
		it('replaces __BUILD_TIME__ placeholder', () => {
			const buildTime = '2025-01-01T00:00:00.000Z'
			const transform = createBuildMetadataTransform(buildTime)

			const code = 'const time = __BUILD_TIME__'
			const result = transform(code, 'test.ts')

			expect(result).toBe(`const time = "${buildTime}"`)
		})

		it('handles multiple placeholders', () => {
			const buildTime = '2025-01-01T00:00:00.000Z'
			const transform = createBuildMetadataTransform(buildTime)

			const code = 'const a = __BUILD_TIME__; const b = __BUILD_TIME__;'
			const result = transform(code, 'test.ts')

			expect(result).toBe(`const a = "${buildTime}"; const b = "${buildTime}";`)
		})

		it('returns null for non-ts files', () => {
			const transform = createBuildMetadataTransform('test')

			const result = transform('const x = __BUILD_TIME__', 'test.js')

			expect(result).toBeNull()
		})

		it('returns null when no placeholder present', () => {
			const transform = createBuildMetadataTransform('test')

			const result = transform('const x = 123', 'test.ts')

			expect(result).toBeNull()
		})
	})

	describe('Env Info Transform', () => {
		it('replaces environment placeholders', () => {
			const transform = createEnvInfoTransform({
				mode: 'production',
				nodeVersion: 'v20.0.0'
			})

			const code = 'const mode = __ENV_MODE__; const node = __NODE_VERSION__;'
			const result = transform(code, 'test.ts')

			expect(result).toBe('const mode = "production"; const node = "v20.0.0";')
		})

		it('handles missing placeholders', () => {
			const transform = createEnvInfoTransform({
				mode: 'development',
				nodeVersion: 'v18.0.0'
			})

			const code = 'const x = 123'
			const result = transform(code, 'test.ts')

			expect(result).toBe('const x = 123')
		})
	})

	describe('Virtual Modules Resolver', () => {
		it('resolves virtual module id', () => {
			const resolver = createVirtualModulesResolver()

			const result = resolver.resolveId('virtual:config')

			expect(result).toBe('\0virtual:config')
		})

		it('returns null for non-virtual imports', () => {
			const resolver = createVirtualModulesResolver()

			const result = resolver.resolveId('./some-module')

			expect(result).toBeNull()
		})

		it('loads virtual module content', () => {
			const resolver = createVirtualModulesResolver()

			const result = resolver.load('\0virtual:config')

			expect(result).toContain("export const config")
			expect(result).toContain("name: 'test'")
		})

		it('returns null for non-virtual module loads', () => {
			const resolver = createVirtualModulesResolver()

			const result = resolver.load('./some-module')

			expect(result).toBeNull()
		})
	})

	describe('Transform Composition', () => {
		it('transforms can be chained', () => {
			const transforms = [
				createBuildMetadataTransform('2025-01-01'),
				createEnvInfoTransform({ mode: 'prod', nodeVersion: 'v20' })
			]

			let code = 'const t = __BUILD_TIME__; const m = __ENV_MODE__;'

			for (const transform of transforms) {
				const result = transform(code, 'test.ts')
				if (typeof result === 'string') {
					code = result
				}
			}

			expect(code).toBe('const t = "2025-01-01"; const m = "prod";')
		})
	})
})
