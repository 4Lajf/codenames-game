Sometimes the client does not receive the new player join event and the playerList becomes stale.
The 1st client the one that created the room is always up to date
But the second that joined sees only the 1st client
the 3rd client that joined sees only the 2nd and 1st client
the 4th client that joined sees only the 1st and 2nd and 3rd client
In all cases (apart from 1st client), the don't see themselves on the PlayerLsit either.

Make the timer only start after the first clue is submited.
Make the timer stop couting when there is gameover state.
Make the timer able to pause/resume by clicking it
add configuration to the room creation to supply a custom timer duration in seconds
Also clicking on the timer should pause it for everybody and display the same message.
Synchronize the timer in 10 second intervals between clients.