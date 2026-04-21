import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { account, type APIClientOptions, type WorkerDeploymentInfo } from '../../packages/devflare/src/cloudflare'
import { getDependencies } from '../../packages/devflare/src/cli/dependencies'
import {
	parseWranglerVersionBindings,
	type ParsedWranglerBindingRow
} from '../../packages/devflare/src/cli/preview-bindings'
import { loadConfig, resolveConfigForEnvironment, type DevflareConfig } from '../../packages/devflare/src/config'
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
	expectedAuthWorkerName: string
	expectedSearchWorkerName: string
	resolvedWorkerName: string
	resolvedAppName?: string
	resolvedDeploymentChannel?: string
	previewUrl?: string
	previewStatus?: TestingPreviewStatus
	previewStatusError?: string
	previewHealth?: PreviewHealthResult
	previewHealthError?: string
	availableWorkers: string[]
	versionId?: string
	bindingsInspected: boolean
	bindingNames: string[]
}

export interface TestingPreviewStatus {
	appName?: string
	deploymentChannel?: string
	hasDurableObjectBindings?: boolean
	hasServiceBindings?: boolean
	hasVectorizeBindings?: boolean
	hasAnalyticsBindings?: boolean
	hasSendEmailBindings?: boolean
	hasHyperdriveBinding?: boolean
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

export async function loadTestingPreviewConfig(previewScope: string): Promise<DevflareConfig> {
	return withTemporaryPreviewEnvironment(previewScope, async () => {
		const config = await loadConfig({
			cwd: TESTING_DIR
		})

		return resolveConfigForEnvironment(config, 'preview')
	})
}

function uniqueSorted(values: string[]): string[] {
	return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
		.sort((left, right) => left.localeCompare(right))
}

function readOptionalString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function readOptionalBoolean(value: unknown): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined
}

function appendPreviewPath(previewUrl: string, pathSuffix: string): string {
	return `${previewUrl.replace(/\/+$/g, '')}${pathSuffix}`
}

function isCloudflareAccessRedirect(response: Response): boolean {
	if (response.status < 300 || response.status >= 400) {
		return false
	}

	const location = response.headers.get('location')
	if (!location) {
		return false
	}

	try {
		return new URL(location, 'http://placeholder.invalid').host.includes('cloudflareaccess.com')
	} catch {
		return false
	}
}

async function readBodyExcerpt(response: Response): Promise<string> {
	try {
		const text = await response.text()
		return text.length > 500 ? `${text.slice(0, 500)}…` : text
	} catch {
		return ''
	}
}

// When the preview worker sits behind a Cloudflare Access policy, callers
// must present a service-token (CF-Access-Client-Id / CF-Access-Client-Secret).
// Both env vars must be set; partial config is treated as no config.
function cloudflareAccessHeaders(): Record<string, string> {
	const id = process.env.CLOUDFLARE_ACCESS_CLIENT_ID
	const secret = process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET
	if (!id || !secret) {
		return {}
	}
	return {
		'CF-Access-Client-Id': id,
		'CF-Access-Client-Secret': secret
	}
}

export interface PreviewHealthResult {
	ok: boolean
	status: number
	body: string
	redirectedToAccess: boolean
	locationHeader?: string
}

async function loadPreviewHealth(previewUrl: string, _attempt: number): Promise<PreviewHealthResult> {
	const response = await fetch(appendPreviewPath(previewUrl, '/health'), {
		redirect: 'manual',
		cache: 'no-store',
		headers: {
			'cache-control': 'no-store',
			...cloudflareAccessHeaders()
		},
		signal: AbortSignal.timeout(15_000)
	})

	const locationHeader = response.headers.get('location') ?? undefined

	if (isCloudflareAccessRedirect(response)) {
		const body = await readBodyExcerpt(response)
		return {
			ok: false,
			status: response.status,
			body,
			redirectedToAccess: true,
			locationHeader
		}
	}

	const body = await readBodyExcerpt(response)
	return {
		ok: response.ok,
		status: response.status,
		body,
		redirectedToAccess: false,
		locationHeader
	}
}

