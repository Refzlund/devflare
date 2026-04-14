import { mkdirSync, writeFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { dirname, join } from 'path'
import { loadConfig, normalizeDOBinding, type DevflareConfig } from '../config'
import { DEFAULT_DO_PATTERN, findFiles } from '../utils/glob'
import { buildGatewayScript } from './simple-context-gateway-script'
import { getBunRuntime } from './simple-context-paths'

/**
 * Find all exported class names in a TypeScript/JavaScript file.
 */
function findExportedClasses(code: string): string[] {
	const classes: string[] = []
	const classPattern = /export\s+class\s+(\w+)/g

	let match: RegExpExecArray | null
	while ((match = classPattern.exec(code)) !== null) {
		classes.push(match[1])
	}

	return classes
}

function classSupportsNativeDurableObjectRpc(code: string, className: string): boolean {
	const nativeRpcPattern = new RegExp(`export\\s+class\\s+${className}\\s+extends\\s+DurableObject\\b`)
	return nativeRpcPattern.test(code)
}

function toGeneratedIdentifier(value: string): string {
	const normalized = value.replace(/[^A-Za-z0-9_$]/g, '_')
	return /^[A-Za-z_$]/.test(normalized) ? normalized : `_${normalized}`
}

interface LocalDurableObjectInfo {
	name: string
	className: string
	scriptPath: string
	nativeRpc: boolean
	runtimeClassName: string
}

async function discoverLocalDurableObjectClasses(
	config: DevflareConfig,
	configDir: string
): Promise<Map<string, { filePath: string; nativeRpc: boolean }>> {
	const classToFilePath = new Map<string, { filePath: string; nativeRpc: boolean }>()
	const doPatternConfig = config.files?.durableObjects
	const doPattern = typeof doPatternConfig === 'string' ? doPatternConfig : DEFAULT_DO_PATTERN

	if (doPatternConfig === false) {
		return classToFilePath
	}

	const doFiles = await findFiles(doPattern, { cwd: configDir })
	for (const filePath of doFiles) {
		try {
			const code = await readFile(filePath, 'utf-8')
			const classNames = findExportedClasses(code)

			for (const className of classNames) {
				classToFilePath.set(className, {
					filePath,
					nativeRpc: classSupportsNativeDurableObjectRpc(code, className)
				})
			}
		} catch {
			// Skip files that can't be read.
		}
	}

	return classToFilePath
}

async function resolveLocalDurableObjects(
	config: DevflareConfig,
	configDir: string
): Promise<{
	doConfig: Record<string, string>
	doInfos: LocalDurableObjectInfo[]
}> {
	const doConfig: Record<string, string> = {}
	const doInfos: LocalDurableObjectInfo[] = []
	const classToFilePath = await discoverLocalDurableObjectClasses(config, configDir)

	for (const [name, rawDoInfo] of Object.entries(config.bindings?.durableObjects ?? {})) {
		const doInfo = normalizeDOBinding(rawDoInfo)

		if (doInfo.__ref) {
			continue
		}

		let scriptPath: string
		let nativeRpc = false

		if (doInfo.scriptName) {
			scriptPath = join(configDir, 'src', doInfo.scriptName)
			try {
				const code = await readFile(scriptPath, 'utf-8')
				nativeRpc = classSupportsNativeDurableObjectRpc(code, doInfo.className)
			} catch {
				nativeRpc = false
			}
		} else {
			const discoveredClass = classToFilePath.get(doInfo.className)
			if (!discoveredClass) {
				throw new Error(
					`Durable object ${name} (className: '${doInfo.className}') not found.\n`
					+ `Either:\n`
					+ `  1. Set files.durableObjects pattern in config (e.g., 'src/do.*.ts')\n`
					+ `  2. Use explicit scriptName: { className: '${doInfo.className}', scriptName: 'do.file.ts' }`
				)
			}

			scriptPath = discoveredClass.filePath
			nativeRpc = discoveredClass.nativeRpc
		}

		const runtimeClassName = nativeRpc
			? doInfo.className
			: `__Devflare${toGeneratedIdentifier(name)}RpcWrapper`

		doConfig[name] = runtimeClassName
		doInfos.push({
			name,
			className: doInfo.className,
			scriptPath,
			nativeRpc,
			runtimeClassName
		})
	}

	return {
		doConfig,
		doInfos
	}
}

function buildWrapperCode(doInfos: LocalDurableObjectInfo[]): string {
	return doInfos
		.filter((info) => !info.nativeRpc)
		.map((info) => `
export class ${info.runtimeClassName} {
	constructor(state, env) {
		this.__instance = new ${info.className}(state, env)
	}

	async fetch(request) {
		const url = new URL(request.url)
		if (request.method !== 'POST' || url.pathname !== '/_rpc') {
			return new Response('Not found', { status: 404 })
		}

		try {
			const payload = await request.json()
			const method = payload?.method
			const params = Array.isArray(payload?.params) ? payload.params : []
			const target = this.__instance?.[method]

			if (typeof target !== 'function') {
				return new Response(JSON.stringify({
					ok: false,
					error: { message: 'Method not found: ' + String(method) }
				}), {
					status: 404,
					headers: { 'Content-Type': 'application/json' }
				})
			}

			let result = await target.apply(this.__instance, params)
			result = __encodeTransport(result)

			return new Response(JSON.stringify({ ok: true, result }), {
				headers: { 'Content-Type': 'application/json' }
			})
		} catch (error) {
			return new Response(JSON.stringify({
				ok: false,
				error: { message: error instanceof Error ? error.message : String(error) }
			}), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			})
		}
	}
}`.trim())
		.join('\n\n')
}

async function bundleDurableObjectModules(
	configDir: string,
	doInfos: LocalDurableObjectInfo[],
	transportFile: string | null
): Promise<string> {
	const virtualImports: string[] = []
	const virtualExports: string[] = []

	if (transportFile) {
		const transportPath = join(configDir, transportFile)
		virtualImports.push(`import { transport } from '${transportPath.replace(/\\/g, '/')}'`)
		virtualExports.push('export { transport }')
	}

	for (const info of doInfos) {
		virtualImports.push(`import { ${info.className} } from '${info.scriptPath.replace(/\\/g, '/')}'`)
		virtualExports.push(`export { ${info.className} }`)
	}

	if (virtualImports.length === 0) {
		return ''
	}

	const virtualEntry = [...virtualImports, '', ...virtualExports].join('\n')
	const virtualPath = join(configDir, '.devflare', '__test_entry.ts')
	mkdirSync(dirname(virtualPath), { recursive: true })
	writeFileSync(virtualPath, virtualEntry)

	const bun = getBunRuntime()
	if (!bun) {
		throw new Error('Bun runtime is required for createTestContext with Durable Objects')
	}

	const result = await bun.build({
		entrypoints: [virtualPath],
		target: 'browser',
		format: 'esm',
		minify: false,
		external: ['cloudflare:workers', 'cloudflare:*']
	})

	if (!result.success) {
		throw new Error(`Failed to bundle test entry: ${result.logs.join('\n')}`)
	}

	return await result.outputs[0].text()
}

export async function buildDurableObjectGateway(config: DevflareConfig, configDir: string, transportFile: string | null): Promise<{
	durableObjects?: Record<string, string>
	script: string
}> {
	if (!config.bindings?.durableObjects) {
		return {
			script: buildGatewayScript('', '')
		}
	}

	const { doConfig, doInfos } = await resolveLocalDurableObjects(config, configDir)
	const bundledCode = await bundleDurableObjectModules(configDir, doInfos, transportFile)
	const wrapperCode = buildWrapperCode(doInfos)

	return {
		durableObjects: doConfig,
		script: buildGatewayScript(bundledCode, wrapperCode)
	}
}
