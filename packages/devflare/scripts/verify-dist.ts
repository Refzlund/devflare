/**
 * Smoke-verify the built package: load every published entrypoint under **node**
 * (real ESM resolution, the way consumers do) and assert it produces exports.
 *
 * This exists because the publish gate runs the unit suite against `src`, so a
 * `dist` that builds "successfully" but is unimportable would otherwise ship
 * undetected. That happened once: `bun build` miscompiled the re-export barrels
 * into `export { x }` with no binding, so `devflare`, `devflare/runtime`, and
 * `devflare/test` all threw `Export 'x' is not defined in module` on import,
 * across every published version. Run this after `build`, before publish.
 *
 * Exits non-zero if any entrypoint fails to import or exports nothing.
 */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

interface ExportTarget {
	browser?: string
	import?: string
	default?: string
}

const pkgDir = resolve(import.meta.dir, '..')
const pkg = (await Bun.file(resolve(pkgDir, 'package.json')).json()) as {
	exports: Record<string, string | ExportTarget>
}

// Collect every distinct JS file across conditions (skip the package.json
// passthrough). The `browser` condition resolves to a different bundle than
// `import`, so probe both — a re-export-barrel regression could hit either.
const targets: { subpath: string; file: string }[] = []
const seen = new Set<string>()
for (const [subpath, target] of Object.entries(pkg.exports)) {
	if (typeof target === 'string') continue // ./package.json
	for (const [condition, file] of Object.entries(target)) {
		if (!file.endsWith('.js') || seen.has(file)) continue
		seen.add(file)
		const label = condition === 'browser' ? `${subpath} (browser)` : subpath
		targets.push({ subpath: label, file: resolve(pkgDir, file) })
	}
}

const failures: string[] = []
for (const { subpath, file } of targets) {
	if (!(await Bun.file(file).exists())) {
		failures.push(`${subpath}: missing build output ${file}`)
		continue
	}
	// Import in a child node process so resolution matches a real consumer
	// (not bun's more lenient loader) and a hard module error is observable.
	const url = pathToFileURL(file).href
	const proc = Bun.spawn(
		[
			'node',
			'--input-type=module',
			'-e',
			`import(${JSON.stringify(url)}).then((m) => { if (Object.keys(m).length === 0) { console.error('no exports'); process.exit(3) } }).catch((e) => { console.error(e.message); process.exit(4) })`
		],
		{ stdout: 'pipe', stderr: 'pipe' }
	)
	const code = await proc.exited
	if (code !== 0) {
		const err = (await new Response(proc.stderr).text()).trim().split('\n')[0]
		failures.push(`${subpath}: node import failed — ${err || `exit ${code}`}`)
	}
}

if (failures.length > 0) {
	console.error(`verify-dist: ${failures.length}/${targets.length} entrypoints FAILED:`)
	for (const f of failures) console.error(`  ✗ ${f}`)
	process.exit(1)
}
console.log(`verify-dist: all ${targets.length} entrypoints import cleanly under node`)
