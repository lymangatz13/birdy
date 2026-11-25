# Publishing Pulse Tag

Pulse Tag is static files in `public/`. Players connect directly to each other (see `public/birdy/net.js`), so any static host works.

## GitHub Pages (current)

In the Birdy repository, `.github/workflows/deploy.yml` copies `pulse-tag/public` into the site at `/pulse-tag/` on every push to `main`. The game is at https://lymangatz13.github.io/birdy/pulse-tag/.

## Render (optional)

`render.yaml` runs `server.js`, a small static file server, as a Node web service. When it lives in the Birdy repository under `pulse-tag/`, use the repository-root `render.yaml`, which selects this folder with `rootDir`.

1. In Render, create a Blueprint and connect the repository.
2. Review `render.yaml`, choose a service plan in Render, and create the service.
3. Open the service URL and create a room. The other player opens the same URL and joins with the room code.

## How a match runs

- The room creator's browser hosts the match: it keeps the score, timer and catch rules (`public/birdy/roomlogic.js`) and checks the ant player's moves.
- The free public PeerJS service introduces the two browsers. Add `?peerHost=…&peerPort=…&peerPath=…&peerSecure=0|1` to the page URL to use a different PeerJS server.
- If the room creator closes or reloads the page, the room ends; both players see "CONNECTION LOST".
