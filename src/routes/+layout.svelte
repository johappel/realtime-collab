<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import { page } from '$app/stores';

	let { children } = $props();

	onMount(() => {
		theme.init();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="h-screen flex flex-col bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-200">
	<header class="border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between bg-gray-50 dark:bg-gray-800">
		<div class="flex items-center gap-6">
			<a href="/" class="font-bold text-lg tracking-tight">Realtime Collab</a>
			
			<nav class="flex gap-4 text-sm font-medium">
				<a href="/editor/demo" class:text-blue-600={$page.url.pathname.startsWith('/editor')} class="hover:text-blue-500">Editor</a>
				<a href="/mindmap/demo" class:text-blue-600={$page.url.pathname.startsWith('/mindmap')} class="hover:text-blue-500">Mindmap</a>
				<a href="/todo/demo" class:text-blue-600={$page.url.pathname.startsWith('/todo')} class="hover:text-blue-500">Todo</a>
				<a href="/whiteboard/demo" class:text-blue-600={$page.url.pathname.startsWith('/whiteboard')} class="hover:text-blue-500">Whiteboard</a>
			</nav>
		</div>

		<button 
			onclick={() => theme.toggle()}
			class="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
			aria-label="Toggle Dark Mode"
		>
			{#if theme.isDark}
				<!-- Sun Icon -->
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M17.36 17.36l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="M4.22 19.78l1.42-1.42"/><path d="M17.36 6.64l1.42-1.42"/></svg>
			{:else}
				<!-- Moon Icon -->
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
			{/if}
		</button>
	</header>

	<main class="flex-1 flex flex-col relative overflow-hidden">
		{@render children()}
	</main>
</div>
