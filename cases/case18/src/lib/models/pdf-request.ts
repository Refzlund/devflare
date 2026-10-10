// =============================================================================
// PdfRequest — Transportable class for PDF generation requests
// =============================================================================

export interface PdfOptions {
	format: 'A4' | 'Letter' | 'Legal'
	landscape: boolean
	printBackground: boolean
	margin: {
		top: string
		right: string
		bottom: string
		left: string
	}
}

export interface PdfRequestData {
	id?: string
	url: string
	options?: Partial<PdfOptions>
	createdAt?: number
}

export class PdfRequest {
	readonly id: string
	readonly url: string
	readonly options: PdfOptions
	readonly createdAt: number

	constructor(data: PdfRequestData) {
		this.id = data.id ?? crypto.randomUUID()
		this.url = data.url
		this.createdAt = data.createdAt ?? Date.now()
		this.options = {
			format: data.options?.format ?? 'A4',
			landscape: data.options?.landscape ?? false,
			printBackground: data.options?.printBackground ?? true,
			margin: data.options?.margin ?? {
				top: '1cm',
				right: '1cm',
				bottom: '1cm',
				left: '1cm'
			}
		}
	}
}
