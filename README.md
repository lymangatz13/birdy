# Birdy: Jack and the Giant Slayer

Jack and the Giant Slayer is a two-player online game of hide and seek, set in a 3D voxel bedroom with a giant beanstalk. One player is an ugly 3D giant who walks around the room trying to catch and grab Jack. The other player is Jack, a tiny red stick figure one tenth of the giant's size, who runs, hides and dodges anywhere in the room.

Play in the browser: https://lymangatz13.github.io/birdy/

> **Status:** this README describes the game being built now. The version live at the link above may still be the earlier robot-and-ant game until the new version is released.

## The players

- **Player 1: the Giant.** A large, ugly 3D figure with a head, body, arms and legs. The Giant walks around the room with `W` `A` `S` `D` and reaches out with its arms to grab Jack.
- **Player 2: Jack.** A tiny stick figure painted red, about 1/10 of the Giant's height. Jack can go anywhere in the room: across the floor, under the bed and the desk, and onto furniture.

## The room

The game takes place in a 3D bedroom with a sloped attic ceiling, modelled on a real room. Jack can use every piece of furniture to hide:

- a bed with pillows and blankets, a nightstand with a lamp, a printer and a mug
- a window with blinds and a wall air conditioner, two framed diplomas, a fly swatter and a hanging flower vase
- a desk with monitors, a laptop and clutter, a black-and-white gaming chair and an electric guitar with an amp
- a mini fridge, a wooden dresser, a radiator, a laundry basket and a pair of shoes
- a giant beanstalk growing up through the room

The mug and the laptop from the original desk are still there.

## Rules

- **Player 1 is the Giant** (the player who creates the room). **Player 2 is Jack** (the player who joins).
- A match lasts **3 minutes**.
- **The Giant wins** by grabbing Jack and **holding Jack for 10 seconds**. If the Giant lets go before 10 seconds, Jack is free again and the hold timer starts over at the next grab.
- **Jack wins** by not being held for 10 seconds before the clock runs out.
- When the match ends, both players can press **REMATCH**. The same room starts a new match once both have pressed it.

## Controls

### Giant (Player 1)

| Action | Keyboard and mouse |
| --- | --- |
| Walk forward / back | `W` / `S` |
| Turn left / right | `A` / `D` |
| Aim the active hand | Move the mouse |
| Grab / let go | Left click |
| Select left / right arm | `Q` / `E` |

### Jack (Player 2)

| Action | Keyboard |
| --- | --- |
| Run forward / back | `W` / `S` |
| Turn left / right | `A` / `D` |
| Jump (to climb onto furniture) | `Space` |

On phones and tablets, on-screen buttons replace the keys.

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
| `src/roomlogic.js` | Match rules: timer, win conditions, rematch (no DOM or network) |
| `src/net.js` | Peer-to-peer connection with PeerJS |
| `src/room.js` | The voxel bedroom and desk |
| `src/robot.js` | Arm movement (being replaced by the Giant) |
| `src/ants.js` | Background ants |
| `src/items.js` | The mug and laptop, and how they fall |
| `src/sky.js` | Day/night cycle |
| `src/style.css` | Styles |
| `tests/` | Vitest tests (`tests/**/*.test.js`) |

Built with [Three.js](https://threejs.org/), [PeerJS](https://peerjs.com/), [Vite](https://vitejs.dev/) and [Vitest](https://vitest.dev/).

### Deploying to GitHub Pages

The workflow `.github/workflows/deploy.yml` deploys the site on every push to `main` (it can also be started by hand from the **Actions** tab). It runs `npm ci`, `npm test` and `npm run build`, then publishes `dist/` to GitHub Pages. If the tests fail, nothing is deployed.

In the repository settings, **Settings → Pages → Source** must be set to **GitHub Actions**.

`vite.config.js` sets `base: './'`, so the built site works from any path, including `https://<user>.github.io/birdy/`.
