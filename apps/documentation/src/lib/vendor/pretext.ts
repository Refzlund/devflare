export interface PreparedText { }

export interface PreparedTextWithSegments extends PreparedText { }

export interface LayoutResult {
	lineCount: number
	height: number
}

export interface PretextModule {
	prepare(
		text: string,
		font: string,
		options?: {
			whiteSpace?: 'normal' | 'pre-wrap'
			wordBreak?: 'normal' | 'keep-all'
		}
	): PreparedText
	prepareWithSegments(
		text: string,
		font: string,
		options?: {
			whiteSpace?: 'normal' | 'pre-wrap'
			wordBreak?: 'normal' | 'keep-all'
		}
	): PreparedTextWithSegments
	layout(prepared: PreparedText, maxWidth: number, lineHeight: number): LayoutResult
	measureNaturalWidth(prepared: PreparedTextWithSegments): number
}

export async function loadPretext(): Promise<PretextModule> {
	return import('@chenglou/pretext') as Promise<PretextModule>
}
