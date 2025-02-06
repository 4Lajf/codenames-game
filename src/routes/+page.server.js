// src/routes/+page.server.js
import { generate } from 'random-words';
import { supabase } from '$lib/supabase';
import { redirect } from '@sveltejs/kit';

export const actions = {
  default: async () => {
    const words = generate({ exactly: 3 });
    const roomId = words.join('-');

    await supabase.from('rooms').insert({
      id: roomId,
      game_state: null
    });

    throw redirect(303, `/room/${roomId}`);
  }
};