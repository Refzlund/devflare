#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const sourceCliEntryPath = resolve(currentDir, '../src/cli/index.ts')
const distCliEntryPath = resolve(currentDir, '../dist/cli/index.js')
const cliEntryPath = existsSync(sourceCliEntryPath) ? sourceCliEntryPath : distCliEntryPath

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
