const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const axios = require('axios');
const { Video } = require('../../dist/models');

const uri = process.env.MONGODB_TEST_URI;
if (!uri || !/^mongodb:\/\/127\.0\.0\.1:\d+\/wcl_goal_test_[a-z0-9_]+$/.test(uri)) {
  throw new Error('Set MONGODB_TEST_URI to a disposable localhost wcl_goal_test_* database');
}
let server;
let base;
let videoRequests = 0;
const originalAdapter = axios.defaults.adapter;
let providerFails = false;
let upstreamRequests = 0;
before(async () => {
  await mongoose.connect(uri + '_api', { serverSelectionTimeoutMS: 5000 });
  await Video.init();
  Object.assign(process.env, { WCL_CLIENT_ID: 'synthetic', WCL_CLIENT_SECRET: 'synthetic', YT_API_KEY: 'synthetic',
    BLIZZARD_CLIENT_ID: '', BLIZZARD_CLIENT_SECRET: '', TWITCH_CLIENT_ID: '', TWITCH_CLIENT_SECRET: '' });
  // Replace only the external HTTP transport. Exercise actual routes, clients and MongoDB.
  axios.defaults.adapter = async config => {
    upstreamRequests++;
    assert.equal(config.url, 'https://www.googleapis.com/youtube/v3/videos', 'unexpected external request');
    videoRequests++;
    if (providerFails) throw new Error('Synthetic provider timeout');
    await new Promise(resolve => setTimeout(resolve, 30));
    return { status: 200, statusText: 'OK', headers: {}, config, data: { items: [{
      id: config.params.id, snippet: { title: 'Synthetic VOD', description: '', publishedAt: '2026-01-01T18:00:00Z', channelId: 'synthetic', channelTitle: 'Synthetic guild' },
      contentDetails: { duration: 'PT1H' },
    }] } };
  };
  const { app } = require('../../dist/app');
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  await Video.deleteMany({});
  videoRequests = 0;
  upstreamRequests = 0;
  providerFails = false;
});

test('invalid event ranges and filters fail before any provider work', async () => {
  const bodies = [
    { startTime: 10, endTime: 1 },
    { startTime: -1, endTime: 3000 },
    { startTime: 0, endTime: 3000, fightId: '1' },
    { startTime: 0, endTime: 3000, eventTypes: [] },
    { startTime: 0, endTime: 3000, eventTypes: ['Damage'] },
    { startTime: 0, endTime: 3000, eventTypes: 'Deaths' },
  ];
  for (const body of bodies) {
    const response = await fetch(base + '/api/wcl/reports/SyntheticReport1/events', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  }
  assert.equal(upstreamRequests, 0);
});

test('malformed JSON returns a readable JSON error', async () => {
  const response = await fetch(base + '/api/parse-urls', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal(response.status, 400);
  assert.match(response.headers.get('content-type'), /application\/json/);
});

test('health recovers when the MongoDB connection is re-established', async () => {
  process.env.MONGODB_URI = uri + '_api';
  const { Database } = require('../../dist/lib/database');
  await Database.getInstance().connect();
  assert.equal((await fetch(base + '/health')).status, 200);
  await mongoose.disconnect();
  assert.equal((await fetch(base + '/health')).status, 503);
  await mongoose.connect(uri + '_api');
  assert.equal((await fetch(base + '/health')).status, 200);
});

test('metadata failures can be retried; cache entries expire and stay scoped to platform and video', async () => {
  providerFails = true;
  assert.equal((await fetch(base + '/api/video-metadata/youtube/localVideo1')).status, 500);
  providerFails = false;
  const recovered = await fetch(base + '/api/video-metadata/youtube/localVideo1').then(response => response.json());
  assert.equal(recovered.duration, 3600);
  assert.equal(recovered.cached, false);
  await Video.create({ platform: 'twitch', videoId: 'localVideo2', title: 'Other platform', duration: 99 });
  await Video.create({ platform: 'youtube', videoId: 'localVideo2', title: 'Expired video', duration: 22, lastUpdated: new Date(Date.now() - 8 * 86400000) });
  const expired = await fetch(base + '/api/video-metadata/youtube/localVideo2').then(response => response.json());
  assert.equal(expired.duration, 3600);
  assert.equal(expired.cached, false);
  // An old raw document must remain readable without an in-place migration.
  await Video.collection.insertOne({ platform: 'twitch', videoId: '123', title: 'Legacy video', description: '', duration: '1h2m3s', lastUpdated: new Date() });
  const legacy = await fetch(base + '/api/video-metadata/twitch/123').then(response => response.json());
  assert.equal(legacy.duration, 3723);
  assert.equal(legacy.cached, true);
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  axios.defaults.adapter = originalAdapter;
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('parsing links and concurrent metadata reads share one provider request', async () => {
  const counts = [];
  for (let round = 1; round <= 3; round++) {
  videoRequests = 0;
  const videoId = `localVideo${round}`;
  const parsed = await fetch(base + '/api/parse-urls', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    wclUrl: 'https://www.warcraftlogs.com/reports/SyntheticReport1#fight=2', vodUrl: `https://youtu.be/${videoId}?t=40`,
  }) });
  assert.equal(parsed.status, 200);
  assert.equal((await parsed.json()).vod.startSeconds, 40);
  const responses = await Promise.all(Array.from({ length: 8 }, () => fetch(base + '/api/video-metadata/youtube/' + videoId).then(response => response.json())));
  assert.ok(responses.every(response => response.duration === 3600));
  const warm = await fetch(base + '/api/video-metadata/youtube/' + videoId).then(response => response.json());
  assert.equal(warm.cached, true);
  counts.push(videoRequests);
  }
  console.log('Provider requests per cold burst (3 repetitions):', counts);
  assert.deepEqual(counts, [1, 1, 1]);
});
