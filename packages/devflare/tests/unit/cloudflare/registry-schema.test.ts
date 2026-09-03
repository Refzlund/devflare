import { describe, expect, test } from 'bun:test'
import {
	devflareAccountLayerRecordSchema,
	devflareAccountRecordSchema,
	devflareDeploymentRecordSchema,
	devflarePreviewRecordSchema,
	devflarePreviewScopeRecordSchema
} from '../../../src/cloudflare/registry-schema'

const TEST_ACCOUNT_ID = 'test-account-id'

describe('devflareAccountRecordSchema', () => {
	test('coerces timestamps to Date and normalizes numeric creator ids', () => {
		const record = devflareAccountRecordSchema.parse({
			id: 'preview:base',
			ver: 1,
			createdAt: '2026-04-08T12:00:00.000Z',
			updatedAt: '2026-04-08T12:05:00.000Z',
			createdBy: 42
		})

		expect(record.createdAt).toBeInstanceOf(Date)
		expect(record.updatedAt).toBeInstanceOf(Date)
		expect(record.createdBy).toBe('42')
	})
})

describe('devflarePreviewRecordSchema', () => {
	test('accepts preview records with scope metadata', () => {
		const record = devflarePreviewRecordSchema.parse({
			id: 'preview:documentation:5dba9570',
			kind: 'preview',
			ver: 1,
			createdAt: '2026-04-08T12:00:00.000Z',
			createdBy: 'user-123',
			accountId: TEST_ACCOUNT_ID,
			workerName: 'documentation',
			versionId: '5dba9570-33c4-4375-b784-e1b34ad01569',
			previewUrl: 'https://5dba9570-documentation.refz.workers.dev/',
			scope: 'acceptance-sweep',
			scopeUrl: 'https://acceptance-sweep-documentation.refz.workers.dev/',
			branchName: 'feature/preview-registry',
			commitSha: 'abcdef1234567890',
			source: 'cli'
		})

		expect(record.status).toBe('active')
		expect(record.source).toBe('cli')
	})

	test('rejects scope URLs when no scope is present', () => {
		expect(() => {
			devflarePreviewRecordSchema.parse({
				id: 'preview:documentation:orphan',
				kind: 'preview',
				ver: 1,
				createdAt: '2026-04-08T12:00:00.000Z',
				createdBy: 'user-123',
				accountId: TEST_ACCOUNT_ID,
				workerName: 'documentation',
				versionId: '5dba9570-33c4-4375-b784-e1b34ad01569',
				previewUrl: 'https://5dba9570-documentation.refz.workers.dev/',
				scopeUrl: 'https://acceptance-sweep-documentation.refz.workers.dev/'
			})
		}).toThrow('scopeUrl requires scope to be set')
	})
})

describe('devflarePreviewScopeRecordSchema', () => {
	test('enforces Cloudflare-safe preview names', () => {
		expect(() => {
			devflarePreviewScopeRecordSchema.parse({
				id: 'previewScope:documentation:Invalid Alias',
				kind: 'previewScope',
				ver: 1,
				createdAt: '2026-04-08T12:00:00.000Z',
				createdBy: 'user-123',
				accountId: TEST_ACCOUNT_ID,
				workerName: 'documentation',
				scope: 'Invalid Alias',
				scopeUrl: 'https://acceptance-sweep-documentation.refz.workers.dev/',
				versionId: '5dba9570-33c4-4375-b784-e1b34ad01569'
			})
		}).toThrow('Preview names must start with a lowercase letter')
	})
})

describe('devflareDeploymentRecordSchema', () => {
	test('requires preview deployments to reference a preview record', () => {
		expect(() => {
			devflareDeploymentRecordSchema.parse({
				id: 'deployment:documentation:preview:1',
				kind: 'deployment',
				ver: 1,
				createdAt: '2026-04-08T12:00:00.000Z',
				createdBy: 'user-123',
				accountId: TEST_ACCOUNT_ID,
				workerName: 'documentation',
				deploymentId: 'deployment-preview-1',
				channel: 'preview',
				versionId: '5dba9570-33c4-4375-b784-e1b34ad01569'
			})
		}).toThrow('Preview deployments must reference the preview record they materialize')
	})
})

describe('devflareAccountLayerRecordSchema', () => {
	test('parses discriminated account-layer records', () => {
		const record = devflareAccountLayerRecordSchema.parse({
			id: 'deployment:documentation:production:1',
			kind: 'deployment',
			ver: 1,
			createdAt: '2026-04-08T12:00:00.000Z',
			createdBy: 'user-123',
			accountId: TEST_ACCOUNT_ID,
			workerName: 'documentation',
			deploymentId: 'deployment-production-1',
			channel: 'production',
			versionId: '39f82f43-df67-4050-af54-6dcbca5585b5',
			status: 'active',
			source: 'github-action'
		})

		if (record.kind !== 'deployment') {
			throw new Error(`Expected deployment record, received ${record.kind}`)
		}

		expect(record.channel).toBe('production')
	})
})
