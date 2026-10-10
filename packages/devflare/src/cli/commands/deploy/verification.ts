import type { ConsolaInstance } from 'consola'
import {
	getPrimaryAccount,
	getWorkerVersionDetail,
	listWorkerDeployments,
	listWorkerVersions
} from '../../../cloudflare/account'
import { getEffectiveAccountId } from '../../../cloudflare/preferences'
import { type createCliTheme, dim, logLine } from '../../ui'

export function shouldVerifyDeployControlPlane(): boolean {
	const configured = process.env.DEVFLARE_VERIFY_DEPLOYMENT?.trim().toLowerCase()
	if (!configured) {
		return false
	}

	return !['0', 'false', 'no', 'off'].includes(configured)
}

export function shouldRequireFreshProductionDeployment(): boolean {
	const configured = process.env.DEVFLARE_REQUIRE_FRESH_PRODUCTION_DEPLOYMENT?.trim().toLowerCase()
	if (!configured) {
		return false
	}

	return !['0', 'false', 'no', 'off'].includes(configured)
}

function getDeployVerificationSettings(): { attempts: number; delayMs: number } {
	const attempts = Number.parseInt(process.env.DEVFLARE_VERIFY_DEPLOYMENT_ATTEMPTS ?? '', 10)
	const delayMs = Number.parseInt(process.env.DEVFLARE_VERIFY_DEPLOYMENT_DELAY_MS ?? '', 10)

	return {
		attempts: Number.isFinite(attempts) && attempts > 0 ? attempts : 5,
		delayMs: Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 1500
	}
}

const DEPLOYMENT_LOOKBACK_TOLERANCE_MS = 2 * 60 * 1000

export function normalizeCloudflareAccountId(value: string | undefined): string | undefined {
	const trimmed = value?.trim()
	if (!trimmed) {
		return undefined
	}

	return /^[a-f0-9]{32}$/i.test(trimmed) ? trimmed : undefined
}

async function waitForDeployVerification(delayMs: number): Promise<void> {
	if (delayMs <= 0) {
		return
	}

	await new Promise((resolve) => setTimeout(resolve, delayMs))
}

async function retryDeployVerification<T>(
	description: string,
	operation: () => Promise<T>
): Promise<T> {
	const { attempts, delayMs } = getDeployVerificationSettings()
	let lastError: unknown

	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await operation()
		} catch (error) {
			lastError = error
			if (attempt < attempts) {
				await waitForDeployVerification(delayMs)
			}
		}
	}

	const message = lastError instanceof Error ? lastError.message : String(lastError)
	throw new Error(
		`Cloudflare could not verify ${description} after ${attempts} attempt${attempts === 1 ? '' : 's'}: ${message}`
	)
}

export async function resolveDeployAccountId(
	preferredAccountId: string | undefined
): Promise<string | undefined> {
	if (preferredAccountId !== undefined) {
		return normalizeCloudflareAccountId(preferredAccountId)
	}

	const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim()
	const apiKey = process.env.CLOUDFLARE_API_KEY?.trim()
	const apiEmail = process.env.CLOUDFLARE_EMAIL?.trim()
	if (!apiToken && !(apiKey && apiEmail)) {
		return undefined
	}

	try {
		const primaryAccount = await getPrimaryAccount()
		if (!primaryAccount) {
			return undefined
		}

		const effective = await getEffectiveAccountId(primaryAccount.id)
		return normalizeCloudflareAccountId(effective.accountId)
	} catch {
		return undefined
	}
}

function selectDeploymentVersionId(deployment: {
	versions: Array<{
		percentage: number
		versionId: string
	}>
}): string | undefined {
	return (
		deployment.versions.find((version) => version.percentage === 100)?.versionId ??
		deployment.versions[0]?.versionId
	)
}

function getWorkerVersionTimestamp(version: {
	metadata: {
		createdOn?: Date
		modifiedOn?: Date
	}
}): Date | undefined {
	return version.metadata.modifiedOn ?? version.metadata.createdOn
}

