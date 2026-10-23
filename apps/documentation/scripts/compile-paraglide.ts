import { compile } from '@inlang/paraglide-js'
import { documentationUrlPatterns } from '../paraglide-routing'

await compile({
	project: './project.inlang',
	outdir: './src/lib/paraglide',
	emitTsDeclarations: true,
	strategy: ['url', 'baseLocale'],
	urlPatterns: documentationUrlPatterns
})
