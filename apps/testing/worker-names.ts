const CLOUDFLARE_WORKER_NAME_MAX_LENGTH = 63

function sanitizeBranchFragment(rawValue: string): string {
	let sanitized = rawValue
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '')

	if (!sanitized) {
		sanitized = 'preview'
	}

	if (!/^[a-z]/.test(sanitized)) {
		sanitized = `b-${sanitized}`
	}

	return sanitized
}

function clampBranchFragment(baseName: string, branchFragment: string, reservedSuffix: string): string {
	const maxBranchLength = CLOUDFLARE_WORKER_NAME_MAX_LENGTH - baseName.length - reservedSuffix.length - 1

	if (maxBranchLength < 1) {
		throw new Error(`Worker name "${baseName}" leaves no room for a branch-scoped preview suffix.`)
	}

	const clamped = branchFragment.slice(0, maxBranchLength).replace(/-+$/g, '')
	return clamped || 'preview'
}

function buildTestingWorkerName(baseName: string, branchName?: string, reservedSuffix = ''): string {
	if (!branchName?.trim()) {
		return baseName
	}

	const branchFragment = clampBranchFragment(
		baseName,
		sanitizeBranchFragment(branchName),
		reservedSuffix
	)

	return `${baseName}-${branchFragment}`
}

export function resolveTestingWorkerNames(branchName = process.env.DEVFLARE_PREVIEW_BRANCH) {
	return {
		authServiceName: buildTestingWorkerName('devflare-testing-auth-service', branchName),
		searchServiceName: buildTestingWorkerName('devflare-testing-search-service', branchName, '-staging'),
		mainWorkerName: buildTestingWorkerName('devflare-testing-binding-matrix', branchName, '-preview')
	}
}