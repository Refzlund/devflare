import { basename, normalizePath } from './path'

const languageAliases: Record<string, string> = {
	bash: 'bash',
	html: 'markup',
	json: 'json',
	jsonc: 'json',
	md: 'markdown',
	markdown: 'markdown',
	plain: 'plain',
	sh: 'bash',
	shell: 'bash',
	svelte: 'markup',
	ts: 'typescript',
	txt: 'plain',
	yaml: 'yaml',
	yml: 'yaml'
}

const extensionLanguages: Record<string, string> = {
	bash: 'bash',
	html: 'markup',
	json: 'json',
	jsonc: 'json',
	md: 'markdown',
	sh: 'bash',
	svelte: 'markup',
	ts: 'typescript',
	yaml: 'yaml',
	yml: 'yaml'
}

const fileIconClassNames = {
	astro: 'material-icon-theme--astro',
	console: 'material-icon-theme--console',
	css: 'material-icon-theme--css',
	docker: 'material-icon-theme--docker',
	document: 'material-icon-theme--document',
	git: 'material-icon-theme--git',
	html: 'material-icon-theme--html',
	javascript: 'material-icon-theme--javascript',
	json: 'material-icon-theme--json',
	lock: 'material-icon-theme--lock',
	markdown: 'material-icon-theme--markdown',
	mdx: 'material-icon-theme--mdx',
	nodejs: 'material-icon-theme--nodejs',
	npm: 'material-icon-theme--npm',
	react: 'material-icon-theme--react',
	reactTs: 'material-icon-theme--react-ts',
	settings: 'material-icon-theme--settings',
	svelte: 'material-icon-theme--svelte',
	tailwindcss: 'material-icon-theme--tailwindcss',
	toml: 'material-icon-theme--toml',
	typescript: 'material-icon-theme--typescript',
	typescriptDef: 'material-icon-theme--typescript-def',
	vite: 'material-icon-theme--vite',
	wrangler: 'material-icon-theme--wrangler',
	xml: 'material-icon-theme--xml',
	yaml: 'material-icon-theme--yaml',
	svg: 'material-icon-theme--svg'
} as const

export function resolveLanguage(
	language: string | undefined,
	displayPath: string | undefined
): string {
	const normalizedLanguage = language?.trim().toLowerCase()
	if (normalizedLanguage && languageAliases[normalizedLanguage]) {
		return languageAliases[normalizedLanguage]
	}

	if (displayPath) {
		const extension = displayPath.split('.').pop()?.toLowerCase()
		if (extension && extensionLanguages[extension]) {
			return extensionLanguages[extension]
		}
	}

	return normalizedLanguage ?? 'plain'
}

export function resolveLanguageLabel(
	language: string | undefined,
	displayPath: string | undefined,
	resolvedLanguage: string
): string {
	if (language?.trim()) {
		return language.trim().toLowerCase()
	}

	if (displayPath) {
		const extension = displayPath.split('.').pop()?.toLowerCase()
		if (extension) {
			return extension
		}
	}

	return resolvedLanguage
}

export function resolveMetaIconClass(pathLike: string | undefined, languageLabel: string): string {
	if (pathLike) {
		const fileIconClass = resolveFileIconClass(pathLike)
		if (fileIconClass !== fileIconClassNames.document) {
			return fileIconClass
		}
	}

	return resolveLanguageIconClass(languageLabel)
}

export function resolveLanguageIconClass(languageLabel: string): string {
	switch (languageLabel.trim().toLowerCase()) {
		case 'astro':
			return fileIconClassNames.astro
		case 'bash':
		case 'console':
		case 'powershell':
		case 'ps1':
		case 'shell':
		case 'sh':
		case 'zsh':
			return fileIconClassNames.console
		case 'css':
		case 'less':
		case 'pcss':
		case 'postcss':
		case 'sass':
		case 'scss':
			return fileIconClassNames.css
		case 'html':
		case 'markup':
			return fileIconClassNames.html
		case 'javascript':
		case 'js':
			return fileIconClassNames.javascript
		case 'json':
		case 'jsonc':
			return fileIconClassNames.json
		case 'markdown':
		case 'md':
			return fileIconClassNames.markdown
		case 'mdsvex':
		case 'mdx':
			return fileIconClassNames.mdx
		case 'react':
		case 'jsx':
			return fileIconClassNames.react
		case 'react-ts':
		case 'tsx':
			return fileIconClassNames.reactTs
		case 'svelte':
			return fileIconClassNames.svelte
		case 'toml':
			return fileIconClassNames.toml
		case 'ts':
		case 'typescript':
			return fileIconClassNames.typescript
		case 'xml':
			return fileIconClassNames.xml
		case 'yaml':
		case 'yml':
			return fileIconClassNames.yaml
		default:
			return fileIconClassNames.document
	}
}

