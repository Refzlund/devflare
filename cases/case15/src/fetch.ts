// =============================================================================
// Case 15: AI & Vectorize — Fetch Handler
// =============================================================================
// Demonstrates AI inference and vector search using Cloudflare bindings.
// NOTE: AI and Vectorize ALWAYS require `remote: true` — no local simulation.
// =============================================================================

import { env } from 'devflare'

/**
 * Embedding result from AI model
 */
interface EmbeddingResult {
	shape: number[]
	data: number[][]
}

/**
 * Text generation result
 */
interface TextGenerationResult {
	response: string
}

/**
 * Vector search match
 */
interface VectorMatch {
	id: string
	score: number
	metadata?: Record<string, unknown>
}

/**
 * Generate embeddings for text using AI binding
 */
export async function generateEmbedding(
	ai: DevflareEnv['AI'],
	text: string,
	model: string
): Promise<number[]> {
	const result = await ai.run(model as keyof AiModels, { text: [text] }) as EmbeddingResult
	return result.data[0]
}

/**
 * Generate text using AI binding
 */
export async function generateText(
	ai: DevflareEnv['AI'],
	prompt: string,
	model: string,
	options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
	const result = await ai.run(model as keyof AiModels, {
		prompt,
		max_tokens: options?.maxTokens ?? 256,
		temperature: options?.temperature ?? 0.7
	}) as TextGenerationResult

	return result.response
}

/**
 * Search for similar vectors
 */
export async function searchSimilar(
	vectorize: DevflareEnv['VECTORIZE'],
	embedding: number[],
	topK = 5
): Promise<VectorMatch[]> {
	const result = await vectorize.query(embedding, {
		topK,
		returnMetadata: 'all'
	})

	return result.matches.map((match) => ({
		id: match.id,
		score: match.score,
		metadata: match.metadata as Record<string, unknown> | undefined
	}))
}

/**
 * Insert vector into index
 */
export async function insertVector(
	vectorize: DevflareEnv['VECTORIZE'],
	id: string,
	embedding: number[],
	metadata?: Record<string, VectorizeVectorMetadata>
): Promise<void> {
	await vectorize.upsert([
		{
			id,
			values: embedding,
			metadata
		}
	])
}

/**
 * Fetch handler for AI & Vectorize demo
 */
export default async function fetch(request: Request): Promise<Response> {
	const url = new URL(request.url)

	// Generate embedding for text
	if (url.pathname === '/embed') {
		const text = url.searchParams.get('text')
		if (!text) {
			return Response.json({ error: 'Missing text parameter' }, { status: 400 })
		}

		const embedding = await generateEmbedding(env.AI, text, env.EMBEDDING_MODEL)
		return Response.json({ embedding, dimensions: embedding.length })
	}

	// Generate text completion
	if (url.pathname === '/generate') {
		const prompt = url.searchParams.get('prompt')
		if (!prompt) {
			return Response.json({ error: 'Missing prompt parameter' }, { status: 400 })
		}

		const response = await generateText(env.AI, prompt, env.TEXT_MODEL)
		return Response.json({ response })
	}

	// Semantic search
	if (url.pathname === '/search') {
		const query = url.searchParams.get('q')
		if (!query) {
			return Response.json({ error: 'Missing query parameter' }, { status: 400 })
		}

		// Generate embedding for query
		const queryEmbedding = await generateEmbedding(env.AI, query, env.EMBEDDING_MODEL)

		// Search for similar vectors
		const matches = await searchSimilar(env.VECTORIZE, queryEmbedding)

		return Response.json({ query, matches })
	}

	// Index a document
	if (url.pathname === '/index' && request.method === 'POST') {
		const body = await request.json() as {
			id: string
			text: string
			metadata?: Record<string, unknown>
		}

		// Generate embedding
		const embedding = await generateEmbedding(env.AI, body.text, env.EMBEDDING_MODEL)

		// Store in Vectorize
		await insertVector(env.VECTORIZE, body.id, embedding, {
			...body.metadata,
			text: body.text
		})

		return Response.json({ success: true, id: body.id })
	}

	// RAG (Retrieval Augmented Generation)
	if (url.pathname === '/rag') {
		const query = url.searchParams.get('q')
		if (!query) {
			return Response.json({ error: 'Missing query parameter' }, { status: 400 })
		}

		// Step 1: Generate embedding for query
		const queryEmbedding = await generateEmbedding(env.AI, query, env.EMBEDDING_MODEL)

		// Step 2: Search for relevant documents
		const matches = await searchSimilar(env.VECTORIZE, queryEmbedding, 3)

		// Step 3: Build context from retrieved documents
		const context = matches
			.map((m) => m.metadata?.text as string ?? '')
			.filter(Boolean)
			.join('\n\n')

		// Step 4: Generate response with context
		const prompt = `Based on the following context, answer the question.

Context:
${context}

Question: ${query}

Answer:`

		const response = await generateText(env.AI, prompt, env.TEXT_MODEL, {
			maxTokens: 512
		})

		return Response.json({
			query,
			context: matches.map((m) => ({
				id: m.id,
				score: m.score,
				text: m.metadata?.text
			})),
			response
		})
	}

	return Response.json({
		endpoints: [
			'GET /embed?text=...',
			'GET /generate?prompt=...',
			'GET /search?q=...',
			'POST /index { id, text, metadata }',
			'GET /rag?q=...'
		]
	})
}
