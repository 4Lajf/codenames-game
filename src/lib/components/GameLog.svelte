<script>
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { fade } from 'svelte/transition';

	export let roomId;
	let gameHistory = [];
	let historySubscription;

	function formatTimestamp(timestamp) {
		const date = new Date(timestamp);
		return date.toLocaleTimeString(undefined, {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		});
	}

	function formatHistoryEntry(entry) {
		switch (entry.action_type) {
			case 'clue':
				return {
					text: `${entry.action_data.team}'s Spymaster gave clue: "${entry.action_data.clue}" (${
						entry.action_data.number === null
							? ''
							: entry.action_data.number === 'Infinity'
								? '∞'
								: entry.action_data.number
					})`,
					team: entry.action_data.team
				};
			case 'guess':
				return {
					text: `${entry.action_data.team} team guessed "${entry.action_data.word}" ${entry.action_data.correct ? '✅' : '❌'}`,
					team: entry.action_data.team
				};
			default:
				return {
					text: 'Unknown action',
					team: null
				};
		}
	}

	onMount(async () => {
		try {
			// Get initial history
			const { data, error } = await supabase
				.from('game_history')
				.select('*')
				.eq('room_id', roomId)
				.order('created_at', { ascending: true })
				.limit(50);

			if (error) throw error;
			gameHistory = data || [];

			// Subscribe to new history entries
			historySubscription = supabase
				.channel(`game_history:${roomId}`)
				.on(
					'postgres_changes',
					{
						event: 'INSERT',
						schema: 'public',
						table: 'game_history',
						filter: `room_id=eq.${roomId}`
					},
					(payload) => {
						// Add new entry to the end of the history
						gameHistory = [...gameHistory, payload.new];
					}
				)
				.subscribe((status) => {
					if (status === 'SUBSCRIPTION_ERROR') {
						console.error('Failed to subscribe to game history');
					}
				});
		} catch (error) {
			console.error('Error loading game history:', error);
		}
	});

	onDestroy(() => {
		if (historySubscription) {
			historySubscription.unsubscribe();
		}
	});
</script>

<div class="max-h-96 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800/50 p-4">
	<h3 class="mb-4 font-bold text-gray-200">Game Log</h3>
	<div class="space-y-2">
		{#each gameHistory as entry (entry.id)}
			{@const formattedEntry = formatHistoryEntry(entry)}
			<div class="text-sm" transition:fade={{ duration: 200 }}>
				<span class="text-gray-400">[{formatTimestamp(entry.created_at)}]</span>
				<span
					class="font-medium"
					style="color: {formattedEntry.team === 'red' ? '#ef4444' : '#3b82f6'}"
				>
					{formattedEntry.text}
				</span>
			</div>
		{:else}
			<div class="text-sm text-gray-400">No game history yet</div>
		{/each}
	</div>
</div>
