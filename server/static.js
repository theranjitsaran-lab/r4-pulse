// Static files, fast: every script, style and data file gzipped once (kept until the file changes) and
// sent with an ETag, so a repeat visit costs a 304 or nothing. The map and brand files rarely change
// and are cached for a day. The page shell lists every module up front (<link rel="modulepreload">),
// so the browser fetches them in one parallel round instead of discovering them one import at a time.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const PUBLIC = path.join(__dirname, '..', 'public');
const TYPES = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.png': 'image/png' };
const LONG = /^\/(data|fonts|brand)\//;
const cache = new Map();

// the page shell, with every module listed for preloading (read from the folders, so it never drifts)
function shell() {
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const mods = ['components', 'views'].flatMap(d => fs.readdirSync(path.join(PUBLIC, d)).filter(f => f.endsWith('.js')).sort().map(f => `/${d}/${f}`));
  const links = ['/app.js', ...mods].map(m => `<link rel="modulepreload" href="${m}">`).join('\n')
    + '\n<link rel="preload" href="/model/rates.js" as="script">';
  return html.replace('</head>', links + '\n</head>');
}
function fileFor(url) {
  if (url === '/' || url === '/index.html') return { file: path.join(PUBLIC, 'index.html'), shell: true };
  if (url === '/model/rates.js') return { file: path.join(__dirname, '..', 'model', 'rates.js') };
  const f = path.normalize(path.join(PUBLIC, decodeURIComponent(url)));
  if (!f.startsWith(PUBLIC + path.sep)) return null;
  return { file: f };
}
function entry(url) {
  const t = fileFor(url); if (!t) return null;
  let st; try { st = fs.statSync(t.file); } catch { return null; }
  if (!st.isFile()) return null;
  const key = url, hit = cache.get(key);
  // the shell depends on the module folders too: rebuild it when any of them changes
  const stamp = t.shell ? ['components', 'views'].map(d => fs.statSync(path.join(PUBLIC, d)).mtimeMs).join() + st.mtimeMs : String(st.mtimeMs);
  if (hit && hit.stamp === stamp) return hit;
  const ext = path.extname(t.file), body = t.shell ? Buffer.from(shell()) : fs.readFileSync(t.file);
  const zip = ['.js', '.css', '.json', '.html', '.svg'].includes(ext);
  const e = { stamp, type: TYPES[ext] || 'application/octet-stream', body, gz: zip ? zlib.gzipSync(body, { level: 9 }) : null,
    etag: '"' + crypto.createHash('sha1').update(body).digest('base64url').slice(0, 20) + '"', long: LONG.test(url) };
  cache.set(key, e);
  return e;
}

module.exports = function staticFast(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const e = entry(req.path);
  if (!e) return next();
  res.set({ 'Content-Type': e.type, ETag: e.etag, Vary: 'Accept-Encoding',
    'Cache-Control': e.long ? 'private, max-age=86400' : 'private, no-cache' });
  if (req.headers['if-none-match'] === e.etag) return res.status(304).end();
  if (e.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) { res.set('Content-Encoding', 'gzip'); return res.end(req.method === 'HEAD' ? undefined : e.gz); }
  res.end(req.method === 'HEAD' ? undefined : e.body);
};
