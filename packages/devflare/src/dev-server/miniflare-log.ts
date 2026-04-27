const ANSI_ESCAPE_REGEX = /\u001B\[[0-9;]*m/g

const COMPATIBILITY_DATE_FALLBACK_REGEX = /^The latest compatibility date supported by the installed Cloudflare Workers Runtime is "([^"]+)", but you've requested "([^"]+)"\. Falling back to "([^"]+)"\.\.\.$/

export interface MiniflareCompatibilityLogger {
	info(message: string): void
}

const MINIFLARE_LOG_LEVEL_FALLBACKS = {
	WARN: 2,
	DEBUG: 4
} as const

interface MiniflareLogLike {
	warn(message: string): void
	info(message: string): void
}

type MiniflareLogConstructor = new (level?: number) => MiniflareLogLike
type MiniflareLogLevelName = keyof typeof MINIFLARE_LOG_LEVEL_FALLBACKS
type MiniflareLogLevelExport = Partial<Record<MiniflareLogLevelName, number>> | undefined

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

export function resolveMiniflareLogLevel(
	logLevel: MiniflareLogLevelExport,
	levelName: MiniflareLogLevelName
): number {
	return logLevel?.[levelName] ?? MINIFLARE_LOG_LEVEL_FALLBACKS[levelName]
}

export function createMiniflareLog<TBase extends MiniflareLogConstructor>(
	BaseLog: TBase | undefined,
	logLevel: MiniflareLogLevelExport,
	levelName: MiniflareLogLevelName,
	logger?: MiniflareCompatibilityLogger
): InstanceType<TBase> | undefined {
	if (!BaseLog) {
		return undefined
	}

	return createCompatibilityAwareMiniflareLog(
		BaseLog,
		resolveMiniflareLogLevel(logLevel, levelName),
		logger
	)
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
