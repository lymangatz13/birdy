# Birdy: Jack and the Giant Slayer

Jack and the Giant Slayer is a two-player online game of hide and seek, set in a 3D voxel bedroom with a giant beanstalk. One player is an ugly 3D giant who walks around the room trying to catch and grab Jack. The other player is Jack, a tiny red stick figure one tenth of the giant's size, who runs, hides and dodges anywhere in the room.

Play in the browser: https://lymangatz13.github.io/birdy/

## The players

- **Player 1: the Giant.** A big, ugly 3D giant, about 20 voxels (2 m) tall, with a head, body, arms and legs. The Giant walks around the room, crouches to look under furniture, and grabs Jack with one hand.
- **Player 2: Jack.** A tiny stick figure painted red, about 1/10 of the Giant's height. Jack can go anywhere in the room: across the floor, under the bed, onto furniture and up the leaves of the beanstalk.

## The room

The game takes place in a 3D attic bedroom with a sloped ceiling, modelled on a real room. Places to run and hide include:

- a bed raised on legs (with a gap underneath), pillows and a blanket slumped onto the floor, a nightstand with a lamp, a printer, a red cup and a toilet roll, and a black radiator
- a window with blinds and an air conditioner, two framed diplomas, a bug-zapper racket and a wall vase of flowers
- a dresser, a mini fridge with a blue light, a desk with drawers and clutter (with the laptop and the mug on it), a white desk with two monitors and an amp, an electric guitar and a gaming chair
- a bookshelf, a framed picture, a door with a light switch, a rug, a laundry basket, a pair of shoes, a cardboard box and a potted plant
- a giant beanstalk growing from the middle of the floor up through a hole in the ceiling, with leaves Jack can climb

## Rules

- **Player 1 is the Giant** (the player who creates the room). **Player 2 is Jack** (the player who joins).
- A match lasts **3 minutes**.
- **The Giant wins** by grabbing Jack and **holding Jack for 10 seconds**.
- A grab only works if Jack is the first thing under the Giant's crosshair and within reach (12.5 voxels from the Giant, measured across the floor).
- While held, Jack can **struggle** by pressing `Space` repeatedly. The struggle meter drains slowly by itself; when it fills, Jack wriggles free, the hold timer resets, and Jack cannot be grabbed again for 2.5 seconds.
- **Jack wins** if the clock runs out before the Giant has held Jack for 10 seconds.
- When the match ends, both players can press **REMATCH**. The same room starts a new match once both have pressed it.

## Controls

Click the room first to lock the mouse, so moving the mouse looks around. Press `Esc` to unlock it.

### Giant (Player 1)

| Action | Keyboard and mouse | Touch (phones and tablets) |
| --- | --- | --- |
| Look around and turn | Move the mouse | Drag on the room |
| Walk forward / back | `W` / `S` | On-screen arrows |
| Step left / right | `A` / `D` | On-screen arrows |
| Crouch | Hold `C` | **CROUCH** button |
| Grab Jack (under the crosshair) | Left click | Quick tap, or the **GRAB** button |

### Jack (Player 2)

| Action | Keyboard and mouse | Touch (phones and tablets) |
| --- | --- | --- |
| Look around | Move the mouse | Drag on the room |
| Run (relative to the camera) | `W` `A` `S` `D` | On-screen arrows |
| Jump | `Space` | **JUMP** button |
| Struggle free while held | Press `Space` repeatedly | Press **JUMP** repeatedly |

## How to play online

1. Open https://lymangatz13.github.io/birdy/.
2. **Player 1 (Giant):** enter a name (optional) and press **CREATE A ROOM**. A 4-character room code appears.
3. Send the code to Player 2, or press **COPY LINK** and send the link (it opens the game with the code already filled in).
4. **Player 2 (Jack):** open the game, enter the code (or open the link) and press **JOIN**. The match starts as soon as Jack joins.

How the connection works:

- The game has no server of its own. The two browsers connect directly to each other (WebRTC, through [PeerJS](https://peerjs.com/)). The free public PeerJS service is used only to find the other player.
- The Giant player's browser runs the match. If Player 1 closes the tab or loses the connection, the match stops and Player 2 sees **CONNECTION LOST**.
- A room holds two players. A third player who tries to join is refused.
- Both players need an internet connection. Some strict networks (for example, some company or school networks) block direct browser connections.

Optional URL parameters:

- `?room=ABCD` fills in the room code on the lobby screen.
- `?speed=N` makes the day/night cycle run N times faster (set by the player who creates the room; both players see the same sky).
- `?peerHost=&peerPort=&peerPath=&peerSecure=0|1` connect to a different PeerJS server, for testing.

## Development

Requires [Node.js](https://nodejs.org/) (the deploy workflow uses Node 22).

```sh
npm install      # install dependencies
npm run dev      # start the Vite dev server with hot reload
npm test         # run the Vitest tests once
npm run build    # build the static site into dist/
```

To test online play locally, open the dev server URL in two browser windows: create a room in one and join it from the other.

### Project layout

| Path | Contents |
| --- | --- |
| `index.html` | Lobby and game screens |
| `src/main.js` | Rendering, input and the game loop |
| `src/roomlogic.js` | Match rules: timer, grab and hold, struggle, rematch (no DOM or network) |
| `src/net.js` | Peer-to-peer connection with PeerJS |
| `src/room.js` | The voxel attic bedroom, its furniture and the beanstalk |
| `src/giant.js` | The Giant's model and movement |
| `src/jack.js` | Jack's stick figure and physics |
| `src/items.js` | The laptop and the mug |
| `src/sky.js` | Day/night cycle |
| `src/style.css` | Styles |
| `tests/` | Vitest tests (`tests/**/*.test.js`) |

Built with [Three.js](https://threejs.org/), [PeerJS](https://peerjs.com/), [Vite](https://vitejs.dev/) and [Vitest](https://vitest.dev/).

### Deploying to GitHub Pages

The workflow `.github/workflows/deploy.yml` deploys the site on every push to `main` (it can also be started by hand from the **Actions** tab). It runs `npm ci`, `npm test` and `npm run build`, then publishes `dist/` to GitHub Pages. If the tests fail, nothing is deployed.

In the repository settings, **Settings → Pages → Source** must be set to **GitHub Actions**.

`vite.config.js` sets `base: './'`, so the built site works from any path, including `https://<user>.github.io/birdy/`.
