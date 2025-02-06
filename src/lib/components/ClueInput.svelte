<script>
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import { gameStore } from '$lib/stores/gameStore';
	import { toast } from 'svelte-sonner';

	export let roomId;
	export let isSpymaster;
	export let currentTeam;

	let clue = '';
	let selectedNumber = 1;

	const numbers = [
		{ value: 0, label: '0' },
		{ value: 1, label: '1' },
		{ value: 2, label: '2' },
		{ value: 3, label: '3' },
		{ value: 4, label: '4' },
		{ value: 5, label: '5' },
		{ value: 6, label: '6' },
		{ value: 7, label: '7' },
		{ value: 8, label: '8' },
		{ value: 9, label: '9' },
		{ value: Infinity, label: '∞' }
	];

	const submitClue = async () => {
		try {
			if (!clue.trim()) {
				toast.error('Please enter a clue!');
				return;
			}

			if (!isSpymaster) {
				toast.error('Only Spymasters can submit clues!');
				return;
			}

			if ($gameStore.currentTurn !== currentTeam) {
				toast.error("It's not your team's turn!");
				return;
			}

			if ($gameStore.currentClue) {
				toast.error('A clue is already in play!');
				return;
			}

			// Ensure selectedNumber is a number
			const parsedNumber =
				typeof selectedNumber === 'string'
					? selectedNumber === 'Infinity'
						? Infinity
						: parseInt(selectedNumber, 10)
					: selectedNumber;

			await gameStore.setClue(roomId, clue.trim(), parsedNumber);

			clue = '';
			selectedNumber = 1;
			toast.success('Clue submitted!');
		} catch (error) {
			console.error('Clue submission error:', error);
			toast.error(`Failed to submit clue: ${error.message}`);
		}
	};
</script>

<div class="space-y-4 rounded-lg border border-gray-700 bg-gray-800/50 p-4">
	{#if isSpymaster && $gameStore.currentTurn === currentTeam && !$gameStore.currentClue}
		<div class="flex items-center gap-4">
			<Input
				type="text"
				placeholder="Enter clue..."
				bind:value={clue}
				class="flex-1 border-gray-600 bg-gray-700 text-gray-200 placeholder-gray-400"
			/>
			<div class="flex items-center gap-2">
				<Input
					type="text"
					placeholder="Number"
					bind:value={selectedNumber}
					class="w-24 border-gray-600 bg-gray-700 text-gray-200 placeholder-gray-400"
				/>
				<Select.Root>
					<Select.Trigger class="w-24">
						<Select.Value placeholder="Quick Select" />
					</Select.Trigger>
					<Select.Content>
						<Select.Group>
							{#each numbers as num}
								<Select.Item
									value={num.value === Infinity ? 'Infinity' : String(num.value)}
									label={num.label}
									on:click={() => (selectedNumber = num.value)}
								>
									{num.label}
								</Select.Item>
							{/each}
						</Select.Group>
					</Select.Content>
				</Select.Root>
			</div>
			<Button on:click={submitClue} class="bg-gray-700 text-gray-200 hover:bg-gray-600">
				Give Clue
			</Button>
		</div>
	{:else if $gameStore.currentClue}
		<div class="space-y-2">
			<p class="text-lg font-bold text-gray-200">
				Current Clue: {$gameStore.currentClue.text} ({$gameStore.clueType === 'special' &&
				$gameStore.currentClue.number === null
					? '∞'
					: $gameStore.clueType === 'special' && $gameStore.currentClue.number !== null
						? '0'
						: $gameStore.currentClue.number === Infinity
							? '∞'
							: $gameStore.currentClue.number})
			</p>
			{#if !isSpymaster && currentTeam === $gameStore.currentTurn && $gameStore.canGuess}
				<div class="flex items-center justify-between">
					<p class="text-gray-300">
						Guesses remaining:
						{#if $gameStore.clueType === 'special'}
							Unlimited
						{:else}
							{$gameStore.guessesRemaining}
						{/if}
					</p>
					<Button
						variant="outline"
						on:click={() => gameStore.endTurn(roomId)}
						class="border-gray-600 text-gray-200 hover:bg-gray-700"
					>
						End Turn
					</Button>
				</div>
			{/if}
		</div>
	{:else if $gameStore.currentTurn === currentTeam}
		<p class="text-center text-gray-400">
			{isSpymaster ? "It's your turn to give a clue!" : "Waiting for Spymaster's clue..."}
		</p>
	{/if}
</div>
