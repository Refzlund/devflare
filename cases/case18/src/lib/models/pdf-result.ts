// =============================================================================
// PdfResult — Transportable class for PDF generation results
// =============================================================================

export interface PdfResultData {
	requestId: string
	success: boolean
	pdfBase64?: string
	error?: string
	generatedAt?: number
	durationMs: number
}

export class PdfResult {
	readonly requestId: string
	readonly success: boolean
	readonly pdfBase64?: string
	readonly error?: string
	readonly generatedAt: number
	readonly durationMs: number

	constructor(data: PdfResultData) {
		this.requestId = data.requestId
		this.success = data.success
		this.pdfBase64 = data.pdfBase64
		this.error = data.error
		this.generatedAt = data.generatedAt ?? Date.now()
		this.durationMs = data.durationMs
	}

	/** Get PDF as Uint8Array */
	get pdfData(): Uint8Array | undefined {
		if (!this.pdfBase64) return undefined
		return new Uint8Array([...atob(this.pdfBase64)].map((c) => c.charCodeAt(0)))
	}

	/** Check if result is an error */
	get isError(): boolean {
		return !this.success
	}
}
