export interface InlineTextSegment {
	kind: 'text' | 'code'
	value: string
}

function appendTextSegment(segments: InlineTextSegment[], value: string): void {
	if (!value) {
		return
	}

	const previousSegment = segments.at(-1)
	if (previousSegment?.kind === 'text') {
		previousSegment.value += value
		return
	}

	segments.push({
		kind: 'text',
		value
	})
}

function appendCodeSegment(segments: InlineTextSegment[], value: string): void {
	if (!value) {
		appendTextSegment(segments, '``')
		return
	}

	segments.push({
		kind: 'code',
		value
	})
}

export function parseInlineText(value: string): InlineTextSegment[] {
	const segments: InlineTextSegment[] = []
	let currentSegment = ''
	let inCode = false

	for (const character of value) {
		if (character !== '`') {
			currentSegment += character
			continue
		}

		if (inCode) {
			appendCodeSegment(segments, currentSegment)
			currentSegment = ''
			inCode = false
			continue
		}

		appendTextSegment(segments, currentSegment)
		currentSegment = ''
		inCode = true
	}

	if (inCode) {
		appendTextSegment(segments, `\`${currentSegment}`)
		return segments
	}

	appendTextSegment(segments, currentSegment)
	return segments
}
