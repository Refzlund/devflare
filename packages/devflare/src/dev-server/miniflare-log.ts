const ANSI_ESCAPE_REGEX = /\u001B\[[0-9;]*m/g

const COMPATIBILITY_DATE_FALLBACK_REGEX = /^The latest compatibility date supported by the installed Cloudflare Workers Runtime is "([^"]+)", but you've requested "([^"]+)"\. Falling back to "([^"]+)"\.\.\.$/

export interface MiniflareCompatibilityLogger {
	info(message: string): void
}

interface MiniflareLogLike {
	warn(message: string): void
	info(message: string): void
}

type MiniflareLogConstructor = new (level?: number) => MiniflareLogLike

function normalizeMiniflareMessage(message: string): string {
	return message
		.replace(ANSI_ESCAPE_REGEX, '')
		.replace(/\s+/g, ' ')
		.trim()
}

export function formatCompatibilityDateFallbackNotice(message: string): string | null {
	const normalizedMessage = normalizeMiniflareMessage(message)
	const match = COMPATIBILITY_DATE_FALLBACK_REGEX.exec(normalizedMessage)

	if (!match) {
		return null
	}

	const [, _supportedDate, requestedDate, fallbackDate] = match
	return `Using latest supported Cloudflare Workers Runtime compatibility date ${fallbackDate} (requested ${requestedDate})`
}

export function createCompatibilityAwareMiniflareLog<TBase extends MiniflareLogConstructor>(
	BaseLog: TBase,
	level: number,
	logger?: MiniflareCompatibilityLogger
): InstanceType<TBase> {
	const log = new BaseLog(level) as InstanceType<TBase> & MiniflareLogLike
	const originalWarn = log.warn.bind(log)
	const originalInfo = log.info.bind(log)

	log.warn = (message: string): void => {
		const notice = formatCompatibilityDateFallbackNotice(message)

		if (!notice) {
			originalWarn(message)
			return
		}

		if (logger) {
			logger.info(notice)
			return
		}

		originalInfo(notice)
	}

	return log as InstanceType<TBase>
}