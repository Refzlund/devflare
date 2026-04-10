// =============================================================================
// Case 16: Workflows — Data Pipeline Workflow
// =============================================================================
// Demonstrates a data processing workflow with ETL steps.
// Uses wf.*.ts naming convention.
// =============================================================================

import { StepResult, WorkflowInstance } from './models'
import type { WorkflowEvent, WorkflowStep } from './wf.order-processor'

/**
 * Data pipeline input
 */
export interface DataPipelineInput {
	sourceId: string
	sourcePath: string
	destinationPath: string
	transformations: string[]
}

/**
 * Data pipeline output
 */
export interface DataPipelineOutput {
	recordsProcessed: number
	recordsFailed: number
	outputPath: string
	duration: number
}

/**
 * Data record type
 */
interface DataRecord {
	id: string
	data: Record<string, unknown>
	timestamp: string
}

/**
 * Data Pipeline Workflow
 * 
 * Steps:
 * 1. Extract data from source
 * 2. Transform data (apply transformations)
 * 3. Validate transformed data
 * 4. Load data to destination
 */
export class DataPipelineWorkflow {
	protected env: DevflareEnv

	constructor(env: DevflareEnv) {
		this.env = env
	}

	/**
	 * Main workflow execution
	 */
	async run(
		event: WorkflowEvent<DataPipelineInput>,
		step: WorkflowStep
	): Promise<DataPipelineOutput> {
		const { sourceId, sourcePath, destinationPath, transformations } = event.params
		const startTime = Date.now()

		// Create workflow instance
		const instance = new WorkflowInstance({
			id: `pipeline-${sourceId}-${Date.now()}`,
			workflowName: 'DataPipelineWorkflow',
			status: 'running',
			currentStep: 'extract',
			steps: [],
			input: event.params,
			startedAt: new Date().toISOString()
		})

		try {
			// Step 1: Extract
			instance.currentStep = 'extract'
			const extracted = await step.do('extract-data', async (): Promise<DataRecord[]> => {
				// Simulate data extraction
				const records: DataRecord[] = Array.from({ length: 100 }, (_, i) => ({
					id: `record-${i}`,
					data: {
						value: Math.random() * 100,
						category: ['A', 'B', 'C'][i % 3],
						source: sourcePath
					},
					timestamp: new Date().toISOString()
				}))

				return records
			})

			instance.addStep(new StepResult({
				stepName: 'extract-data',
				success: true,
				output: { recordCount: extracted.length },
				startedAt: new Date().toISOString(),
				completedAt: new Date().toISOString(),
				retryCount: 0
			}))

			// Step 2: Transform (apply each transformation)
			instance.currentStep = 'transform'
			let transformedData = extracted

			for (const transformation of transformations) {
				transformedData = await step.do(
					`transform-${transformation}`,
					async (): Promise<DataRecord[]> => {
						return this.applyTransformation(transformedData, transformation)
					}
				)

				instance.addStep(new StepResult({
					stepName: `transform-${transformation}`,
					success: true,
					output: { transformation, recordCount: transformedData.length },
					startedAt: new Date().toISOString(),
					completedAt: new Date().toISOString(),
					retryCount: 0
				}))
			}

			// Step 3: Validate
			instance.currentStep = 'validate'
			const validation = await step.do('validate-data', async () => {
				const valid = transformedData.filter((r) => this.validateRecord(r))
				const invalid = transformedData.length - valid.length

				return {
					validRecords: valid.length,
					invalidRecords: invalid,
					records: valid
				}
			})

			instance.addStep(new StepResult({
				stepName: 'validate-data',
				success: true,
				output: {
					validRecords: validation.validRecords,
					invalidRecords: validation.invalidRecords
				},
				startedAt: new Date().toISOString(),
				completedAt: new Date().toISOString(),
				retryCount: 0
			}))

			// Step 4: Load
			instance.currentStep = 'load'
			await step.do('load-data', async () => {
				// Simulate loading to destination
				await this.env.RESULTS.put(
					`pipeline:${sourceId}:${Date.now()}`,
					JSON.stringify({
						path: destinationPath,
						recordCount: validation.validRecords,
						completedAt: new Date().toISOString()
					})
				)

				return { loaded: validation.validRecords }
			})

			instance.addStep(new StepResult({
				stepName: 'load-data',
				success: true,
				output: { loaded: validation.validRecords },
				startedAt: new Date().toISOString(),
				completedAt: new Date().toISOString(),
				retryCount: 0
			}))

			// Complete workflow
			const output: DataPipelineOutput = {
				recordsProcessed: validation.validRecords,
				recordsFailed: validation.invalidRecords,
				outputPath: destinationPath,
				duration: Date.now() - startTime
			}

			instance.complete(output)

			await this.env.WORKFLOW_STATE.put(
				`workflow:${instance.id}`,
				JSON.stringify(instance.toData())
			)

			return output

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			instance.fail(errorMessage)

			await this.env.WORKFLOW_STATE.put(
				`workflow:${instance.id}`,
				JSON.stringify(instance.toData())
			)

			return {
				recordsProcessed: 0,
				recordsFailed: 0,
				outputPath: '',
				duration: Date.now() - startTime
			}
		}
	}

	/**
	 * Apply a transformation to data
	 */
	private applyTransformation(data: DataRecord[], transformation: string): DataRecord[] {
		switch (transformation) {
			case 'normalize':
				return data.map((r) => ({
					...r,
					data: {
						...r.data,
						value: typeof r.data.value === 'number' ? r.data.value / 100 : r.data.value
					}
				}))

			case 'filter':
				return data.filter((r) => {
					const value = r.data.value as number
					return value > 0.2
				})

			case 'enrich':
				return data.map((r) => ({
					...r,
					data: {
						...r.data,
						enrichedAt: new Date().toISOString(),
						version: '1.0'
					}
				}))

			default:
				return data
		}
	}

	/**
	 * Validate a single record
	 */
	private validateRecord(record: DataRecord): boolean {
		return (
			typeof record.id === 'string' &&
			record.id.length > 0 &&
			record.data !== null &&
			typeof record.data === 'object'
		)
	}
}

export default DataPipelineWorkflow
