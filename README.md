# Last Race

Exam project by Berke Sayicioglu for Web Applications I.

Last Race is a single-player metro route-planning game built with React, Express, Passport, and SQLite. Players study a colored network, receive a random start and destination, and have 90 seconds to submit a valid route.

## Main Features

- Session-based login with Passport Local Strategy.
- SQLite-backed stations, metro lines, colors, connections, events, users, and games.
- Random start and destination for every new game.
- A new journey is different from the player's immediately previous journey.
- 90-second route-planning timer.
- Server-side route validation and scoring.
- Random positive and negative events for valid route segments.
- General ranking based on each player's best valid score.
- Multiple games per authenticated player through **Play again**.
- Confirmation dialogs before leaving an active game or logging out.
- The timer pauses while a confirmation dialog is open.
- Start station highlighting and green destination highlighting.
- Submitted route visualization:

  - green for a valid route;
  - red for an invalid route.
- Light and dark themes.
- Responsive desktop, tablet, and mobile layouts.

## Running the Application

The client and server run in separate terminals.

### Server

```bash
cd server
npm install
npm run dev
```

The API server runs at `http://localhost:3001`.

`npm run dev` uses Node watch mode. Saving `server/index.js` restarts the server and synchronizes the configured metro data with SQLite.

For a normal non-watching start:

```bash
npm start
```

### Client

```bash
cd client
npm install
npm run dev
```

The React application runs at `http://localhost:5173`.

## Test Accounts

| Email | Password |
| --- | --- |
| `alice@student.test` | `alice` |
| `berke@student.test` | `berke` |
| `marta@student.test` | `marta` |
| `berra@student.test` | `berra` |
| `can@student.test` | `can` |

## Game Flow

1. Log in with a seeded account.
2. Study the complete colored network on the Setup screen.
3. Start a new game to receive a random start and destination.
4. Build a route by selecting stations in order.
5. Submit the route before the timer reaches zero.
6. Review the score, route validity, and event log.
7. Select **Play again** for a new random journey or return to Setup.

During an active game, Ranking is hidden. Attempting to return to Setup opens a confirmation dialog because leaving abandons the current route.

## Database-Backed Network

The metro configuration is defined near the top of `server/index.js`:

- `lines`: line names and colors;
- `stations`: names, coordinates, and interchange flags;
- `connections`: station pairs and their line;
- `events`: descriptions and score effects.

At server startup, this configuration is synchronized with `server/last-race.sqlite`:

- lines and stations are inserted or updated;
- connections and events are rebuilt;
- users and game history are preserved.

When changing network data, save `server/index.js`. With `npm run dev`, the server restarts automatically. Return to the Setup screen or start a new game to load the updated network.

## API

### Public endpoints

- `GET /api/session` - returns the authenticated user or `null`.
- `POST /api/sessions` - logs in with `{ "email": "...", "password": "..." }`.
- `DELETE /api/sessions/current` - logs out.
- `GET /api/instructions` - returns the game title and instructions.
- `GET /api/ranking` - returns players ranked by best valid score.

### Authenticated endpoints

- `GET /api/network` - returns database-backed lines, stations, and connections.
- `POST /api/games` - creates a game with a random reachable journey.
- `POST /api/games/:id/submit` - validates and scores `{ "route": [stationId, ...] }`.
- `GET /api/me/games` - returns the current player's completed games.

## Database Tables

- `users` - account details, password salt, and password hash.
- `lines` - metro line names and colors.
- `stations` - station names, SVG coordinates, and interchange flags.
- `connections` - connected station pairs and line IDs.
- `events` - random journey events and score effects.
- `games` - assigned journeys, submitted routes, validity, score, and event logs.

## Main React Components

- `App` - session, navigation, theme, game, and confirmation-dialog state.
- `Login` - controlled authentication form.
- `SetupPage` - network overview and new-game entry point.
- `StationMap` - SVG network and route visualization.
- `Game` - timer, route builder, submission, result, and replay flow.
- `Ranking` - best-score leaderboard.
- `ConfirmationModal` - reusable leave-game and logout confirmation dialog.

## Validation Commands

Run these inside `client`:

```bash
npm run lint
npm run build
```

## Screenshots

![Ranking and setup](exam-1-last-race-berkesayicioglu\img\gameplay.svg)

![Game planning](exam-1-last-race-berkesayicioglu\img\ranking.svg)

## Use of AI Tools

AI assistance was used to interpret the assignment, implement and refine the React/Express/SQLite application, improve the interface, and diagnose client/server issues. The resulting code was reviewed and verified with linting, production builds, server syntax checks, and HTTP smoke tests.
