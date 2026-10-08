import { db } from '../db.js';
import { liveCard, processLiveData, escapeHtml, isSafeImageSrc } from '../utils.js';
import { searchArtistImage } from '../spotify.js';

export async function renderArtist(container, artistName) {
    artistName = decodeURIComponent(artistName);

    // Fetch Artist Image
    let imgUrl = null;
    const artist = await db.artists.get(artistName);
    if (artist && artist.image_data) {
        imgUrl = artist.image_data;
    } else {
        const spotifyImg = await searchArtistImage(artistName);
        if (spotifyImg) {
            imgUrl = spotifyImg;
            await db.artists.put({ name: artistName, image_data: spotifyImg, updated_at: new Date().toISOString() });
        }
    }

    const rawLives = await db.lives.toArray();
    const lives = rawLives
        .map(l => processLiveData(l))
        .filter(l => {
            if (l.artist_name === artistName) return true;
            if (l.performances) {
                return l.performances.some(p => p.artist_name === artistName);
            }
            return false;
        })
        .sort((a, b) => a.concert_date > b.concert_date ? -1 : 1);

    const topBarContainer = document.getElementById('top-bar-container');
    topBarContainer.innerHTML = `
        <div class="fixed-top-bar">
            <a href="/" data-nav="back" class="close-btn top-bar-left">←</a>
            <a href="/" class="top-bar-title">LIVEFolio</a>
            <div class="top-bar-spacer"></div>
        </div>
    `;

    let html = `
        <div class="content-wrapper">
            <div class="detail-centered-container detail-centered-compact">
                ${isSafeImageSrc(imgUrl) ? `<img src="${escapeHtml(imgUrl)}" class="detail-hero-image" loading="lazy" decoding="async">` : ''}
                <div class="detail-main-title">${escapeHtml(artistName)}</div>
            </div>

            <div class="section-title">lives</div>
            <div class="card-list">
    `;

    lives.forEach(live => {
        html += liveCard(live);
    });

    html += `
            </div>
        </div>
    `;

    container.innerHTML = html;
}
