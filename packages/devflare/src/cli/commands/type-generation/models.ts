import type { DiscoveredEntrypoint } from '../../../utils/entrypoint-discovery'

export interface DiscoveredDO {
	className: string
	filePath: string
	bindingName: string
}

export interface ServiceBindingInfo {
	bindingName: string
	entrypoint?: string
	interfaceImport?: string
	interfaceType?: string
}

export interface CrossWorkerDOInfo {
	bindingName: string
	doName: string
	className: string
	filePath: string
}

export interface ReferencedConfig {
	varName: string
	importPath: string
	refDir: string
	entrypoints: DiscoveredEntrypoint[]
	serviceBindings: ServiceBindingInfo[]
	durableObjects: CrossWorkerDOInfo[]
}
