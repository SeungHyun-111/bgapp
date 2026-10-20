const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
let directory = '', transport = null;
const entries = new Map(), reads = new Map(), pending = new Map();
const stats = new Map();
const startedAt = Date.now();
let metricsWrite = Promise.resolve();
function configureCache(dir, fetcher) { directory = dir; transport = fetcher || null; }
const file = url => path.join(directory, crypto.createHash('sha256').update(url).digest('hex') + '.json');
async function read(url) {
  if (entries.has(url)) return entries.get(url);
  if (reads.has(url)) return reads.get(url);
  const task = (async () => {
    let entry = null;
    if (directory) try { entry = JSON.parse(await fs.readFile(file(url), 'utf8')); } catch {}
    if (entry?.version !== 1) entry = null;
    entries.set(url, entry);
    return entry;
  })();
  reads.set(url, task);
  try { return await task; } finally { reads.delete(url); }
}
async function save(url, entry) {
  entries.set(url, entry);
  if (!directory) return;
  await fs.mkdir(directory, { recursive: true });
  const target = file(url);
  await fs.writeFile(target + '.tmp', JSON.stringify(entry), 'utf8');
  await fs.rename(target + '.tmp', target);
}
async function download(url, type, headers) {
  const fetcher = transport || ((...args) => require('electron').net.fetch(...args));
  const response = await fetcher(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Data read failed: ${response.status} ${url}`);
  const text = await response.text();
  const bytes = Buffer.byteLength(text, 'utf8');
  const previous = stats.get(url) || { requests: 0, bodyBytes: 0, lastBytes: 0 };
  stats.set(url, { requests: previous.requests + 1, bodyBytes: previous.bodyBytes + bytes, lastBytes: bytes });
  if (directory) {
    const snapshot = JSON.stringify({ startedAt, updatedAt: Date.now(), endpoints: Object.fromEntries(stats) }, null, 2);
    metricsWrite = metricsWrite.catch(() => {}).then(async () => {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, 'network-usage.json'), snapshot, 'utf8');
    });
    await metricsWrite;
  }
  return type === 'text' ? text : JSON.parse(text);
}
async function revalidate(url, options, old) {
  if (pending.has(url)) return pending.get(url);
  const task = (async () => {
    let revision = null;
    if (options.marker) {
      const marker = await get(options.marker, { ttl: 300000, stale: false, force: options.force });
      if (status(options.marker).offline) throw new Error('Change marker is offline');
      revision = JSON.stringify(marker);
    }
    // A missing marker is not proof that an old payload is current.
    if (!options.force && old && revision && revision !== 'null' && revision === old.revision && Date.now() - old.loadedAt < 86400000) {
      await save(url, { ...old, checkedAt: Date.now(), offline: false });
      return old.data;
    }
    const data = await download(url, options.type || 'json', options.headers);
    await save(url, { version: 1, data, revision, loadedAt: Date.now(), checkedAt: Date.now(), offline: false });
    return data;
  })();
  pending.set(url, task);
  try { return await task; }
  catch (error) {
    if (!old) throw error;
    // Back off failed reads, keep the last usable data and expose its age.
    entries.set(url, { ...old, checkedAt: Date.now(), offline: true });
    return old.data;
  } finally { pending.delete(url); }
}
async function get(url, options = {}) {
  const old = await read(url);
  if (options.force) return revalidate(url, options, old);
  const ttl = options.ttl ?? 300000;
  if (old && Date.now() - old.checkedAt < ttl) return old.data;
  if (old && options.stale !== false) {
    revalidate(url, options, old).catch(error => console.error('Cache refresh failed:', error.message));
    return old.data;
  }
  return revalidate(url, options, old);
}
function status(url) {
  const entry = entries.get(url);
  return { loadedAt: entry?.loadedAt || null, offline: Boolean(entry?.offline) };
}
function metrics() { return Object.fromEntries(stats); }
module.exports = { configureCache, get, status, metrics };
