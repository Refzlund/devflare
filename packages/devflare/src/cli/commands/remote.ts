// =============================================================================
// CLI Remote Command
// =============================================================================
// `devflare remote` — Manage remote test mode
// =============================================================================

import type { ConsolaInstance } from 'consola'
import {
	disableRemoteMode,
	enableRemoteMode,
	getEffectiveRemoteModeStatus
} from '../../cloudflare/remote-config'
import { BOLD, DIM, GREEN, RED, RESET, YELLOW } from '../colors'
import type { CliOptions, CliResult, ParsedArgs } from '../index'

// -----------------------------------------------------------------------------
// Output Helpers
// -----------------------------------------------------------------------------

function log(message = ''): void {
	console.log(message)
}

// -----------------------------------------------------------------------------
// Subcommands
// -----------------------------------------------------------------------------

function showStatus(): void {
	const status = getEffectiveRemoteModeStatus()

	log()
	log(`${BOLD}Remote Test Mode${RESET}`)
	log()

	if (status.isActive) {
		log(`  ${GREEN}●${RESET} ${BOLD}Enabled${RESET}`)
		if (status.source === 'env') {
			log(`    Source: ${YELLOW}DEVFLARE_REMOTE${RESET} environment variable`)
			log(`    ${DIM}(unset the variable to disable)${RESET}`)
		} else {
			log(`    Expires in ${status.remainingMinutes} minute(s)`)
			log(`    ${DIM}At: ${status.expiresAt?.toLocaleTimeString()}${RESET}`)
		}
	} else {
		log(`  ${DIM}○${RESET} Disabled`)
		log(`    ${DIM}Remote-only tests (AI, Vectorize) will be skipped${RESET}`)
	}

	log()
	log(`${DIM}Commands:${RESET}`)
	log(`  devflare remote enable [minutes]  Enable for N minutes (default: 30)`)
	log(`  devflare remote disable           Disable immediately`)
	log(`  devflare remote status            Show current status`)
	log()
}

function enable(inputMinutes: number): void {
	// enableRemoteMode clamps and validates the input
	const actualMinutes = enableRemoteMode(inputMinutes)
	const status = getEffectiveRemoteModeStatus()

	log()
	if (inputMinutes !== actualMinutes) {
		log(`${YELLOW}⚠${RESET}  Invalid duration, using ${actualMinutes} minute(s)`)
	}
	log(`${GREEN}✓${RESET} Remote test mode ${BOLD}enabled${RESET} for ${actualMinutes} minute(s)`)
	log(`  Expires at: ${status.expiresAt?.toLocaleTimeString()}`)
	log()
	log(`${YELLOW}⚠${RESET}  Remote tests use real Cloudflare infrastructure and may incur costs.`)
	log(`   Run ${DIM}devflare remote disable${RESET} when done.`)
	log()
}

function disable(): void {
	const statusBefore = getEffectiveRemoteModeStatus()
	disableRemoteMode()

	log()
	log(`${GREEN}✓${RESET} Remote test mode ${BOLD}disabled${RESET}`)

	// Warn if env var still active
	if (statusBefore.envVarSet) {
		log()
		log(
			`${YELLOW}⚠${RESET}  Note: ${BOLD}DEVFLARE_REMOTE${RESET} environment variable is still set.`
		)
		log(`   Remote mode will remain active until you unset it.`)
	} else {
		log(`  Remote-only tests (AI, Vectorize) will now be skipped.`)
	}
	log()
}

// -----------------------------------------------------------------------------
// Main Command
// -----------------------------------------------------------------------------

export function runRemoteCommand(
	parsed: ParsedArgs,
	_logger: ConsolaInstance,
	_options: CliOptions
): CliResult {
	const subcommand = parsed.args[0] as string | undefined
	const arg = parsed.args[1] as string | undefined

	switch (subcommand) {
		case 'enable': {
			const minutes = arg ? Number.parseInt(arg, 10) : 30
			enable(Number.isNaN(minutes) ? 30 : minutes)
			return { exitCode: 0 }
		}

		case 'disable':
			disable()
			return { exitCode: 0 }

		case 'status':
		case undefined:
			showStatus()
			return { exitCode: 0 }

		default:
			log(`${RED}Unknown subcommand:${RESET} ${subcommand}`)
			log(`Run ${DIM}devflare remote${RESET} for usage.`)
			return { exitCode: 1 }
	}
}
