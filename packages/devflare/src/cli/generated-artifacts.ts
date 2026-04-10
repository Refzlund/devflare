import { resolve } from 'pathe'

const DEVFLARE_DIR = ['.devflare'] as const
const DEVFLARE_BUILD_DIR = ['.devflare', 'build'] as const
const WRANGLER_DEPLOY_DIR = ['.wrangler', 'deploy'] as const

export interface GeneratedArtifactPaths {
	devflareDir: string
	devWranglerConfigPath: string
	buildDir: string
	buildWorkerPath: string
	buildWranglerConfigPath: string
	deployDir: string
	deployRedirectPath: string
}

export function getGeneratedArtifactPaths(cwd: string): GeneratedArtifactPaths {
	const devflareDir = resolve(cwd, ...DEVFLARE_DIR)
	const buildDir = resolve(cwd, ...DEVFLARE_BUILD_DIR)
	const deployDir = resolve(cwd, ...WRANGLER_DEPLOY_DIR)

	return {
		devflareDir,
		devWranglerConfigPath: resolve(devflareDir, 'wrangler.jsonc'),
		buildDir,
		buildWorkerPath: resolve(buildDir, 'worker.js'),
		buildWranglerConfigPath: resolve(buildDir, 'wrangler.jsonc'),
		deployDir,
		deployRedirectPath: resolve(deployDir, 'config.json')
	}
}

export async function ensureGeneratedDirectory(
	dirPath: string,
	writeGitignore: boolean = false
): Promise<void> {
	const fs = await import('node:fs/promises')
	await fs.mkdir(dirPath, { recursive: true })

	if (!writeGitignore) {
		return
	}

	const gitignorePath = resolve(dirPath, '.gitignore')
	try {
		await fs.access(gitignorePath)
	} catch {
		await fs.writeFile(gitignorePath, '*\n', 'utf-8')
	}
}