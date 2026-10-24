import { describe, expect, test } from 'bun:test'
import {
	buildGradualDeployInvocation,
	buildVersionSpecs,
	parseDeployPercentage
} from '../../../src/cli/gradual-deploy'

describe('parseDeployPercentage', () => {
	test('returns undefined when the flag is absent', () => {
		expect(parseDeployPercentage(undefined)).toBeUndefined()
	})

	test('parses a valid integer percentage', () => {
		expect(parseDeployPercentage('0')).toBe(0)
		expect(parseDeployPercentage('10')).toBe(10)
		expect(parseDeployPercentage('100')).toBe(100)
	})

	test('rejects a bare flag with no value', () => {
		expect(() => parseDeployPercentage(true)).toThrow(/requires a value/)
	})

	test('rejects out-of-range values', () => {
		expect(() => parseDeployPercentage('101')).toThrow(/between 0 and 100/)
	})

	test('rejects non-integer / non-numeric values', () => {
		expect(() => parseDeployPercentage('10.5')).toThrow(/whole number/)
		expect(() => parseDeployPercentage('ten')).toThrow(/whole number/)
		expect(() => parseDeployPercentage('-5')).toThrow(/whole number/)
	})
})

describe('buildVersionSpecs', () => {
	test('emits a single positional spec when no previous version is given', () => {
		expect(
			buildVersionSpecs({
				versionId: 'v-new',
				percentage: 10,
				workerName: 'demo'
			})
		).toEqual(['v-new@10'])
	})

	test('splits the remaining traffic to a distinct previous version', () => {
		expect(
			buildVersionSpecs({
				versionId: 'v-new',
				percentage: 10,
				previousVersionId: 'v-old',
				workerName: 'demo'
			})
		).toEqual(['v-new@10', 'v-old@90'])
	})

	test('does not add a previous-version spec at 100%', () => {
		expect(
			buildVersionSpecs({
				versionId: 'v-new',
				percentage: 100,
				previousVersionId: 'v-old',
				workerName: 'demo'
			})
		).toEqual(['v-new@100'])
	})

	test('ignores a previous version equal to the new version', () => {
		expect(
			buildVersionSpecs({
				versionId: 'v-new',
				percentage: 25,
				previousVersionId: 'v-new',
				workerName: 'demo'
			})
		).toEqual(['v-new@25'])
	})
})

describe('buildGradualDeployInvocation', () => {
	test('uses bunx wrangler when no local executable is resolved', () => {
		const invocation = buildGradualDeployInvocation(
			{
				versionId: 'v-new',
				percentage: 10,
				workerName: 'demo-worker'
			},
			null
		)

		expect(invocation.command).toBe('bunx')
		expect(invocation.args).toEqual([
			'wrangler',
			'versions',
			'deploy',
			'v-new@10',
			'--name',
			'demo-worker',
			'--yes'
		])
	})

	test('runs the local wrangler executable under node and includes the message', () => {
		const invocation = buildGradualDeployInvocation(
			{
				versionId: 'v-new',
				percentage: 25,
				previousVersionId: 'v-old',
				workerName: 'demo-worker',
				message: 'canary'
			},
			'/abs/path/wrangler/bin/wrangler.js'
		)

		expect(invocation.command).toBe('node')
		expect(invocation.args).toEqual([
			'/abs/path/wrangler/bin/wrangler.js',
			'versions',
			'deploy',
			'v-new@25',
			'v-old@75',
			'--name',
			'demo-worker',
			'--message',
			'canary',
			'--yes'
		])
	})
})
