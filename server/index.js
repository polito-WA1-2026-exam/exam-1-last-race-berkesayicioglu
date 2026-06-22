import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import session from "express-session";
import passport from "passport";
import LocalStrategy from "passport-local";
import sqlite3 from "sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new sqlite3.Database(path.join(__dirname, "last-race.sqlite"));
const app = express();
const port = 3001;
const CLIENT_ORIGIN = "http://localhost:5173";

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

const hashPassword = (password, salt = crypto.randomBytes(16).toString("hex")) => {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
};

const verifyPassword = (password, salt, hash) => {
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, "hex"));
};

const lines = [
  { id: 1, name: "Crimson", color: "#E76F51" },
  { id: 2, name: "Cyan", color: "#4CC9F0" },
  { id: 3, name: "Teal", color: "#2EC4B6" },
  { id: 4, name: "Lavender", color: "#A78BFA" },
];

const stations = [
  { id: 1, name: "Yenikapi", x: 50, y: 50, interchange: 1 },
  { id: 2, name: "Nisantasi", x: 28, y: 50, interchange: 1 },
  { id: 3, name: "Levent", x: 38, y: 30, interchange: 0 },
  { id: 4, name: "Taksim", x: 58, y: 30, interchange: 1 },
  { id: 5, name: "Kadikoy", x: 72, y: 50, interchange: 1 },
  { id: 6, name: "Uskudar", x: 50, y: 72, interchange: 1 },
  { id: 7, name: "Kartal", x: 72, y: 76, interchange: 0 },
  { id: 8, name: "Bostanci", x: 82, y: 50, interchange: 1 },
  { id: 9, name: "Levent", x: 82, y: 72, interchange: 1 },
  { id: 10, name: "Haciosman", x: 18, y: 30, interchange: 0 },
  { id: 11, name: "Bagcilar", x: 18, y: 72, interchange: 0 },
  { id: 12, name: "Atakoy", x: 38, y: 86, interchange: 0 },
];

const connections = [
  // Crimson Line
  [10, 3, 1],
  [3, 4, 1],
  [4, 5, 1],
  [5, 8, 1],
  [10, 2, 1],

  // Cyan Line
  [2, 1, 2],
  [1, 5, 2],
  [5, 8, 2],
  [8, 9, 2],
  [9, 7, 2],

  // Teal Line
  [2, 11, 3],
  [11, 12, 3],
  [12, 6, 3],
  [6, 1, 3],
  [1, 4, 3],

  // Lavender Line
  [2, 6, 4],
  [6, 7, 4],
  [7, 5, 4],
  [5, 4, 4],
];

const events = [
  ["Quiet journey", 0],
  ["Wrong platform", -2],
  ["Kind passenger", 1],
  ["Express escalator", 2],
  ["Crowded carriage", -3],
  ["Found bonus ticket", 3],
  ["Signal delay", -4],
  ["Perfect transfer", 4],
];

const users = [
  ["alice@student.test", "alice", "Alice Lumen"],
  ["berke@student.test", "berke", "Berke Sayicioglu"],
  ["marta@student.test", "marta", "Marta Ferro"],
  ["berra@student.test", "berra", "Berra Turgut"],
  ["can@student.test", "can", "Can Kaya"],
];

