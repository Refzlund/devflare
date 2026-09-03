// =============================================================================
// Integration Test Mocks — Index
// =============================================================================

export { createVirtualFS, VirtualFileSystem } from './virtual-fs'
export {
	createMockExeca,
	createEmptyMockExeca,
	createMockProcessRunner,
	MockExeca,
	type CommandExecution,
	type MockExecResult,
	type CommandMatcher
} from './mock-execa'
export {
	createTestHarness,
	createStandardProjectHarness,
	createParsedArgs,
	STANDARD_PROJECT_FILES,
	type TestHarness,
	type TestHarnessOptions,
	type TestLogger
} from './harness'
