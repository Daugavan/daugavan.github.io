// Publish daily counts only. Conversation contents and identifiers stay local.
import { createReadStream } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const historyRoot = process.argv[2];
if (!historyRoot) throw new Error('Pass the authorized local Codex history directory.');
const today = '2026-10-08';
const end = new Date(`${today}T00:00:00Z`);
const start = new Date(end);
start.setUTCDate(start.getUTCDate() - 364);
const firstDay = start.toISOString().slice(0, 10);
const dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' });
const counts = new Map();
const sessions = new Set();
const turns = new Set();
let total = 0;
async function scan(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = join(folder, entry.name);
    if (entry.isDirectory()) { await scan(path); continue; }
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
    let duplicate = false;
    let subagent = false;
    const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    for await (const line of lines) {
      let record;
      try { record = JSON.parse(line); } catch { continue; }
      if (record.type === 'session_meta' && record.payload?.id) {
        duplicate = sessions.has(record.payload.id);
        sessions.add(record.payload.id);
        subagent = typeof record.payload.source === 'object' && Boolean(record.payload.source?.subagent);
      }
      if (duplicate || subagent || record.type !== 'event_msg' || record.payload?.type !== 'task_complete') continue;
      const turn = record.payload.turn_id;
      if (!turn || turns.has(turn)) continue;
      turns.add(turn);
      const timestamp = new Date(record.timestamp);
      if (!Number.isFinite(timestamp.getTime())) continue;
      const day = dateFormat.format(timestamp);
      if (day < firstDay || day > today) continue;
      counts.set(day, (counts.get(day) || 0) + 1);
      total++;
    }
  }
}
await scan(join(historyRoot, 'sessions'));
await scan(join(historyRoot, 'archived_sessions'));
const palette = ['#161e2b', '#216059', '#2b8c7f', '#45b4a2', '#80dcc8'];
const maximum = Math.max(1, ...counts.values());
const gridStart = new Date(start);
gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
const weeks = Math.floor((end - gridStart) / 86400000 / 7) + 1;
const step = 952 / weeks;
const svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 130" role="img" aria-labelledby="title description">',
  '<title id="title">Codex activity calendar</title>',
  `<desc id="description">${total} completed turns in saved local Codex history, ${firstDay} to ${today}, Europe/Stockholm. Snapshot; excludes subagents and history unavailable on this computer.</desc>`,
  '<g font-family="system-ui, sans-serif" font-size="11" fill="#9ca8b8">'];
let previousMonth;
for (let week = 0; week < weeks; week++) {
  const date = new Date(gridStart);
  date.setUTCDate(date.getUTCDate() + week * 7);
  const month = date.getUTCMonth();
  if (month !== previousMonth) svg.push(`<text x="${34 + week * step}" y="14">${date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}</text>`);
  previousMonth = month;
}
svg.push('<text x="2" y="46">Mon</text><text x="2" y="72">Wed</text><text x="2" y="98">Fri</text></g>');
for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
  const day = date.toISOString().slice(0, 10);
  const count = counts.get(day) || 0;
  const level = count ? Math.min(4, Math.ceil(count / maximum * 4)) : 0;
  const week = Math.floor((date - gridStart) / 86400000 / 7);
  svg.push(`<rect x="${(34 + week * step).toFixed(2)}" y="${24 + date.getUTCDay() * 13}" width="${(step - 3).toFixed(2)}" height="10" rx="2" fill="${palette[level]}"><title>${day}: ${count} completed turns in local history</title></rect>`);
}
svg.push('<g font-family="system-ui, sans-serif" font-size="10" fill="#9ca8b8"><text x="851" y="125">Less</text><text x="965" y="125">More</text></g>');
palette.forEach((color, i) => svg.push(`<rect x="${879 + i * 15}" y="116" width="10" height="10" rx="2" fill="${color}"/>`));
svg.push('</svg>');
await writeFile(new URL('../images/codex-activity.svg', import.meta.url), svg.join('\n') + '\n');
console.log(JSON.stringify({ total, activeDays: counts.size, from: firstDay, to: today, source: 'saved local task_complete events; subagents excluded' }));
