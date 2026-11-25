# Birdy

This repository keeps the original Birdy Three.js room simulation at the repository root. The multiplayer robot-versus-ant adaptation lives in `pulse-tag/` as a separate Node web app.

## Run Pulse Tag locally

```powershell
cd pulse-tag
npm ci
npm start
```

Open `http://localhost:4173` by default (or the configured `PORT`) and create a room. Player 1 controls the robot; player 2 controls the ant in first person.

## Render

The repository-root `render.yaml` defines a Node web service with `rootDir: pulse-tag`. Connect this repository as a Render Blueprint and create the service. Automatic deploys are off by default in the Blueprint.