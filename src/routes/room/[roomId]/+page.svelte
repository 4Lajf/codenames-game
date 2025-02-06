<script>
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { supabase } from '$lib/supabase';
	import GameBoard from '$lib/components/GameBoard.svelte';
	import UserAuthModal from '$lib/components/UserAuthModal.svelte';
	import WordListInput from '$lib/components/WordListInput.svelte';
	import ClueInput from '$lib/components/ClueInput.svelte';
	import TeamSelector from '$lib/components/TeamSelector.svelte';
	import PlayerList from '$lib/components/PlayerList.svelte';
	import GameLog from '$lib/components/GameLog.svelte';
	import TurnTimer from '$lib/components/TurnTimer.svelte';
	import { gameStore } from '$lib/stores/gameStore';
	import { playerStore } from '$lib/stores/playerStore';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { fade } from 'svelte/transition';

	export let data;

	const roomId = $page.params.roomId;
	let showAuthModal = true;
	let gameStarted = false;
	let gameLoading = true;
	let error = null;
	let roomSubscription;
	let historySubscription;
	let disconnected = false;

	const onSubmit = async (words, fullWordList) => {
		try {
			await gameStore.initializeGame(roomId, words, fullWordList);
			gameStarted = true;
			toast.success('Game started!');
		} catch (error) {
			console.error('Error initializing game:', error);
			toast.error('Failed to start game');
		}
	};

	const copyRoomLink = async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
			toast.success('Room link copied to clipboard!');
		} catch (error) {
			console.error('Failed to copy link:', error);
			toast.error('Failed to copy room link');
		}
	};

	const initializeGame = async (words) => {
		try {
			await gameStore.initializeGame(roomId, words);
			gameStarted = true;
			toast.success('Game started!');
		} catch (error) {
			console.error('Error initializing game:', error);
			toast.error('Failed to start game');
		}
	};

	const retryConnection = async () => {
		try {
			await playerStore.reconnect(roomId);
			await gameStore.setInitialState(roomId);
			disconnected = false;
			toast.success('Reconnected successfully');
		} catch (error) {
			console.error('Reconnection failed:', error);
			toast.error('Failed to reconnect');
		}
	};

	const handleKeyPress = (e) => {
		// Potential future key bindings
	};

	onMount(async () => {
		console.log('Mounting Room Page', { roomId });

		gameStore.subscribe((newState) => {
			console.log('Game Store Updated:', {
				rawState: newState,
				currentTurn: newState.currentTurn,
				currentClue: newState.currentClue,
				guessesRemaining: newState.guessesRemaining,
				canGuess: newState.canGuess,
				clueType: newState.clueType
			});
		});

		try {
			console.log('Attempting to reconnect existing session');
			const reconnected = await playerStore.reconnect(roomId);
			if (reconnected) {
				console.log('Session reconnected successfully');
				showAuthModal = false;
			} else {
				console.log('No existing session to reconnect');
				showAuthModal = true;
			}

			console.log('Initializing Presence');
			await playerStore.initializePresence(roomId);

			console.log('Subscribing to Room Changes');
			roomSubscription = gameStore.subscribeToRoom(roomId);

			console.log('Subscribing to Game History');
			historySubscription = supabase
				.channel(`game_history:${roomId}`)
				.on(
					'postgres_changes',
					{
						event: '*',
						schema: 'public',
						table: 'game_history',
						filter: `room_id=eq.${roomId}`
					},
					(payload) => {
						console.log('Game History Payload:', payload);
					}
				)
				.subscribe((status) => {
					console.log('Game History Subscription Status:', status);
				});

			// Subscribe to room-wide reset events
			const roomEventSubscription = supabase
				.channel(`room_events:${roomId}`)
				.on(
					'postgres_changes',
					{
						event: 'INSERT',
						schema: 'public',
						table: 'room_events',
						filter: `room_id=eq.${roomId}`
					},
					async (payload) => {
						if (payload.new.event_type === 'RESET_PLAYERS') {
							// Force reset player store state for all clients
							playerStore.set({
								username: $playerStore.username, // Keep username
								team: null,
								role: null,
								isConnected: true,
								presence: {
									fullState: {},
									onlinePlayers: [],
									lastUpdate: new Date().toISOString()
								}
							});

							// Optional: Add a toast to inform user
							toast.info('Game reset. Please select your team.');
						}
					}
				)
				.subscribe();

			if (data.room?.game_state) {
				console.log('Loading Initial Game State');
				gameStore.set(data.room.game_state);
				gameStarted = true;
			}

			gameLoading = false;

			if (browser) {
				console.log('Adding Browser Event Listeners');
				const beforeUnloadHandler = () => {
					console.log('Performing Cleanup on Page Unload');
					playerStore.cleanup();
				};

				window.addEventListener('beforeunload', beforeUnloadHandler);
				window.addEventListener('keydown', handleKeyPress);

				window.beforeUnloadHandler = beforeUnloadHandler;
			}

			console.log('Room Initialization Complete');
		} catch (err) {
			console.error('Initialization Error:', err);
			error = err.message;
			gameLoading = false;
			toast.error('Failed to load game');
		}
	});

	onDestroy(() => {
		try {
			if (roomSubscription) {
				roomSubscription.unsubscribe();
			}

			if (historySubscription) {
				historySubscription.unsubscribe();
			}

			// Add unsubscription for room events
			if (roomEventSubscription) {
				roomEventSubscription.unsubscribe();
			}

			if (browser) {
				if (window.beforeUnloadHandler) {
					window.removeEventListener('beforeunload', window.beforeUnloadHandler);
				}
				window.removeEventListener('keydown', handleKeyPress);
			}

			playerStore.cleanup();
		} catch (error) {
			console.error('Error during room cleanup:', error);
		}
	});

	let showRules = false;
