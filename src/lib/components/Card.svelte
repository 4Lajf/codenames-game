<!-- Card.svelte -->
<script>
	import { createEventDispatcher } from 'svelte';

	export let word;
	export let color;
	export let revealed;
	export let isSpymaster;
	export let loading = false;
	export let index;

	let isHovered = false;
	const dispatch = createEventDispatcher();

	function getColorClass(color) {
		// Spymasters should always see colors, others only see revealed cards
		if (!isSpymaster && !revealed) {
			return 'bg-gray-800/50 text-gray-200 border-gray-600';
		}

		switch (color) {
			case 'red':
				return 'bg-red-900/50 text-red-100 border-red-700';
			case 'blue':
				return 'bg-blue-900/50 text-blue-100 border-blue-700';
			case 'black':
				return 'bg-black text-gray-300 border-gray-500';
			case 'neutral':
				// Use a brighter shade of gray for neutral cards
				return revealed
					? 'bg-gray-500/50 text-gray-100 border-gray-400'
					: 'bg-gray-800/50 text-gray-300 border-gray-600';
			default:
				return 'bg-gray-800/50 text-gray-300 border-gray-600';
		}
	}

	function handleClick() {
		if (!loading && !revealed && !isSpymaster) {
			dispatch('cardClick', { index });
		}
	}

	$: cardClass = `
        relative w-full h-32
        ${getColorClass(color)}
        rounded-lg shadow-md border
        flex items-center justify-center
        ${!loading && !revealed && !isSpymaster ? 'cursor-pointer' : 'cursor-default'}
        ${isHovered && !loading && !revealed && !isSpymaster ? 'scale-105' : ''}
        transition-transform duration-200
    `;
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class={cardClass}
	on:click={handleClick}
	on:mouseenter={() => (isHovered = true)}
	on:mouseleave={() => (isHovered = false)}
>
	<p class="text-center font-bold uppercase">{word}</p>
</div>
