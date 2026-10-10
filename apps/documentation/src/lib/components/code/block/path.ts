export function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
}

export function basename(path: string): string {
	const normalizedPath = normalizePath(path)
	const segments = normalizedPath.split('/').filter(Boolean)
	return segments.at(-1) ?? normalizedPath
}

export function toKebabCase(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
		.toLowerCase()
}
