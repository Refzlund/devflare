export const DOCUMENTATION_WORKER_NAME = 'devflare-docs'

const CLOUDFLARE_WORKER_NAME_MAX_LENGTH = 63

function sanitizePreviewScope(rawValue: string): string {
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

function clampPreviewScope(baseName: string, previewScope: string): string {
	const maxPreviewScopeLength = CLOUDFLARE_WORKER_NAME_MAX_LENGTH - baseName.length - 1

	if (maxPreviewScopeLength < 1) {
		throw new Error(`Worker name "${baseName}" leaves no room for a preview scope suffix.`)
	}

	const clamped = previewScope.slice(0, maxPreviewScopeLength).replace(/-+$/g, '')
	return clamped || 'preview'
}

function resolveDefaultPreviewScope(): string | undefined {
	const previewIdentifier = process.env.DEVFLARE_PREVIEW_IDENTIFIER?.trim()
	if (previewIdentifier) {
		return previewIdentifier
	}

	const previewPr = process.env.DEVFLARE_PREVIEW_PR?.trim()
	if (previewPr) {
		return `pr-${previewPr}`
	}

	const previewBranch = process.env.DEVFLARE_PREVIEW_BRANCH?.trim()
	if (previewBranch) {
		return previewBranch
	}

	return undefined
}

export function resolveDocumentationWorkerName(previewScope = resolveDefaultPreviewScope()): string {
	const resolvedPreviewScope = previewScope?.trim()
	if (!resolvedPreviewScope) {
		return DOCUMENTATION_WORKER_NAME
	}

	const sanitizedPreviewScope = clampPreviewScope(
		DOCUMENTATION_WORKER_NAME,
		sanitizePreviewScope(resolvedPreviewScope)
	)

	return `${DOCUMENTATION_WORKER_NAME}-${sanitizedPreviewScope}`
}
