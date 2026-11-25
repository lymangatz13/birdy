# Birdy

This repository keeps the original Birdy Three.js room simulation at the repository root. The multiplayer robot-versus-ant adaptation lives in `pulse-tag/`.

Both are published on GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`:

- Birdy: https://lymangatz13.github.io/birdy/
- Pulse Tag: https://lymangatz13.github.io/birdy/pulse-tag/

## Pulse Tag

Pulse Tag is a two-player game. Player 1 creates a room and controls the robot; player 2 opens the same page, enters the room code, and controls the ant in first person.

It needs no server of its own: the players' browsers connect directly to each other (WebRTC, via PeerJS), and the room creator's browser runs the match. The free public PeerJS service is used only to introduce the two players. If both players are behind strict networks, PeerJS falls back to its public relay servers.

### Run Pulse Tag locally

```powershell
cd pulse-tag
npm ci
npm start
```

Open `http://localhost:4173` (or the configured `PORT`) and create a room. An internet connection is still needed to reach the PeerJS service.

### Render (optional)

The repository-root `render.yaml` defines a Node web service with `rootDir: pulse-tag` that serves the same static files. Connect this repository as a Render Blueprint and create the service. Automatic deploys are off by default in the Blueprint.
