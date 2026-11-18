import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const cache = new Map();
const cacheMs = 10 * 60_000;

async function getJson(url, headers = {}) {
  const key = url;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < cacheMs) return hit.body;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const body = await response.json();
  cache.set(key, { body, time: Date.now() });
  return body;
}

const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/weather') {
    const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return json(res, 400, { error: 'Valid coordinates are required.' });
    const point = `POINT(${lon.toFixed(4)} ${lat.toFixed(4)})`;
    const start = new Date().toISOString().slice(0, 10) + 'T00:00:00Z';
    const end = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10) + 'T23:59:59Z';
    const dmiUrl = new URL('https://opendataapi.dmi.dk/v1/forecastedr/collections/harmonie_dini_sf/position');
    dmiUrl.searchParams.set('coords', point); dmiUrl.searchParams.set('crs','crs84');
    dmiUrl.searchParams.set('parameter-name','temperature-2m,wind-speed-10m,gust-wind-speed-10m,wind-dir-10m,relative-humidity-2m,fraction-of-cloud-cover-2m,total-precipitation,pressure-sealevel');
    dmiUrl.searchParams.set('datetime', `${start}/${end}`);
    const [met, dmi] = await Promise.allSettled([
      getJson(`https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`, { 'User-Agent': process.env.MET_USER_AGENT || 'AtmosWeatherDashboard/1.0 (https://localhost:4173)' }),
      getJson(dmiUrl.toString())
    ]);
    return json(res, 200, { met: met.status === 'fulfilled' ? met.value : null, metError: met.status === 'rejected' ? met.reason.message : null,
      dmi: dmi.status === 'fulfilled' ? dmi.value : null, dmiError: dmi.status === 'rejected' ? dmi.reason.message : null, fetchedAt: new Date().toISOString() });
  }
  if (url.pathname === '/api/search') {
    const q = url.searchParams.get('q')?.trim();
    if (!q) return json(res, 400, { error: 'Search query is required.' });
    try { return json(res, 200, await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`)); }
    catch (e) { return json(res, 502, { error: e.message }); }
  }
  if (url.pathname === '/api/reverse') {
    const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json(res, 400, { error: 'Valid coordinates are required.' });
    try {
      const result = await getJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10`, { 'User-Agent': 'AtmosWeatherDashboard/1.0 (local weather dashboard)' });
      return json(res, 200, result);
    } catch (e) { return json(res, 502, { error: e.message }); }
  }
  if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Unknown API route.' });
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const fullPath = path.resolve(root, file);
  if (fullPath !== root && !fullPath.startsWith(root + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  const mime = file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.webmanifest') ? 'application/manifest+json; charset=utf-8' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html; charset=utf-8';
  try { const data = await readFile(fullPath); res.writeHead(200, { 'Content-Type': mime }); res.end(data); }
  catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '0.0.0.0', () => console.log(`Weather dashboard listening on port ${port}`));
