# Ohana Monopoly — Live Game Board + Admin Console

This package contains a real browser-based event game for six teams.

There are only two spaces:

- **Live Game Board**: `http://localhost:3000/`
- **Admin Console**: `http://localhost:3000/admin`

No participant login is required. The game is intended to run from one admin/operator machine and one shared display or projector.

## Run locally

```bash
npm install
npm start
```

Then open:

```text
Live Game Board: http://localhost:3000/
Admin Console:   http://localhost:3000/admin
```

## Main rules implemented

- Six teams start with 20 points each.
- The admin enters values from the physical dice.
- The active team moves one tile at a time on the live board.
- Passing or landing on START gives +5 points.
- Landing on a Mini Game tile triggers “It’s Game Time” for all teams.
- Mini Game awards are: 1st +20, 2nd +10, 3rd +5.
- Landing on an unowned city lets the active team buy a tower only if their current points are at least the tower cost.
- Landing on another team’s tower city charges the city fee. Passing over a tower city does not charge a fee.
- If a team cannot cover a tower fee, its point balance can go negative. There is no bankruptcy state.
- A team may sell towers only during that team’s active turn.
- Selling a tower refunds half of its original cost.
- The live board keeps teams in the original game order; the badge number shows each team’s current rank.

## City list

1. San Francisco (HQ) — Cost 10, Fee 20
2. New York (Tower) — Cost 6, Fee 12
3. London (Tower) — Cost 6, Fee 12
4. Tokyo (Tower) — Cost 10, Fee 20
5. Sydney (Tower) — Cost 6, Fee 12
6. Seoul (Hometown) — Cost 10, Fee 20
7. Taipei — Cost 6, Fee 12
8. Singapore — Cost 4, Fee 8
9. Paris — Cost 4, Fee 8
10. Barcelona — Cost 4, Fee 8
11. Toronto — Cost 4, Fee 8
12. Chicago — Cost 4, Fee 8

## Replacing photos

City images are included in:

```text
public/assets/cities/
```

Keep the same filenames to replace photos without changing code.

## Resetting saved game state

The app creates `game-state.json` after changes are made. To completely reset saved state, stop the server, delete `game-state.json`, then restart the server.
