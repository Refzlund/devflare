import { resolvePackageSpecifier } from '../../../utils/resolve-package'
import { getDependencies } from '../../dependencies'

export async function getCurrentGitBranch(cwd: string): Promise<string | null> {
	const deps = await getDependencies()
	const gitResult = await deps.exec.exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd })
	if (gitResult.exitCode !== 0) {
		return null
	}

	const branchName = gitResult.stdout.trim()
	if (!branchName || branchName === 'HEAD') {
		return null
	}

	return branchName
}

export async function resolveLocalWranglerExecutable(
	cwd: string,
	fs: Awaited<ReturnType<typeof getDependencies>>['fs']
): Promise<string | null> {
	const wranglerExecutablePath = resolvePackageSpecifier('wrangler/bin/wrangler.js', cwd)

	try {
		await fs.access(wranglerExecutablePath)
		return wranglerExecutablePath
	} catch {
		return null
	}
}