async function initDb() {
  await run("PRAGMA foreign_keys = ON");
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL
  )`);
  await run(`CREATE TABLE IF NOT EXISTS lines (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL
  )`);
  await run(`CREATE TABLE IF NOT EXISTS stations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    interchange INTEGER NOT NULL
  )`);
  await run(`CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_station INTEGER NOT NULL,
    to_station INTEGER NOT NULL,
    line_id INTEGER NOT NULL
  )`);
  await run(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    effect INTEGER NOT NULL
  )`);
  await run(`CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    start_station INTEGER NOT NULL,
    destination_station INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    submitted_at TEXT,
    route TEXT,
    score INTEGER,
    valid INTEGER,
    log TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  for (const [email, password, name] of users) {
    const existingUser = await get("SELECT id FROM users WHERE email = ?", [email]);
    if (!existingUser) {
      const { salt, hash } = hashPassword(password);
      await run("INSERT INTO users(email, name, salt, password_hash) VALUES (?, ?, ?, ?)", [
        email,
        name,
        salt,
        hash,
      ]);
    } else {
      await run("UPDATE users SET name = ? WHERE id = ?", [name, existingUser.id]);
    }
  }

  const hadStations = Boolean(await get("SELECT id FROM stations LIMIT 1"));
  await syncGameData();

  if (!hadStations && !(await get("SELECT id FROM games LIMIT 1"))) {
    await seedPastGames();
  }
}

async function syncGameData() {
  await run("BEGIN TRANSACTION");
  try {
    for (const line of lines) {
      await run(
        `INSERT INTO lines(id, name, color) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color`,
        [line.id, line.name, line.color],
      );
    }

    for (const station of stations) {
      await run(
        `INSERT INTO stations(id, name, x, y, interchange) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           x = excluded.x,
           y = excluded.y,
           interchange = excluded.interchange`,
        [station.id, station.name, station.x, station.y, station.interchange],
      );
    }

    await run("DELETE FROM connections");
    for (const [fromStation, toStation, lineId] of connections) {
      await run(
        "INSERT INTO connections(from_station, to_station, line_id) VALUES (?, ?, ?)",
        [fromStation, toStation, lineId],
      );
    }

    await run("DELETE FROM events");
    for (const [description, effect] of events) {
      await run("INSERT INTO events(description, effect) VALUES (?, ?)", [description, effect]);
    }

    await run("COMMIT");
  } catch (err) {
    await run("ROLLBACK");
    throw err;
  }
}

async function seedPastGames() {
  const alice = await get("SELECT id FROM users WHERE email = ?", ["alice@student.test"]);
  const berke = await get("SELECT id FROM users WHERE email = ?", ["berke@student.test"]);
  await run("INSERT INTO games(user_id, start_station, destination_station, started_at, submitted_at, route, score, valid, log) VALUES (?, 2, 8, datetime('now','-4 days'), datetime('now','-4 days'), ?, 24, 1, ?)", [alice.id, "[2,1,5,8]", "[]"]);
  await run("INSERT INTO games(user_id, start_station, destination_station, started_at, submitted_at, route, score, valid, log) VALUES (?, 10, 9, datetime('now','-2 days'), datetime('now','-2 days'), ?, 18, 1, ?)", [berke.id, "[10,3,4,8,9]", "[]"]);
}

passport.use(new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
  try {
    const user = await get("SELECT * FROM users WHERE email = ?", [email]);
    if (!user || !verifyPassword(password, user.salt, user.password_hash)) {
      return done(null, false, { message: "Invalid email or password." });
    }
    return done(null, { id: user.id, email: user.email, name: user.name });
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await get("SELECT id, email, name FROM users WHERE id = ?", [id]);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(session({
  secret: "last-race-session-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { sameSite: "lax" },
}));
app.use(passport.initialize());
app.use(passport.session());

const requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: "Authentication required." });
};

async function network() {
  return {
    lines: await all("SELECT * FROM lines ORDER BY id"),
    stations: await all("SELECT * FROM stations ORDER BY id"),
    connections: await all(`SELECT c.id, c.from_station, c.to_station, c.line_id, l.color, l.name AS line_name
      FROM connections c JOIN lines l ON l.id = c.line_id ORDER BY c.id`),
  };
}

function reachablePairs(connectionsRows) {
  const graph = new Map();
  for (const c of connectionsRows) {
    graph.set(c.from_station, [...(graph.get(c.from_station) || []), c.to_station]);
    graph.set(c.to_station, [...(graph.get(c.to_station) || []), c.from_station]);
  }
  const pairs = [];
  for (const start of graph.keys()) {
    const queue = [[start, 0]];
    const seen = new Set([start]);
    while (queue.length) {
      const [node, distance] = queue.shift();
      if (distance >= 3) pairs.push([start, node]);
      for (const next of graph.get(node) || []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push([next, distance + 1]);
        }
      }
    }
  }
  return pairs;
}

function validateRoute(route, start, destination, connectionsRows) {
  if (!Array.isArray(route) || route.length < 2) return { valid: false, reason: "Select at least two stations." };
  if (route[0] !== start) return { valid: false, reason: "The route must start from the assigned station." };
  if (route[route.length - 1] !== destination) return { valid: false, reason: "The route must end at the destination station." };
  const used = new Set();
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = route[i];
    const b = route[i + 1];
    const match = connectionsRows.find((c) =>
      (c.from_station === a && c.to_station === b) || (c.from_station === b && c.to_station === a)
    );
    if (!match) return { valid: false, reason: "Every segment must follow an existing line." };
    if (used.has(match.id)) return { valid: false, reason: "A segment cannot be used more than once." };
    used.add(match.id);
  }
  return { valid: true };
}

app.get("/api/session", (req, res) => res.json({ user: req.user || null }));

app.post("/api/sessions", passport.authenticate("local"), (req, res) => {
  res.json({ user: req.user });
});

app.delete("/api/sessions/current", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.status(204).end();
  });
});

app.get("/api/instructions", async (req, res) => {
  res.json({
    title: "Last Race",
    summary: "Plan a route across the metro before the 90-second clock expires. Valid routes start and end at the assigned stations, follow existing segments, and never reuse the same segment.",
  });
});

app.get("/api/ranking", async (req, res) => {
  const rows = await all(`SELECT u.name, MAX(g.score) AS best_score, COUNT(g.id) AS games_played
    FROM users u JOIN games g ON g.user_id = u.id
    WHERE g.valid = 1 AND g.score IS NOT NULL
    GROUP BY u.id
    ORDER BY best_score DESC, games_played ASC, u.name ASC`);
  res.json(rows);
});

app.get("/api/network", requireAuth, async (req, res) => res.json(await network()));

app.post("/api/games", requireAuth, async (req, res) => {
  const net = await network();
  const pairs = reachablePairs(net.connections);
  const previousGame = await get(
    "SELECT start_station, destination_station FROM games WHERE user_id = ? ORDER BY id DESC LIMIT 1",
    [req.user.id],
  );
  const freshPairs = previousGame
    ? pairs.filter(([start, destination]) =>
        start !== previousGame.start_station || destination !== previousGame.destination_station)
    : pairs;
  const choices = freshPairs.length ? freshPairs : pairs;
  const [start, destination] = choices[Math.floor(Math.random() * choices.length)];
  const result = await run("INSERT INTO games(user_id, start_station, destination_station, started_at) VALUES (?, ?, ?, datetime('now'))", [
    req.user.id,
    start,
    destination,
  ]);
  res.status(201).json({
    id: result.lastID,
    startStation: start,
    destinationStation: destination,
    expiresAt: Date.now() + 90_000,
    network: net,
    segments: net.connections.map((c) => ({
      id: c.id,
      from_station: c.from_station,
      to_station: c.to_station,
      line_id: c.line_id,
      line_name: c.line_name,
      color: c.color,
    })),
  });
});

app.post("/api/games/:id/submit", requireAuth, async (req, res) => {
  const game = await get("SELECT * FROM games WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
  if (!game) return res.status(404).json({ error: "Game not found." });
  if (game.submitted_at) return res.status(409).json({ error: "Game already submitted." });

  const route = (req.body.route || []).map(Number);
  const net = await network();
  const validation = validateRoute(route, game.start_station, game.destination_station, net.connections);

  if (!validation.valid) {
    await run("UPDATE games SET submitted_at = datetime('now'), route = ?, score = 0, valid = 0, log = ? WHERE id = ?", [
      JSON.stringify(route),
      JSON.stringify([{ description: validation.reason, effect: -20, score: 0 }]),
      game.id,
    ]);
    return res.json({ valid: false, score: 0, reason: validation.reason, log: [{ description: validation.reason, effect: -20, score: 0 }] });
  }

  const availableEvents = await all("SELECT * FROM events ORDER BY id");
  if (!availableEvents.length) {
    return res.status(503).json({ error: "Game events are unavailable. Restart the server to initialize them." });
  }
  let score = 20;
  const log = [];
  for (let i = 0; i < route.length - 1; i += 1) {
    const event = availableEvents[Math.floor(Math.random() * availableEvents.length)];
    score += event.effect;
    log.push({ from: route[i], to: route[i + 1], description: event.description, effect: event.effect, score: Math.max(0, score) });
  }
  score = Math.max(0, score);
  await run("UPDATE games SET submitted_at = datetime('now'), route = ?, score = ?, valid = 1, log = ? WHERE id = ?", [
    JSON.stringify(route),
    score,
    JSON.stringify(log),
    game.id,
  ]);
  res.json({ valid: true, score, log });
});

app.get("/api/me/games", requireAuth, async (req, res) => {
  const rows = await all(`SELECT id, started_at, submitted_at, score, valid FROM games
    WHERE user_id = ? AND submitted_at IS NOT NULL ORDER BY submitted_at DESC`, [req.user.id]);
  res.json(rows);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Unexpected server error." });
});

await initDb();
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
