# Publishing Pulse Tag

This project is prepared for Render as a Node web service. When used on its own, its `render.yaml` builds with `npm ci`, starts with `npm start`, checks `/`, and leaves automatic deploys off until you turn them on. When it lives in the Birdy repository under `pulse-tag/`, the repository-root Blueprint selects that folder with `rootDir`.

## Publish

1. Put this project in a GitHub repository, either on its own or under `pulse-tag/` in the Birdy repository.
2. In Render, create a Blueprint and connect the repository containing this project. For the Birdy monorepo, use the repository-root `render.yaml`.
3. Review `render.yaml`, choose a service plan in Render, and create the service.
4. Open the service URL and create a room. The other player should open the same URL and join with the room code.

The room list is kept in server memory. Use one running service instance; a server restart clears open rooms.
