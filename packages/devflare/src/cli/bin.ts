#!/usr/bin/env node
// =============================================================================
// devflare CLI Binary Entry Point
// =============================================================================

import { runCli } from './index'

const args = process.argv.slice(2)

runCli(args).then((result) => {
	process.exit(result.exitCode)
}).catch((error) => {
	console.error('Fatal error:', error)
	process.exit(1)
})
