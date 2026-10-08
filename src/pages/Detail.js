import { db } from '../db.js';
import { processLiveData, escapeHtml, isSafeImageSrc } from '../utils.js';
import { searchArtistImage } from '../spotify.js';

export async function renderDetail(container, id) {
    const rawLive = await db.lives.get(id);
    if (!rawLive) {
        container.innerHTML = '<div style="margin-top:60px;text-align:center;">見つかりませんでした</div>';
        return;
    }

    const live = processLiveData(rawLive);

    // Date formatting (YYYY/MM/DD)
    const formattedDate = live.concert_date.replace(/-/g, '/');

    // Fetch Image logic
    let imgUrl = null;
    if (isSafeImageSrc(live.image_data)) {
        imgUrl = live.image_data;
    }

    const topBarContainer = document.getElementById('top-bar-container');
    topBarContainer.innerHTML = `
        <div class="header-new header-detail">
            <a href="/" data-nav="back" class="close-btn">←</a>
            <a href="/" class="header-title">LIVEFolio</a>
            <a href="/edit/${escapeHtml(live.id)}" class="close-btn">
                <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
            </a>
        </div>
    `;

    let html = `
        <div class="detail-centered-container">
    `;

    if (imgUrl) {
        html += `<img src="${escapeHtml(imgUrl)}" class="detail-hero-image" decoding="async" fetchpriority="high">`;
    }

    html += `
            <div class="detail-date">${escapeHtml(formattedDate)}</div>
            <div class="detail-main-title">${escapeHtml(live.detail_main_title)}</div>
            <div class="detail-sub-title">${escapeHtml(live.detail_sub_title)}</div>

            <div class="detail-venue">
                <svg class="inline-icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                ${escapeHtml(live.venue)}
            </div>
    `;

    if (live.days_left !== undefined && live.days_left >= 0) {
        html += `
            <div class="detail-countdown-box">
                ${live.days_left === 0 ? 
                    `<div class="num detail-today">TODAY</div>` : 
                    `<div class="num">${live.days_left}</div><div class="text">DAYS</div>`
                }
            </div>
        `;
    } else {
        if (live.performances) {
            live.performances.forEach(perf => {
                if (perf.setlist && perf.setlist.trim()) {
                    html += `<div class="setlist-block">`;
                    if (live.live_type === 'フェス' || live.live_type === '対バン') {
                        html += `<div class="setlist-artist">${escapeHtml(perf.artist_name)}</div>`;
                    }
                    html += `<ol class="setlist-grid">`;
                    perf.setlist.split(/\r?\n|\\n/).forEach(song => {
                        if (song.trim()) {
                            html += `<li><a href="https://open.spotify.com/search/${encodeURIComponent(perf.artist_name)} ${encodeURIComponent(song.trim())}" target="_blank" rel="noopener" class="spotify-link">${escapeHtml(song.trim())}</a></li>`;
                        }
                    });
                    html += `</ol></div>`;
                }
            });
        }
    }
    html += `</div>`;
    container.innerHTML = html;
}
