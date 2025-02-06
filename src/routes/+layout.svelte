<script>
	import { Toaster } from '$lib/components/ui/sonner';
	import { ModeWatcher } from 'mode-watcher';
	import { dev } from '$app/environment';
	import { fade } from 'svelte/transition';
	import '../app.css';

	let errorMessage = null;

	function handleError(error) {
		console.error('Application error:', error);
		errorMessage = dev ? error.message : 'An unexpected error occurred';
	}

	function clearError() {
		errorMessage = null;
	}
</script>

<svelte:window on:error={handleError} />

<div class="min-h-screen bg-gray-950 transition-colors duration-200">
	<ModeWatcher defaultMode={'dark'} />
	<Toaster richColors position="top-right" closeButton />

	{#if errorMessage}
		<div class="fixed inset-x-0 top-0 z-50 bg-red-500/10 p-4" transition:fade={{ duration: 200 }}>
			<div class="container mx-auto flex items-center justify-between">
				<p class="text-red-500">
					{errorMessage}
				</p>
				<button class="text-red-500 hover:text-red-400" on:click={clearError}> Dismiss </button>
			</div>
		</div>
	{/if}

	<main class="relative">
		{#key errorMessage}
			<div transition:fade={{ duration: 200 }}>
				<slot />
			</div>
		{/key}
	</main>

	<!-- Add a footer if needed -->
	<footer class="mt-auto py-4 text-center text-gray-500">
		<p class="text-sm">♿</p>
	</footer>
</div>

<style>
	/* Ensure the layout takes up full height */
	:global(html, body) {
		height: 100%;
	}

	/* Add smooth scrolling */
	:global(html) {
		scroll-behavior: smooth;
	}

	/* Improve focus visibility */
	:global(*:focus-visible) {
		outline: 2px solid rgb(59, 130, 246);
		outline-offset: 2px;
	}
</style>
