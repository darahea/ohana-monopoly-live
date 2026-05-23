# Ohana Monopoly — Live Game Board + Admin Console

A real-time browser-based event game for 2–10 teams.

There are only two screens:

- **Live Game Board**: `http://localhost:3000/`
- **Admin Console**: `http://localhost:3000/admin`

No participant login is required. The game is intended to run from one admin/operator machine and one shared display or projector.

## Run locally

```bash
npm install
npm start
```

For auto-restart on file changes:

```bash
npm run dev
```

## Main rules implemented

- 2–10 teams start with 5 points each.
- The admin enters two dice values (1–6 each); the team moves by the total (2–12).
- The active team moves one tile at a time on the live board with animation.
- Passing or landing on START gives +5 points.
- Landing on a Mini Game tile triggers a mini game for all teams.
- Mini Game awards are: 1st +20, 2nd +10, 3rd +5.
- Landing on an unowned city lets the active team buy a tower only if their current points are at least the tower cost.
- Landing on another team's tower city charges the toll fee. Passing over a tower city does not charge a fee.
- If a team cannot cover a toll fee, its point balance can go negative. There is no bankruptcy state.
- A team may sell towers only during that team's active turn.
- Selling a tower refunds half of its original cost.
- The admin sets the total number of rounds (laps) before game start (1–5).
- When a team completes all rounds, it is removed from the board and marked as "Done" on the leaderboard.
- Completed teams are skipped in turn order.
- The game ends automatically when all teams finish their rounds.
- Turn order is always fixed: Team 1 → 2 → 3 → ... → 6.

## City list

| # | City | Tier | Cost | Toll Fee |
|---|------|------|------|----------|
| 1 | San Francisco (HQ) | $$$ | 10 | 8 |
| 2 | Singapore | $ | 4 | 3 |
| 3 | London (Tower) | $$ | 6 | 5 |
| 4 | Dubai | $$ | 6 | 5 |
| 5 | Paris | $ | 4 | 3 |
| 6 | Sydney (Tower) | $$ | 6 | 5 |
| 7 | Barcelona | $ | 4 | 3 |
| 8 | Taipei | $$ | 6 | 5 |
| 9 | Toronto | $ | 4 | 3 |
| 10 | New York (Tower) | $$ | 6 | 5 |
| 11 | Berlin | $ | 4 | 3 |
| 12 | Chicago | $ | 4 | 3 |
| 13 | Tokyo (Tower) | $$$ | 10 | 8 |
| 14 | Dublin | $$$ | 10 | 8 |
| 15 | Seoul (Hometown) | $$$ | 10 | 8 |

## Replacing photos

City images are located in:

```text
public/assets/cities/
```

Keep the same filenames to replace photos without changing code.

## Resetting saved game state

The app creates `game-state.json` after changes are made. To completely reset saved state, stop the server, delete `game-state.json`, then restart the server.
