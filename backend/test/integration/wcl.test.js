const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const { WarcraftLogsClient } = require('../../dist/lib/wcl');
const { Report, CachedEvents } = require('../../dist/models');

// Explicitly isolated: never use MONGODB_URI or load backend/.env here.
const uri = process.env.MONGODB_TEST_URI;
if (!uri || !/^mongodb:\/\/127\.0\.0\.1:\d+\/wcl_goal_test_[a-z0-9_]+$/.test(uri)) {
  throw new Error('Set MONGODB_TEST_URI to a disposable localhost wcl_goal_test_* database');
}

let server;
let client;
let handleQuery;
let calls;
const masterData = { abilities: [{ gameID: 123, name: 'Raid burst', icon: '' }], actors: [] };
const eventPage = (data, nextPageTimestamp = null) => ({ reportData: { report: { events: { data, nextPageTimestamp } } } });

before(async () => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  server = http.createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/oauth/token') {
      res.end(JSON.stringify({ access_token: 'synthetic-local-token', token_type: 'Bearer', expires_in: 3600 }));
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    const { query, variables } = JSON.parse(body);
    calls.push({ query, variables });
    if (query.includes('GetMasterData')) {
      res.end(JSON.stringify({ data: { reportData: { report: { masterData } } } }));
      return;
    }
    const result = handleQuery(query, variables);
    res.end(JSON.stringify(result));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.WCL_API_BASE = `http://127.0.0.1:${server.address().port}`;
  process.env.WCL_CLIENT_ID = 'synthetic';
  process.env.WCL_CLIENT_SECRET = 'synthetic';
  client = new WarcraftLogsClient();
});

beforeEach(async () => {
  await Promise.all([Report.deleteMany({}), CachedEvents.deleteMany({})]);
  calls = [];
});

after(async () => {
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (server) await new Promise(resolve => server.close(resolve));
});

test('returns every event page once using the provider cursor', async () => {
  handleQuery = (query, variables) => {
    if (query.includes('startingAfterTime')) return { errors: [{ message: 'Unknown argument startingAfterTime' }] };
    if (variables.startTime === 0) return { data: eventPage([{ timestamp: 1000, type: 'cast', abilityGameID: 123 }], 2000) };
    if (variables.startTime === 2000) return { data: eventPage([{ timestamp: 2000, type: 'death' }]) };
    return { errors: [{ message: 'Unexpected cursor' }] };
  };
  const result = await client.getEvents('SyntheticReport1', 1, 0, 3000);
  assert.deepEqual(result.events.map(event => event.timestamp), [1000, 2000]);
  assert.equal(result.events[0].abilityInfo.name, 'Raid burst');
});

test('keeps event filters separate and caches empty fights starting at zero', async () => {
  handleQuery = (_query, variables) => ({ data: eventPage(
    variables.filterExpression.includes("'death'") ? [{ timestamp: 1000, type: 'death' }] : []
  ) });
  await client.getEvents('SyntheticReport1', 1, 0, 3000, ['Casts']);
  const empty = await client.getEvents('SyntheticReport1', 1, 0, 3000, ['Casts']);
  assert.equal(empty.cached, true, 'empty zero-start fights should be cached');
  assert.deepEqual(empty.events, []);
  const deaths = await client.getEvents('SyntheticReport1', 1, 0, 3000, ['Deaths']);
  assert.equal(deaths.cached, false, 'a different filter must not reuse the cast cache');
  assert.equal(deaths.events[0].type, 'Deaths');
  const combined = await client.getEvents('SyntheticReport1', 1, 0, 3000, ['Deaths', 'Casts']);
  assert.equal(combined.cached, false);
  const reordered = await client.getEvents('SyntheticReport1', 1, 0, 3000, ['Casts', 'Deaths', 'Deaths']);
  assert.equal(reordered.cached, true, 'equivalent filter sets should share a cache entry');
});

