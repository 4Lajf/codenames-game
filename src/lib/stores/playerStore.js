// src/lib/stores/playerStore.js
import { writable } from 'svelte/store';
import { supabase } from '$lib/supabase';
import { toast } from 'svelte-sonner';

function createPlayerStore() {
  const { subscribe, set, update } = writable({
    username: null,
    team: null,
    role: null,
    isConnected: true,
    presence: {
      fullState: {},
      onlinePlayers: [],
      lastUpdate: null
    }
  });

  const presenceState = writable({});
  let presenceChannel;
  let currentState = null;
  let presenceTrackingInterval = null;

  subscribe(value => {
    currentState = value;
  });

  const updatePresenceData = (state) => {
    const onlinePlayers = Object.values(state).flat().map(player => ({
      name: player.name,
      playerId: player.player_id,
      team: player.team,
      role: player.role,
      onlineAt: player.online_at,
      presenceRef: player.presence_ref
    }));

    update(current => ({
      ...current,
      presence: {
        fullState: state,
        onlinePlayers,
        lastUpdate: new Date().toISOString()
      }
    }));
  };

  const self = {
    subscribe,
    set,
    presenceState,

    setPlayer: async (username, roomId) => {
      try {
        if (!username.trim()) {
          throw new Error('Username cannot be empty');
        }

        if (!/^[a-zA-Z0-9_-]{2,20}$/.test(username)) {
          throw new Error('Username can only contain letters, numbers, underscores, and hyphens (2-20 characters)');
        }

        const playerData = {
          username,
          team: null,
          role: null,
          online: true,
          last_seen: new Date().toISOString(),
          last_heartbeat: new Date().toISOString()
        };

        const { error: addError } = await supabase.rpc('add_player_to_room', {
          p_room_id: roomId,
          p_username: username,
          p_player_data: JSON.stringify(playerData)
        });

        if (addError) {
          console.error('Error adding player:', addError);
          throw addError;
        }

        update(current => ({
          ...current,
          username,
          team: null,
          role: null,
          isConnected: true,
          presence: {
            ...current.presence,
            lastUpdate: new Date().toISOString()
          }
        }));

        await self.initializePresence(roomId);

        return username;

      } catch (error) {
        console.error('Error in setPlayer:', error);
        toast.error(error.message);
        throw error;
      }
    },

    updateTeamAndRole: async (roomId, team, role) => {
      return new Promise(async (resolve, reject) => {
        try {
          const username = currentState.username;
          if (!username) throw new Error('No user set');

          update(state => ({
            ...state,
            team,
            role,
            presence: {
              ...state.presence,
              lastUpdate: new Date().toISOString()
            }
          }));

          const { data: room } = await supabase
            .from('rooms')
            .select('game_state')
            .eq('id', roomId)
            .single();

          if (room?.game_state?.gameStarted) {
            throw new Error('Cannot change team/role during active game');
          }

          const presencePlayers = Object.values(await presenceChannel.presenceState() || {}).flat();
          const existingSpymaster = presencePlayers.find(p =>
            p.team === team &&
            p.role === 'spymaster' &&
            p.name !== username
          );

          if (role === 'spymaster' && existingSpymaster) {
            throw new Error(`${team} team already has a Spymaster`);
          }

          const { error } = await supabase.rpc('update_player_in_room', {
            p_room_id: roomId,
            p_username: username,
            p_team: team,
            p_role: role
          });

          if (error) throw error;

          if (presenceChannel) {
            await presenceChannel.track({
              player_id: username,
              name: username,
              team,
              role,
              online_at: new Date().toISOString()
            });
          }

          resolve();
        } catch (error) {
          console.error('Error updating team and role:', error);
          update(state => ({
            ...state,
            team: null,
            role: null,
            presence: {
              ...state.presence,
              lastUpdate: new Date().toISOString()
            }
          }));
          reject(error);
        }
      });
    },

    initializePresence: async (roomId) => {
      try {
        console.log('PlayerStore: Initializing presence for room:', roomId);

        if (presenceChannel) {
          await presenceChannel.unsubscribe();
        }

        presenceChannel = supabase.channel(`presence:${roomId}`, {
          config: {
            presence: {
              key: roomId
            }
          }
        });

        // Add subscription to player updates
        const playerSubscription = supabase
          .channel(`players:${roomId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'players',
              filter: `room_id=eq.${roomId}`
            },
            async (payload) => {
              // When players are updated (like during reset)
              if (payload.eventType === 'UPDATE') {
                // Update local state if this update affects current player
                if (currentState?.username === payload.new.username) {
                  update(current => ({
                    ...current,
                    team: payload.new.team,
                    role: payload.new.role
                  }));

                  // Also update presence state
                  if (presenceChannel) {
                    await presenceChannel.track({
                      player_id: currentState.username,
                      name: currentState.username,
                      team: payload.new.team,
                      role: payload.new.role,
                      online_at: new Date().toISOString()
                    });
                  }
                }
              }
            }
          )
          .subscribe();

        // Store subscription for cleanup
        self.playerSubscription = playerSubscription;

        presenceChannel
          .on('presence', { event: 'sync' }, () => {
            const state = presenceChannel.presenceState();
            presenceState.set(state);
            updatePresenceData(state);

            update(current => {
              const currentUserPresence = Object.values(state)
                .flat()
                .find(p => p.name === current.username);

              return {
                ...current,
                isConnected: !!currentUserPresence,
                team: currentUserPresence?.team || current.team,
                role: currentUserPresence?.role || current.role
              };
            });
          })
          .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            const state = presenceChannel.presenceState();
            presenceState.set(state);
            updatePresenceData(state);

            update(current => {
              const joinedUser = newPresences.find(p => p.name === current.username);
              if (joinedUser) {
                return {
                  ...current,
                  isConnected: true,
                  team: joinedUser.team || current.team,
                  role: joinedUser.role || current.role
                };
              }
              return current;
            });
          })
          .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            const state = presenceChannel.presenceState();
            presenceState.set(state);
            updatePresenceData(state);

            update(current => {
              const leftUser = leftPresences.find(p => p.name === current.username);
              if (leftUser) {
                return {
                  ...current,
                  isConnected: false
                };
              }
              return current;
            });
          });

        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Presence subscription timeout'));
          }, 10000);

          presenceChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              clearTimeout(timeout);

              if (currentState?.username) {
                const userStatus = {
                  player_id: currentState.username,
                  name: currentState.username,
                  team: currentState.team,
                  role: currentState.role,
                  online_at: new Date().toISOString()
                };

                try {
                  await presenceChannel.track(userStatus);
                  resolve(true);
                } catch (error) {
                  reject(error);
                }
              } else {
                resolve(true);
              }
            } else if (status === 'CHANNEL_ERROR') {
              clearTimeout(timeout);
              reject(new Error('Channel subscription failed'));
            }
          });
        });

        if (presenceTrackingInterval) {
          clearInterval(presenceTrackingInterval);
        }

        presenceTrackingInterval = setInterval(async () => {
          if (presenceChannel && currentState?.username) {
            try {
              await presenceChannel.track({
                player_id: currentState.username,
                name: currentState.username,
                team: currentState.team,
                role: currentState.role,
                online_at: new Date().toISOString()
              });
            } catch (error) {
              console.error('PlayerStore: Error tracking presence:', error);
            }
          }
        }, 5000);

        return presenceChannel;
      } catch (error) {
        console.error('PlayerStore: Error initializing presence:', error);
        throw error;
      }
    },

    reconnect: async (roomId) => {
      try {
        const username = currentState?.username;

        if (username) {
          const playerData = {
            username,
            team: null,
            role: null,
            online: true,
            last_seen: new Date().toISOString()
          };

          const { error } = await supabase.rpc('add_player_to_room', {
            p_room_id: roomId,
            p_username: username,
            p_player_data: JSON.stringify(playerData)
          });

          if (error) throw error;

          update(current => ({
            ...current,
            username,
            team: null,
            role: null,
            isConnected: true,
            presence: {
              ...current.presence,
              lastUpdate: new Date().toISOString()
            }
          }));

          await self.initializePresence(roomId);

          return true;
        }
        return false;
      } catch (error) {
        console.error('PlayerStore: Reconnection error:', error);
        toast.error('Failed to reconnect');
        return false;
      }
    },

    cleanup: async () => {
      try {
        if (presenceTrackingInterval) {
          clearInterval(presenceTrackingInterval);
        }

        if (presenceChannel) {
          const username = currentState?.username;
          const roomId = presenceChannel.topic.split(':')[1];

          if (username && roomId) {
            await supabase.rpc('remove_player_from_room', {
              p_room_id: roomId,
              p_username: username
            });

            await presenceChannel.untrack();
            await presenceChannel.unsubscribe();
          }
        }

        if (self.playerSubscription) {
          await self.playerSubscription.unsubscribe();
        }

        set({
          username: null,
          team: null,
          role: null,
          isConnected: false,
          presence: {
            fullState: {},
            onlinePlayers: [],
            lastUpdate: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    },

    clearSession: async (roomId) => {
      try {
        const username = currentState?.username;

        if (username && roomId) {
          await supabase.rpc('remove_player_from_room', {
            p_room_id: roomId,
            p_username: username
          });
        }

        if (presenceChannel) {
          await presenceChannel.untrack();
          await presenceChannel.unsubscribe();
        }

        set({
          username: null,
          team: null,
          role: null,
          isConnected: false,
          presence: {
            fullState: {},
            onlinePlayers: [],
            lastUpdate: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error('Clear session error:', error);
      }
    },

    resetPlayerRole: async () => {
      update(current => ({
        ...current,
        team: null,
        role: null
      }));

      if (presenceChannel) {
        await presenceChannel.track({
          player_id: currentState.username,
          name: currentState.username,
          team: null,
          role: null,
          online_at: new Date().toISOString()
        });
      }
    },

    resetAllPlayers: async (roomId) => {
      try {
        // Get all players in the room
        const { data: players, error: fetchError } = await supabase
          .from('players')
          .select('*')
          .eq('room_id', roomId);

        if (fetchError) throw fetchError;

        // Batch update all players to remove teams and roles
        const { error: updateError } = await supabase
          .from('players')
          .update({
            team: null,
            role: null
          })
          .eq('room_id', roomId);

        if (updateError) throw updateError;

        // Reset presence for all players
        if (presenceChannel) {
          try {
            const state = await presenceChannel.presenceState();
            const roomPlayers = Object.values(state).flat();

            // Track each player with null team and role
            for (const player of roomPlayers) {
              await presenceChannel.track({
                player_id: player.name,
                name: player.name,
                team: null,
                role: null,
                online_at: new Date().toISOString()
              });
            }
          } catch (error) {
            console.error('Error resetting presence state:', error);
          }
        }

        // Completely reset the store state
        set({
          username: currentState?.username || null,
          team: null,
          role: null,
          isConnected: true,
          presence: {
            fullState: {},
            onlinePlayers: [],
            lastUpdate: new Date().toISOString()
          }
        });

        return true;
      } catch (error) {
        console.error('Error resetting players:', error);
        toast.error('Failed to reset players');
        throw error;
      }
    },

    broadcastPlayerReset: async (roomId) => {
      try {
        // Broadcast a reset event to all clients in the room
        await supabase
          .from('room_events')
          .insert({
            room_id: roomId,
            event_type: 'RESET_PLAYERS',
            timestamp: new Date().toISOString()
          });
      } catch (error) {
        console.error('Error broadcasting player reset:', error);
        toast.error('Failed to reset players across clients');
      }
    },
  };

  return self;
}

export const playerStore = createPlayerStore();