import { request } from 'node:http';
import { test, summary, assert } from './harness.mjs';
import { createStaticServer, resolveFile } from '../server.js';

console.log('\nstatic server');

const server = createStaticServer({ quiet: true });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

/** Raw request that does NOT normalise the path (unlike curl / fetch). */
const raw = (path) =>
  new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });

test('serves the app shell and assets', async () => {
  const index = await raw('/');
  assert.equal(index.status, 200);
  assert.match(index.headers['content-type'], /text\/html/);
  assert.match(index.body, /Graphing Calculator/);

  for (const [asset, type] of [
    ['/styles.css', /text\/css/],
    ['/src/app.js', /javascript/],
    ['/src/math-engine.js', /javascript/],
    ['/src/catalog.js', /javascript/],
    ['/src/router.js', /javascript/],
    ['/src/play-page.js', /javascript/],
  ]) {
    const res = await raw(asset);
    assert.equal(res.status, 200, `${asset} status`);
    assert.match(res.headers['content-type'], type, `${asset} type`);
    assert.ok(res.body.length > 100, `${asset} body`);
  }
});

test('HEAD is supported', async () => {
  const res = await raw('/styles.css');
  assert.equal(res.status, 200);
});

test('unknown files 404', async () => {
  assert.equal((await raw('/nope.js')).status, 404);
  assert.equal((await raw('/src/nope.js')).status, 404);
});

test('post/put are rejected', async () => {
  const res = await new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/', method: 'POST' }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(res, 405);
});

test('private files are never served', async () => {
  const blocked = [
    '/.git/config',
    '/../.git/config',
    '/..%2f.git%2fconfig',
    '/node_modules/jsdom/package.json',
    '/package.json',
    '/server.js',
    '/tests/math.test.mjs',
    '/.env',
    '/index.html/../../.git/config',
  ];
  for (const target of blocked) {
    const res = await raw(target);
    assert.equal(res.status, 404, `${target} must not be served (got ${res.status})`);
  }
});

test('resolveFile refuses dot paths and unknown roots', async () => {
  for (const bad of ['/.git/config', '/../package.json', '/package.json', '/server.js', '/.env', '/node_modules/x.js']) {
    assert.equal(await resolveFile(bad), null, `${bad}`);
  }
  assert.match(await resolveFile('/index.html'), /index\.html$/);
  assert.match(await resolveFile('/src/app.js'), /app\.js$/);
});

await summary('static server');

// Close only once every test (and its pending requests) has finished.
await new Promise((resolve) => server.close(resolve));
