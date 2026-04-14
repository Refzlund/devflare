import { type ConsolaInstance } from 'consola'
import MagicString from 'magic-string'
import { basename, dirname, relative, resolve } from 'pathe'
import type { ParsedArgs, CliOptions, CliResult } from '../index'
import { account } from '../../cloudflare'
import { loadConfig, normalizeDOBinding, type DevflareConfig } from '../../config'
import {
	findConfigPathsUnderDirectory,
	formatSupportedConfigFilenames,
	resolveConfigCandidatePath
} from '../config-path'
import { asOptionalString, resolveCloudflareAccountId } from '../command-utils'
import { bold, createCliTheme, dim, green, logLine, whiteDim, yellow } from '../ui'

interface LoadedConfigRecord {
	configPath: string
	config: DevflareConfig
}

interface WorkerReferenceHit {
	configPath: string
	scope: string
	kind: 'service' | 'durable-object'
	bindingName: string
}

interface ConfigSelectionResult {
	target: LoadedConfigRecord
	localConfigAlreadyUpdated: boolean
	allConfigs: LoadedConfigRecord[]
}

function formatPathForLog(cwd: string, filePath: string): string {
	const relativePath = relative(cwd, filePath).replace(/\\/g, '/')
	return relativePath && !relativePath.startsWith('..') ? relativePath : filePath
}

async function loadConfigFromPath(configPath: string): Promise<LoadedConfigRecord> {
	return {
		configPath,
		config: await loadConfig({
			cwd: dirname(configPath),
			configFile: basename(configPath)
		})
	}
}

async function loadDiscoveredConfigs(cwd: string, explicitConfigPath?: string): Promise<LoadedConfigRecord[]> {
	const candidatePaths = new Set<string>()
	const discoveredPaths = await findConfigPathsUnderDirectory(cwd)
	for (const configPath of discoveredPaths) {
		candidatePaths.add(configPath)
	}

	if (explicitConfigPath) {
		candidatePaths.add(explicitConfigPath)
	}

	const loadedConfigs: LoadedConfigRecord[] = []
	for (const configPath of [...candidatePaths].sort((left, right) => left.localeCompare(right))) {
		try {
			loadedConfigs.push(await loadConfigFromPath(configPath))
		} catch (error) {
			if (explicitConfigPath && explicitConfigPath === configPath) {
				throw error
			}
		}
	}

	return loadedConfigs
}

function formatConfigChoices(matches: LoadedConfigRecord[], cwd: string): string {
	return matches.map((match) => `  - ${formatPathForLog(cwd, match.configPath)} (${match.config.name})`).join('\n')
}

function selectTargetConfig(
	loadedConfigs: LoadedConfigRecord[],
	cwd: string,
	oldName: string,
	newName: string,
	explicitConfigPath?: string
): ConfigSelectionResult {
	if (loadedConfigs.length === 0) {
		throw new Error(
			`Could not find ${formatSupportedConfigFilenames()} under ${cwd}.`
		)
	}

	if (explicitConfigPath) {
		const target = loadedConfigs.find((candidate) => candidate.configPath === explicitConfigPath)
		if (!target) {
			throw new Error(`Could not load the selected config: ${explicitConfigPath}`)
		}

		if (target.config.name === oldName) {
			return {
				target,
				localConfigAlreadyUpdated: false,
				allConfigs: loadedConfigs
			}
		}

		if (target.config.name === newName) {
			return {
				target,
				localConfigAlreadyUpdated: true,
				allConfigs: loadedConfigs
			}
		}

		throw new Error(
			`The selected config uses \`${target.config.name}\`, not \`${oldName}\` or \`${newName}\`.`
		)
	}

	const matchingConfigs = loadedConfigs.filter((candidate) => {
		return candidate.config.name === oldName || candidate.config.name === newName
	})
	const oldMatches = matchingConfigs.filter((candidate) => candidate.config.name === oldName)
	const newMatches = matchingConfigs.filter((candidate) => candidate.config.name === newName)

	if (oldMatches.length === 1 && matchingConfigs.length === 1) {
		return {
			target: oldMatches[0],
			localConfigAlreadyUpdated: false,
			allConfigs: loadedConfigs
		}
	}

	if (newMatches.length === 1 && matchingConfigs.length === 1) {
		return {
			target: newMatches[0],
			localConfigAlreadyUpdated: true,
			allConfigs: loadedConfigs
		}
	}

	if (matchingConfigs.length === 0) {
		throw new Error(
			`Could not find a matching devflare config under ${cwd}. Expected a config whose \`name\` is \`${oldName}\` or \`${newName}\`.`
		)
	}

	throw new Error(
		`Multiple matching devflare configs were found. Use --config to pick one explicitly.\n${formatConfigChoices(matchingConfigs, cwd)}`
	)
}