async function resolveVersionIdFromLatestDeployment(options: {
	accountId: string
	workerName: string
	verificationDescription: string
	deploymentLabel: 'Latest deployment' | 'Current deployment'
	deployedAfter?: Date
}): Promise<{
	deploymentId: string
	versionId: string
}> {
	return retryDeployVerification(options.verificationDescription, async () => {
		const deployments = await listWorkerDeployments(options.accountId, options.workerName)
		const latestDeployment = [...deployments].sort(
			(a, b) => b.createdOn.getTime() - a.createdOn.getTime()
		)[0]

		if (!latestDeployment) {
			throw new Error(`No deployments were found for Worker "${options.workerName}".`)
		}

		if (
			options.deployedAfter &&
			latestDeployment.createdOn.getTime() <
				options.deployedAfter.getTime() - DEPLOYMENT_LOOKBACK_TOLERANCE_MS
		) {
			throw new Error(
				`${options.deploymentLabel} ${latestDeployment.id} was created before this deploy started.`
			)
		}

		const versionId = selectDeploymentVersionId(latestDeployment)
		if (!versionId) {
			throw new Error(
				`${options.deploymentLabel} ${latestDeployment.id} does not reference any version ids.`
			)
		}

		return {
			deploymentId: latestDeployment.id,
			versionId
		}
	})
}

export async function resolveVersionIdFromLatestWorkerVersion(options: {
	accountId: string
	workerName: string
	preview: boolean
	deployedAfter: Date
}): Promise<string> {
	return retryDeployVerification(
		`the latest ${options.preview ? 'preview ' : ''}version for Worker "${options.workerName}"`,
		async () => {
			const versions = await listWorkerVersions(options.accountId, options.workerName)
			const latestVersion = [...versions]
				.filter((version) => version.id)
				.filter((version) => version.metadata.hasPreview === options.preview)
				.sort((a, b) => {
					const left = getWorkerVersionTimestamp(a)?.getTime() ?? 0
					const right = getWorkerVersionTimestamp(b)?.getTime() ?? 0
					return right - left
				})[0]

			if (!latestVersion) {
				throw new Error(
					`No ${options.preview ? 'preview ' : ''}versions were found for Worker "${options.workerName}".`
				)
			}

			const latestVersionTimestamp = getWorkerVersionTimestamp(latestVersion)
			if (!latestVersionTimestamp) {
				throw new Error(`Latest version ${latestVersion.id} did not include a creation timestamp.`)
			}

			if (
				latestVersionTimestamp.getTime() <
				options.deployedAfter.getTime() - DEPLOYMENT_LOOKBACK_TOLERANCE_MS
			) {
				throw new Error(
					`Latest version ${latestVersion.id} was created before this deploy started.`
				)
			}

			return latestVersion.id
		}
	)
}

export async function resolveVersionIdFromLatestProductionDeployment(options: {
	accountId: string
	workerName: string
	deployedAfter: Date
}): Promise<{
	deploymentId: string
	versionId: string
}> {
	return resolveVersionIdFromLatestDeployment({
		accountId: options.accountId,
		workerName: options.workerName,
		verificationDescription: `the latest deployment for Worker "${options.workerName}"`,
		deploymentLabel: 'Latest deployment',
		deployedAfter: options.deployedAfter
	})
}

export async function resolveVersionIdFromCurrentProductionDeployment(options: {
	accountId: string
	workerName: string
}): Promise<{
	deploymentId: string
	versionId: string
}> {
	return resolveVersionIdFromLatestDeployment({
		accountId: options.accountId,
		workerName: options.workerName,
		verificationDescription: `the current active deployment for Worker "${options.workerName}"`,
		deploymentLabel: 'Current deployment'
	})
}

export async function verifyDeployControlPlane(options: {
	accountId: string
	workerName: string
	versionId: string
	preview: boolean
	logger: ConsolaInstance
	theme: ReturnType<typeof createCliTheme>
}): Promise<void> {
	logLine(options.logger, dim('Verifying Cloudflare control-plane state…', options.theme))

	await retryDeployVerification(`Worker version ${options.versionId}`, async () => {
		const version = await getWorkerVersionDetail(
			options.accountId,
			options.workerName,
			options.versionId
		)

		if (!version.id) {
			throw new Error(`Cloudflare returned an empty version record for ${options.versionId}.`)
		}

		return version
	})

	if (options.preview) {
		options.logger.success(
			`Verified preview upload in Cloudflare control plane for version ${options.versionId}`
		)
		return
	}

	const deployment = await retryDeployVerification(
		`a deployment that references version ${options.versionId}`,
		async () => {
			const deployments = await listWorkerDeployments(options.accountId, options.workerName)
			const match = deployments.find((item) =>
				item.versions.some((version) => version.versionId === options.versionId)
			)

			if (!match) {
				throw new Error(
					`No deployment for Worker "${options.workerName}" references version ${options.versionId} yet.`
				)
			}

			return match
		}
	)

	options.logger.success(
		`Verified Cloudflare deployment ${deployment.id} for version ${options.versionId}`
	)
}
