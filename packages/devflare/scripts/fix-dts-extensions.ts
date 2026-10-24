/**
 * Add explicit module extensions to the relative import/export specifiers in
 * the emitted declaration files.
 *
 * tsgo emits extensionless relative specifiers (`export … from './config'`),
 * which `moduleResolution: bundler` accepts but `node16`/`nodenext` rejects
 * ("Internal resolution error" in are-the-types-wrong) — under those modes a
 * relative import in an ESM `.d.ts` MUST carry an explicit `.js` extension (or
 * `/index.js` for a directory). This pass rewrites only the specifier strings;
 * it never touches the declared types, so it is provably type-preserving.
 *
 * It is intentionally conservative: a specifier is rewritten only when its
 * resolved target actually exists as a sibling `.d.ts` (→ `.js`) or a directory
 * with `index.d.ts` (→ `/index.js`). Anything else is left untouched and
 * reported, so a genuinely dangling import surfaces instead of being masked.
 */
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Glob } from 'bun'

const distDir = resolve(import.meta.dir, '..', 'dist')

let filesChanged = 0
let importsRewritten = 0
const unresolved = new Set<string>()

const RELATIVE = /\.(js|cjs|mjs|json)$/

for await (const rel of new Glob('**/*.d.ts').scan(distDir)) {
	const file = resolve(distDir, rel)
	const fileDir = dirname(file)
	let changed = false

	const resolveSpec = (spec: string): string | null => {
		if (!spec.startsWith('.') || RELATIVE.test(spec)) return null
		const target = resolve(fileDir, spec)
		if (existsSync(`${target}.d.ts`)) return `${spec}.js`
		if (existsSync(resolve(target, 'index.d.ts'))) return `${spec}/index.js`
		unresolved.add(`${rel}: ${spec}`)
		return null
	}

	const original = await Bun.file(file).text()
	const rewritten = original
		// `… from './x'` (import/export/`export *`) and type-position `import('./x')`
		.replace(/(\bfrom\s*['"])(\.[^'"]+)(['"])/g, (m, pre, spec, post) => {
			const next = resolveSpec(spec)
			if (!next) return m
			changed = true
			importsRewritten++
			return `${pre}${next}${post}`
		})
		.replace(/(\bimport\(\s*['"])(\.[^'"]+)(['"]\s*\))/g, (m, pre, spec, post) => {
			const next = resolveSpec(spec)
			if (!next) return m
			changed = true
			importsRewritten++
			return `${pre}${next}${post}`
		})
		// bare side-effect import: `import '../env';` (a quote directly after
		// `import` — distinct from `import x from …` and `import(…)`)
		.replace(/(\bimport\s+['"])(\.[^'"]+)(['"])/g, (m, pre, spec, post) => {
			const next = resolveSpec(spec)
			if (!next) return m
			changed = true
			importsRewritten++
			return `${pre}${next}${post}`
		})

	if (changed) {
		await Bun.write(file, rewritten)
		filesChanged++
	}
}

console.log(
	`fix-dts-extensions: rewrote ${importsRewritten} specifiers across ${filesChanged} files`
)
if (unresolved.size > 0) {
	console.log(`  ${unresolved.size} relative specifiers had no resolvable target (left as-is):`)
	for (const u of [...unresolved].sort().slice(0, 30)) console.log(`    ${u}`)
}
