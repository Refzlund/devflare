function normalizeWorkersSubdomain(accountSubdomain: string): string {
	return accountSubdomain
		.trim()
		.replace(/^https?:\/\//i, '')
		.replace(/\.workers\.dev\/?$/i, '')
}

export function formatWorkersDevUrl(workerName: string, accountSubdomain: string): string {
	const normalizedSubdomain = normalizeWorkersSubdomain(accountSubdomain)

	return `https://${workerName}.${normalizedSubdomain}.workers.dev`
}

export function formatVersionPreviewUrl(
	versionId: string,
	workerName: string,
	accountSubdomain: string
): string {
	const normalizedSubdomain = normalizeWorkersSubdomain(accountSubdomain)

	const versionPrefix = versionId.split('-')[0] || versionId

	return `https://${versionPrefix}-${workerName}.${normalizedSubdomain}.workers.dev`
}
