import { db } from '../db.js';
import { processLiveData, liveArtists, splitSetlist, todayStr, yearOf, parseDate } from '../utils.js';

export async function loadLives() {
    const raw = await db.lives.toArray();
    return raw.map(processLiveData).sort((a, b) => (a.concert_date || '').localeCompare(b.concert_date || ''));
}

// 写真の無いライブにアーティスト写真を薄く出すため、最後に読み込んだ画像を共有する
export const artistImageCache = new Map();

export async function loadArtistImages() {
    const rows = await db.artists.toArray();
    const map = new Map();
    rows.forEach(r => { if (r.image_data) map.set(r.name, r.image_data); });
    artistImageCache.clear();
    map.forEach((v, k) => artistImageCache.set(k, v));
    return map;
}

export function splitByToday(lives) {
    const today = todayStr();
    const upcoming = lives.filter(l => l.concert_date >= today);
    const past = lives.filter(l => l.concert_date < today).reverse();
    return { upcoming, past };
}

export function availableYears(lives) {
    const years = new Set();
    lives.forEach(l => { const y = yearOf(l.concert_date); if (!isNaN(y)) years.add(y); });
    return [...years].sort((a, b) => b - a);
}

export function filterYear(lives, year) {
    return year ? lives.filter(l => yearOf(l.concert_date) === year) : lives;
}

function byCountThenLatest(a, b) {
    return b.count - a.count || (b.last || '').localeCompare(a.last || '');
}

function bump(map, key, live, extra) {
    let e = map.get(key);
    if (!e) {
        e = { key, count: 0, lives: [], first: null, last: null, ...extra };
        map.set(key, e);
    }
    e.count++;
    e.lives.push(live);
    if (!e.first || live.concert_date < e.first) e.first = live.concert_date;
    if (!e.last || live.concert_date > e.last) e.last = live.concert_date;
    return e;
}

export function rankArtists(lives) {
    const map = new Map();
    lives.forEach(l => liveArtists(l).forEach(name => bump(map, name, l, { name })));
    return [...map.values()].sort(byCountThenLatest);
}

export function rankVenues(lives) {
    const map = new Map();
    lives.forEach(l => { if (l.venue) bump(map, l.venue, l, { name: l.venue }); });
    return [...map.values()].sort(byCountThenLatest);
}

export function rankTracks(lives) {
    const map = new Map();
    lives.forEach(l => (l.performances || []).forEach(p => {
        const artist = (p.artist_name || '').trim() || 'Unknown';
        splitSetlist(p.setlist).forEach(song => bump(map, `${artist}|${song}`, l, { artist, song, name: song }));
    }));
    return [...map.values()].sort(byCountThenLatest);
}

export function assignRanks(list) {
    let rank = 0;
    let prev = null;
    list.forEach((item, i) => {
        if (prev === null || item.count !== prev) rank = i + 1;
        item.rank = rank;
        prev = item.count;
    });
    return list;
}

export function withDelta(list, previous) {
    if (!previous) return list;
    const prevRank = new Map(assignRanks(previous).map(p => [p.key, p.rank]));
    list.forEach(item => {
        const before = prevRank.get(item.key);
        item.delta = before === undefined ? 'new' : before - item.rank;
    });
    return list;
}


export function dayMap(lives) {
    const map = new Map();
    lives.forEach(l => {
        if (!map.has(l.concert_date)) map.set(l.concert_date, []);
        map.get(l.concert_date).push(l);
    });
    return map;
}

export function monthCounts(lives) {
    const counts = Array(12).fill(0);
    lives.forEach(l => { const d = parseDate(l.concert_date); if (d) counts[d.getMonth()]++; });
    return counts;
}

export function weekdayCounts(lives) {
    const counts = Array(7).fill(0);
    lives.forEach(l => { const d = parseDate(l.concert_date); if (d) counts[d.getDay()]++; });
    return counts;
}

export function yearCounts(lives) {
    const map = new Map();
    lives.forEach(l => { const y = yearOf(l.concert_date); if (!isNaN(y)) map.set(y, (map.get(y) || 0) + 1); });
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

export function longestGap(lives) {
    const dates = [...new Set(lives.map(l => l.concert_date))].sort().map(parseDate).filter(Boolean);
    let best = 0;
    for (let i = 1; i < dates.length; i++) {
        best = Math.max(best, Math.round((dates[i] - dates[i - 1]) / 86400000));
    }
    return best;
}

export function newArtistsInYear(allLives, year) {
    const firstYear = new Map();
    allLives.forEach(l => {
        const y = yearOf(l.concert_date);
        liveArtists(l).forEach(n => {
            if (!firstYear.has(n) || y < firstYear.get(n)) firstYear.set(n, y);
        });
    });
    return [...firstYear.entries()].filter(([, y]) => y === year).map(([n]) => n);
}
