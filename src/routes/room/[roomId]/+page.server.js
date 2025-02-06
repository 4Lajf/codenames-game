// src/routes/room/[roomId]/+page.server.js
import { error } from '@sveltejs/kit';
import { supabase } from '$lib/supabase';

export async function load({ params }) {
  try {
    // Try to get existing room first
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', params.roomId)
      .single();

    if (roomError) {
      // If room doesn't exist, create it
      if (roomError.code === 'PGRST116') { // PGRST116 is "not found"
        const { data: newRoom, error: createError } = await supabase
          .from('rooms')
          .insert({
            id: params.roomId,
            game_state: null
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating room:', createError);
          throw error(500, 'Failed to create room');
        }

        return {
          room: newRoom
        };
      } else {
        console.error('Error fetching room:', roomError);
        throw error(500, 'Failed to fetch room');
      }
    }

    // Load game history for the room
    const { data: history, error: historyError } = await supabase
      .from('game_history')
      .select('*')
      .eq('room_id', params.roomId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (historyError) {
      console.error('Error fetching game history:', historyError);
    }

    // Load players for the room
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', params.roomId);

    if (playersError) {
      console.error('Error fetching players:', playersError);
    }

    // Return room data along with history and players
    return {
      room: room,
      history: history || [],
      players: players || []
    };
  } catch (err) {
    console.error('Load error:', err);
    throw error(500, err.message);
  }
}

export const actions = {
  // Reset room's game state
  resetGame: async ({ params }) => {
    try {
      const { error: resetError } = await supabase
        .from('rooms')
        .update({
          game_state: null
        })
        .eq('id', params.roomId);

      if (resetError) throw resetError;

      return { success: true };
    } catch (err) {
      console.error('Reset game error:', err);
      return { success: false, error: err.message };
    }
  }
};