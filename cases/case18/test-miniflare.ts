// Test Miniflare with ChatRoom bundle
import { Miniflare, Log, LogLevel } from '../../packages/devflare/node_modules/miniflare'

async function test() {
	const mf = new Miniflare({
		modules: true,
		script: `export default { async fetch() { return new Response('ok') } }`,
		workers: [{
			name: 'do-chatroom',
			modules: true,
			scriptPath: '.devflare/do-bundles/ChatRoom/index.js',
			compatibilityDate: '2025-01-07',
			compatibilityFlags: ['nodejs_compat'],
			durableObjects: { CHAT_ROOM: 'ChatRoom' }
		}],
		durableObjects: { CHAT_ROOM: { className: 'ChatRoom', scriptName: 'do-chatroom' } },
		log: new Log(LogLevel.DEBUG)
	})

	await mf.ready
	console.log('✅ Miniflare started with ChatRoom DO!')

	// Get bindings from the main worker
	const bindings = await mf.getBindings()
	console.log('✅ Available bindings:', Object.keys(bindings))

	// Try to get a DO instance via bindings
	const CHAT_ROOM = bindings.CHAT_ROOM as DurableObjectNamespace
	const id = CHAT_ROOM.idFromName('test-room')
	console.log('✅ Got DO id:', id.toString())

	await mf.dispose()
	console.log('✅ Miniflare disposed - ChatRoom DO works!')
}

test().catch(e => {
	console.error('❌ Test error:', e)
	process.exit(1)
})
