# Birdy

Pulse Tag, a two-player robot-versus-ant chase in a voxel bedroom.

Play: https://lymangatz13.github.io/birdy/

## Pulse Tag

Pulse Tag is a two-player game. Player 1 creates a room and controls the robot; player 2 opens the same page, enters the room code, and controls the ant in first person.

It needs no server of its own: the players' browsers connect directly to each other (WebRTC, via PeerJS), and the room creator's browser runs the match. The free public PeerJS service is used only to introduce the two players. If both players are behind strict networks, PeerJS falls back to its public relay servers.

### Run locally

```powershell
npm ci
npm run dev
```

Open the address it prints (usually `http://localhost:5173`) and create a room. An internet connection is still needed to reach the PeerJS service.

### Publish

Every push to `main` runs the tests, builds the site and publishes it to GitHub Pages (`.github/workflows/deploy.yml`).
