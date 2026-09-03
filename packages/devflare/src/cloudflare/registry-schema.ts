// =============================================================================
// Devflare Account-Layer Record Schemas
// =============================================================================
// Zod 4 schemas for Devflare-managed metadata stored inside a user's Cloudflare
// account. These records are intended for a D1-first control-plane layer that
// tracks previews, scopes, deployments, and future reconciliation state.
// =============================================================================

import { z } from 'zod/v4'

const recordIdSchema = z.string().min(1)
const cloudflareAccountIdSchema = z.string().min(1)
const cloudflareVersionIdSchema = z.string().uuid()
const workerNameSchema = z.string().min(1)
const timestampSchema = z.coerce.date()
const urlSchema = z.string().url()
const branchNameSchema = z.string().min(1)
const commitShaSchema = z.string().regex(/^[a-f0-9]{7,40}$/i, {
	message: 'Commit SHA must be 7 to 40 hexadecimal characters'
})
const previewScopeSchema = z.string().regex(/^[a-z][a-z0-9-]*$/, {
	message:
		'Preview names must start with a lowercase letter and contain only lowercase letters, numbers, and dashes'
})

// Cloudflare's API surfaces author/user identifiers as strings, but accepting a
// numeric-like input here keeps the schema ergonomic for future callers that may
// materialize user ids from numeric storage or UI forms.
export const cloudflareUserIdSchema = z.union([
	z.string().min(1),
	z
		.number()
		.int()
		.nonnegative()
		.transform((value) => String(value))
])

export const devflareAccountRecordSchema = z
	.object({
		id: recordIdSchema,
		ver: z.number().int().min(1),
		createdAt: timestampSchema,
		updatedAt: timestampSchema.optional(),
		deletedAt: timestampSchema.optional(),
		createdBy: cloudflareUserIdSchema
	})
	.strict()

export function createDevflareAccountRecordSchema<const Shape extends z.ZodRawShape>(shape: Shape) {
	return devflareAccountRecordSchema.extend(shape)
}

export const devflareRecordSourceSchema = z.enum([
	'cli',
	'github-action',
	'workers-builds',
	'dashboard',
	'unknown'
])

export const devflarePreviewStatusSchema = z.enum(['active', 'superseded', 'orphaned', 'deleted'])

export const devflarePreviewScopeStatusSchema = z.enum(['active', 'reassigned', 'deleted'])

export const devflareDeploymentChannelSchema = z.enum(['production', 'preview'])

export const devflareDeploymentStatusSchema = z.enum([
	'active',
	'superseded',
	'rolled_back',
	'deleted'
])

export const devflarePreviewRecordSchema = createDevflareAccountRecordSchema({
	kind: z.literal('preview'),
	accountId: cloudflareAccountIdSchema,
	workerName: workerNameSchema,
	versionId: cloudflareVersionIdSchema,
	previewUrl: urlSchema,
	scope: previewScopeSchema.optional(),
	scopeUrl: urlSchema.optional(),
	branchName: branchNameSchema.optional(),
	commitSha: commitShaSchema.optional(),
	deploymentId: recordIdSchema.optional(),
	source: devflareRecordSourceSchema.default('unknown'),
	status: devflarePreviewStatusSchema.default('active')
}).superRefine((record, ctx) => {
	if (record.scopeUrl && !record.scope) {
		ctx.addIssue({
			code: 'custom',
			path: ['scopeUrl'],
			message: 'scopeUrl requires scope to be set'
		})
	}
})

export const devflarePreviewScopeRecordSchema = createDevflareAccountRecordSchema({
	kind: z.literal('previewScope'),
	accountId: cloudflareAccountIdSchema,
	workerName: workerNameSchema,
	scope: previewScopeSchema,
	scopeUrl: urlSchema,
	versionId: cloudflareVersionIdSchema,
	previewId: recordIdSchema.optional(),
	branchName: branchNameSchema.optional(),
	commitSha: commitShaSchema.optional(),
	source: devflareRecordSourceSchema.default('unknown'),
	status: devflarePreviewScopeStatusSchema.default('active')
})

export const devflareDeploymentRecordSchema = createDevflareAccountRecordSchema({
	kind: z.literal('deployment'),
	accountId: cloudflareAccountIdSchema,
	workerName: workerNameSchema,
	deploymentId: recordIdSchema,
	channel: devflareDeploymentChannelSchema,
	status: devflareDeploymentStatusSchema.default('active'),
	versionId: cloudflareVersionIdSchema,
	previewId: recordIdSchema.optional(),
	environment: z.string().min(1).optional(),
	url: urlSchema.optional(),
	message: z.string().min(1).optional(),
	commitSha: commitShaSchema.optional(),
	source: devflareRecordSourceSchema.default('unknown')
}).superRefine((record, ctx) => {
	if (record.channel === 'preview' && !record.previewId) {
		ctx.addIssue({
			code: 'custom',
			path: ['previewId'],
			message: 'Preview deployments must reference the preview record they materialize'
		})
	}

	if (record.channel === 'production' && record.previewId) {
		ctx.addIssue({
			code: 'custom',
			path: ['previewId'],
			message: 'Production deployments should not reference previewId'
		})
	}
})

export const devflareAccountLayerRecordSchema = z.discriminatedUnion('kind', [
	devflarePreviewRecordSchema,
	devflarePreviewScopeRecordSchema,
	devflareDeploymentRecordSchema
])

export type CloudflareUserId = z.output<typeof cloudflareUserIdSchema>
export type DevflareAccountRecord = z.output<typeof devflareAccountRecordSchema>
export type DevflareRecordSource = z.output<typeof devflareRecordSourceSchema>
export type DevflarePreviewStatus = z.output<typeof devflarePreviewStatusSchema>
export type DevflarePreviewScopeStatus = z.output<typeof devflarePreviewScopeStatusSchema>
export type DevflareDeploymentChannel = z.output<typeof devflareDeploymentChannelSchema>
export type DevflareDeploymentStatus = z.output<typeof devflareDeploymentStatusSchema>
export type DevflarePreviewRecord = z.output<typeof devflarePreviewRecordSchema>
export type DevflarePreviewScopeRecord = z.output<typeof devflarePreviewScopeRecordSchema>
export type DevflareDeploymentRecord = z.output<typeof devflareDeploymentRecordSchema>
export type DevflareAccountLayerRecord = z.output<typeof devflareAccountLayerRecordSchema>
