# Socket.io Docs
Open Trivia uses [socket.io](https://socket.io/) for fast, real-time communication. The documentation below will provide a list of event names and arguments used. 

[Contestant Namespace](#contestant-namespace) - Used by all participants

[Host Namespace](#host-namespace) - Used only by the event hosts

## Contestant Namespace
Contestants connect to the global namespace (`/`). 

In order for a contestant to connect, they must first authenticate using their Team PIN. In addition, unless the `OT_SKIP_NAMES` environment variable is set to `1`, they'll be required to go through the `/identity` path and enter their name. 

Note that hosts also have access to the global namespace. 

## Contestant Events
Each of these events are strings that can be sent **from a client to the server**, along with the corresponding arguments needed. 

### status
Returns the current state and status of a user's connection. 

Argument: `mode` *boolean*
- `true` to recieve the `status` event reply

Possible replies: 
- `status` *object* - if mode is set to false
  - `valid` *boolean*
  - `user` *string*
- `config-bk` *string* - background image URL 
- `question` *object* - current question, if a question is active
  - object from `getCurrentQuestion()`
- `announcement` *object* - current announcement, if an announcement is active
  - object from `currentMessage`
- `scores-release` *no argument* - if currently on the special "score release" page

### tn-ping
Sent every ~6 seconds to ping the server. 

Argument: *none*

Reply: `pong` *no argument* 

### sec-login
*Deprecated.*

Used to join the `hosts` room. No longer used. 

### answer
Used to submit an answer to a question. 
*Triggers the `teamBroadcast` function to ensure all teammates have the same information.*

Argument: `answer` *string* 

Reply: 
- **Non-timed questions:** `answer-ack` *object* - answer acknowledgement, sent to the entire team
  - `ok` *boolean* - if the answer was successfully submitted or not
  - `msg` *string* - error details if ok was false
  - `sender` *boolean* - whether the user recieving the acknowledgement was the user who originally submitted the answer
  - `[selected]` *string* - what was selected (for teammates' devices), not always used
- **Timed questions:** `answer-time` 
  - `correct` *boolean* - whether the answer submitted was correct 
  - `[answer]` *string* - the correct answer (if applicable)
  - `[time]` *number* - time taken to answer, in ms
  - `[message]` *string* - help message, if applicable (i.e., "too low" on a number)

### ac-blur
Event sent when a user leaves their competition tab

### ac-focus
Event sent when a user returns to their competition tab

## Host Namespace
Hosts connect to a host-specific, secure namespace (`/secure`).

In order for a host to connect, they must have authenticated via the host key set using the `HOST_KEY` environment variable. Otherwise, the connection request will be rejected. 