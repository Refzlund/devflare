// =============================================================================
// File Router Types
// =============================================================================

export type RouteSegment =
	| {
			readonly type: 'static'
			readonly value: string
	  }
	| {
			readonly type: 'param'
			readonly name: string
	  }
	| {
			readonly type: 'rest'
			readonly name: string
	  }
	| {
			readonly type: 'optional-rest'
			readonly name: string
	  }

export interface RouteModuleDefinition {
	readonly filePath: string
	readonly routePath: string
	readonly segments: readonly RouteSegment[]
	readonly module: Record<string, unknown>
}

export interface RouteMatchResult {
	readonly route: RouteModuleDefinition
	readonly params: Record<string, string>
}
