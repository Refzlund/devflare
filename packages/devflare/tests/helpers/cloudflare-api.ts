export function jsonResponse(result: unknown, resultInfo?: Record<string, unknown>): Response {
	return new Response(JSON.stringify({
		success: true,
		errors: [],
		messages: [],
		result,
		...(resultInfo ? { result_info: resultInfo } : {})
	}), {
		headers: {
			'Content-Type': 'application/json'
		}
	})
}

export function createD1ResultsResponse(results: unknown[] = []): Response {
	return jsonResponse([
		{
			success: true,
			meta: {
				served_by: 'test',
				duration: 0,
				changes: 0,
				last_row_id: 0,
				changed_db: false,
				size_after: 0,
				rows_read: results.length,
				rows_written: 0
			},
			results
		}
	])
}