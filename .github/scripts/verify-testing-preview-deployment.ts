import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { account, type APIClientOptions, type WorkerDeploymentInfo } from '../../packages/devflare/src/cloudflare'
import { getDependencies } from '../../packages/devflare/src/cli/dependencies'
import {
	parseWranglerVersionBindings,
	type ParsedWranglerBindingRow
} from '../../packages/devflare/src/cli/preview-bindings'
import { loadResolvedConfig } from '../../packages/devflare/src/config'
import { resolveTestingWorkerNames } from '../../apps/testing/worker-names'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..')
const TESTING_DIR = resolve(REPO_ROOT, 'apps', 'testing')
const CLOUDFLARE_API_OPTIONS: APIClientOptions = {
	timeout: 10000
}

export const DEFAULT_EXPECTED_APP_NAME = 'testing-binding-matrix-preview'
export const DEFAULT_EXPECTED_DEPLOYMENT_CHANNEL = 'preview'

export const REQUIRED_MAIN_BINDINGS = [
	'SESSIONS',
	'SESSION_ROOM',
	'COLLABORATION_STATE',
	'CROSS_WORKER_LOCK',
	'AUTH_SERVICE',
	'ADMIN_RPC',
	'SEARCH_SERVICE',
	'DOCUMENT_INDEX',
	'SEARCH_INDEX',
	'APP_ANALYTICS',
	'SEARCH_ANALYTICS',
	'TRANSACTIONAL_EMAIL',
	'SUPPORT_EMAIL',
	'POSTGRES'
] as const

export interface TestingPreviewVerificationSnapshot {
	expectedAppName: string
	expectedDeploymentChannel: string
	expectedWorkerName: string
	resolvedWorkerName: string
	resolvedAppName?: string
	resolvedDeploymentChannel?: string
	authServiceName: string
	searchServiceName: string
	availableWorkers: string[]
	versionId?: string
	bindingNames: string[]
}

function restoreOptionalEnvironmentVariable(name: string, value: string | undefined): void {
	if (typeof value === 'undefined') {
		delete process.env[name]
		return
	}

	process.env[name] = value
}

async function withTemporaryPreviewEnvironment<T>(
	previewScope: string,
	operation: () => Promise<T>
): Promise<T> {
	const originalPreviewBranch = process.env.DEVFLARE_PREVIEW_BRANCH
	const originalPreviewIdentifier = process.env.DEVFLARE_PREVIEW_IDENTIFIER

	process.env.DEVFLARE_PREVIEW_BRANCH = previewScope
	process.env.DEVFLARE_PREVIEW_IDENTIFIER = previewScope

	try {
		return await operation()
	} finally {
		restoreOptionalEnvironmentVariable('DEVFLARE_PREVIEW_BRANCH', originalPreviewBranch)
		restoreOptionalEnvironmentVariable('DEVFLARE_PREVIEW_IDENTIFIER', originalPreviewIdentifier)
	}
}

function uniqueSorted(values: string[]): string[] {
	return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
		.sort((left, right) => left.localeCompare(right))
}

function readOptionalString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function resolveActiveVersionId(deployments: WorkerDeploymentInfo[]): string | undefined {
	const sortedDeployments = [...deployments].sort((left, right) => {
		return right.createdOn.getTime() - left.createdOn.getTime()
	})

	for (const deployment of sortedDeployments) {
		const version = [...deployment.versions].sort((left, right) => right.percentage - left.percentage)[0]
		if (version?.versionId) {
			return version.versionId
		}
	}

	return undefined
}

async function inspectWorkerVersionBindings(options: {
	accountId: string
	workerName: string
	versionId: string
	cwd: string
}): Promise<ParsedWranglerBindingRow[]> {
	const deps = await getDependencies()
	const result = await deps.exec.exec('bunx', [
		'wrangler',
		'versions',
		'view',
		options.versionId,
		'--name',
		options.workerName
	], {
		cwd: options.cwd,
		env: {
			...process.env,
			CLOUDFLARE_ACCOUNT_ID: options.accountId,
			FORCE_COLOR: process.env.FORCE_COLOR ?? '0'
		}
	})

	if (result.exitCode !== 0) {
		throw new Error(result.stderr || result.stdout || 'Wrangler versions view failed')
	}

	return parseWranglerVersionBindings(`${result.stdout}\n${result.stderr}`)
}

