//src/lib/stores/gameStore.js
import { writable } from 'svelte/store';
import { supabase } from '$lib/supabase';
import { toast } from 'svelte-sonner';

function createGameStore() {
  const { subscribe, set, update } = writable({
    cards: [],
    currentTurn: 'blue',
    blueCardsLeft: 9,
    redCardsLeft: 8,
    gameOver: false,
    winner: null,
    currentClue: null,
    guessesRemaining: 0,
    canGuess: false
  });

  const serializeGameState = (state) => {
    return {
      ...state,
      guessesRemaining: state.guessesRemaining === Infinity ? 'Infinity' : state.guessesRemaining
    };
  };

  const deserializeGameState = (state) => {
    return {
      ...state,
      guessesRemaining: state.guessesRemaining === 'Infinity' ? Infinity : state.guessesRemaining
    };
  };

  const validateGameAction = (action) => {
    if (!action.type || !action.data) return false;
    if (action.type === 'clue' && (!action.data.clue || (action.data.number !== 0 && action.data.number !== Infinity && (!Number.isInteger(action.data.number) || action.data.number < 0 || action.data.number > 9)))) return false;
    if (action.type === 'guess' && (!action.data.word || action.data.correct === undefined)) return false;
    return true;
  };

  const checkGameEnd = (state) => {
    if (state.redCardsLeft === 0) {
      state.gameOver = true;
      state.winner = 'red';
    } else if (state.blueCardsLeft === 0) {
      state.gameOver = true;
      state.winner = 'blue';
    }
    return state;
  };

  const addToHistory = async (roomId, action) => {
    if (!validateGameAction(action)) {
      throw new Error('Invalid game action');
    }

    try {
      await supabase
        .from('game_history')
        .insert({
          room_id: roomId,
          action_type: action.type,
          action_data: {
            ...action.data,
            // Ensure number is always a valid value
            number: action.data.number === undefined ? null :
              action.data.number === Infinity ? 'Infinity' :
                action.data.number
          }
        });
    } catch (error) {
      console.error('Error adding to history:', error);
      throw error;
    }
  };

  const updateSupabase = async (roomId, state) => {
    try {
      const { error } = await supabase
        .from('rooms')
        .update({ game_state: serializeGameState(state) })
        .eq('id', roomId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating game state:', error);
      throw error;
    }
  };

  return {
    subscribe,
    set: (state) => set(deserializeGameState(state)),

    subscribeToRoom: (roomId) => {
      return supabase
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
              set(deserializeGameState(payload.new.game_state));
            }
          }
        )
        .subscribe();
    },

    setInitialState: async (roomId) => {
      try {
        const { data: room } = await supabase
          .from('rooms')
          .select('game_state')
          .eq('id', roomId)
          .single();

        if (room?.game_state) {
          set(deserializeGameState(room.game_state));
          return true;
        }
        return false;
      } catch (error) {
        console.error('Error setting initial state:', error);
        throw error;
      }
    },

    initializeGame: async (roomId, words, fullWordList) => {
      if (!Array.isArray(words) || words.length < 25) {
        throw new Error('Invalid word list');
      }

      if (!fullWordList) {
        throw new Error('Full word list is required');
      }

      const shuffleArray = (array) => {
        for (let i = array.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
      };

      // Create card distribution
      const cardColors = [
        ...Array(8).fill('red'),     // 8 red cards
        ...Array(9).fill('blue'),    // 9 blue cards
        ...Array(7).fill('neutral'), // 7 neutral cards
        'black'                      // 1 black card
      ];

      const shuffledColors = shuffleArray([...cardColors]);
      const cards = words.slice(0, 25).map((word, index) => ({
        word,
        color: shuffledColors[index],
        revealed: false
      }));

      const gameState = {
        cards,
        currentTurn: 'blue',
        blueCardsLeft: 9,
        redCardsLeft: 8,
        gameOver: false,
        winner: null,
        currentClue: null,
        guessesRemaining: 0,
        canGuess: false,
        fullWordList  // Store the full word list for future resets
      };

      try {
        await updateSupabase(roomId, gameState);
        set(gameState);
      } catch (error) {
        console.error('Error initializing game:', error);
        throw error;
      }
    },

    revealCard: async (roomId, cardIndex) => {
      try {
        const { data: room } = await supabase
          .from('rooms')
          .select('game_state')
          .eq('id', roomId)
          .single();

        if (!room?.game_state) throw new Error('No game state found');

        const currentGameState = deserializeGameState(room.game_state);
        const card = currentGameState.cards[cardIndex];

        if (card.revealed) return;

        card.revealed = true;

        if (card.color === 'black') {
          currentGameState.gameOver = true;
          currentGameState.winner = currentGameState.currentTurn === 'red' ? 'blue' : 'red';
          currentGameState.canGuess = false;
        } else if (card.color === 'red') {
          currentGameState.redCardsLeft--;
          if (currentGameState.currentTurn !== 'red') {
            currentGameState.currentTurn = 'blue';
            currentGameState.canGuess = false;
            currentGameState.guessesRemaining = 0;
          }
        } else if (card.color === 'blue') {
          currentGameState.blueCardsLeft--;
          if (currentGameState.currentTurn !== 'blue') {
            currentGameState.currentTurn = 'red';
            currentGameState.canGuess = false;
            currentGameState.guessesRemaining = 0;
          }
        } else if (card.color === 'neutral') {
          currentGameState.currentTurn = currentGameState.currentTurn === 'red' ? 'blue' : 'red';
          currentGameState.canGuess = false;
          currentGameState.guessesRemaining = 0;
        }

        // Only decrement guesses and potentially end turn if:
        // 1. The card color matches current team AND
        // 2. This is not a special clue (0 or Infinity)
        if (card.color === currentGameState.currentTurn && currentGameState.clueType !== 'special') {
          currentGameState.guessesRemaining--;
          if (currentGameState.guessesRemaining <= 0) {
            currentGameState.currentTurn = currentGameState.currentTurn === 'red' ? 'blue' : 'red';
            currentGameState.canGuess = false;
          }
        }

        checkGameEnd(currentGameState);
        await updateSupabase(roomId, currentGameState);
        set(currentGameState);

      } catch (error) {
        console.error('Error revealing card:', error);
        throw error;
      }
    },

    setClue: async (roomId, clue, number) => {
      try {
        let currentState;
        // Get current state from the store
        gameStore.subscribe(state => {
          currentState = state;
        })();  // Call immediately and unsubscribe

        // Special handling for 0, 1, and Infinity clues
        let guessesAllowed;
        let displayNumber;

        if (number === 0) {
          guessesAllowed = Infinity;
          displayNumber = 0;
        } else if (number === 1) {
          guessesAllowed = 2; // 1 + 1 additional guess
          displayNumber = 1;
        } else if (number === Infinity) {
          guessesAllowed = Infinity;
          displayNumber = Infinity;
        } else {
          guessesAllowed = number + 1;
          displayNumber = number;
        }

        // Update database first
        const { data, error } = await supabase
          .from('rooms')
          .update({
            game_state: {
              ...currentState,
              currentClue: {
                text: clue,
                number: displayNumber // Store the original number for display
              },
              guessesRemaining: guessesAllowed, // Store calculated guesses
              canGuess: true,
              // Add a flag to distinguish clue type
              clueType: number === 0 || number === Infinity ? 'special' : 'normal'
            }
          })
          .eq('id', roomId)
          .select()
          .single();

        if (error) throw error;

        // Only update local state after successful database update
        set(deserializeGameState(data.game_state));

        // Add to history with original number
        await addToHistory(roomId, {
          type: 'clue',
          data: {
            team: currentState.currentTurn,
            clue,
            number: displayNumber
          }
        });
      } catch (error) {
        console.error('Error setting clue:', error);
        toast.error('Failed to submit clue');
        throw error;
      }
    },

    endTurn: async (roomId) => {
      try {
        update(state => {
          const newState = {
            ...state,
            currentTurn: state.currentTurn === 'red' ? 'blue' : 'red',
            currentClue: null,
            guessesRemaining: 0,
            canGuess: false
          };

          updateSupabase(roomId, newState);
          return newState;
        });
      } catch (error) {
        console.error('Error ending turn:', error);
        throw error;
      }
    },

    resetGame: async (roomId) => {
      try {
        // Get current game state to access word list
        const { data: room } = await supabase
          .from('rooms')
          .select('game_state')
          .eq('id', roomId)
          .single();

        if (!room?.game_state) throw new Error('No game state found');

        const allWords = room.game_state.fullWordList
          .split('\n')
          .map(word => word.trim())
          .filter(word => word.length > 0 && word.length <= 30);

        // Shuffle and select 25 words
        const shuffledWords = [...allWords]
          .sort(() => Math.random() - 0.5)
          .slice(0, 25);

        // Create new card distribution
        const cardColors = [
          ...Array(8).fill('red'),     // 8 red cards
          ...Array(9).fill('blue'),    // 9 blue cards
          ...Array(7).fill('neutral'), // 7 neutral cards
          'black'                      // 1 black card
        ];

        // Shuffle colors and create new cards
        const shuffledColors = [...cardColors].sort(() => Math.random() - 0.5);
        const newCards = shuffledWords.map((word, index) => ({
          word,
          color: shuffledColors[index],
          revealed: false
        }));

        // Create fresh game state
        const newGameState = {
          cards: newCards,
          currentTurn: 'blue',
          blueCardsLeft: 9,
          redCardsLeft: 8,
          gameOver: false,
          winner: null,
          currentClue: null,
          guessesRemaining: 0,
          canGuess: false,
          fullWordList: room.game_state.fullWordList
        };

        // Update the game state in database
        const { error: updateError } = await supabase
          .from('rooms')
          .update({ game_state: newGameState })
          .eq('id', roomId);

        if (updateError) throw updateError;

        // Clear game history
        const { error: historyError } = await supabase
          .from('game_history')
          .delete()
          .eq('room_id', roomId);

        if (historyError) throw historyError;

        // Reset all players in the room
        const { error: playersResetError } = await supabase
          .from('players')
          .update({
            team: null,
            role: null
          })
          .eq('room_id', roomId);

        if (playersResetError) throw playersResetError;

        // Update local state
        set(newGameState);
        toast.success('Game reset! Everyone needs to select their teams again.');

      } catch (error) {
        console.error('Error resetting game:', error);
        toast.error('Failed to reset game');
        throw error;
      }
    }
  };
}

export const gameStore = createGameStore();