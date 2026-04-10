// =============================================================================
// Case 16: Workflows — Transport
// =============================================================================
// Transport object for encoding/decoding custom types across RPC boundaries.
// This follows the SvelteKit signature pattern used in devflare.
// =============================================================================

import {
	Order,
	StepResult,
	WorkflowInstance,
	type OrderData,
	type StepResultData,
	type WorkflowInstanceData
} from './models'

export const transport = {
	Order: {
		encode: (v: unknown): OrderData | false =>
			v instanceof Order && v.toData(),
		decode: (v: OrderData) => new Order(v)
	},

	StepResult: {
		encode: (v: unknown): StepResultData | false =>
			v instanceof StepResult && v.toData(),
		decode: (v: StepResultData) => new StepResult(v)
	},

	WorkflowInstance: {
		encode: (v: unknown): WorkflowInstanceData | false =>
			v instanceof WorkflowInstance && v.toData(),
		decode: (v: WorkflowInstanceData) => new WorkflowInstance(v)
	}
}
