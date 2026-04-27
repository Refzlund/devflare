export type InlineTextSegment =
	| {
			kind: 'text' | 'code'
			value: string
	  }
	| {
			kind: 'link'
			value: string
			href: string
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

function appendLinkSegment(segments: InlineTextSegment[], value: string, href: string): void {
	segments.push({
		kind: 'link',
		value,
		href
	})
}

function readLink(
	value: string,
	start: number
): { label: string; href: string; end: number } | undefined {
	const labelEnd = value.indexOf(']', start + 1)
	if (labelEnd === -1 || value[labelEnd + 1] !== '(') {
		return undefined
	}

	const hrefEnd = value.indexOf(')', labelEnd + 2)
	if (hrefEnd === -1) {
		return undefined
	}

	const label = value.slice(start + 1, labelEnd)
	const href = value.slice(labelEnd + 2, hrefEnd)
	if (!label || !href) {
		return undefined
	}

	return { label, href, end: hrefEnd + 1 }
}

export function parseInlineText(value: string): InlineTextSegment[] {
	const segments: InlineTextSegment[] = []
	let currentSegment = ''
	let inCode = false
	let index = 0

	while (index < value.length) {
		const character = value[index]

		if (!inCode && character === '[') {
			const link = readLink(value, index)
			if (link !== undefined) {
				appendTextSegment(segments, currentSegment)
				appendLinkSegment(segments, link.label, link.href)
				currentSegment = ''
				index = link.end
				continue
			}
		}

		if (character !== '`') {
			currentSegment += character
			index += 1
			continue
		}

		if (inCode) {
			appendCodeSegment(segments, currentSegment)
			currentSegment = ''
			inCode = false
			index += 1
			continue
		}

		appendTextSegment(segments, currentSegment)
		currentSegment = ''
		inCode = true
		index += 1
	}

	if (inCode) {
		appendTextSegment(segments, `\`${currentSegment}`)
		return segments
	}

	appendTextSegment(segments, currentSegment)
	return segments
}
