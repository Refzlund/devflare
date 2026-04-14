type PreviewAliasSource =
	| 'branch-name'
	| 'github-head-ref'
	| 'github-ref-name'
	| 'workers-ci-branch'
	| 'git'

export interface ResolvedPreviewAlias {
	alias: string
	source: PreviewAliasSource
	rawValue: string
}

export interface ResolvePreviewAliasOptions {
	branchName?: string
	workerName?: string
	env?: NodeJS.ProcessEnv
	getGitBranch?: () => Promise<string | null>
}

export interface ParsedWranglerDeployOutput {
	versionId?: string
	previewUrl?: string
	previewAliasUrl?: string
	urls: string[]
}

interface WranglerStructuredOutputRecord {
	type?: string
	version_id?: unknown
	targets?: unknown
	preview_url?: unknown
	preview_urls?: unknown
	preview_alias_url?: unknown
	preview_alias_urls?: unknown
	url?: unknown
	urls?: unknown
}

const PREVIEW_ALIAS_MAX_LENGTH = 63

function normalizeWorkersSubdomain(accountSubdomain: string): string {
	return accountSubdomain
		.trim()
		.replace(/^https?:\/\//i, '')
		.replace(/\.workers\.dev\/?$/i, '')
}

function normalizeAlias(rawAlias: string): string {
	return rawAlias
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '')
}

function clampAliasForWorker(alias: string, workerName?: string): string {
	if (workerName) {
		const availableAliasLength = PREVIEW_ALIAS_MAX_LENGTH - workerName.length - 1
		if (availableAliasLength < 1) {
			throw new Error(
				`Worker name "${workerName}" is too long for preview aliases. Rename the Worker or pass a shorter worker name before using preview deploys.`
			)
		}
	}

	const maxAliasLength = workerName
		? PREVIEW_ALIAS_MAX_LENGTH - workerName.length - 1
		: PREVIEW_ALIAS_MAX_LENGTH

	return alias.slice(0, maxAliasLength).replace(/-+$/g, '')
}

export function sanitizePreviewAlias(rawAlias: string, workerName?: string): string {
	let alias = normalizeAlias(rawAlias)

	if (!alias) {
		alias = 'preview'
	}

	if (!/^[a-z]/.test(alias)) {
		alias = `b-${alias}`
	}

	alias = clampAliasForWorker(alias, workerName)

	if (!alias) {
		alias = 'preview'
	}

	if (!/^[a-z]/.test(alias)) {
		alias = `b-${alias}`
		alias = clampAliasForWorker(alias, workerName)
	}

	return alias || 'preview'
}

export async function resolvePreviewAlias(
	options: ResolvePreviewAliasOptions
): Promise<ResolvedPreviewAlias> {
	const env = options.env ?? process.env
	const candidates: Array<{ value?: string; source: PreviewAliasSource }> = [
		{ value: options.branchName, source: 'branch-name' },
		{ value: env.GITHUB_HEAD_REF, source: 'github-head-ref' },
		{ value: env.GITHUB_REF_NAME, source: 'github-ref-name' },
		{ value: env.WORKERS_CI_BRANCH, source: 'workers-ci-branch' }
	]

	for (const candidate of candidates) {
		if (!candidate.value?.trim()) {
			continue
		}

		return {
			alias: sanitizePreviewAlias(candidate.value, options.workerName),
			source: candidate.source,
			rawValue: candidate.value
		}
	}

	const gitBranch = await options.getGitBranch?.()
	if (gitBranch?.trim() && gitBranch !== 'HEAD') {
		return {
			alias: sanitizePreviewAlias(gitBranch, options.workerName),
			source: 'git',
			rawValue: gitBranch
		}
	}

	throw new Error(
		'Preview deploys need a stable alias source. Pass --branch-name <branch>, or run from CI/git with branch metadata available.'
	)
}

export function formatPreviewAliasUrl(
	alias: string,
	workerName: string,
	accountSubdomain: string
): string {
	const normalizedSubdomain = normalizeWorkersSubdomain(accountSubdomain)

	return `https://${alias}-${workerName}.${normalizedSubdomain}.workers.dev`
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
	let previewAliasUrl: string | undefined

	for (const record of records) {
		if (!versionId && typeof record.version_id === 'string' && record.version_id.trim()) {
			versionId = record.version_id.trim()
		}

		appendUniqueUrls(urls, record.targets)
		appendUniqueUrls(urls, record.preview_urls)
		appendUniqueUrls(urls, record.preview_alias_urls)
		appendUniqueUrls(urls, record.urls)
		appendUniqueUrls(urls, record.url)

		if (!previewUrl && typeof record.preview_url === 'string' && record.preview_url.trim()) {
			previewUrl = record.preview_url.trim()
		}

		if (!previewAliasUrl && typeof record.preview_alias_url === 'string' && record.preview_alias_url.trim()) {
			previewAliasUrl = record.preview_alias_url.trim()
		}
	}

	const uniqueUrls = [...new Set(urls)]

	if (!previewUrl) {
		previewUrl = uniqueUrls.find((url) => url.includes('workers.dev'))
	}

	return {
		versionId,
		previewUrl,
		previewAliasUrl,
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
		previewAliasUrl: outputs.map((output) => output.previewAliasUrl).find((value) => Boolean(value)),
		urls
	}
}

export function parseWranglerDeployOutput(output: string): ParsedWranglerDeployOutput {
	const normalizedOutput = output.replace(/\r/g, '')
	const urls = [...new Set(normalizedOutput.match(/https?:\/\/[^\s'"`]+/g) ?? [])]

	const previewAliasUrl = matchNamedValue(normalizedOutput, [
		/Preview Alias URL:\s*(https?:\/\/\S+)/i,
		/Alias URL:\s*(https?:\/\/\S+)/i
	])

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
		previewAliasUrl,
		urls
	}
}