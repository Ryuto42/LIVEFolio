const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
}

const DATA_IMAGE_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
export const MAX_DATA_IMAGE_LENGTH = 3000000;
export const MAX_IMAGE_URL_LENGTH = 2048;

export function isSafeImageSrc(value) {
    if (typeof value !== 'string') return false;
    if (value.startsWith('data:')) {
        return value.length <= MAX_DATA_IMAGE_LENGTH && DATA_IMAGE_RE.test(value);
    }
    if (value.length > MAX_IMAGE_URL_LENGTH) return false;
    try {
        return new URL(value).protocol === 'https:';
    } catch {
        return false;
    }
}

export function processLiveData(d) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const perfArtists = d.performances ? d.performances.map(p => p.artist_name ? p.artist_name.trim() : '').filter(x => x) : [];
    if (perfArtists.length === 0 && d.artist_name) {
        perfArtists.push(d.artist_name.trim());
    }

    const allArtistsStr = perfArtists.join(" / ");
    let cardSubArtists = allArtistsStr;

    if (perfArtists.length > 2) {
        cardSubArtists = perfArtists.slice(0, 2).join(" / ") + " ...";
    } else if (allArtistsStr.length > 30) {
        cardSubArtists = allArtistsStr.substring(0, 30) + "...";
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

    if (d.concert_date) {
        const dateObj = new Date(d.concert_date);
        const diffTime = dateObj - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        d.days_left = diffDays;
        if (diffDays < 0) {
            d.time_class = 'card-past';
        } else if (diffDays === 0 || diffDays === 1) {
            d.time_class = 'card-soon';
        } else {
            d.time_class = 'card-future';
        }
    } else {
        d.time_class = 'card-past';
    }

    return d;
}

export function liveCard(history) {
    let imgHtml = '';
    if (history.time_class === 'card-past') {
        imgHtml = `
        <div class="card-image">
            ${isSafeImageSrc(history.image_data) ? `<img src="${escapeHtml(history.image_data)}" loading="lazy" decoding="async" alt="">` : ''}
        </div>
        `;
    }

    return `
    <a href="/detail/${escapeHtml(history.id)}" class="card-link">
        <div class="card ${history.time_class}">
            ${imgHtml}
            <div class="card-info">
                <div class="card-date">${escapeHtml(history.concert_date)}</div>
                <div class="card-artist">${escapeHtml(history.card_main_title)}</div>
                <div class="card-title">${escapeHtml(history.card_sub_title)}</div>
            </div>
            <div class="detail-type-tag live-type-card ${history.live_type_class}">${escapeHtml(history.live_type)}</div>
        </div>
    </a>
    `;
}

export function artistTile(artist) {
    return `
    <a href="/artist/${escapeHtml(encodeURIComponent(artist.name))}" class="artist-tile">
        <div class="artist-tile-image">
            <img src="${isSafeImageSrc(artist.image_data) ? escapeHtml(artist.image_data) : '/icon.png'}" loading="lazy" decoding="async" alt="">
        </div>
        <div class="artist-tile-name">${escapeHtml(artist.name)}</div>
        <div class="artist-tile-meta">${escapeHtml(artist.latest_date)} • ${artist.count || 0} Live</div>
    </a>
    `;
}
