<script>
	import { Button } from '$lib/components/ui/button';
	import { playerStore } from '$lib/stores/playerStore';
	import { toast } from 'svelte-sonner';

	export let roomId;

	const teams = ['red', 'blue'];
	const roles = ['operative', 'spymaster'];
	let loading = {};

	const validateTeamSelection = (team, role) => {
		if (!$playerStore.username) {
			toast.error('Please set your username first');
			return false;
		}

		if (team === $playerStore.team && role === $playerStore.role) {
			toast.error('You are already in this role');
			return false;
		}

		// Check for existing spymaster using presence state
		const presencePlayers = Object.values($playerStore.presenceState || {}).flat();
		const existingSpymaster = presencePlayers.find(
			(p) => p.team === team && p.role === 'spymaster' && p.name !== $playerStore.username
		);

		if (role === 'spymaster' && existingSpymaster) {
			toast.error(`${team} team already has a Spymaster!`);
			return false;
		}

		return true;
	};

	const selectTeamAndRole = async (team, role) => {
		try {
			if (!validateTeamSelection(team, role)) {
				return;
			}

			// Set loading state for specific team/role button
			loading[`${team}_${role}`] = true;

			// Optimistically update the UI
			await playerStore.updateTeamAndRole(roomId, team, role);
		} catch (error) {
			console.error(error);
			toast.error('Failed to join team');
		} finally {
			// Ensure loading state is cleared
			loading[`${team}_${role}`] = false;
		}
	};
</script>

<div class="space-y-4 rounded-lg border border-gray-700 bg-gray-800/50 p-4">
	<h2 class="text-xl font-bold text-gray-200">Select Team & Role</h2>
	<div class="grid grid-cols-2 gap-4">
		{#each teams as team}
			<div class="space-y-2">
				<h3
					class="text-lg font-bold capitalize"
					style="color: {team === 'red' ? '#ef4444' : '#3b82f6'}"
				>
					{team} Team
				</h3>
				{#each roles as role}
					<Button
						variant={$playerStore.team === team && $playerStore.role === role
							? 'default'
							: 'outline'}
						class="w-full border-gray-600 bg-gray-700 capitalize text-gray-200 
													hover:bg-gray-600"
						disabled={loading[`${team}_${role}`]}
						on:click={() => selectTeamAndRole(team, role)}
					>
						{#if loading[`${team}_${role}`]}
							Joining...
						{:else}
							{role}
						{/if}
					</Button>
				{/each}
			</div>
		{/each}
	</div>
</div>
