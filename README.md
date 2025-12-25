# Campaign Map MVP (UX markers)

This is a minimal self-hosted web app:
- PNG map as background
- draggable markers (everyone can edit)
- polling sync for ~30 people (no refresh needed)
- git commits on every change for backup/version history

## Quick start

1) Install deps
```bash
npm install
```

2) Init git + set git identity (required for auto-commits)
```bash
git init
git config user.name "Your Name"
git config user.email "you@example.com"
git add .
git commit -m "Init"
```

3) Run
```bash
npm start
```

Open http://localhost:3000

## Replace the map

Replace:
`public/map.png`

The app reads the PNG size automatically.

## Controls

- Drag marker: move
- Shift + click map: add marker
- Alt + click marker: delete
- Shift + click marker: rename

## Storage

Markers are stored in `data.json` (image-space coords: x,y).