async function resolveAccountId(
	parsed: ParsedArgs,
	config: DevflareConfig
): Promise<string | undefined> {
	return resolveCloudflareAccountId({
		explicitAccountId: asOptionalString(parsed.options.account),
		configuredAccountId: config.accountId
	})
}

function skipWhitespaceAndComments(source: string, start: number, end: number): number {
	let index = start

	while (index < end) {
		const char = source[index]
		if (/\s/.test(char)) {
			index++
			continue
		}

		const nextIndex = consumeComment(source, index, end)
		if (nextIndex !== null) {
			index = nextIndex
			continue
		}

		break
	}

	return index
}

function consumeQuotedLiteral(source: string, start: number, end: number): number {
	const quote = source[start]
	let index = start + 1

	while (index < end) {
		const char = source[index]
		if (char === '\\') {
			index += 2
			continue
		}

		if (char === quote) {
			return index + 1
		}

		index++
	}

	throw new Error('Unterminated string literal in devflare config.')
}

function consumeComment(source: string, start: number, end: number): number | null {
	if (source[start] !== '/') {
		return null
	}

	if (source[start + 1] === '/') {
		let index = start + 2
		while (index < end && source[index] !== '\n') {
			index++
		}
		return index
	}

	if (source[start + 1] === '*') {
		let index = start + 2
		while (index < end && !(source[index] === '*' && source[index + 1] === '/')) {
			index++
		}
		return Math.min(index + 2, end)
	}

	return null
}

function findConfigObjectStart(source: string): number {
	const defineConfigIndex = source.indexOf('defineConfig')
	if (defineConfigIndex >= 0) {
		const parenIndex = source.indexOf('(', defineConfigIndex)
		if (parenIndex >= 0) {
			const objectIndex = source.indexOf('{', parenIndex)
			if (objectIndex >= 0) {
				return objectIndex
			}
		}
	}

	const exportDefaultIndex = source.indexOf('export default')
	if (exportDefaultIndex >= 0) {
		const objectIndex = source.indexOf('{', exportDefaultIndex)
		if (objectIndex >= 0) {
			return objectIndex
		}
	}

	return -1
}

function getRootPropertySlices(source: string, objectStart: number): Array<{ start: number; end: number }> {
	const slices: Array<{ start: number; end: number }> = []
	let curlyDepth = 1
	let squareDepth = 0
	let parenDepth = 0
	let propertyStart = objectStart + 1
	let index = objectStart + 1

	while (index < source.length) {
		const char = source[index]

		if (char === '\'' || char === '"' || char === '`') {
			index = consumeQuotedLiteral(source, index, source.length)
			continue
		}

		const nextIndex = consumeComment(source, index, source.length)
		if (nextIndex !== null) {
			index = nextIndex
			continue
		}

		if (char === '{') {
			curlyDepth++
			index++
			continue
		}

		if (char === '}') {
			curlyDepth--
			if (curlyDepth === 0) {
				slices.push({ start: propertyStart, end: index })
				return slices
			}
			index++
			continue
		}

		if (char === '[') {
			squareDepth++
			index++
			continue
		}

		if (char === ']') {
			squareDepth--
			index++
			continue
		}

		if (char === '(') {
			parenDepth++
			index++
			continue
		}

		if (char === ')') {
			parenDepth--
			index++
			continue
		}

		if (char === ',' && curlyDepth === 1 && squareDepth === 0 && parenDepth === 0) {
			slices.push({ start: propertyStart, end: index })
			propertyStart = index + 1
		}

		index++
	}

	throw new Error('Could not parse the root object in devflare config.')
}

function findTopLevelColon(source: string, start: number, end: number): number {
	let curlyDepth = 0
	let squareDepth = 0
	let parenDepth = 0
	let index = start

	while (index < end) {
		const char = source[index]

		if (char === '\'' || char === '"' || char === '`') {
			index = consumeQuotedLiteral(source, index, end)
			continue
		}

		const nextIndex = consumeComment(source, index, end)
		if (nextIndex !== null) {
			index = nextIndex
			continue
		}

		if (char === '{') {
			curlyDepth++
			index++
			continue
		}

		if (char === '}') {
			curlyDepth--
			index++
			continue
		}

		if (char === '[') {
			squareDepth++
			index++
			continue
		}

		if (char === ']') {
			squareDepth--
			index++
			continue
		}

		if (char === '(') {
			parenDepth++
			index++
			continue
		}

		if (char === ')') {
			parenDepth--
			index++
			continue
		}

		if (char === ':' && curlyDepth === 0 && squareDepth === 0 && parenDepth === 0) {
			return index
		}

		index++
	}

	return -1
}

