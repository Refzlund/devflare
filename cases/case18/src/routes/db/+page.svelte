<script lang="ts">
	interface Todo {
		id: number
		title: string
		completed: boolean
		created_at: string
	}

	interface TodoListResponse {
		todos?: Todo[]
		error?: string
	}

	interface TodoResponse {
		success?: boolean
		todo?: Todo
		error?: string
	}

	let todos = $state<Todo[]>([])
	let loading = $state(true)
	let error = $state<string | null>(null)
	let newTodoTitle = $state('')
	let adding = $state(false)
	let editingId = $state<number | null>(null)
	let editingTitle = $state('')

	$effect(() => {
		loadTodos()
	})

	async function loadTodos() {
		loading = true
		error = null

		try {
			const response = await fetch('/db')
			const data: TodoListResponse = await response.json()

			if (data.error) {
				error = data.error
			} else if (data.todos) {
				todos = data.todos
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load todos'
		} finally {
			loading = false
		}
	}

	async function addTodo() {
		if (!newTodoTitle.trim()) return

		adding = true
		try {
			const response = await fetch('/db', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: newTodoTitle })
			})
			const data: TodoResponse = await response.json()

			if (data.success && data.todo) {
				todos = [data.todo, ...todos]
				newTodoTitle = ''
			} else if (data.error) {
				error = data.error
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to add todo'
		} finally {
			adding = false
		}
	}

	async function toggleTodo(todo: Todo) {
		try {
			const response = await fetch('/db', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: todo.id, completed: !todo.completed })
			})
			const data: TodoResponse = await response.json()

			if (data.success && data.todo) {
				todos = todos.map((t) =>
					t.id === todo.id ? data.todo! : t
				)
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to update todo'
		}
	}

	async function deleteTodo(id: number) {
		try {
			const response = await fetch(`/db?id=${id}`, { method: 'DELETE' })
			const data: { success?: boolean } = await response.json()

			if (data.success) {
				todos = todos.filter((t) => t.id !== id)
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to delete todo'
		}
	}

	function startEdit(todo: Todo) {
		editingId = todo.id
		editingTitle = todo.title
	}

	async function saveEdit() {
		if (!editingId || !editingTitle.trim()) {
			editingId = null
			return
		}

		try {
			const response = await fetch('/db', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: editingId, title: editingTitle })
			})
			const data: TodoResponse = await response.json()

			if (data.success && data.todo) {
				todos = todos.map((t) =>
					t.id === editingId ? data.todo! : t
				)
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to update todo'
		} finally {
			editingId = null
		}
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString()
	}

	const completedCount = $derived(todos.filter((t) => t.completed).length)
</script>

<div class="db-page">
	<h2>🗃️ Database (D1)</h2>
	<p class="description">Todo list using Cloudflare D1 SQLite database.</p>

	{#if error}
		<div class="error">
			<p>❌ {error}</p>
			<button onclick={() => (error = null)}>Dismiss</button>
		</div>
	{/if}

	<div class="add-form">
		<input
			type="text"
			bind:value={newTodoTitle}
			placeholder="What needs to be done?"
			onkeydown={(e) => e.key === 'Enter' && addTodo()}
		/>
		<button onclick={addTodo} disabled={adding || !newTodoTitle.trim()}>
			{adding ? 'Adding...' : 'Add Todo'}
		</button>
	</div>

	<div class="stats">
		<span>{todos.length} total</span>
		<span>{completedCount} completed</span>
		<span>{todos.length - completedCount} remaining</span>
	</div>

	{#if loading}
		<div class="loading">Loading todos...</div>
	{:else if todos.length === 0}
		<div class="empty">
			<p>No todos yet. Add one above!</p>
		</div>
	{:else}
		<ul class="todo-list">
			{#each todos as todo}
				<li class:completed={todo.completed}>
					<label class="checkbox">
						<input
							type="checkbox"
							checked={todo.completed}
							onchange={() => toggleTodo(todo)}
						/>
						<span class="checkmark"></span>
					</label>

					{#if editingId === todo.id}
						<input
							type="text"
							class="edit-input"
							bind:value={editingTitle}
							onblur={saveEdit}
							onkeydown={(e) => e.key === 'Enter' && saveEdit()}
						/>
					{:else}
						<span
							class="title"
							ondblclick={() => startEdit(todo)}
							onkeydown={(e) => e.key === 'Enter' && startEdit(todo)}
							role="button"
							tabindex="0"
							aria-label={`Edit todo: ${todo.title}`}
						>
							{todo.title}
						</span>
					{/if}

					<span class="date">{formatDate(todo.created_at)}</span>

					<button
						class="delete-btn"
						onclick={() => deleteTodo(todo.id)}
						title="Delete"
					>
						×
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.db-page {
		max-width: 600px;
		margin: 0 auto;
	}

	h2 {
		color: #333;
		margin-bottom: 0.5rem;
	}

	.description {
		color: #666;
		margin-bottom: 1.5rem;
	}

	.error {
		background: #ffebee;
		color: #c62828;
		padding: 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.error button {
		background: #c62828;
		color: white;
		border: none;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		cursor: pointer;
	}

	.add-form {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.add-form input {
		flex: 1;
		padding: 0.75rem 1rem;
		border: 2px solid #e0e0e0;
		border-radius: 8px;
		font-size: 1rem;
	}

	.add-form input:focus {
		outline: none;
		border-color: #f48225;
	}

	.add-form button {
		padding: 0.75rem 1.5rem;
		background: #4caf50;
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		cursor: pointer;
	}

	.add-form button:disabled {
		background: #ccc;
	}

	.stats {
		display: flex;
		gap: 1rem;
		font-size: 0.85rem;
		color: #666;
		margin-bottom: 1rem;
		padding: 0.5rem;
		background: #f5f5f5;
		border-radius: 4px;
	}

	.loading,
	.empty {
		text-align: center;
		padding: 2rem;
		color: #999;
	}

	.todo-list {
		list-style: none;
		background: white;
		border-radius: 8px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		overflow: hidden;
	}

	.todo-list li {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		border-bottom: 1px solid #f0f0f0;
	}

	.todo-list li:last-child {
		border-bottom: none;
	}

	.todo-list li.completed .title {
		text-decoration: line-through;
		color: #999;
	}

	.checkbox {
		position: relative;
		cursor: pointer;
	}

	.checkbox input {
		position: absolute;
		opacity: 0;
		cursor: pointer;
	}

	.checkmark {
		display: block;
		width: 22px;
		height: 22px;
		border: 2px solid #ddd;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.checkbox input:checked ~ .checkmark {
		background: #4caf50;
		border-color: #4caf50;
	}

	.checkbox input:checked ~ .checkmark::after {
		content: '✓';
		color: white;
		display: flex;
		justify-content: center;
		font-size: 0.9rem;
	}

	.title {
		flex: 1;
		cursor: pointer;
	}

	.edit-input {
		flex: 1;
		padding: 0.25rem 0.5rem;
		border: 1px solid #f48225;
		border-radius: 4px;
		font-size: 1rem;
	}

	.date {
		font-size: 0.75rem;
		color: #999;
	}

	.delete-btn {
		background: transparent;
		border: none;
		color: #c62828;
		font-size: 1.5rem;
		cursor: pointer;
		opacity: 0.5;
		transition: opacity 0.2s;
		width: 28px;
		height: 28px;
	}

	.delete-btn:hover {
		opacity: 1;
	}
</style>
