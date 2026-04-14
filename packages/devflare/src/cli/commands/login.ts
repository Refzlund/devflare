import type { ConsolaInstance } from 'consola'
import type { ParsedArgs, CliOptions, CliResult } from '../index'
import { account } from '../../cloudflare'
import { getConfiguredAccountId } from '../command-utils'
import { getDependencies } from '../dependencies'
import { createCliTheme, dim, green, logLine, yellow, whiteDim } from '../ui'

async function logResolvedAccount(cwd: string, logger: ConsolaInstance, theme: ReturnType<typeof createCliTheme>): Promise<void> {
	try {
		const primaryAccount = await account.getPrimaryAccount()
		if (primaryAccount) {
			logLine(logger, `${dim('Primary account:', theme)} ${green(primaryAccount.name, theme)} ${whiteDim(`(${primaryAccount.id})`, theme)}`)
			return
		}
	} catch {
		// Fall back to a configured account hint when the current credentials
		// cannot enumerate all accounts.
	}

	const configuredAccountId = await getConfiguredAccountId(cwd)
	if (!configuredAccountId) {
		logLine(logger, dim('Run `devflare account` to inspect available accounts.', theme))
		return
	}

	const configuredAccount = await account.getAccountById(configuredAccountId)
	if (configuredAccount) {
		logLine(logger, `${dim('Configured account:', theme)} ${green(configuredAccount.name, theme)} ${whiteDim(`(${configuredAccount.id})`, theme)}`)
		return
	}

	logLine(logger, `${dim('Configured account ID:', theme)} ${whiteDim(configuredAccountId, theme)}`)
	logLine(logger, dim('Run `devflare account --account <id>` to inspect the configured account.', theme))
}

export async function runLoginCommand(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	const force = parsed.options.force === true
	const cwd = options.cwd ?? process.cwd()
	const theme = createCliTheme(parsed.options)

	if (!force && await account.isAuthenticated()) {
		logger.success('Already authenticated with Cloudflare')
		await logResolvedAccount(cwd, logger, theme)

		logLine(logger, dim('Use `devflare login --force` to open Wrangler login again.', theme))
		return { exitCode: 0 }
	}

	logLine(logger)
	logLine(logger, `${yellow('login', theme)} ${dim('Opening Wrangler login…', theme)}`)
	const deps = await getDependencies()
	const result = await deps.exec.exec('bunx', ['--bun', 'wrangler', 'login'], {
		cwd,
		stdio: 'inherit' as any
	})

	if (result.exitCode !== 0) {
		logger.error('Wrangler login failed')
		return { exitCode: 1 }
	}

	logger.success('Authenticated with Cloudflare')
	await logResolvedAccount(cwd, logger, theme)

	return { exitCode: 0 }
}
