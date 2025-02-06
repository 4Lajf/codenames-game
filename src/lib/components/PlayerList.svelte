<script>
	import { onMount, onDestroy } from 'svelte';
	import { playerStore } from '$lib/stores/playerStore';
	import { supabase } from '$lib/supabase';
	import { fade } from 'svelte/transition';

	export let roomId;
	let players = [];
	let playersSubscription;

	// Track both presence state and active players
	$: presenceData = $playerStore.presence.fullState || {};
	$: onlinePlayers = $playerStore.presence.onlinePlayers || [];
	$: activePlayerNames = onlinePlayers.map((p) => p.name);

	// Debug logging to track presence changes
	$: {
		console.log('PlayerList: Presence Update', {
			presenceData,
			onlinePlayers,
			activePlayerNames,
			playerCount: activePlayerNames.length,
			allPlayers: players,
			rawStore: $playerStore
		});
	}

	onMount(async () => {
		console.log('PlayerList: Initializing');

		try {
			// Initial database load
			const { data, error } = await supabase.from('players').select('*').eq('room_id', roomId);

			if (error) throw error;

			console.log('PlayerList: Initial players loaded:', data);
			players = data || [];

			// Subscribe to database changes
			playersSubscription = supabase
				.channel(`players:${roomId}`)
				.on(
					'postgres_changes',
					{
						event: '*',
						schema: 'public',
						table: 'players',
						filter: `room_id=eq.${roomId}`
					},
					handlePlayerChange
				)
				.subscribe();
		} catch (error) {
			console.error('PlayerList: Error in initialization:', error);
		}
	});

	onDestroy(() => {
		if (playersSubscription) {
			playersSubscription.unsubscribe();
		}
	});

	function handlePlayerChange(payload) {
		console.log('PlayerList: Player change detected:', payload);

		if (payload.eventType === 'INSERT') {
			players = [...players, payload.new];
		} else if (payload.eventType === 'DELETE') {
			players = players.filter((p) => p.id !== payload.old.id);
		} else if (payload.eventType === 'UPDATE') {
			players = players.map((p) => (p.id === payload.new.id ? payload.new : p));
		}
	}

	// Combine database players with presence state
	$: combinedPlayers = players.map((player) => {
		const presenceInfo = onlinePlayers.find((p) => p.name === player.username);

		return {
			...player,
			isOnline: !!presenceInfo,
			team: presenceInfo?.team || player.team,
			role: presenceInfo?.role || player.role,
			online_at: presenceInfo?.onlineAt,
			presence_ref: presenceInfo?.presenceRef
		};
	});

	// Sort players
	$: sortedPlayers = [...combinedPlayers].sort((a, b) => {
		if (a.isOnline !== b.isOnline) return b.isOnline ? 1 : -1;
		if (a.team !== b.team) {
			if (!a.team) return 1;
			if (!b.team) return -1;
			return a.team === 'red' ? -1 : 1;
		}
		if (a.role !== b.role) return a.role === 'spymaster' ? -1 : 1;
		return a.username.localeCompare(b.username);
	});

	function getTeamColorClass(team) {
		if (!team) return 'text-gray-400';
		return team === 'red' ? 'text-red-500' : 'text-blue-500';
	}
</script>

<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
	<h3 class="mb-4 font-bold text-gray-200">
		Players ({activePlayerNames.length} online)
	</h3>
	<div class="space-y-2">
		{#each sortedPlayers as player (player.id)}
			<div class="flex items-center justify-between" transition:fade={{ duration: 200 }}>
				<div class="flex items-center gap-2">
					<div class="relative">
						<span class="font-medium {player.isOnline ? 'text-gray-200' : 'text-gray-500'}">
							{player.username}
						</span>
						<!-- svelte-ignore element_invalid_self_closing_tag -->
						<span
							class="absolute -right-3 -top-1 h-2 w-2 rounded-full {player.isOnline
								? 'bg-green-500'
								: 'bg-gray-500'}"
						/>
					</div>
					{#if player.team && player.role}
						<span class="text-sm {getTeamColorClass(player.team)}">
							({player.team}
							{player.role})
						</span>
					{/if}
				</div>
			</div>
		{:else}
			<div class="text-sm text-gray-400">No players in room</div>
		{/each}
	</div>
</div>
