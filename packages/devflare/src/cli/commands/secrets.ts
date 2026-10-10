import type { ConsolaInstance } from 'consola'
import { deleteLocalSecret, listLocalSecrets, writeLocalSecret } from '../../secrets/local-secrets'
import type { CliOptions, CliResult, ParsedArgs } from '../index'

function getStringOption(
	options: Record<string, string | boolean>,
	key: string
): string | undefined {
	const value = options[key]
	return typeof value === 'string' ? value : undefined
}

function getCwd(options: CliOptions): string {
	return options.cwd ?? process.cwd()
}

function requireLocalFlag(parsed: ParsedArgs, logger: ConsolaInstance): boolean {
	if (parsed.options.local === true) {
		return true
	}

	logger.error('Local Secrets Store commands require --local.')
	return false
}

function requireStoreAndName(
	parsed: ParsedArgs,
	logger: ConsolaInstance
): { storeId: string; name: string } | undefined {
	const storeId = getStringOption(parsed.options, 'store')
	const name = getStringOption(parsed.options, 'name')

	if (!storeId || !name) {
		logger.error('Pass --store <id> and --name <name>.')
		return undefined
	}

	return { storeId, name }
}

function formatSecretRef(storeId: string, name: string): string {
	return `${storeId}/${name}`
}

function usage(): string {
	return [
		'devflare secrets --local --store <id> --name <name> --value <value>',
		'devflare secrets --local --store <id> --list',
		'devflare secrets --local --store <id> --name <name> --delete'
	].join('\n')
}

export function runSecretsCommand(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): CliResult {
	if (!requireLocalFlag(parsed, logger)) {
		return { exitCode: 1, output: usage() }
	}

	const cwd = getCwd(options)
	const storeId = getStringOption(parsed.options, 'store')

	if (parsed.options.list === true) {
		const rows = listLocalSecrets({ cwd, storeId })
		const output = rows.map((row) => formatSecretRef(row.storeId, row.name)).join('\n')
		if (output) {
			logger.info(output)
		}
		return { exitCode: 0, output }
	}

	const required = requireStoreAndName(parsed, logger)
	if (!required) {
		return { exitCode: 1, output: usage() }
	}

	if (parsed.options.delete === true) {
		deleteLocalSecret({ cwd, storeId: required.storeId, name: required.name })
		const output = formatSecretRef(required.storeId, required.name)
		logger.success(`Deleted local secret ${output}`)
		return { exitCode: 0, output }
	}

	const value = getStringOption(parsed.options, 'value')
	if (value === undefined) {
		logger.error('Pass --value <value>, --list, or --delete.')
		return { exitCode: 1, output: usage() }
	}

	writeLocalSecret({
		cwd,
		storeId: required.storeId,
		name: required.name,
		value
	})

	const output = formatSecretRef(required.storeId, required.name)
	logger.success(`Stored local secret ${output}`)
	return { exitCode: 0, output }
}
