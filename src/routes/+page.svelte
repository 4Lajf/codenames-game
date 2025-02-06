<script>
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { generate } from 'random-words';

	const createRoom = async () => {
		const words = generate({ exactly: 3 });
		const roomName = words.join('-');
		await goto(`/room/${roomName}`);
	};
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-900">
	<div class="space-y-8 text-center">
		<h1 class="text-6xl font-bold text-gray-100">Codenames</h1>
		<p class="text-xl text-gray-400">Create a room or join via invite link</p>
		<Button
			class="border border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700"
			on:click={createRoom}
		>
			Create Room
		</Button>
	</div>
</div>
