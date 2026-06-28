// =============================================================================
// Init Command — Create new devflare project
// =============================================================================

import type { ConsolaInstance } from 'consola'
import { join, resolve } from 'pathe'
import { type FileSystem, getDependencies } from '../dependencies'
import type { CliOptions, CliResult, ParsedArgs } from '../index'
import { getInitDependencyVersions } from '../package-metadata'
import { createCliTheme, cyanBold, dim, green, logLine } from '../ui'

/**
 * Template configuration for project scaffolding
 */
interface ProjectTemplate {
	name: string
	description: string
	files: Record<string, string>
}

// =============================================================================
// Templates
// =============================================================================

const MINIMAL_TEMPLATE: ProjectTemplate = {
	name: 'minimal',
	description: 'Minimal starter with single handler',
	files: {
		'devflare.config.ts': `import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: '{{PROJECT_NAME}}',
	compatibilityDate: '${new Date().toISOString().split('T')[0]}',
	files: {
		fetch: 'src/fetch.ts'
	}
})
`,
		'src/fetch.ts': `import type { FetchEvent } from 'devflare/runtime'

export async function fetch({ url }: FetchEvent): Promise<Response> {
	return new Response(
		url.pathname === '/'
			? 'Hello from Devflare'
			: \`Hello from Devflare: \${url.pathname}\`
	)
}
`,
		'package.json': `{
	"name": "{{PROJECT_NAME}}",
	"version": "0.0.1",
	"private": true,
	"type": "module",
	"scripts": {
		"dev": "devflare dev",
		"build": "devflare build",
		"deploy": "devflare deploy",
		"types": "devflare types"
	},
	"devDependencies": {
		"@cloudflare/workers-types": "{{WORKERS_TYPES_VERSION}}",
		"devflare": "{{DEVFLARE_VERSION}}",
		"typescript": "{{TYPESCRIPT_VERSION}}",
		"wrangler": "{{WRANGLER_VERSION}}"
	}
}
`,
		'tsconfig.json': `{
	"compilerOptions": {
		"target": "ESNext",
		"module": "ESNext",
		"moduleResolution": "bundler",
		"strict": true,
		"skipLibCheck": true,
		"types": ["@cloudflare/workers-types"]
	},
	"include": ["src/**/*", "env.d.ts", "devflare.config.ts"]
}
`
	}
}

const API_TEMPLATE: ProjectTemplate = {
	name: 'api',
	description: 'API starter with request-wide middleware',
	files: {
		'devflare.config.ts': `import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: '{{PROJECT_NAME}}',
	compatibilityDate: '${new Date().toISOString().split('T')[0]}',
	files: {
		fetch: 'src/fetch.ts'
	}
})
`,
		'src/fetch.ts': `import { sequence } from 'devflare/runtime'
import { corsHandle } from './middleware/cors'
import { appFetch } from './app'

export const handle = sequence(corsHandle, appFetch)
`,
		'src/middleware/cors.ts': `import type { FetchEvent, ResolveFetch } from 'devflare/runtime'

export async function corsHandle(event: FetchEvent, resolve: ResolveFetch): Promise<Response> {
	// Handle preflight
	if (event.request.method === 'OPTIONS') {
		return new Response(null, {
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type, Authorization'
			}
		})
	}

	const response = await resolve(event)
	const next = new Response(response.body, response)
	next.headers.set('Access-Control-Allow-Origin', '*')
	return next
}
`,
		'src/app.ts': `import type { FetchEvent } from 'devflare/runtime'

export async function appFetch({ url }: FetchEvent): Promise<Response> {
	if (url.pathname === '/api/health') {
		return Response.json({ status: 'ok' })
	}

	if (url.pathname.startsWith('/api/')) {
		return Response.json({ error: 'Not found' }, { status: 404 })
	}

	return new Response('Not Found', { status: 404 })
}
`,
		'package.json': MINIMAL_TEMPLATE.files['package.json'],
		'tsconfig.json': MINIMAL_TEMPLATE.files['tsconfig.json']
	}
}

const TEMPLATES: Record<string, ProjectTemplate> = {
	minimal: MINIMAL_TEMPLATE,
	api: API_TEMPLATE
}

// =============================================================================
// Init Command Implementation
// =============================================================================

export async function runInitCommand(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	const projectName = parsed.args[0] || 'my-devflare-app'
	const templateName = (parsed.options.template as string) || 'minimal'
	const cwd = options.cwd || process.cwd()
	const theme = createCliTheme(parsed.options)

	logLine(logger)
	logLine(logger, `${cyanBold('init', theme)} ${dim('Creating a new Devflare project', theme)}`)
	logLine(logger, `${dim('project', theme)} ${green(projectName, theme)}`)

	// Validate template
	const template = TEMPLATES[templateName]
	if (!template) {
		logger.error(`Unknown template: ${templateName}`)
		logger.info(`Available templates: ${Object.keys(TEMPLATES).join(', ')}`)
		return { exitCode: 1 }
	}

	const projectDir = resolve(cwd, projectName)
	const dependencyVersions = await getInitDependencyVersions()

	// Get filesystem dependency
	const { fs } = await getDependencies()

	try {
		await fs.access(projectDir)
		logger.error(`Directory already exists: ${projectDir}`)
		return { exitCode: 1 }
	} catch {
		// Directory doesn't exist, good to proceed
	}

	// Create project directory
	await fs.mkdir(projectDir, { recursive: true })

	// Create files from template
	for (const [filePath, content] of Object.entries(template.files)) {
		const fullPath = join(projectDir, filePath)
		const dir = fullPath.substring(0, fullPath.lastIndexOf('/'))

		// Ensure directory exists
		await fs.mkdir(dir, { recursive: true }).catch(() => {})

		// Replace placeholders
		const processedContent = content
			.replace(/\{\{PROJECT_NAME\}\}/g, projectName)
			.replace(/\{\{DEVFLARE_VERSION\}\}/g, dependencyVersions.devflare)
			.replace(/\{\{TYPESCRIPT_VERSION\}\}/g, dependencyVersions.typescript)
			.replace(/\{\{WRANGLER_VERSION\}\}/g, dependencyVersions.wrangler)
			.replace(/\{\{WORKERS_TYPES_VERSION\}\}/g, dependencyVersions.workersTypes)

		await fs.writeFile(fullPath, processedContent, 'utf-8')
		logLine(logger, `  ${dim('created', theme)} ${filePath}`)
	}

	logger.success('Project created successfully!')
	logLine(logger)
	logLine(logger, dim('next steps', theme))
	logLine(logger, `  cd ${projectName}`)
	logLine(logger, '  bun install')
	logLine(logger, '  bun run types')
	logLine(logger, '  bun run dev')

	return { exitCode: 0 }
}