export function collectTestingPreviewVerificationErrors(
	snapshot: TestingPreviewVerificationSnapshot
): string[] {
	const errors: string[] = []
	const availableWorkers = new Set(snapshot.availableWorkers)
	const bindingNames = new Set(snapshot.bindingNames)

	if (snapshot.resolvedWorkerName !== snapshot.expectedWorkerName) {
		errors.push(
			`Resolved preview worker name was ${JSON.stringify(snapshot.resolvedWorkerName)} instead of ${JSON.stringify(snapshot.expectedWorkerName)}.`
		)
	}

	if (snapshot.resolvedAppName !== snapshot.expectedAppName) {
		errors.push(
			`Resolved APP_NAME was ${JSON.stringify(snapshot.resolvedAppName)} instead of ${JSON.stringify(snapshot.expectedAppName)}.`
		)
	}

	if (snapshot.resolvedDeploymentChannel !== snapshot.expectedDeploymentChannel) {
		errors.push(
			`Resolved DEPLOYMENT_CHANNEL was ${JSON.stringify(snapshot.resolvedDeploymentChannel)} instead of ${JSON.stringify(snapshot.expectedDeploymentChannel)}.`
		)
	}

	for (const workerName of [
		snapshot.expectedWorkerName,
		snapshot.authServiceName,
		snapshot.searchServiceName
	]) {
		if (!availableWorkers.has(workerName)) {
			errors.push(`Expected deployed preview worker ${JSON.stringify(workerName)} was not found in the Cloudflare account.`)
		}
	}

	if (!snapshot.versionId) {
		errors.push(`Could not resolve an active deployment version for ${JSON.stringify(snapshot.expectedWorkerName)}.`)
	}

	for (const bindingName of REQUIRED_MAIN_BINDINGS) {
		if (!bindingNames.has(bindingName)) {
			errors.push(`Expected binding ${JSON.stringify(bindingName)} was missing from the deployed preview Worker version.`)
		}
	}

	return errors
}

async function loadVerificationSnapshot(
	previewScope: string,
	accountId: string
): Promise<{
	snapshot: TestingPreviewVerificationSnapshot
	bindingRows: ParsedWranglerBindingRow[]
	availableTestingWorkers: string[]
}> {
	const workerNames = resolveTestingWorkerNames(previewScope)
	const config = await withTemporaryPreviewEnvironment(previewScope, async () => {
		return loadResolvedConfig({
			cwd: TESTING_DIR,
			environment: 'preview',
			identifier: previewScope,
			accountId
		})
	})
	const vars = (config.vars ?? {}) as Record<string, unknown>
	const liveWorkers = await account.workers(accountId, CLOUDFLARE_API_OPTIONS)
	const availableWorkers = uniqueSorted(liveWorkers.map((worker) => worker.name))
	const availableWorkerSet = new Set(availableWorkers)
	let versionId: string | undefined
	let bindingRows: ParsedWranglerBindingRow[] = []

	if (availableWorkerSet.has(config.name)) {
		const deployments = await account.workerDeployments(
			accountId,
			config.name,
			CLOUDFLARE_API_OPTIONS
		)
		versionId = resolveActiveVersionId(deployments)

		if (versionId) {
			bindingRows = await inspectWorkerVersionBindings({
				accountId,
				workerName: config.name,
				versionId,
				cwd: TESTING_DIR
			})
		}
	}

	return {
		snapshot: {
			expectedAppName: process.env.TESTING_EXPECTED_APP_NAME?.trim() || DEFAULT_EXPECTED_APP_NAME,
			expectedDeploymentChannel: process.env.TESTING_EXPECTED_DEPLOYMENT_CHANNEL?.trim() || DEFAULT_EXPECTED_DEPLOYMENT_CHANNEL,
			expectedWorkerName: workerNames.mainWorkerName,
			resolvedWorkerName: config.name,
			resolvedAppName: readOptionalString(vars.APP_NAME),
			resolvedDeploymentChannel: readOptionalString(vars.DEPLOYMENT_CHANNEL),
			authServiceName: workerNames.authServiceName,
			searchServiceName: workerNames.searchServiceName,
			availableWorkers,
			versionId,
			bindingNames: uniqueSorted(bindingRows.map((row) => row.bindingName))
		},
		bindingRows,
		availableTestingWorkers: availableWorkers.filter((workerName) => workerName.startsWith('devflare-testing-'))
	}
}

