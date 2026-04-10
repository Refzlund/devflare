// =============================================================================
// Build Command — Build for production
// =============================================================================

import { type ConsolaInstance } from 'consola'
import type { ParsedArgs, CliOptions, CliResult } from '../index'
import { prepareBuildArtifacts } from './build-artifacts'
import { createCliTheme, cyanBold, dim, logLine } from '../ui'

export async function runBuildCommand(
	parsed: ParsedArgs,
	logger: ConsolaInstance,
	options: CliOptions
): Promise<CliResult> {
	const theme = createCliTheme(parsed.options)
	logLine(logger)
	logLine(logger, `${cyanBold('build', theme)} ${dim('Preparing production artifacts', theme)}`)

	try {
		await prepareBuildArtifacts(parsed, logger, options)
		logger.success('Generated .devflare/wrangler.jsonc')
		logger.success('Generated .devflare/build/wrangler.jsonc')
		logger.success('Generated .wrangler/deploy/config.json')
		logger.success('Build complete!')
		return { exitCode: 0 }
	} catch (error) {
		if (error instanceof Error) {
			logger.error('Build failed:', error.message)
			if (parsed.options.debug) {
				logger.error(error.stack)
			}
		}
		return { exitCode: 1 }
	}
}
