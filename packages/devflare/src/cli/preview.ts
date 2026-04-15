export interface ParsedWranglerDeployOutput {
	versionId?: string
	previewUrl?: string
	urls: string[]
}

interface WranglerStructuredOutputRecord {
	type?: string
	version_id?: unknown
	targets?: unknown
	preview_url?: unknown
	preview_urls?: unknown
	url?: unknown
	urls?: unknown
}

function normalizeWorkersSubdomain(accountSubdomain: string): string {
	return accountSubdomain
		.trim()
		.replace(/^https?:\/\//i, '')
		.replace(/\.workers\.dev\/?$/i, '')
}

export function formatWorkersDevUrl(
	workerName: string,
	accountSubdomain: string
): string {
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

function matchNamedValue(output: string, patterns: RegExp[]): string | undefined {
	for (const pattern of patterns) {
		const match = output.match(pattern)
		if (match?.[1]) {
			return match[1]
		}
	}

	return undefined
}

function appendUniqueUrls(target: string[], value: unknown): void {
	if (typeof value === 'string') {
		if (value.startsWith('http://') || value.startsWith('https://')) {
			target.push(value)
		}
		return
	}

	if (!Array.isArray(value)) {
		return
	}

	for (const item of value) {
		appendUniqueUrls(target, item)
	}
}

export function parseWranglerStructuredOutput(output: string): ParsedWranglerDeployOutput {
	const records = output
		.replace(/\r/g, '')
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			try {
				return JSON.parse(line) as WranglerStructuredOutputRecord
			} catch {
				return null
			}
		})
		.filter((record): record is WranglerStructuredOutputRecord => record !== null)

	const urls: string[] = []
	let versionId: string | undefined
	let previewUrl: string | undefined

	for (const record of records) {
		if (!versionId && typeof record.version_id === 'string' && record.version_id.trim()) {
			versionId = record.version_id.trim()
		}

		appendUniqueUrls(urls, record.targets)
		appendUniqueUrls(urls, record.preview_urls)
		appendUniqueUrls(urls, record.urls)
		appendUniqueUrls(urls, record.url)

		if (!previewUrl && typeof record.preview_url === 'string' && record.preview_url.trim()) {
			previewUrl = record.preview_url.trim()
		}
	}

	const uniqueUrls = [...new Set(urls)]

	if (!previewUrl) {
		previewUrl = uniqueUrls.find((url) => url.includes('workers.dev'))
	}

	return {
		versionId,
		previewUrl,
		urls: uniqueUrls
	}
}

export function mergeParsedWranglerDeployOutputs(
	...outputs: ParsedWranglerDeployOutput[]
): ParsedWranglerDeployOutput {
	const urls = [...new Set(outputs.flatMap((output) => output.urls))]

	return {
		versionId: outputs.map((output) => output.versionId).find((value) => Boolean(value)),
		previewUrl: outputs.map((output) => output.previewUrl).find((value) => Boolean(value)) ?? urls.find((url) => url.includes('workers.dev')),
		urls
	}
}

export function parseWranglerDeployOutput(output: string): ParsedWranglerDeployOutput {
	const normalizedOutput = output.replace(/\r/g, '')
	const urls = [...new Set(normalizedOutput.match(/https?:\/\/[^\s'"`]+/g) ?? [])]

	const previewUrl = matchNamedValue(normalizedOutput, [
		/Preview URL:\s*(https?:\/\/\S+)/i,
		/Version Preview URL:\s*(https?:\/\/\S+)/i
	]) ?? urls.find((url) => url.includes('workers.dev'))

	const versionId = matchNamedValue(normalizedOutput, [
		/Worker Version ID:\s*([A-Za-z0-9_-]+)/i,
		/Version ID:\s*([A-Za-z0-9_-]+)/i,
		/version(?:_id| id)?\s*[:=]\s*([A-Za-z0-9_-]+)/i,
		/"id"\s*:\s*"([A-Za-z0-9_-]+)"/i
	])

	return {
		versionId,
		previewUrl,
		urls
	}
}