async function loadPreviewStatus(previewUrl: string): Promise<TestingPreviewStatus> {
	const response = await fetch(appendPreviewPath(previewUrl, '/status'), {
		redirect: 'manual',
		headers: {
			'cache-control': 'no-store',
			...cloudflareAccessHeaders()
		}
	})

	if (isCloudflareAccessRedirect(response)) {
		const locationHeader = response.headers.get('location') ?? '(missing)'
		throw new Error(
			`Cloudflare Access intercepted ${appendPreviewPath(previewUrl, '/status')} (Location: ${locationHeader}). Cannot read /status.`
		)
	}

	if (!response.ok) {
		throw new Error(`Preview status endpoint returned ${response.status} ${response.statusText}.`)
	}

	const payload = await response.json() as Record<string, unknown>

	return {
		appName: readOptionalString(payload.appName),
		deploymentChannel: readOptionalString(payload.deploymentChannel),
		hasDurableObjectBindings: readOptionalBoolean(payload.hasDurableObjectBindings),
		hasServiceBindings: readOptionalBoolean(payload.hasServiceBindings),
		hasVectorizeBindings: readOptionalBoolean(payload.hasVectorizeBindings),
		hasAnalyticsBindings: readOptionalBoolean(payload.hasAnalyticsBindings),
		hasSendEmailBindings: readOptionalBoolean(payload.hasSendEmailBindings),
		hasHyperdriveBinding: readOptionalBoolean(payload.hasHyperdriveBinding)
	}
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
		options.workerName,
		'--json'
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

	return parseWranglerVersionBindings(result.stdout)
}

export function collectTestingPreviewVerificationErrors(
	snapshot: TestingPreviewVerificationSnapshot
): string[] {
	const errors: string[] = []
	const availableWorkers = new Set(snapshot.availableWorkers)
	const bindingNames = new Set(snapshot.bindingNames)
	const hasVerifiedPreviewUrl = typeof snapshot.previewUrl === 'string' && snapshot.previewUrl.trim().length > 0

	if (hasVerifiedPreviewUrl && snapshot.previewHealth) {
		if (snapshot.previewHealth.redirectedToAccess) {
			errors.push(
				`Cloudflare Access intercepted ${snapshot.previewUrl}/health (Location: ${snapshot.previewHealth.locationHeader ?? '(missing)'}). The verifier cannot determine deployment health.`
			)
		} else if (!snapshot.previewHealth.ok) {
			errors.push(
				`Preview /health probe at ${snapshot.previewUrl}/health returned ${snapshot.previewHealth.status}. Body excerpt: ${snapshot.previewHealth.body || '(empty)'}`
			)
		}
	} else if (hasVerifiedPreviewUrl && snapshot.previewHealthError) {
		errors.push(
			`Preview /health probe at ${snapshot.previewUrl}/health failed: ${snapshot.previewHealthError}`
		)
	}

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

	if (!availableWorkers.has(snapshot.expectedWorkerName)) {
		errors.push(`Expected deployed preview worker ${JSON.stringify(snapshot.expectedWorkerName)} was not found in the Cloudflare account.`)
	}

	if (!snapshot.bindingsInspected) {
		for (const sidecarWorkerName of [snapshot.expectedAuthWorkerName, snapshot.expectedSearchWorkerName]) {
			if (!availableWorkers.has(sidecarWorkerName)) {
				errors.push(`Expected preview sidecar worker ${JSON.stringify(sidecarWorkerName)} was not found in the Cloudflare account.`)
			}
		}
	}

	if (!snapshot.versionId && !hasVerifiedPreviewUrl) {
		errors.push(`Could not resolve an active deployment version for ${JSON.stringify(snapshot.expectedWorkerName)}.`)
	}

	if (hasVerifiedPreviewUrl && !snapshot.previewStatus) {
		errors.push(
			snapshot.previewStatusError
				? `Could not load the preview status endpoint from ${JSON.stringify(snapshot.previewUrl)}: ${snapshot.previewStatusError}`
				: `Could not load the preview status endpoint from ${JSON.stringify(snapshot.previewUrl)}.`
		)
	}

	if (snapshot.previewStatus) {
		if (snapshot.previewStatus.appName !== snapshot.expectedAppName) {
			errors.push(
				`Preview status APP_NAME was ${JSON.stringify(snapshot.previewStatus.appName)} instead of ${JSON.stringify(snapshot.expectedAppName)}.`
			)
		}

		if (snapshot.previewStatus.deploymentChannel !== snapshot.expectedDeploymentChannel) {
			errors.push(
				`Preview status DEPLOYMENT_CHANNEL was ${JSON.stringify(snapshot.previewStatus.deploymentChannel)} instead of ${JSON.stringify(snapshot.expectedDeploymentChannel)}.`
			)
		}

		if (snapshot.previewStatus.hasDurableObjectBindings !== true) {
			errors.push('Preview status did not confirm durable object bindings.')
		}

		if (snapshot.previewStatus.hasServiceBindings !== true) {
			errors.push('Preview status did not confirm service bindings.')
		}

		if (snapshot.previewStatus.hasVectorizeBindings !== true) {
			errors.push('Preview status did not confirm vectorize bindings.')
		}

		if (snapshot.previewStatus.hasAnalyticsBindings !== true) {
			errors.push('Preview status did not confirm analytics bindings.')
		}

		if (snapshot.previewStatus.hasSendEmailBindings !== true) {
			errors.push('Preview status did not confirm send-email bindings.')
		}

		if (snapshot.previewStatus.hasHyperdriveBinding !== true) {
			errors.push('Preview status did not confirm the Hyperdrive binding.')
		}
	}

	if (snapshot.bindingsInspected) {
		for (const bindingName of REQUIRED_MAIN_BINDINGS) {
			if (!bindingNames.has(bindingName)) {
				errors.push(`Expected binding ${JSON.stringify(bindingName)} was missing from the deployed preview Worker version.`)
			}
		}
	}

	return errors
}

