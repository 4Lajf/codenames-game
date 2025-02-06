<script>
	import { onMount, onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import Card from '$lib/components/Card.svelte';
	import { gameStore } from '$lib/stores/gameStore';
	import { playerStore } from '$lib/stores/playerStore';
	import { supabase } from '$lib/supabase';
	import { toast } from 'svelte-sonner';

	export let roomId;
	export let isSpymaster;
	export let currentTeam;

	let loading = false;
	let subscription;
	let gameState;

	console.log($gameStore);

	$: hasJoinedTeam = currentTeam !== null;

	$: activePlayers = Object.values($playerStore.presenceState || {})
		.flat()
		.map((p) => ({
			id: p.player_id,
			name: p.name,
			team: p.team,
			role: p.role
		}));

	const handleGameEnd = async (currentGameState) => {
		try {
			currentGameState.canGuess = false;

			const { error } = await supabase
				.from('rooms')
				.update({
					game_state: {
						...currentGameState,
						gameOver: true,
						canGuess: false
					}
				})
				.eq('id', roomId);

			if (error) throw error;

			gameStore.set(currentGameState);
			toast.success(`Game Over! ${currentGameState.winner} team wins!`);
		} catch (error) {
			console.error('Error handling game end:', error);
			toast.error('Error updating game state');
		}
	};

	const checkGameEnd = async (state) => {
		let gameEnded = false;

		if (state.redCardsLeft === 0) {
			state.gameOver = true;
			state.winner = 'red';
			gameEnded = true;
		} else if (state.blueCardsLeft === 0) {
			state.gameOver = true;
			state.winner = 'blue';
			gameEnded = true;
		}

		if (gameEnded) {
			await handleGameEnd(state);
		}

		return state;
	};

	const handleCardClick = async (event) => {
		const index = event.detail.index;

		if (!isSpymaster && hasJoinedTeam) {
			if (currentTeam !== $gameStore.currentTurn) {
				toast.error("It's not your team's turn!");
				return;
			}

			if (!$gameStore.canGuess) {
				toast.error("Wait for your Spymaster's clue!");
				return;
			}

			loading = true;
			try {
				const { data: room, error: roomError } = await supabase
					.from('rooms')
					.select('game_state')
					.eq('id', roomId)
					.single();

				if (roomError) throw roomError;

				const currentGameState = room.game_state;

				// More strict guess validation
				if (
					!currentGameState.canGuess ||
					currentGameState.currentTurn !== currentTeam ||
					currentGameState.guessesRemaining <= 0
				) {
					toast.error('Cannot make a guess right now');
					loading = false;
					return;
				}

				const card = currentGameState.cards[index];

				if (card.revealed) {
					toast.error('This card has already been revealed');
					loading = false;
					return;
				}

				card.revealed = true;

				// Decrement guesses remaining for non-special clues
				if (currentGameState.clueType !== 'special') {
					currentGameState.guessesRemaining--;
				}

				// Logic for determining game state after guess
				if (card.color === 'black') {
					currentGameState.gameOver = true;
					currentGameState.winner = currentGameState.currentTurn === 'red' ? 'blue' : 'red';
					currentGameState.canGuess = false;
				} else if (card.color !== currentGameState.currentTurn) {
					// Wrong color, end turn
					currentGameState.currentTurn = currentGameState.currentTurn === 'red' ? 'blue' : 'red';
					currentGameState.canGuess = false;
					currentGameState.guessesRemaining = 0;
					currentGameState.currentClue = null;
				}

				// Team-specific card reduction
				if (card.color === 'red') currentGameState.redCardsLeft--;
				if (card.color === 'blue') currentGameState.blueCardsLeft--;

				// Check if guesses are exhausted
				if (currentGameState.guessesRemaining <= 0 && currentGameState.clueType !== 'special') {
					currentGameState.currentTurn = currentGameState.currentTurn === 'red' ? 'blue' : 'red';
					currentGameState.canGuess = false;
					currentGameState.currentClue = null;
				}

				// Existing game end check
				await checkGameEnd(currentGameState);

				// Update database
				const { error: updateError } = await supabase
					.from('rooms')
					.update({ game_state: currentGameState })
					.eq('id', roomId);

				if (updateError) throw updateError;

				// Add guess to history
				await supabase.from('game_history').insert({
					room_id: roomId,
					action_type: 'guess',
					action_data: {
						team: currentTeam,
						word: card.word,
						correct: card.color === currentTeam
					}
				});

				gameStore.set(currentGameState);
			} catch (error) {
				console.error('Error handling card click:', error);
				toast.error('Failed to reveal card');
			} finally {
				loading = false;
			}
		}
	};

	$: gridClass = `grid grid-cols-5 gap-4 p-4 ${
		currentTeam === $gameStore.currentTurn && !isSpymaster && $gameStore.canGuess
			? 'cursor-pointer'
			: 'cursor-default'
	}`;

	$: statusMessage = (() => {
		if (!currentTeam) return 'Select a team to play';
		if (isSpymaster) {
			if (currentTeam === $gameStore.currentTurn) {
				if (!$gameStore.currentClue) return 'Give your team a clue!';
				return 'Wait for your team to guess';
			}
			return "Wait for the other team's turn";
		} else {
			if (currentTeam === $gameStore.currentTurn) {
				if (!$gameStore.currentClue) return "Wait for Spymaster's clue";
				return `Your turn! You have ${
					($gameStore.clueType === 'special' && $gameStore.currentClue.number === 0) ||
					($gameStore.clueType === 'special' && $gameStore.currentClue.number === null)
						? '∞'
						: $gameStore.guessesRemaining
				} guesses remaining`;
			}
			return 'Wait for your turn';
		}
	})();

	onMount(async () => {
		try {
			// Subscribe to room changes
			subscription = supabase
				.channel(`room:${roomId}`)
				.on(
					'postgres_changes',
					{
						event: '*',
						schema: 'public',
						table: 'rooms',
						filter: `id=eq.${roomId}`
					},
					(payload) => {
						if (payload.new?.game_state) {
							gameStore.set(payload.new.game_state);
						}
					}
				)
				.subscribe((status) => {
					if (status === 'SUBSCRIPTION_ERROR') {
						toast.error('Lost connection to game');
					}
				});

			// Initialize local game state
			const { data: room } = await supabase
				.from('rooms')
				.select('game_state')
				.eq('id', roomId)
				.single();

			if (room?.game_state) {
				gameStore.set(room.game_state);
			}
		} catch (error) {
			console.error('Error initializing game board:', error);
			toast.error('Failed to initialize game');
		}
	});

	onDestroy(() => {
		if (subscription) {
			subscription.unsubscribe();
		}
	});
</script>

<div>
	<div class="mb-4 text-center font-medium text-gray-600" transition:fade>
		{statusMessage}
	</div>

	<div class={gridClass}>
		{#each $gameStore.cards as card, i (i)}
			<div animate:flip={{ duration: 300 }}>
				<Card
					word={card.word}
					color={card.color}
					revealed={card.revealed}
					isSpymaster={isSpymaster && hasJoinedTeam}
					{loading}
					index={i}
					on:cardClick={handleCardClick}
				/>
			</div>
		{/each}
	</div>

	<div class="mt-4 flex justify-between text-sm text-gray-500" transition:fade>
		<div>Blue cards remaining: {$gameStore.blueCardsLeft}</div>
		<div>Red cards remaining: {$gameStore.redCardsLeft}</div>
	</div>
</div>
