import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
	__resetTestContextConfigCache,
	resolveTestContextConfig
} from '../../../src/test/simple-context-lifecycle'
import { createTrackedTempDirectories } from '../../helpers/tracked-temp-directories'

const tempDirectories = createTrackedTempDirectories()

afterAll(() => {
	tempDirectories.cleanup()
})

beforeEach(() => {
	__resetTestContextConfigCache()
})

function createProject(name: string): string {
	const projectDir = tempDirectories.create('devflare-lifecycle-config-')
	mkdirSync(projectDir, { recursive: true })
	writeFileSync(
		join(projectDir, 'devflare.config.ts'),
		`export default { name: '${name}', compatibilityDate: '2026-03-17' }\n`
	)

	return projectDir
}

describe('resolveTestContextConfig', () => {
	test('hands back the same resolution for a repeated path', async () => {
		const projectDir = createProject('lifecycle-memo')

		const first = await resolveTestContextConfig('devflare.config.ts', projectDir)
		const second = await resolveTestContextConfig('devflare.config.ts', projectDir)

		expect(second).toBe(first)
		expect(second.config.name).toBe('lifecycle-memo')
	})

	test('reaches the same entry through autodiscovery and an explicit path', async () => {
		const projectDir = createProject('lifecycle-autodiscovered')
		mkdirSync(join(projectDir, 'tests'), { recursive: true })

		const explicit = await resolveTestContextConfig('devflare.config.ts', projectDir)
		const discovered = await resolveTestContextConfig(undefined, join(projectDir, 'tests'))

		expect(discovered).toBe(explicit)
	})

	test('keeps separate projects apart', async () => {
		const projectA = createProject('lifecycle-a')
		const projectB = createProject('lifecycle-b')

		const a = await resolveTestContextConfig('devflare.config.ts', projectA)
		const b = await resolveTestContextConfig('devflare.config.ts', projectB)

		expect(a.config.name).toBe('lifecycle-a')
		expect(b.config.name).toBe('lifecycle-b')
	})

	test('still fails loudly when no config exists', async () => {
		const emptyDir = tempDirectories.create('devflare-lifecycle-empty-')

		await expect(resolveTestContextConfig('devflare.config.ts', emptyDir)).rejects.toThrow()
	})
})