test('never reports an upstream failure or a stalled cursor as an empty/complete fight', async () => {
  handleQuery = () => ({ errors: [{ message: 'Synthetic provider unavailable' }] });
  await assert.rejects(client.getEvents('SyntheticReport1', 1, 0, 30000));
  handleQuery = () => ({ data: eventPage([{ timestamp: 1000, type: 'cast' }], 2000) });
  await assert.rejects(client.getEvents('SyntheticReport1', 1, 0, 30000), /pagination/i);
  handleQuery = () => ({ data: eventPage([]) });
  assert.equal((await client.getEvents('SyntheticReport1', 1, 0, 30000)).cached, false, 'partial failures must not be cached');
});

test('retrieves fights longer than ten event pages without truncation', async () => {
  handleQuery = (_query, variables) => {
    const time = variables.startTime;
    return { data: eventPage([{ timestamp: time, type: 'cast' }], time < 11000 ? time + 1000 : null) };
  };
  const result = await client.getEvents('SyntheticReport1', 1, 0, 12000);
  assert.equal(result.events.length, 12);
  assert.equal(result.events.at(-1).timestamp, 11000);
});

test('legacy event documents are preserved and stale versioned results refresh', async () => {
  await CachedEvents.collection.insertOne({ reportCode: 'SyntheticReport1', fightId: 1, startTime: 0, endTime: 3000,
    events: [{ timestamp: 999, type: 'Deaths' }], lastUpdated: new Date() });
  handleQuery = () => ({ data: eventPage([{ timestamp: 1000, type: 'death' }]) });
  const fresh = await client.getEvents('SyntheticReport1', 1, 0, 3000);
  assert.equal(fresh.cached, false);
  assert.deepEqual(fresh.events.map(event => event.timestamp), [1000]);
  assert.equal(await CachedEvents.countDocuments({ cacheVersion: { $exists: false } }), 1, 'legacy data must remain intact');
  await CachedEvents.updateOne({ cacheVersion: 2 }, { $set: { lastUpdated: new Date(Date.now() - 16 * 60 * 1000) } });
  handleQuery = () => ({ data: eventPage([{ timestamp: 2000, type: 'death' }]) });
  const refreshed = await client.getEvents('SyntheticReport1', 1, 0, 3000);
  assert.equal(refreshed.cached, false);
  assert.deepEqual(refreshed.events.map(event => event.timestamp), [2000]);
});

test('reading enhanced reports does not keep an old report fresh forever', async () => {
  const reportTime = Date.parse('2026-01-01T18:00:00Z');
  const originalAge = new Date(Date.now() - 59 * 60 * 1000);
  await Report.create({ code: 'SyntheticReport1', title: 'Earlier upload', startTime: reportTime,
    endTime: reportTime + 3000, owner: { name: 'Synthetic guild' }, lastUpdated: originalAge,
    fights: [{ id: 1, name: 'Boss', startTime: 0, endTime: 3000, encounterID: 1 }] });
  handleQuery = query => {
    if (query.includes('GetMultipleEncounters')) return { data: { worldData: { encounter0: { id: 1, name: 'Boss', journalID: 1, zone: { id: 1, name: 'Raid' } } } } };
    return { data: { reportData: { report: { title: 'New upload', startTime: reportTime, endTime: reportTime + 9000,
      owner: { name: 'Synthetic guild' }, fights: [{ id: 2, name: 'Boss', startTime: 6000, endTime: 9000, encounterID: 1 }] } } } };
  };
  const first = await client.getReportWithEncounterDetails('SyntheticReport1');
  assert.equal(first.title, 'Earlier upload');
  // Advance wall time, not the database, to exercise source freshness through the client interface.
  const realNow = Date.now;
  Date.now = () => realNow() + 2 * 60 * 1000;
  try {
    const refreshed = await client.getReportWithEncounterDetails('SyntheticReport1');
    assert.equal(refreshed.title, 'New upload');
    assert.equal(refreshed.fights[0].id, 2);
  } finally {
    Date.now = realNow;
  }
});
