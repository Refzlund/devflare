// =============================================================================
// Mock D1
// =============================================================================

interface D1Result<T = unknown> {
	results: T[]
	success: boolean
	meta: { duration: number; changes: number; last_row_id: number }
}

interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement
	first<T = unknown>(column?: string): Promise<T | null>
	all<T = unknown>(): Promise<D1Result<T>>
	run(): Promise<D1Result>
	raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]>
}

export interface MockD1Options {
	/** Per-table fixtures, keyed by table name. Matched against INSERT/SELECT/UPDATE/DELETE FROM <table> */
	fixtures?: Record<string, unknown[]>
	/** Fallback results returned when no fixture matches */
	results?: unknown[]
}

const TABLE_NAME_RE = /(?:from|into|update)\s+["'`]?([a-zA-Z_][a-zA-Z0-9_]*)["'`]?/i

const extractTable = (sql: string): string | null => {
	const match = TABLE_NAME_RE.exec(sql)
	return match ? match[1] : null
}

type SqlOp = 'select' | 'insert' | 'update' | 'delete' | 'other'

const detectOp = (sql: string): SqlOp => {
	const trimmed = sql.trimStart().toLowerCase()
	if (trimmed.startsWith('select')) return 'select'
	if (trimmed.startsWith('insert')) return 'insert'
	if (trimmed.startsWith('update')) return 'update'
	if (trimmed.startsWith('delete')) return 'delete'
	return 'other'
}

/**
 * Creates a mock D1Database for testing
 *
 * @example
 * ```ts
 * // Legacy: fixed results for all queries
 * const d1 = createMockD1([{ id: 1, name: 'Alice' }])
 *
 * // Preferred: per-table fixtures
 * const d1 = createMockD1({ fixtures: { users: [{ id: 1, name: 'Alice' }] } })
 * await d1.prepare('SELECT * FROM users').all() // returns users fixture
 * ```
 */
export function createMockD1(mockResultsOrOptions: unknown[] | MockD1Options = []): D1Database {
	const options: MockD1Options = Array.isArray(mockResultsOrOptions)
		? { results: mockResultsOrOptions }
		: mockResultsOrOptions

	// Per-instance mutable table storage, seeded with fixtures
	const tables = new Map<string, unknown[]>()
	for (const [name, rows] of Object.entries(options.fixtures ?? {})) {
		tables.set(name, [...rows])
	}
	const fallback = options.results ?? []

	const resolveRows = (sql: string): { rows: unknown[]; op: SqlOp; table: string | null } => {
		const op = detectOp(sql)
		const table = extractTable(sql)
		if (table && tables.has(table)) {
			return { rows: tables.get(table) ?? [], op, table }
		}
		return { rows: [...fallback], op, table }
	}

	const createStatement = (sql: string): D1PreparedStatement => {
		let boundValues: unknown[] = []
		const statement: D1PreparedStatement = {
			bind(...values: unknown[]) {
				boundValues = values
				return statement
			},

			async first<T>(column?: string): Promise<T | null> {
				const { rows } = resolveRows(sql)
				const row = rows[0] as Record<string, unknown> | undefined
				if (!row) return null
				if (column) return row[column] as T
				return row as T
			},

			async all<T>(): Promise<D1Result<T>> {
				const { rows } = resolveRows(sql)
				return {
					results: rows as T[],
					success: true,
					meta: { duration: 0, changes: 0, last_row_id: 0 }
				}
			},

			async run(): Promise<D1Result> {
				const { op, table } = resolveRows(sql)
				let changes = 0
				let lastRowId = 0
				if (op === 'insert' && table) {
					const rows = tables.get(table) ?? []
					const bound =
						boundValues.length > 0
							? Object.fromEntries(boundValues.map((v, i) => [`col${i}`, v]))
							: {}
					rows.push(bound)
					tables.set(table, rows)
					changes = 1
					lastRowId = rows.length
				} else if (op === 'delete' && table) {
					const rows = tables.get(table) ?? []
					changes = rows.length
					tables.set(table, [])
				} else if (op === 'update' && table) {
					changes = (tables.get(table) ?? []).length
				}
				return {
					results: [],
					success: true,
					meta: { duration: 0, changes, last_row_id: lastRowId }
				}
			},

			async raw<T>(_options?: { columnNames?: boolean }): Promise<T[]> {
				const { rows } = resolveRows(sql)
				return rows.map((row) => Object.values(row as Record<string, unknown>)) as T[]
			}
		}
		return statement
	}

	return {
		prepare(query: string): D1PreparedStatement {
			return createStatement(query)
		},

		async exec(_query: string): Promise<D1Result> {
			return {
				results: [],
				success: true,
				meta: { duration: 0, changes: 0, last_row_id: 0 }
			}
		},

		async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
			return statements.map(() => ({
				results: [] as T[],
				success: true,
				meta: { duration: 0, changes: 0, last_row_id: 0 }
			}))
		},

		async dump(): Promise<ArrayBuffer> {
			return new ArrayBuffer(0)
		},

		withSession(_constraintOrBookmark?: string) {
			return this
		}
	} as unknown as D1Database
}
