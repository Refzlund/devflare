// =============================================================================
// Integration Test Mocks — Index
// =============================================================================

export {
	createParsedArgs,
	createStandardProjectHarness,
	createTestHarness,
	STANDARD_PROJECT_FILES,
	type TestHarness,
	type TestHarnessOptions,
	type TestLogger
} from './harness'
export {
	type CommandExecution,
	type CommandMatcher,
	createEmptyMockExeca,
	createMockExeca,
	createMockProcessRunner,
	MockExeca,
	type MockExecResult
} from './mock-execa'
export { createVirtualFS, VirtualFileSystem } from './virtual-fs'