</script>

<svelte:head>
	<title>Codenames - Room {roomId}</title>
	<meta property="og:title" content="Join Codenames Game" />
	<meta property="og:description" content="Join a game of Codenames in room {roomId}" />
	<meta name="theme-color" content="#1F2937" />
</svelte:head>

<div class="min-h-screen bg-gray-900 text-gray-200">
	<div class="container mx-auto p-4">
		<UserAuthModal bind:isOpen={showAuthModal} />

		{#if disconnected}
			<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80" transition:fade>
				<div class="rounded-lg border border-gray-700 bg-gray-800 p-8 text-center">
					<h2 class="text-2xl font-bold text-gray-100">Connection Lost</h2>
					<p class="mt-4 text-gray-300">Lost connection to the server</p>
					<Button
						class="mt-4 bg-gray-700 text-gray-200 hover:bg-gray-600"
						on:click={retryConnection}
					>
						Reconnect
					</Button>
				</div>
			</div>
		{/if}

		{#if error}
			<div class="p-4 text-center text-red-500">{error}</div>
		{:else if gameLoading}
			<div class="flex min-h-screen items-center justify-center">
				<!-- svelte-ignore element_invalid_self_closing_tag -->
				<div class="h-32 w-32 animate-spin rounded-full border-b-2 border-gray-200" />
			</div>
		{:else}
			<div class="mb-8 flex items-center justify-between"></div>

			{#if !gameStarted}
				<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
					<WordListInput {roomId} {onSubmit} />
				</div>
			{:else}
				<div class="grid grid-cols-[250px_1fr_250px] gap-8">
					<div class="space-y-8">
						<TeamSelector {roomId} />
						<PlayerList {roomId} />
					</div>

					<div class="space-y-8">
						<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
							<TurnTimer duration={120} />
						</div>
						<ClueInput
							{roomId}
							isSpymaster={$playerStore.role === 'spymaster'}
							currentTeam={$playerStore.team}
						/>
						<GameBoard
							{roomId}
							isSpymaster={$playerStore.role === 'spymaster'}
							currentTeam={$playerStore.team}
						/>

						{#if $gameStore.gameOver}
							<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-4 text-center">
								<h2 class="mb-4 text-xl font-bold text-gray-100">Game Over!</h2>
								<p class="mb-4 text-lg capitalize text-gray-200">
									{$gameStore.winner} team wins!
								</p>
								<Button
									class="bg-gray-700 text-gray-200 hover:bg-gray-600"
									on:click={async () => {
										try {
											// Reset all players first
											await playerStore.resetAllPlayers(roomId);

											// Broadcast reset event to all clients
											await playerStore.broadcastPlayerReset(roomId);

											// Clear game history
											await supabase.from('game_history').delete().eq('room_id', roomId);

											// Reset game state
											await gameStore.resetGame(roomId);

											toast.success('Game reset! Select your team to play again.');
										} catch (error) {
											console.error('Error resetting game:', error);
											toast.error('Failed to reset game. Please try again.');
										}
									}}
								>
									Play Again
								</Button>
							</div>
						{/if}
					</div>

					<div class="space-y-8">
						<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
							<h3 class="font-bold text-gray-200">Game Status</h3>
							<div class="mt-2 space-y-1 text-gray-300">
								<p>Current Turn: {$gameStore.currentTurn}</p>
								<p>Blue cards left: {$gameStore.blueCardsLeft}</p>
								<p>Red cards left: {$gameStore.redCardsLeft}</p>
							</div>
						</div>
						<GameLog {roomId} />
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>