function normalizePropertyKey(rawKey: string): string {
	const trimmed = rawKey.trim()
	if (
		(trimmed.startsWith('\'') && trimmed.endsWith('\''))
		|| (trimmed.startsWith('"') && trimmed.endsWith('"'))
	) {
		return trimmed.slice(1, -1)
	}
	return trimmed
}

function findRootNameLiteralRange(source: string): { start: number; end: number; quote: '\'' | '"' } | null {
	const objectStart = findConfigObjectStart(source)
	if (objectStart < 0) {
		return null
	}

	for (const slice of getRootPropertySlices(source, objectStart)) {
		const keyStart = skipWhitespaceAndComments(source, slice.start, slice.end)
		const colonIndex = findTopLevelColon(source, keyStart, slice.end)
		if (colonIndex < 0) {
			continue
		}

		const key = normalizePropertyKey(source.slice(keyStart, colonIndex))
		if (key !== 'name') {
			continue
		}

		const valueStart = skipWhitespaceAndComments(source, colonIndex + 1, slice.end)
		const quote = source[valueStart]
		if (quote !== '\'' && quote !== '"') {
			throw new Error('The top-level `name` property must be a string literal to be updated automatically.')
		}

		return {
			start: valueStart,
			end: consumeQuotedLiteral(source, valueStart, slice.end),
			quote
		}
	}

	return null
}

function quoteWorkerName(value: string, quote: '\'' | '"'): string {
	const escapedValue = value
		.replace(/\\/g, '\\\\')
		.replace(new RegExp(`\\${quote}`, 'g'), `\\${quote}`)

	return `${quote}${escapedValue}${quote}`
}

async function updateConfigName(configPath: string, newName: string): Promise<void> {
	const fs = await import('node:fs/promises')
	const source = await fs.readFile(configPath, 'utf-8')
	const literalRange = findRootNameLiteralRange(source)
	if (!literalRange) {
		throw new Error('Could not locate a top-level string literal `name` property in the selected devflare config.')
	}

	const magicString = new MagicString(source)
	magicString.overwrite(
		literalRange.start,
		literalRange.end,
		quoteWorkerName(newName, literalRange.quote)
	)
	await fs.writeFile(configPath, magicString.toString(), 'utf-8')
}

function collectReferenceHitsFromConfig(
	configPath: string,
	configLike: Pick<DevflareConfig, 'bindings'> | undefined,
	oldName: string,
	scope: string
): WorkerReferenceHit[] {
	if (!configLike?.bindings) {
		return []
	}

	const hits: WorkerReferenceHit[] = []

	for (const [bindingName, bindingConfig] of Object.entries(configLike.bindings.services ?? {})) {
		if (bindingConfig.service === oldName) {
			hits.push({
				configPath,
				scope,
				kind: 'service',
				bindingName
			})
		}
	}

	for (const [bindingName, bindingConfig] of Object.entries(configLike.bindings.durableObjects ?? {})) {
		const normalized = normalizeDOBinding(bindingConfig)
		if (normalized.scriptName === oldName) {
			hits.push({
				configPath,
				scope,
				kind: 'durable-object',
				bindingName
			})
		}
	}

	return hits
}

function collectReferenceHits(
	loadedConfigs: LoadedConfigRecord[],
	oldName: string
): WorkerReferenceHit[] {
	const hits: WorkerReferenceHit[] = []

	for (const record of loadedConfigs) {
		hits.push(...collectReferenceHitsFromConfig(record.configPath, record.config, oldName, 'root'))

		for (const [envName, envConfig] of Object.entries(record.config.env ?? {})) {
			hits.push(
				...collectReferenceHitsFromConfig(
					record.configPath,
					envConfig as Pick<DevflareConfig, 'bindings'>,
					oldName,
					`env.${envName}`
				)
			)
		}
	}

	return hits
}

