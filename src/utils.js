const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
}

const DATA_IMAGE_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
export const MAX_DATA_IMAGE_LENGTH = 3000000;
export const MAX_IMAGE_URL_LENGTH = 2048;

// 外部画像は Spotify と Apple の画像配信ドメインだけを許可する（任意の URL を読み込ませて閲覧を追跡されないように）
const IMAGE_HOSTS = [/^i\.scdn\.co$/, /\.scdn\.co$/, /\.spotifycdn\.com$/, /\.mzstatic\.com$/];

export function isSafeImageSrc(value) {
    if (typeof value !== 'string') return false;
    if (value.startsWith('data:')) {
        return value.length <= MAX_DATA_IMAGE_LENGTH && DATA_IMAGE_RE.test(value);
    }
    if (value.length > MAX_IMAGE_URL_LENGTH) return false;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && IMAGE_HOSTS.some(re => re.test(url.hostname));
    } catch {
        return false;
    }
}

export const nf = new Intl.NumberFormat('ja-JP');
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// 'YYYY-MM-DD' を new Date() に渡すと UTC 0時になり、JST で日付がずれるためローカル日付として解釈する
export function parseDate(str) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(str || '');
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
}

export function toDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function todayStr() {
    return toDateStr(new Date());
}

// URL などから受け取った年を、扱える範囲（1900〜2100 年）に限って数値にする
export function parseYear(value) {
    const y = parseInt(value, 10);
    return Number.isInteger(y) && y >= 1900 && y <= 2100 ? y : null;
}

export function yearOf(str) {
    return str ? parseInt(str.slice(0, 4), 10) : NaN;
}

export function formatDate(str, { weekday = false, style = 'slash' } = {}) {
    const d = parseDate(str);
    if (!d) return str || '';
    const base = style === 'ja'
        ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
        : `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    return weekday ? `${base}（${WEEKDAYS[d.getDay()]}）` : base;
}


export function splitSetlist(setlist) {
    if (!setlist) return [];
    return String(setlist).split(/\r?\n|\\n/).map(s => s.trim()).filter(Boolean);
}

export function liveArtists(live) {
    const names = (live.performances || []).map(p => (p.artist_name || '').trim()).filter(Boolean);
    if (names.length === 0 && live.artist_name) names.push(live.artist_name.trim());
    return [...new Set(names)];
}

export function processLiveData(d) {
    const perfArtists = liveArtists(d);
    const allArtistsStr = perfArtists.join(' / ');
    let cardSubArtists = allArtistsStr;

    if (perfArtists.length > 2) {
        cardSubArtists = perfArtists.slice(0, 2).join(' / ') + ' ...';
    } else if (allArtistsStr.length > 30) {
        cardSubArtists = allArtistsStr.substring(0, 30) + '...';
    }

    if (d.live_type === 'フェス' || d.live_type === '対バン') {
        d.card_main_title = d.title || '';
        d.card_sub_title = cardSubArtists;
        d.detail_main_title = d.title || '';
        d.detail_sub_title = allArtistsStr;
        d.live_type_class = d.live_type === 'フェス' ? 'type-fes' : 'type-taiban';
    } else {
        d.card_main_title = d.artist_name || '';
        d.card_sub_title = d.title || '';
        d.detail_main_title = d.artist_name || '';
        d.detail_sub_title = d.title || '';
        d.live_type_class = 'type-oneman';
    }

    const date = parseDate(d.concert_date);
    if (date) {
        const today = parseDate(todayStr());
        const diffDays = Math.round((date - today) / 86400000);
        d.days_left = diffDays;
        if (diffDays < 0) {
            d.time_class = 'card-past';
        } else if (diffDays <= 1) {
            d.time_class = 'card-soon';
        } else {
            d.time_class = 'card-future';
        }
    } else {
        d.time_class = 'card-past';
    }

    return d;
}

export function countdownLabel(days) {
    if (days === 0) return '今日';
    if (days === 1) return '明日';
    return `あと${nf.format(days)}日`;
}

// Java の String.hashCode と同じ計算（Encore のシード色と揃えるため）
export function hashCode(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return h;
}

function hsvToHex(h, s, v) {
    const f = n => {
        const k = (n + h / 60) % 6;
        return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    };
    const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(f(5))}${toHex(f(3))}${toHex(f(1))}`;
}

export function seedColors(seed) {
    const hue = (hashCode(String(seed || '')) & 0x7fffffff) % 360;
    return [hsvToHex(hue, 0.55, 0.62), hsvToHex((hue + 38) % 360, 0.70, 0.28)];
}

export function initialOf(name) {
    const ch = Array.from(String(name || '').trim())[0];
    return ch ? ch.toUpperCase() : '♪';
}

// 壊れたサロゲートペアを含む文字列でも encodeURIComponent が例外を投げないよう、先に整える
export function encodeText(value) {
    const s = String(value ?? '');
    const wellFormed = typeof s.toWellFormed === 'function'
        ? s.toWellFormed()
        : s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
    return encodeURIComponent(wellFormed);
}

export function artistHref(name) {
    return `/artist/${encodeText(name)}`;
}

export function spotifySearchUrl(...terms) {
    return `https://open.spotify.com/search/${terms.filter(Boolean).map(encodeText).join(' ')}`;
}
