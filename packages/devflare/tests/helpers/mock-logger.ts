import { mock } from 'bun:test'

export interface TestLogger {
	info: ReturnType<typeof mock>
	warn: ReturnType<typeof mock>
	error: ReturnType<typeof mock>
	success: ReturnType<typeof mock>
	debug: ReturnType<typeof mock>
	log?: ReturnType<typeof mock>
	messages: Array<{ level: string; args: unknown[] }>
}

export interface CreateLoggerOptions {
	includeLog?: boolean
}

const ANSI_REGEX = /\x1b\[[0-9;]*m/g

export function stripAnsi(value: string): string {
	return value.replace(ANSI_REGEX, '')
}

export function renderMessages(logger: Pick<TestLogger, 'messages'>): string[] {
	return logger.messages.map((message) => stripAnsi(message.args.join(' ')))
}

export function createLogger(options: CreateLoggerOptions = {}): TestLogger {
	const includeLog = options.includeLog !== false
	const messages: Array<{ level: string; args: unknown[] }> = []

	const createMethod = (level: string) =>
		mock((...args: unknown[]) => {
			messages.push({ level, args })
		})

	return {
		info: createMethod('info'),
		warn: createMethod('warn'),
		error: createMethod('error'),
		success: createMethod('success'),
		debug: createMethod('debug'),
		...(includeLog ? { log: createMethod('log') } : {}),
		messages
	}
}
