import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'pathe'
import { fileURLToPath } from 'node:url'

export interface LocalWorkspaceBuildStatus {
	state: 'not-applicable' | 'fresh' | 'missing-dist' | 'stale'
	packageRoot?: string
	sourceNewestAt?: Date
	distNewestAt?: Date
}

function isTruthyEnvFlag(value: string | undefined): boolean {
	const normalized = value?.trim().toLowerCase()
	return normalized !== undefined && ['1', 'true', 'yes', 'on'].includes(normalized)
}

function isCiEnvironment(env: NodeJS.ProcessEnv): boolean {
	return isTruthyEnvFlag(env.CI) || isTruthyEnvFlag(env.GITHUB_ACTIONS)
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path)
		return true
	} catch {
		return false
	}
}

async function readPackageName(packageRoot: string): Promise<string | undefined> {
	try {
		const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as {
			name?: unknown
		}

		return typeof packageJson.name === 'string' ? packageJson.name : undefined
	} catch {
		return undefined
	}
}

async function findLocalDevflarePackageRoot(startDirectory: string): Promise<string | undefined> {
	let currentDirectory = startDirectory

	while (true) {
		if (await pathExists(join(currentDirectory, 'package.json'))) {
			const packageName = await readPackageName(currentDirectory)
			if (packageName === 'devflare') {
				return currentDirectory
			}
		}

		const parentDirectory = dirname(currentDirectory)
		if (parentDirectory === currentDirectory) {
			return undefined
		}

		currentDirectory = parentDirectory
	}
}

async function getLatestModifiedTime(path: string): Promise<number | undefined> {
	if (!await pathExists(path)) {
		return undefined
	}

	const entry = await stat(path)
	if (entry.isFile()) {
		return entry.mtimeMs
	}

	if (!entry.isDirectory()) {
		return undefined
	}

	let newestModifiedTime = 0
	const children = await readdir(path, { withFileTypes: true })

	for (const child of children) {
		if (child.name === 'node_modules' || child.name === '.turbo') {
			continue
		}

		const childModifiedTime = await getLatestModifiedTime(join(path, child.name))
		if (typeof childModifiedTime === 'number' && childModifiedTime > newestModifiedTime) {
			newestModifiedTime = childModifiedTime
		}
	}

	return newestModifiedTime > 0 ? newestModifiedTime : entry.mtimeMs
}

export async function getLocalWorkspaceBuildStatus(options: {
	packageRoot?: string
} = {}): Promise<LocalWorkspaceBuildStatus> {
	const packageRoot = options.packageRoot
		?? await findLocalDevflarePackageRoot(dirname(fileURLToPath(import.meta.url)))

	if (!packageRoot) {
		return {
			state: 'not-applicable'
		}
	}

	const sourceDirectory = join(packageRoot, 'src')
	if (!await pathExists(sourceDirectory)) {
		return {
			state: 'not-applicable',
			packageRoot
		}
	}

	const distDirectory = join(packageRoot, 'dist')
	if (!await pathExists(distDirectory)) {
		const sourceNewestAt = await getLatestModifiedTime(sourceDirectory)
		return {
			state: 'missing-dist',
			packageRoot,
			...(typeof sourceNewestAt === 'number'
				? { sourceNewestAt: new Date(sourceNewestAt) }
				: {})
		}
	}

	const [sourceNewestAt, distNewestAt] = await Promise.all([
		getLatestModifiedTime(sourceDirectory),
		getLatestModifiedTime(distDirectory)
	])

	if (typeof sourceNewestAt !== 'number' || typeof distNewestAt !== 'number') {
		return {
			state: 'not-applicable',
			packageRoot
		}
	}

	return {
		state: sourceNewestAt > distNewestAt ? 'stale' : 'fresh',
		packageRoot,
		sourceNewestAt: new Date(sourceNewestAt),
		distNewestAt: new Date(distNewestAt)
	}
}

export async function getLocalWorkspaceBuildGuardMessage(
	command: string,
	options: {
		packageRoot?: string
		env?: NodeJS.ProcessEnv
	} = {}
): Promise<string | undefined> {
	if (!['build', 'deploy', 'types'].includes(command)) {
		return undefined
	}

	const env = options.env ?? process.env
	if (isTruthyEnvFlag(env.DEVFLARE_SKIP_WORKSPACE_BUILD_GUARD)) {
		return undefined
	}

	if (isCiEnvironment(env)) {
		return undefined
	}

	const status = await getLocalWorkspaceBuildStatus({
		packageRoot: options.packageRoot
	})
	if (status.state === 'fresh' || status.state === 'not-applicable') {
		return undefined
	}

	const timestampSummary = status.sourceNewestAt
		? ` Latest source change: ${status.sourceNewestAt.toISOString()}.`
		: ''
	const distTimestampSummary = status.distNewestAt
		? ` Latest dist build: ${status.distNewestAt.toISOString()}.`
		: ''

	if (status.state === 'missing-dist') {
		return `Local Devflare workspace exports are missing. Running \`devflare ${command}\` from this repository can mix the live CLI source with missing runtime exports. Run \`bun run --cwd packages/devflare build\` first, or set DEVFLARE_SKIP_WORKSPACE_BUILD_GUARD=true to bypass this guard.${timestampSummary}`
	}

	return `Local Devflare workspace exports are stale. Running \`devflare ${command}\` from this repository can mix newer CLI source with older \`devflare/runtime\` exports.${timestampSummary}${distTimestampSummary} Run \`bun run --cwd packages/devflare build\` first, or set DEVFLARE_SKIP_WORKSPACE_BUILD_GUARD=true to bypass this guard.`
}