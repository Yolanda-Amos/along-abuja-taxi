# Along! — Berger to Wuse

A 3D shared-taxi game for [start.ng](https://start.ng), set on an Abuja commute (Berger → Area 1 → Banex → Wuse Zone 4 → Wuse Market).

Drive a green-and-white taxi, load and drop passengers at the right stop, earn fares, and honk to warn waiting passengers off unpainted cars. Your start.ng character drives the taxi and the score goes to the start.ng leaderboard.

Built by Yolanda Amos (Team Yoda, HNG Internship) with Three.js.

## Play

Open `index.html` through a web server (or the published start.ng link). Arrow keys / A D change lane, Space or ↓ stops, H honks. On a phone: tap left or right of the screen, hold STOP, tap HONK.

## Build

`npm install` then `npx esbuild src/main.js --bundle --format=iife --outfile=game.js`

Inspired by everyday Abuja commuting. Not affiliated with any transport operator or app.