function formatBindingRows(rows: ParsedWranglerBindingRow[]): string {
	if (rows.length === 0) {
		return '(none)'
	}

	return rows
		.map((row) => `${row.type}: ${row.bindingName} -> ${row.resource}`)
		.join('\n')
}

function createDiagnosticsMessage(input: {
	snapshot: TestingPreviewVerificationSnapshot
	bindingRows: ParsedWranglerBindingRow[]
	availableTestingWorkers: string[]
	errors: string[]
}): string {
	const details = [
		'Testing preview verification failed.',
		...input.errors.map((error) => `- ${error}`),
		'',
		`Expected preview worker: ${input.snapshot.expectedWorkerName}`,
		`Resolved preview worker: ${input.snapshot.resolvedWorkerName}`,
		`Resolved APP_NAME: ${JSON.stringify(input.snapshot.resolvedAppName)}`,
		`Resolved DEPLOYMENT_CHANNEL: ${JSON.stringify(input.snapshot.resolvedDeploymentChannel)}`,
		`Auth service worker: ${input.snapshot.authServiceName}`,
		`Search service worker: ${input.snapshot.searchServiceName}`,
		`Active preview version: ${input.snapshot.versionId ?? 'not found'}`,
		`Testing workers in account: ${input.availableTestingWorkers.join(', ') || '(none)'}`,
		`Deployed main-worker binding names: ${input.snapshot.bindingNames.join(', ') || '(none)'}`,
		'Deployed main-worker binding rows:',
		formatBindingRows(input.bindingRows)
	]

	return details.join('\n')
}

async function runVerification(): Promise<void> {
	const previewScope = process.argv[2]?.trim() || process.env.DEVFLARE_PREVIEW_BRANCH?.trim() || process.env.DEVFLARE_PREVIEW_IDENTIFIER?.trim()
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
	const attempts = Number(process.env.TESTING_VERIFICATION_ATTEMPTS ?? '5')
	const delayMs = Number(process.env.TESTING_VERIFICATION_DELAY_MS ?? '3000')

	if (!previewScope) {
		throw new Error('Provide a preview scope argument or set DEVFLARE_PREVIEW_BRANCH / DEVFLARE_PREVIEW_IDENTIFIER.')
	}

	if (!accountId) {
		throw new Error('CLOUDFLARE_ACCOUNT_ID must be set before verifying the testing preview deployment.')
	}

	for (let attempt = 1;attempt <= attempts;attempt += 1) {
		try {
			const { snapshot, bindingRows, availableTestingWorkers } = await loadVerificationSnapshot(previewScope, accountId)
			const errors = collectTestingPreviewVerificationErrors(snapshot)

			if (errors.length > 0) {
				throw new Error(createDiagnosticsMessage({
					snapshot,
					bindingRows,
					availableTestingWorkers,
					errors
				}))
			}

			console.log(`Verified testing preview scope ${JSON.stringify(previewScope)}.`)
			console.log(`Verified main worker ${snapshot.expectedWorkerName} version ${snapshot.versionId}.`)
			console.log(`Verified preview workers: ${snapshot.authServiceName}, ${snapshot.searchServiceName}.`)
			console.log(`Verified bindings: ${REQUIRED_MAIN_BINDINGS.join(', ')}.`)
			return
		} catch (error) {
			if (attempt >= attempts) {
				throw error
			}

			const message = error instanceof Error ? error.message : String(error)
			console.error(`Testing preview verification attempt ${attempt}/${attempts} failed; retrying in ${delayMs}ms...`)
			console.error(message)
			await Bun.sleep(delayMs)
		}
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	runVerification().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error))
		process.exitCode = 1
	})
}