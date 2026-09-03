import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { clearDependencies } from '../../../src/cli/dependencies'
import {
	TEST_ACCOUNT_ID,
	TEST_UPLOAD_VERSION_ID,
	captureDeployEnvironmentSnapshot,
	classifyWranglerUploadExecution,
	cloudflareApiResponse,
	createDeployHarness,
	createWorkerDeployment,
	createWorkerDeploymentsList,
	createWorkerVersionDetail,
	createWorkerVersionsList,
	disableCloudflareAccountResolution,
	recordWranglerUpload,
	restoreDeployEnvironmentSnapshot,
	runWorkerOnlyDeploy,
	successResult,
	writeAccountProjectFiles,
	writeProjectFiles
} from './build-deploy-worker-only.test-utils'

const originalEnvironment = captureDeployEnvironmentSnapshot()

/**
 * The Cloudflare answer for a Worker that is not on the account.
 *
 * @description Error 10007 is what the API returned in the production incident
 * this suite exists for: `devflare deploy --prod` reported success for a Worker
 * that had never been created.
 */
function workerDoesNotExistResponse(): Response {
	return new Response(
		JSON.stringify({
			success: false,
			errors: [{ code: 10007, message: 'This Worker does not exist on your account' }],
			messages: [],
			result: null
		}),
		{ status: 404, headers: { 'Content-Type': 'application/json' } }
	)
}

/** Answer every Cloudflare version/deployment lookup with "this Worker does not exist". */
function mockAbsentWorker(): void {
	globalThis.fetch = mock(async () => workerDoesNotExistResponse()) as unknown as typeof fetch
}

function renderedMessages(logger: { messages: Array<{ args: unknown[] }> }): string {
	return logger.messages.map((message) => message.args.join(' ')).join('\n')
}

describe('deploy upload evidence', () => {
	let projectDir = ''

	beforeEach(async () => {
		clearDependencies()
		disableCloudflareAccountResolution()
		// Keep the verification retries instant; the delay is read regardless of
		// whether strict verification is enabled.
		process.env.DEVFLARE_VERIFY_DEPLOYMENT_ATTEMPTS = '1'
		process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS = '0'
		projectDir = await mkdtemp(join(tmpdir(), 'devflare-deploy-upload-evidence-'))
		await mkdir(join(projectDir, 'src'), { recursive: true })
	})

	afterEach(async () => {
		clearDependencies()
		restoreDeployEnvironmentSnapshot(originalEnvironment)
		if (projectDir) {
			await rm(projectDir, { recursive: true, force: true })
		}
	})

	test('a wrangler run that exits 0 without uploading fails the deploy', async () => {
		// The production incident, reproduced: wrangler exits 0 having written no
		// structured output, and Cloudflare has no such Worker. Strict
		// verification is deliberately NOT enabled — that opt-in is what let this
		// run report success.
		await writeAccountProjectFiles(projectDir, { accountId: TEST_ACCOUNT_ID })
		process.env.CLOUDFLARE_API_TOKEN = 'test-token'
		expect(process.env.DEVFLARE_VERIFY_DEPLOYMENT).toBeUndefined()
		mockAbsentWorker()

		const { logger } = createDeployHarness(() => successResult())
		const result = await runWorkerOnlyDeploy(projectDir, logger)

		expect(result.exitCode).toBe(1)
		const output = renderedMessages(logger)
		expect(output).not.toContain('Deployed successfully!')
		expect(output).toContain('wrote no structured output at all')
		expect(output).toContain(
			'Devflare could not prove which version of "worker-build-test" Cloudflare accepted'
		)
		expect(output).toContain('Cloudflare fallback checks also failed:')
	})

	test("wrangler's own deploy record is enough, with no Cloudflare API call at all", async () => {
		// A project with no accountId and no credentials: the structured output is
		// the only evidence available, and it must be sufficient. Any Cloudflare
		// request here is a bug — a deploy must not start needing credentials it
		// never needed before.
		await writeProjectFiles(projectDir, { withViteConfig: false, withViteDeps: false })
		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			throw new Error(`Unexpected Cloudflare request: ${String(input)}`)
		}) as unknown as typeof fetch

		const { logger } = createDeployHarness(async (command, args, executionOptions) => {
			const uploadKind = classifyWranglerUploadExecution(command, args)
			if (uploadKind) {
				await recordWranglerUpload(executionOptions, { kind: uploadKind })
			}
			return successResult()
		})
		const result = await runWorkerOnlyDeploy(projectDir, logger)

		expect(result.exitCode).toBe(0)
		const output = renderedMessages(logger)
		expect(output).toContain('Deployed successfully!')
		expect(output).toContain(`Version ID: ${TEST_UPLOAD_VERSION_ID}`)
	})

	test('a deploy record with no version id is a dry run or an abort, not a deploy', async () => {
		await writeAccountProjectFiles(projectDir, { accountId: TEST_ACCOUNT_ID })
		process.env.CLOUDFLARE_API_TOKEN = 'test-token'
		mockAbsentWorker()

		const { logger } = createDeployHarness(async (command, args, executionOptions) => {
			const uploadKind = classifyWranglerUploadExecution(command, args)
			if (uploadKind) {
				await recordWranglerUpload(executionOptions, { kind: uploadKind, versionId: null })
			}
			return successResult()
		})
		const result = await runWorkerOnlyDeploy(projectDir, logger)

		expect(result.exitCode).toBe(1)
		const output = renderedMessages(logger)
		expect(output).not.toContain('Deployed successfully!')
		expect(output).toContain('"deploy" entry with no version id')
	})

	test('an unchanged bundle still succeeds on the reused live version', async () => {
		// The legitimate case this rule must not break: wrangler uploaded, and
		// Cloudflare kept the existing live version rather than creating a new
		// one. There IS a current deployment pointing at a version, so the deploy
		// is proven — it is simply the version that was already live.
		await writeAccountProjectFiles(projectDir, { accountId: TEST_ACCOUNT_ID })
		process.env.CLOUDFLARE_API_TOKEN = 'test-token'
		globalThis.fetch = mock(async (input: RequestInfo | URL) => {
			const url = String(input)
			if (url.includes('/workers/scripts/worker-build-test/versions?page=1&per_page=100')) {
				return createWorkerVersionsList([
					createWorkerVersionDetail('version-existing', {
						createdOn: '2020-01-01T00:00:00.000Z',
						modifiedOn: '2020-01-01T00:00:00.000Z'
					})
				])
			}

			if (url.endsWith('/workers/scripts/worker-build-test/deployments')) {
				return createWorkerDeploymentsList([
					createWorkerDeployment('deployment-existing', 'version-existing', {
						createdOn: '2020-01-01T00:00:00.000Z',
						authorEmail: 'test@example.com'
					})
				])
			}

			return cloudflareApiResponse(createWorkerVersionDetail('version-existing'))
		}) as unknown as typeof fetch

		const { logger } = createDeployHarness(() => successResult())
		const result = await runWorkerOnlyDeploy(projectDir, logger)

		expect(result.exitCode).toBe(0)
		const output = renderedMessages(logger)
		expect(output).toContain('Deployed successfully!')
		expect(output).toContain('Cloudflare kept the existing live version')
		// The fallbacks that failed on the way there are now reported rather than
		// collected and dropped.
		expect(output).toContain('Version lookups that failed before this deploy was proven:')
	})
})
