import { db } from './db.js';
import { searchArtistImage } from './spotify.js';
import { liveArtists, isSafeImageSrc } from './utils.js';

// 見つからなかったアーティストも記録し、起動のたびに全員を再検索しないようにする
const RETRY_MISS_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_GAP_MS = 500;

let running = null;

function shouldFetch(row) {
    if (!row) return true;
    if (row.image_data) return false;
    const at = Date.parse(row.updated_at || '');
    return !at || Date.now() - at > RETRY_MISS_MS;
}

async function lookupAndStore(name) {
    const url = await searchArtistImage(name);
    await db.artists.put({ name, image_data: isSafeImageSrc(url) ? url : null, updated_at: new Date().toISOString() });
    return isSafeImageSrc(url) ? url : null;
}

export function syncArtistImages() {
    if (running) return running;
    running = (async () => {
        try {
            if (!localStorage.getItem('spotify_client_id')) return;
            const lives = await db.lives.toArray();
            const names = new Set();
            lives.forEach(l => liveArtists(l).forEach(n => names.add(n)));

            for (const name of names) {
                if (!shouldFetch(await db.artists.get(name))) continue;
                await lookupAndStore(name);
                await new Promise(r => setTimeout(r, REQUEST_GAP_MS));
            }
        } catch (e) {
            // レート制限や通信エラーのときは今回の同期をやめ、次回の起動で続きから取る
            console.error('Background image sync stopped', e);
        } finally {
            running = null;
        }
    })();
    return running;
}

export async function fetchArtistImage(name) {
    const cached = await db.artists.get(name);
    if (!shouldFetch(cached)) return cached?.image_data || null;
    try {
        return await lookupAndStore(name);
    } catch {
        return null;
    }
}
