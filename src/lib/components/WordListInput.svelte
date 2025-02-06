<script>
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { supabase } from '$lib/supabase';
	import { toast } from 'svelte-sonner';

	export let onSubmit;
	export let roomId;

	let wordListText = `Fullmetal Alchemist
Shingeki no Kyojin
Steins;Gate
Hunter x Hunter
Violet Evergarden
Koe no Katachi 
Mob Psycho
Monster
Kimi no Na wa
Tantei wa Mou, Shindeiru
Mushoku Tensei
Monogatari Series
Kill la kill 
Tengen Toppa Gurren Lagann
My Neighbor Totoro
Cowboy Bebop
One Punch Man 
Sword Art Online
Naruto
Tokyo Ghoul
Kimetsu no Yaiba
Boku no Hero Academia
Toradora!
Noragami
Re:Zero
One Piece
Nanatsu no Taizai
Boku dake ga Inai Machi
Ao no Exorcist
Jujutsu Kaisen
Konosuba 
Bleach
Yakusoku no Neverland
Fairy Tail
Code Geass
Death Parade
Another
Psycho-Pass
Dr. Stone
Darling in the FranXX
Jojo 
Overlord
Clannad
Black Clover
Tate no Yuusha
Oregairu 
Kakegurui
Haikyuu
Deadman Wonderland
Made in Abyss
Bungou Stray Dogs
Fruits Basket
Gintama
No Game No Life
Mirai Nikki
Akame ga Kill
Kiseijuu
Soul Eater
Fate Stay Night
Kaguya-sama
High School DxD
Ansatsu Kyoushitsu
Owari no Seraph
Guilty Crown
Perfect Blue
K-On!
Neon Genesis Evangelion
Vinland Saga
Banana Fish
86
Odd Taxi
Sonny Boy
Eiga Daisuki Pompo-san
Akebi-chan no Sailor Fuku
Sabikui Bisco
Sasaki to Miyano
Sono Bisque Doll wa Koi wo Suru
Ghost in the Shell
Akira
Mahou Shoujo Madoka Magica
Horimiya
Shinsekai yori
Berserk
Serial Experiments Lain
Nichijou
Devilman: Crybaby
Yuri on Ice
Mononoke Hime
Grand Blue
Ping Pong the Animation
5-toubun no Hanayome
Lucky Star
Tamako Love Story
Houseki no Kuni
Wolf Children
Youjo Senki`;
	let loading = false;

	const handleSubmit = async () => {
		try {
			loading = true;
			const words = wordListText
				.split('\n')
				.map((word) => word.trim())
				.filter((word) => word.length > 0 && word.length <= 30);

			if (words.length < 25) {
				toast.error('Please enter at least 25 words');
				return;
			}

			if (words.length !== new Set(words).size) {
				toast.error('All words must be unique');
				return;
			}

			// Check if game already exists
			const { data: room } = await supabase
				.from('rooms')
				.select('game_state')
				.eq('id', roomId)
				.single();

			if (room?.game_state) {
				toast.error('Game already exists in this room');
				return;
			}

			// Pass both the selected words and the full wordlist text
			await onSubmit(words, wordListText);
		} catch (error) {
			toast.error(error.message);
		} finally {
			loading = false;
		}
	};
</script>

<div class="space-y-4">
	<h2 class="text-xl font-bold">Enter Word List</h2>
	<p class="text-sm text-gray-600">Enter at least 25 words, one per line</p>
	<Textarea bind:value={wordListText} rows="10" placeholder="Enter words..." />
	<Button on:click={handleSubmit}>Start Game</Button>
</div>
