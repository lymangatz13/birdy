# Birdy: Pulse Tag

Pulse Tag is a two-player online chase set in a voxel bedroom. One player is a robot standing at a desk, working two arms to grab a mug and a laptop. The other player is a small red ant running across the desk top. The robot tries to catch the ant by dropping or slamming objects onto it; the ant tries to survive until the clock runs out.

Play in the browser: https://lymangatz13.github.io/birdy/

## Rules

- A match has two players: **Player 1 is the Robot** (the player who creates the room) and **Player 2 is the Ant** (the player who joins).
- A match lasts **3 minutes**.
- The **Robot wins** by catching the ant **3 times** before time runs out.
- The **Ant wins** by surviving until the clock reaches zero.
- A catch counts when a **moving object** (one the robot is holding, or one that is falling) lands on or presses into the ant on the desk top. Dropping the mug or laptop onto the ant, or slamming a held object down onto it, both count.
- After each catch, the ant reappears at a random spot on the desk, away from where it was caught and not under an object.
- The ant can move anywhere on the desk top, including under the mug and the laptop. It cannot leave the desk.
- The desk also has a few background ants that wander around. They do not count towards the score.
- When the match ends, both players can press **REMATCH**. The same room starts a new match once both have pressed it.

## Controls

### Robot (Player 1)

| Action | Keyboard and mouse | Touch (screens 760 px wide or less) |
| --- | --- | --- |
| Aim the active hand | Move the mouse | Touch or drag on the scene |
| Grab / drop an object | Left click | Tap on the scene |
| Press down (slam a held object) | Hold `Space` or the right mouse button | Hold the **PRESS** button |
| Select left / right arm | `Q` / `E` | **LEFT ARM** / **RIGHT ARM** buttons |
| Turn left / right | `A` / `D` or `←` / `→` | Not available |
| Look up / down | `W` / `S` or `↑` / `↓` | Not available |

The active arm's joint is highlighted in orange. Click an object within reach to make the active hand reach for it and pick it up; click again to drop it. An object that is out of reach shows a message instead.

### Ant (Player 2)

| Action | Keyboard | Touch (screens 760 px wide or less) |
| --- | --- | --- |
| Accelerate | `W` or `↑` | **▲** button |
| Brake / reverse | `S` or `↓` | **▼** button |
| Steer left / right | `A` / `D` or `←` / `→` | **◀** / **▶** buttons |

The ant keeps some speed when you let go and slows down gradually.

## How to play online

1. Open https://lymangatz13.github.io/birdy/.
2. **Player 1:** enter a name (optional) and press **CREATE A ROOM**. A 4-character room code appears.
3. Send the code to Player 2, or press **COPY LINK** and send the link (it opens the game with the code already filled in).
4. **Player 2:** open the game, enter the code (or open the link) and press **JOIN**. The match starts as soon as Player 2 joins.

How the connection works:

- The game has no server of its own. The two browsers connect directly to each other (WebRTC, through [PeerJS](https://peerjs.com/)). The free public PeerJS service is used only to find the other player.
- The Robot player's browser runs the match. If Player 1 closes the tab or loses the connection, the match stops and Player 2 sees **CONNECTION LOST**.
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
| `src/roomlogic.js` | Match rules: timer, catches, scoring, rematch (no DOM or network) |
| `src/net.js` | Peer-to-peer connection with PeerJS |
| `src/room.js` | The voxel bedroom and desk |
| `src/robot.js` | Robot body and arm movement |
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
