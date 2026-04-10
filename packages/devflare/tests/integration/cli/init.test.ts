// =============================================================================
// CLI Init Command — Integration Tests
// =============================================================================

import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import {
	createTestHarness,
	createParsedArgs,
	createMockProcessRunner,
	type TestHarness
} from '../mocks'
import { runInitCommand } from '../../../src/cli/commands/init'
import { setDependencies, clearDependencies } from '../../../src/cli/dependencies'
import { getInitDependencyVersions } from '../../../src/cli/package-metadata'

describe('init command integration', () => {
	let harness: TestHarness

	beforeEach(() => {
		harness = createTestHarness({
			cwd: '/workspace'
		})

		// Inject mock dependencies
		setDependencies({
			fs: harness.fs.createMock(),
			exec: createMockProcessRunner(harness.execa)
		})
	})

	afterEach(() => {
		harness.reset()
		clearDependencies()
	})

	describe('project creation', () => {
		test('creates project directory with minimal template', async () => {
			const parsed = createParsedArgs('init', ['my-project'], {})

			const result = await runInitCommand(
				parsed,
				harness.logger as unknown as import('consola').ConsolaInstance,
				{ cwd: harness.cwd }
			)

			expect(result.exitCode).toBe(0)

			// Verify directory was created
			expect(harness.fs.exists('/workspace/my-project')).toBe(true)

			// Verify expected files exist
			expect(harness.fs.exists('/workspace/my-project/package.json')).toBe(true)
			expect(harness.fs.exists('/workspace/my-project/devflare.config.ts')).toBe(true)
			expect(harness.fs.exists('/workspace/my-project/src/fetch.ts')).toBe(true)
			expect(harness.fs.exists('/workspace/my-project/tsconfig.json')).toBe(true)

			// Check success message was logged
			expect(harness.logger.success).toHaveBeenCalled()
		})

		test('creates all required files for minimal template', async () => {
			const parsed = createParsedArgs('init', ['test-app'], {})

			const result = await runInitCommand(
				parsed,
				harness.logger as unknown as import('consola').ConsolaInstance,
				{ cwd: harness.cwd }
			)

			expect(result.exitCode).toBe(0)

			// Check all files from minimal template
			const projectPath = '/workspace/test-app'
			expect(harness.fs.exists(`${projectPath}/devflare.config.ts`)).toBe(true)
			expect(harness.fs.exists(`${projectPath}/src/fetch.ts`)).toBe(true)
			expect(harness.fs.exists(`${projectPath}/package.json`)).toBe(true)
			expect(harness.fs.exists(`${projectPath}/tsconfig.json`)).toBe(true)
		})

		test('creates project with api template', async () => {
			const parsed = createParsedArgs('init', ['api-app'], {
				template: 'api'
			})

			const result = await runInitCommand(
				parsed,
				harness.logger as unknown as import('consola').ConsolaInstance,
				{ cwd: harness.cwd }
			)

			expect(result.exitCode).toBe(0)

			// Check API-specific files
			const projectPath = '/workspace/api-app'
			expect(harness.fs.exists(`${projectPath}/src/fetch.ts`)).toBe(true)
			expect(harness.fs.exists(`${projectPath}/src/app.ts`)).toBe(true)
			expect(harness.fs.exists(`${projectPath}/src/middleware/cors.ts`)).toBe(true)
		})

		test('fails for unknown template', async () => {
			const parsed = createParsedArgs('init', ['my-app'], {
				template: 'nonexistent'
			})

			const result = await runInitCommand(
				parsed,
				harness.logger as unknown as import('consola').ConsolaInstance,
				{ cwd: harness.cwd }
			)

			expect(result.exitCode).toBe(1)
			expect(harness.logger.error).toHaveBeenCalled()
		})

		test('uses default project name when not provided', async () => {
			const parsed = createParsedArgs('init', [], {})

			const result = await runInitCommand(
				parsed,
				harness.logger as unknown as import('consola').ConsolaInstance,
				{ cwd: harness.cwd }
			)

			expect(result.exitCode).toBe(0)
			expect(harness.fs.exists('/workspace/my-devflare-app')).toBe(true)
		})
	})

	describe('file content validation', () => {
		test('generates package.json with correct project name', async () => {
			const dependencyVersions = await getInitDependencyVersions()
			const parsed = createParsedArgs('init', ['custom-name'], {})

			const result = await runInitCommand(
				parsed,
				harness.logger as unknown as import('consola').ConsolaInstance,
				{ cwd: harness.cwd }
			)

			expect(result.exitCode).toBe(0)

			const packageJson = harness.fs.getContent('/workspace/custom-name/package.json')
			expect(packageJson).not.toBeNull()

			const pkg = JSON.parse(packageJson!)
			expect(pkg.name).toBe('custom-name')
			expect(pkg.devDependencies.devflare).toBe(dependencyVersions.devflare)
			expect(pkg.devDependencies.wrangler).toBe(dependencyVersions.wrangler)
			expect(pkg.devDependencies['@cloudflare/workers-types']).toBe(dependencyVersions.workersTypes)
		})

		test('generates devflare.config.ts with project name', async () => {
			const parsed = createParsedArgs('init', ['my-worker'], {})

			const result = await runInitCommand(
				parsed,
				harness.logger as unknown as import('consola').ConsolaInstance,
				{ cwd: harness.cwd }
			)

			expect(result.exitCode).toBe(0)

			const configContent = harness.fs.getContent('/workspace/my-worker/devflare.config.ts')
			expect(configContent).not.toBeNull()
			expect(configContent).toContain("name: 'my-worker'")
			expect(configContent).toContain("fetch: 'src/fetch.ts'")
		})

		test('generates src/fetch.ts with named fetch export and README-aligned response text', async () => {
			const parsed = createParsedArgs('init', ['test-app'], {})

			const result = await runInitCommand(
				parsed,
				harness.logger as unknown as import('consola').ConsolaInstance,
				{ cwd: harness.cwd }
			)

			expect(result.exitCode).toBe(0)

			const fetchContent = harness.fs.getContent('/workspace/test-app/src/fetch.ts')
			expect(fetchContent).not.toBeNull()
			expect(fetchContent).toContain('export async function fetch')
			expect(fetchContent).toContain('FetchEvent')
			expect(fetchContent).toContain('Hello from Devflare')
			expect(fetchContent).toContain('Hello from Devflare:')
			expect(fetchContent).not.toContain('export default')
		})

		test('api template uses src/fetch.ts with a single named handle export', async () => {
			const parsed = createParsedArgs('init', ['api-app'], {
				template: 'api'
			})

			const result = await runInitCommand(
				parsed,
				harness.logger as unknown as import('consola').ConsolaInstance,
				{ cwd: harness.cwd }
			)

			expect(result.exitCode).toBe(0)

			const fetchContent = harness.fs.getContent('/workspace/api-app/src/fetch.ts')
			expect(fetchContent).not.toBeNull()
			expect(fetchContent).toContain("import { sequence } from 'devflare/runtime'")
			expect(fetchContent).toContain('export const handle = sequence(corsHandle, appFetch)')
			expect(fetchContent).not.toContain('export const fetch = sequence(')
			expect(fetchContent).not.toContain('export default')

			const appContent = harness.fs.getContent('/workspace/api-app/src/app.ts')
			expect(appContent).not.toBeNull()
			expect(appContent).toContain('export async function appFetch')
			expect(appContent).toContain("Response.json({ status: 'ok' })")
			expect(appContent).not.toContain('src/routes')

			const tsconfigContent = harness.fs.getContent('/workspace/api-app/tsconfig.json')
			expect(tsconfigContent).toContain('env.d.ts')
		})
	})

	describe('error handling', () => {
		test('fails when directory already exists', async () => {
			// Pre-create the directory
			harness.fs.addFile('/workspace/existing-project/dummy.txt', 'exists')

			const parsed = createParsedArgs('init', ['existing-project'], {})

			const result = await runInitCommand(
				parsed,
				harness.logger as unknown as import('consola').ConsolaInstance,
				{ cwd: harness.cwd }
			)

			expect(result.exitCode).toBe(1)
			expect(harness.logger.error).toHaveBeenCalled()

			// Check error message mentions directory exists
			const errorCalls = harness.logger.error.mock.calls
			const hasExistsError = errorCalls.some(
				(call) => String(call[0]).includes('already exists')
			)
			expect(hasExistsError).toBe(true)
		})
	})

	describe('filesystem operations', () => {
		test('creates nested directories correctly', async () => {
			const parsed = createParsedArgs('init', ['my-app'], {
				template: 'api'
			})

			const result = await runInitCommand(
				parsed,
				harness.logger as unknown as import('consola').ConsolaInstance,
				{ cwd: harness.cwd }
			)

			expect(result.exitCode).toBe(0)

			// Check nested paths were created
			expect(harness.fs.exists('/workspace/my-app/src/middleware')).toBe(true)
			expect(harness.fs.exists('/workspace/my-app/src/app.ts')).toBe(true)
		})

		test('tracks all mkdir operations', async () => {
			const parsed = createParsedArgs('init', ['tracked-app'], {})

			await runInitCommand(
				parsed,
				harness.logger as unknown as import('consola').ConsolaInstance,
				{ cwd: harness.cwd }
			)

			const mkdirOps = harness.fs.getOperations('mkdir')
			expect(mkdirOps.length).toBeGreaterThan(0)

			// Root project dir should be created
			expect(mkdirOps.some((op) => op.path.includes('/tracked-app'))).toBe(true)
		})

		test('tracks all writeFile operations', async () => {
			const parsed = createParsedArgs('init', ['written-app'], {})

			await runInitCommand(
				parsed,
				harness.logger as unknown as import('consola').ConsolaInstance,
				{ cwd: harness.cwd }
			)

			const writeOps = harness.fs.getOperations('writeFile')
			expect(writeOps.length).toBeGreaterThanOrEqual(4) // At least 4 files in minimal template
		})
	})
})