async function loadVerificationSnapshot(
	previewScope: string,
	accountId: string,
	requestedVersionId?: string
): Promise<{
	snapshot: TestingPreviewVerificationSnapshot
	bindingRows: ParsedWranglerBindingRow[]
	availableTestingWorkers: string[]
}> {
	const workerNames = resolveTestingWorkerNames(previewScope)
	const config = await loadTestingPreviewConfig(previewScope)
	const vars = (config.vars ?? {}) as Record<string, unknown>
	const previewUrl = process.env.TESTING_DEPLOY_PREVIEW_URL?.trim() || undefined
	const liveWorkers = await account.workers(accountId, CLOUDFLARE_API_OPTIONS)
	const availableWorkers = uniqueSorted(liveWorkers.map((worker) => worker.name))
	const availableWorkerSet = new Set(availableWorkers)
	let versionId = requestedVersionId?.trim() || undefined
	let bindingRows: ParsedWranglerBindingRow[] = []
	let previewStatus: TestingPreviewStatus | undefined
	let previewStatusError: string | undefined
	let previewHealth: PreviewHealthResult | undefined
	let previewHealthError: string | undefined

	if (previewUrl) {
		try {
			previewHealth = await loadPreviewHealth(previewUrl, 1)
		} catch (error) {
			previewHealthError = error instanceof Error ? error.message : String(error)
		}

		try {
			previewStatus = await loadPreviewStatus(previewUrl)
		} catch (error) {
			previewStatusError = error instanceof Error ? error.message : String(error)
		}
	}

	if (!versionId && availableWorkerSet.has(config.name)) {
		const deployments = await account.workerDeployments(
			accountId,
			config.name,
			CLOUDFLARE_API_OPTIONS
		)
		versionId = resolveActiveVersionId(deployments)
	}

	if (versionId) {
		bindingRows = await inspectWorkerVersionBindings({
			accountId,
			workerName: config.name,
			versionId,
			cwd: TESTING_DIR
		})
	}

	return {
		snapshot: {
			expectedAppName: process.env.TESTING_EXPECTED_APP_NAME?.trim() || DEFAULT_EXPECTED_APP_NAME,
			expectedDeploymentChannel: process.env.TESTING_EXPECTED_DEPLOYMENT_CHANNEL?.trim() || DEFAULT_EXPECTED_DEPLOYMENT_CHANNEL,
			expectedWorkerName: workerNames.mainWorkerName,
			expectedAuthWorkerName: workerNames.authServiceName,
			expectedSearchWorkerName: workerNames.searchServiceName,
			resolvedWorkerName: config.name,
			resolvedAppName: readOptionalString(vars.APP_NAME),
			resolvedDeploymentChannel: readOptionalString(vars.DEPLOYMENT_CHANNEL),
			previewUrl,
			previewStatus,
			previewStatusError,
			previewHealth,
			previewHealthError,
			availableWorkers,
			versionId,
			bindingsInspected: versionId !== undefined,
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
		`Expected auth worker: ${input.snapshot.expectedAuthWorkerName}`,
		`Expected search worker: ${input.snapshot.expectedSearchWorkerName}`,
		`Resolved preview worker: ${input.snapshot.resolvedWorkerName}`,
		`Resolved APP_NAME: ${JSON.stringify(input.snapshot.resolvedAppName)}`,
		`Resolved DEPLOYMENT_CHANNEL: ${JSON.stringify(input.snapshot.resolvedDeploymentChannel)}`,
		`Deploy preview URL: ${input.snapshot.previewUrl ?? 'not provided'}`,
		`Preview status APP_NAME: ${JSON.stringify(input.snapshot.previewStatus?.appName)}`,
		`Preview status error: ${input.snapshot.previewStatusError ?? 'none'}`,
		`Preview status DEPLOYMENT_CHANNEL: ${JSON.stringify(input.snapshot.previewStatus?.deploymentChannel)}`,
		`Preview status service bindings: ${String(input.snapshot.previewStatus?.hasServiceBindings)}`,
		`Preview status durable objects: ${String(input.snapshot.previewStatus?.hasDurableObjectBindings)}`,
		`Preview status vectorize: ${String(input.snapshot.previewStatus?.hasVectorizeBindings)}`,
		`Preview status analytics: ${String(input.snapshot.previewStatus?.hasAnalyticsBindings)}`,
		`Preview status send email: ${String(input.snapshot.previewStatus?.hasSendEmailBindings)}`,
		`Preview status hyperdrive: ${String(input.snapshot.previewStatus?.hasHyperdriveBinding)}`,
		`Active preview version: ${input.snapshot.versionId ?? 'not found'}`,
		`Binding inspection: ${input.snapshot.bindingsInspected ? 'completed via wrangler versions view' : (input.snapshot.previewUrl ? 'skipped because Cloudflare did not expose preview version metadata after a successful named preview deploy' : 'not available')}`,
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
	const requestedVersionId = process.argv[3]?.trim() || process.env.TESTING_DEPLOY_VERSION_ID?.trim()
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
			const { snapshot, bindingRows, availableTestingWorkers } = await loadVerificationSnapshot(
				previewScope,
				accountId,
				requestedVersionId
			)
			const errors = collectTestingPreviewVerificationErrors(snapshot)

			if (errors.length > 0) {
				throw new Error(createDiagnosticsMessage({
					snapshot,
					bindingRows,
					availableTestingWorkers,
					errors
				}))
			}

			if (!snapshot.bindingsInspected && snapshot.previewUrl) {
				console.warn(
					`Cloudflare did not expose preview version metadata for ${JSON.stringify(snapshot.expectedWorkerName)}; verified the live preview status endpoint plus expected preview workers instead.`
				)
			}

			console.log(`Verified testing preview scope ${JSON.stringify(previewScope)}.`)
			console.log(`Verified main worker ${snapshot.expectedWorkerName} version ${snapshot.versionId ?? 'not exposed by Cloudflare'}.`)
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