import { db } from './db.js';
import { spotifyGet } from './spotify.js';
import { isSafeImageSrc, encodeText } from './utils.js';

// 見つからなかった曲も記録し、一定期間は再検索しない
const RETRY_MISS_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_GAP_MS = 600;
const BACKOFF_MS = 60 * 1000;

const cache = new Map();
const inflight = new Map();
const queue = [];
let running = false;
let pausedUntil = 0;
// 再取得で消去したあとに、実行中だった古いジョブの結果を書き戻さないための世代番号
let generation = 0;
const MAX_RETRIES = 3;
let loaded = null;

const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s'’"“”・\-_.,!?！？()（）[\]【】]/g, '');

export function trackKey(artist, song) {
    return `${norm(artist)}|${norm(song)}`;
}

function loadCache() {
    if (!loaded) {
        loaded = db.tracks.toArray()
            .then(rows => rows.forEach(r => cache.set(r.key, r)))
            .catch(() => {});
    }
    return loaded;
}

export function cachedTrack(artist, song) {
    return cache.get(trackKey(artist, song)) || null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function sameArtist(a, b) {
    const x = norm(a);
    const y = norm(b);
    return !!x && !!y && (x.includes(y) || y.includes(x));
}

async function fromSpotify(artist, song) {
    const q = encodeText(`track:${song} artist:${artist}`);
    const data = await spotifyGet(`https://api.spotify.com/v1/search?q=${q}&type=track&limit=5&market=JP`);
    const items = data?.tracks?.items || [];
    const track = items.find(t => t.artists?.some(a => sameArtist(a.name, artist))) || null;
    if (!track) return null;
    const id = /^[A-Za-z0-9]{10,40}$/.test(track.id || '') ? track.id : null;
    const ext = track.external_urls?.spotify;
    const url = typeof ext === 'string' && ext.startsWith('https://open.spotify.com/') ? ext : id && `https://open.spotify.com/track/${id}`;
    if (!url) return null;

    // ジャケットは oEmbed のサムネイルを使い、取れないときは検索結果のアルバム画像に戻す
    let image = null;
    try {
        const oe = await fetch(`https://open.spotify.com/oembed?url=${encodeText(url)}`);
        if (oe.ok) image = (await oe.json())?.thumbnail_url || null;
    } catch { /* oEmbed が使えなくても検索結果の画像で続ける */ }
    image = image || track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || null;
    return image ? { image, spotify_url: url, source: 'spotify' } : null;
}

async function fromITunes(artist, song) {
    const term = encodeText(`${artist} ${song}`);
    const res = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=5&country=JP`);
    if (res.status === 403 || res.status === 429) throw new Error('rate-limited');
    if (!res.ok) return null;
    const results = (await res.json())?.results || [];
    const hit = results.find(r => sameArtist(r.artistName, artist) && norm(r.trackName).includes(norm(song)))
        || results.find(r => sameArtist(r.artistName, artist));
    if (!hit?.artworkUrl100) return null;
    return { image: hit.artworkUrl100.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/600x600bb.$1'), spotify_url: null, source: 'itunes' };
}

async function lookup(artist, song) {
    let found = null;
    if (localStorage.getItem('spotify_client_id')) {
        try { found = await fromSpotify(artist, song); } catch (e) { if (e.message === 'rate-limited') throw e; }
    }
    if (!found) found = await fromITunes(artist, song);
    return found;
}

async function pump() {
    if (running) return;
    running = true;
    while (queue.length) {
        const wait = pausedUntil - Date.now();
        if (wait > 0) await sleep(wait);
        const job = queue.shift();
        if (job.generation !== generation) { job.resolve(null); continue; }
        try {
            const found = await lookup(job.artist, job.song);
            if (job.generation !== generation) { job.resolve(null); continue; }
            const row = {
                key: job.key,
                image: found && isSafeImageSrc(found.image) ? found.image : null,
                spotify_url: found?.spotify_url || null,
                source: found?.source || null,
                updated_at: Date.now(),
            };
            cache.set(job.key, row);
            db.tracks.put(row).catch(() => {});
            job.resolve(row);
        } catch (e) {
            if (e.message === 'rate-limited' && (job.retries || 0) < MAX_RETRIES) {
                job.retries = (job.retries || 0) + 1;
                pausedUntil = Date.now() + BACKOFF_MS;
                queue.unshift(job);
                continue;
            }
            job.resolve(null);
        }
        await sleep(REQUEST_GAP_MS);
    }
    running = false;
}

export async function getTrackArt(artist, song) {
    if (!artist || !song || artist === 'Unknown') return null;
    await loadCache();
    const key = trackKey(artist, song);
    const hit = cache.get(key);
    if (hit && (hit.image || Date.now() - hit.updated_at < RETRY_MISS_MS)) return hit;
    if (inflight.has(key)) return inflight.get(key);
    const promise = new Promise(resolve => queue.push({ key, artist, song, generation, resolve }))
        .finally(() => { if (inflight.get(key) === promise) inflight.delete(key); });
    inflight.set(key, promise);
    pump();
    return promise;
}

// 描画済みの曲アートワーク枠のうち画面に入ったものだけ取得し、画像を差し込む（ランキングの全曲を一度に検索しないため）
let observerWorks = false;
const observer = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => entries.forEach(entry => {
        observerWorks = true;
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        fill(entry.target);
    }), { rootMargin: '200px 0px' })
    : null;

function fill(el) {
    if (el.querySelector('img')) return;
    getTrackArt(el.dataset.trackArtist, el.dataset.trackSong).then(row => {
        if (!row?.image || !el.isConnected || el.querySelector('img')) return;
        const img = document.createElement('img');
        img.src = row.image;
        img.alt = '';
        img.decoding = 'async';
        img.className = 'art-fade-in';
        el.appendChild(img);
    });
}

export function hydrateTrackArt(root) {
    if (!root) return;
    const pending = [];
    root.querySelectorAll('[data-track-artist]:not([data-hydrated])').forEach(el => {
        el.dataset.hydrated = '1';
        if (el.querySelector('img')) return;
        pending.push(el);
        if (observer) observer.observe(el);
        else fill(el);
    });
    // 監視が届かない環境では、先頭の数件だけでも取得しておく
    if (observer && pending.length) {
        setTimeout(() => {
            if (observerWorks) return;
            pending.slice(0, 30).forEach(el => { observer.unobserve(el); fill(el); });
        }, 1500);
    }
}

export async function clearTrackArt() {
    generation++;
    cache.clear();
    queue.splice(0).forEach(job => job.resolve(null));
    inflight.clear();
    pausedUntil = 0;
    await db.tracks.clear();
    // 表示中の枠は取得済みの印を外し、次に描いたときに取り直す
    document.querySelectorAll('[data-track-artist][data-hydrated]').forEach(el => el.removeAttribute('data-hydrated'));
}

export async function countTrackArt() {
    return db.tracks.filter(r => !!r.image).count();
}

loadCache();