export async function runWorkerCommand(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	const cwd = options.cwd ?? process.cwd()
	const theme = createCliTheme(parsed.options)
	const subcommand = parsed.args[0]
	const oldName = parsed.args[1]?.trim()
	const newName = asOptionalString(parsed.options.to)
	const explicitConfigPath = asOptionalString(parsed.options.config)

	if (subcommand !== 'rename') {
		logger.error(`Unknown worker subcommand: ${subcommand ?? '<none>'}`)
		logLine(logger, dim('Usage: devflare worker rename <old-name> --to <new-name> [--config <path>]', theme))
		return { exitCode: 1 }
	}

	if (!oldName) {
		logger.error('A current Worker name is required.')
		logLine(logger, dim('Usage: devflare worker rename <old-name> --to <new-name> [--config <path>]', theme))
		return { exitCode: 1 }
	}

	if (!newName) {
		logger.error('The new Worker name must be provided with --to.')
		return { exitCode: 1 }
	}

	if (oldName === newName) {
		logger.error('The new Worker name must be different from the current name.')
		return { exitCode: 1 }
	}

	logLine(logger)
	logLine(logger, `${yellow('worker', theme)} ${dim('Renaming Worker identity', theme)}`)
	logLine(logger, `${dim('from', theme)} ${whiteDim(oldName, theme)}`)
	logLine(logger, `${dim('to', theme)} ${green(newName, theme)}`)

	if (!await account.isAuthenticated()) {
		logger.error('Not authenticated with Cloudflare')
		logLine(logger, dim('Run `devflare login` first.', theme))
		return { exitCode: 1 }
	}

	let remoteRenamed = false

	try {
		const explicitResolvedConfigPath = explicitConfigPath
			? await resolveConfigCandidatePath(resolve(cwd, explicitConfigPath))
			: null

		if (explicitConfigPath && !explicitResolvedConfigPath) {
			throw new Error(
				`${formatSupportedConfigFilenames()} not found for --config ${explicitConfigPath}.`
			)
		}

		const selection = selectTargetConfig(
			await loadDiscoveredConfigs(cwd, explicitResolvedConfigPath ?? undefined),
			cwd,
			oldName,
			newName,
			explicitResolvedConfigPath ?? undefined
		)
		const { target, localConfigAlreadyUpdated, allConfigs } = selection
		const accountId = await resolveAccountId(parsed, target.config)
		if (!accountId) {
			logger.error('No Cloudflare account could be resolved for this config.')
			logLine(logger, dim('Set accountId in devflare.config.ts, pass --account, or configure a default account.', theme))
			return { exitCode: 1 }
		}

		logLine(logger, `${dim('config', theme)} ${whiteDim(formatPathForLog(cwd, target.configPath), theme)}`)
		logLine(logger, `${dim('account', theme)} ${whiteDim(accountId, theme)}`)
		logLine(logger)

		const workers = await account.workers(accountId)
		const hasOldWorker = workers.some((worker) => worker.name === oldName)
		const hasNewWorker = workers.some((worker) => worker.name === newName)

		if (hasOldWorker && hasNewWorker) {
			logger.error(`Both \`${oldName}\` and \`${newName}\` already exist in Cloudflare.`)
			logLine(logger, dim('Refusing to rename because the target Worker name is already taken.', theme))
			return { exitCode: 1 }
		}

		if (!hasOldWorker && !hasNewWorker) {
			logger.error(`Neither \`${oldName}\` nor \`${newName}\` exists in Cloudflare for account ${accountId}.`)
			return { exitCode: 1 }
		}

		if (hasOldWorker && !hasNewWorker) {
			await account.renameWorker(accountId, oldName, newName)
			remoteRenamed = true
			logger.success(`Renamed remote Worker ${oldName} → ${newName}`)
		} else {
			logLine(logger, `${dim('remote', theme)} ${green(newName, theme)} ${dim('is already the active Worker name in Cloudflare', theme)}`)
		}

		if (!localConfigAlreadyUpdated) {
			await updateConfigName(target.configPath, newName)
			logger.success(`Updated ${formatPathForLog(cwd, target.configPath)}`)
		} else {
			logLine(logger, `${dim('config', theme)} ${green('already updated locally', theme)}`)
		}

		const referenceHits = collectReferenceHits(allConfigs, oldName)
		if (referenceHits.length > 0) {
			logger.warn(`Found ${referenceHits.length} local reference(s) that still use \`${oldName}\`.`)
			for (const hit of referenceHits) {
				logLine(logger, `  ${formatPathForLog(cwd, hit.configPath)} ${dim(`(${hit.scope})`, theme)} ${dim('—', theme)} ${hit.kind === 'service' ? 'service binding' : 'durable object binding'} ${bold(hit.bindingName, theme)}`)
			}
		}

		logLine(logger)
		logLine(logger, `${yellow('preview urls', theme)} ${dim('Existing preview aliases and URLs may continue using the old Worker name until you upload fresh previews for the renamed Worker.', theme)}`)
		logLine(logger, dim('Future deploys and preview uploads from this config will target the new Worker name.', theme))

		return { exitCode: 0 }
	} catch (error) {
		if (remoteRenamed) {
			logger.warn('The remote Worker rename succeeded, but the local config update did not complete.')
			logLine(logger, dim('Update devflare.config.ts manually so future deploys target the renamed Worker.', theme))
		}

		if (error instanceof Error) {
			logger.error(error.message)
			return { exitCode: 1 }
		}

		throw error
	}
}
