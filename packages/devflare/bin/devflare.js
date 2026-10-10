#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const sourceCliEntryPath = resolve(currentDir, '../src/cli/index.ts')
const distCliEntryPath = resolve(currentDir, '../dist/cli/index.js')
// Only the bun runtime can execute the TypeScript source directly (it tolerates
// `.ts` + extensionless relative imports); under node — the default shebang and
// what published consumers use — always run the built dist. In the monorepo
// this means `devflare <cmd>` under node needs a prior build, which the
// build/CI pipeline guarantees. A published install has no `src/`, so it falls
// through to dist under any runtime.
const runningBun = Boolean(process.versions.bun)
const cliEntryPath =
	runningBun && existsSync(sourceCliEntryPath) ? sourceCliEntryPath : distCliEntryPath

const { runCli } = await import(pathToFileURL(cliEntryPath).href)

const args = process.argv.slice(2)

runCli(args)
	.then((result) => {
		process.exit(result.exitCode)
	})
	.catch((error) => {
		console.error('CLI error:', error)
		process.exit(1)
	})
