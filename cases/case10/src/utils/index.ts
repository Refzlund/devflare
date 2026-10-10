// =============================================================================
// Case 10: Path Aliases - Utils
// =============================================================================

export function generateId(): string {
	return crypto.randomUUID()
}

export function timestamp(): number {
	return Date.now()
}

export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^a-z0-9-]/g, '')
}
