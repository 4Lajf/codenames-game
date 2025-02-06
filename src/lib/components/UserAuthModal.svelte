<script>
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Dialog, DialogContent, DialogHeader, DialogTitle } from '$lib/components/ui/dialog';
	import { playerStore } from '$lib/stores/playerStore';
	import { page } from '$app/stores';
	import { toast } from 'svelte-sonner';

	export let isOpen = true;

	let username = '';
	let submitting = false;
	const roomId = $page.params.roomId;

	const handleSubmit = async () => {
		if (username.trim()) {
			try {
				// Set submitting to true immediately
				submitting = true;

				// Close the modal right away
				isOpen = false;

				// Start the player set operation in the background
				playerStore.setPlayer(username.trim(), roomId).catch((error) => {
					// If there's an error, reopen the modal
					isOpen = true;
					submitting = false;
					toast.error('Failed to join room');
				});
			} catch (error) {
				// Fallback error handling
				isOpen = true;
				submitting = false;
				toast.error('Failed to join room');
			}
		}
	};
</script>

<Dialog bind:open={isOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Enter your username</DialogTitle>
		</DialogHeader>
		<form on:submit|preventDefault={handleSubmit} class="space-y-4">
			<Input
				type="text"
				placeholder="Username"
				bind:value={username}
				required
				minlength="2"
				maxlength="20"
				disabled={submitting}
			/>
			<Button type="submit" class="w-full" disabled={submitting}>
				{#if submitting}
					Joining...
				{:else}
					Join Game
				{/if}
			</Button>
		</form>
	</DialogContent>
</Dialog>
