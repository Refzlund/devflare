import type { DevflareConfig } from '../schema'
import type { WranglerConfig } from './types'

export function compileWranglerMigrations(
	migrations: NonNullable<DevflareConfig['migrations']>
): NonNullable<WranglerConfig['migrations']> {
	return migrations.map((migration) => ({
		tag: migration.tag,
		...(migration.new_classes && { new_classes: migration.new_classes }),
		...(migration.renamed_classes && {
			renamed_classes: migration.renamed_classes.map((renamedClass) => ({
				from: renamedClass.from,
				to: renamedClass.to
			}))
		}),
		...(migration.deleted_classes && { deleted_classes: migration.deleted_classes }),
		...(migration.new_sqlite_classes && { new_sqlite_classes: migration.new_sqlite_classes })
	}))
}

export function compileModuleOptions(config: DevflareConfig, result: WranglerConfig): void {
	if (config.rules && config.rules.length > 0) {
		result.rules = config.rules
	}

	if (config.findAdditionalModules !== undefined) {
		result.find_additional_modules = config.findAdditionalModules
	}

	if (config.baseDir) {
		result.base_dir = config.baseDir
	}

	if (config.preserveFileNames !== undefined) {
		result.preserve_file_names = config.preserveFileNames
	}

	if (config.logpush !== undefined) {
		result.logpush = config.logpush
	}

	if (config.uploadSourceMaps !== undefined) {
		result.upload_source_maps = config.uploadSourceMaps
	}

	if (config.keepVars !== undefined) {
		result.keep_vars = config.keepVars
	}
}

export function compileContainers(config: DevflareConfig, result: WranglerConfig): void {
	if (!config.containers || config.containers.length === 0) {
		return
	}

	result.containers = config.containers.map((container) => ({
		class_name: container.className,
		image: container.image,
		...(container.maxInstances !== undefined && { max_instances: container.maxInstances }),
		...(container.instanceType && { instance_type: container.instanceType }),
		...(container.name && { name: container.name }),
		...(container.imageBuildContext && { image_build_context: container.imageBuildContext }),
		...(container.imageVars && { image_vars: container.imageVars }),
		...(container.rolloutActiveGracePeriod !== undefined && {
			rollout_active_grace_period: container.rolloutActiveGracePeriod
		}),
		...(container.rolloutStepPercentage !== undefined && {
			rollout_step_percentage: container.rolloutStepPercentage
		})
	}))
}
