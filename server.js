const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { markers: [] };
  }
}

function writeData(data) {
  // Simple sync write is OK for MVP. Git history is your safety net.
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function sanitizeCommitMessage(msg) {
  return String(msg)
    .replace(/[\r\n]+/g, ' ')
    .replace(/"/g, '\\"')
    .slice(0, 160);
}

function gitCommit(message) {
  const safe = sanitizeCommitMessage(message);
  // NOTE: Requires git user.name/user.email set in this repo.
  exec(`git add data.json && git commit -m "${safe}"`, () => {});
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

app.get('/data', (_req, res) => {
  res.json(readData());
});

app.post('/markers', (req, res) => {
  const data = readData();
  const m = req.body || {};

  if (!m.id) m.id = String(Date.now());
  if (typeof m.x !== 'number') m.x = 0;
  if (typeof m.y !== 'number') m.y = 0;
  if (!m.name) m.name = m.id;
  if (!m.type) m.type = 'player';

  data.markers.push(m);
  writeData(data);

  const who = (req.get('X-User') || 'anon').slice(0, 40);
  gitCommit(`Add marker ${m.name} by ${who}`);

  res.json(m);
});

app.patch('/markers/:id', (req, res) => {
  const data = readData();
  const id = String(req.params.id);
  const idx = data.markers.findIndex(m => String(m.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });

  const patch = req.body || {};
  const m = data.markers[idx];

  // MVP "allowlist" patchable fields
  const fields = ['x', 'y', 'name', 'type', 'color', 'avatar', 'notes'];
  for (const f of fields) {
    if (patch[f] !== undefined) m[f] = patch[f];
  }

  writeData(data);

  const who = (req.get('X-User') || 'anon').slice(0, 40);
  gitCommit(`Update marker ${m.name || m.id} by ${who}`);

  res.json(m);
});

app.delete('/markers/:id', (req, res) => {
  const data = readData();
  const id = String(req.params.id);
  const idx = data.markers.findIndex(m => String(m.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });

  const [deleted] = data.markers.splice(idx, 1);
  writeData(data);

  const who = (req.get('X-User') || 'anon').slice(0, 40);
  gitCommit(`Delete marker ${deleted.name || deleted.id} by ${who}`);

  res.sendStatus(204);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Map MVP running on http://localhost:${port}`);
});