export function resolveFileIconClass(pathLike: string): string {
	const normalizedPath = normalizePath(pathLike).toLowerCase()
	const fileName = basename(normalizedPath)

	if (/\.d\.(ts|mts|cts)$/.test(normalizedPath)) {
		return fileIconClassNames.typescriptDef
	}

	if (fileName === 'package.json') {
		return fileIconClassNames.nodejs
	}

	if (
		fileName === 'pnpm-lock.yaml' ||
		fileName === 'package-lock.json' ||
		fileName === 'yarn.lock' ||
		fileName === 'bun.lock' ||
		fileName === 'bun.lockb'
	) {
		return fileIconClassNames.lock
	}

	if (fileName === 'dockerfile') {
		return fileIconClassNames.docker
	}

	if (fileName === '.gitignore' || fileName === '.gitattributes') {
		return fileIconClassNames.git
	}

	if (fileName.startsWith('.env')) {
		return fileIconClassNames.settings
	}

	if (/^vite\.config\./.test(fileName)) {
		return fileIconClassNames.vite
	}

	if (/^wrangler\./.test(fileName)) {
		return fileIconClassNames.wrangler
	}

	if (/^tailwind\.config\./.test(fileName)) {
		return fileIconClassNames.tailwindcss
	}

	if (/^postcss\.config\./.test(fileName)) {
		return fileIconClassNames.css
	}

	if (/^components?\.json$/.test(fileName)) {
		return fileIconClassNames.json
	}

	if (normalizedPath.endsWith('.tsx')) {
		return fileIconClassNames.reactTs
	}

	if (normalizedPath.endsWith('.jsx')) {
		return fileIconClassNames.react
	}

	if (
		normalizedPath.endsWith('.ts') ||
		normalizedPath.endsWith('.mts') ||
		normalizedPath.endsWith('.cts')
	) {
		return fileIconClassNames.typescript
	}

	if (
		normalizedPath.endsWith('.js') ||
		normalizedPath.endsWith('.mjs') ||
		normalizedPath.endsWith('.cjs')
	) {
		return fileIconClassNames.javascript
	}

	if (normalizedPath.endsWith('.svelte')) {
		return fileIconClassNames.svelte
	}

	if (normalizedPath.endsWith('.astro')) {
		return fileIconClassNames.astro
	}

	if (normalizedPath.endsWith('.json') || normalizedPath.endsWith('.jsonc')) {
		return fileIconClassNames.json
	}

	if (normalizedPath.endsWith('.yaml') || normalizedPath.endsWith('.yml')) {
		return fileIconClassNames.yaml
	}

	if (normalizedPath.endsWith('.md')) {
		return fileIconClassNames.markdown
	}

	if (normalizedPath.endsWith('.mdx') || normalizedPath.endsWith('.mdsvex')) {
		return fileIconClassNames.mdx
	}

	if (normalizedPath.endsWith('.html')) {
		return fileIconClassNames.html
	}

	if (
		normalizedPath.endsWith('.css') ||
		normalizedPath.endsWith('.scss') ||
		normalizedPath.endsWith('.sass') ||
		normalizedPath.endsWith('.less') ||
		normalizedPath.endsWith('.pcss')
	) {
		return fileIconClassNames.css
	}

	if (normalizedPath.endsWith('.toml')) {
		return fileIconClassNames.toml
	}

	if (normalizedPath.endsWith('.xml')) {
		return fileIconClassNames.xml
	}

	if (normalizedPath.endsWith('.svg')) {
		return fileIconClassNames.svg
	}

	if (
		normalizedPath.endsWith('.sh') ||
		normalizedPath.endsWith('.bash') ||
		normalizedPath.endsWith('.zsh') ||
		normalizedPath.endsWith('.ps1')
	) {
		return fileIconClassNames.console
	}

	return fileIconClassNames.document
}
