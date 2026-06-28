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
 * It also statically checks that every bare package the bundle imports is
 * declared in `dependencies`/`peerDependencies`/`optionalDependencies`. The
 * import smoke alone cannot catch an undeclared dependency, because in the
 * monorepo such a package is still resolvable via hoisting — but a real
 * consumer install would fail. (This happened: `typescript` was imported at
 * runtime by the test/vite tooling yet declared only as a devDependency.)
 *
 * Exits non-zero if any entrypoint fails to import, exports nothing, or the
 * bundle imports an undeclared package.
 */
import { isBuiltin } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Glob } from 'bun'
import { init, parse } from 'es-module-lexer'

interface ExportTarget {
	browser?: string
	import?: string
	default?: string
}

const pkgDir = resolve(import.meta.dir, '..')
const pkg = (await Bun.file(resolve(pkgDir, 'package.json')).json()) as {
	exports: Record<string, string | ExportTarget>
	dependencies?: Record<string, string>
	peerDependencies?: Record<string, string>
	optionalDependencies?: Record<string, string>
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

// Every bare package the bundle imports must be a declared dependency, else a
// consumer install (without the monorepo's hoisting) fails at runtime.
const declared = new Set([
	...Object.keys(pkg.dependencies ?? {}),
	...Object.keys(pkg.peerDependencies ?? {}),
	...Object.keys(pkg.optionalDependencies ?? {})
])
const packageOf = (spec: string): string => {
	const parts = spec.split('/')
	return spec.startsWith('@') ? `${parts[0]}/${parts[1]}` : (parts[0] ?? spec)
}
// Specifiers a consumer's environment provides, not npm packages: node/workers
// runtime builtins, framework virtual modules (SvelteKit `$app`/`$env`/…), and
// self-references to this package's own subpaths.
const isProvided = (spec: string): boolean =>
	isBuiltin(spec) ||
	spec.startsWith('cloudflare:') ||
	spec.startsWith('$') ||
	spec === 'devflare' ||
	spec.startsWith('devflare/')

await init
const undeclared = new Map<string, string>() // package -> first dist file seen in
for await (const rel of new Glob('**/*.js').scan(resolve(pkgDir, 'dist'))) {
	const text = await Bun.file(resolve(pkgDir, 'dist', rel)).text()
	const [imports] = parse(text)
	for (const imp of imports) {
		const spec = imp.n // statically-resolvable specifier (undefined for dynamic exprs)
		if (!spec || spec.startsWith('.') || isProvided(spec)) continue
		const name = packageOf(spec)
		if (!declared.has(name) && !undeclared.has(name)) undeclared.set(name, rel)
	}
}
if (undeclared.size > 0) {
	console.error(`verify-dist: ${undeclared.size} undeclared runtime dependenc(ies):`)
	for (const [name, rel] of undeclared) console.error(`  ✗ ${name} (imported by dist/${rel})`)
	console.error('  Add each to dependencies/peerDependencies in package.json.')
	process.exit(1)
}
console.log('verify-dist: all bundle imports are declared dependencies')
