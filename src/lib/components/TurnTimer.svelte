<!-- src/lib/components/TurnTimer.svelte -->
<script>
	import { onMount, onDestroy } from 'svelte';
	import { gameStore } from '$lib/stores/gameStore';
	import { toast } from 'svelte-sonner';

	export let duration = 120; // 2 minutes
	let timeLeft = duration;
	let interval;

	$: if ($gameStore.currentTurn) {
		timeLeft = duration; // Reset timer when turn changes
	}

	onMount(() => {
		interval = setInterval(() => {
			if (timeLeft > 0) timeLeft--;
		}, 1000);
	});

	onDestroy(() => {
		clearInterval(interval);
	});

	$: if (timeLeft === 0) {
		toast.info("Time's up!");
	}

	$: minutes = Math.floor(timeLeft / 60);
	$: seconds = timeLeft % 60;
</script>

<div class="text-center">
	<p class="font-mono text-xl">
		{minutes}:{seconds.toString().padStart(2, '0')}
	</p>
</div>
