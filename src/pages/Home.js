import { db } from '../db.js';
import { processLiveData, liveCard, artistTile, escapeHtml } from '../utils.js';

function triggerCapsuleMorph(track) {
    const capsule = track && track.querySelector('.liquid-capsule');
    if (!capsule) return;
    capsule.classList.remove('is-morphing');
    void capsule.offsetWidth;
    capsule.classList.add('is-morphing');
}

export async function renderHome(container, tab = 'year') {
    // Re-render when background artist sync completes
    window.addEventListener('artists-updated', () => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('tab') === 'artist' && window.location.pathname === '/') {
            renderHome(container, 'artist');
        }
    }, { once: true });

    const topBarContainer = document.getElementById('top-bar-container');
    const rawLives = await db.lives.toArray();
    const lives = rawLives.map(l => processLiveData(l)).sort((a, b) => a.concert_date > b.concert_date ? 1 : -1);

    const todayStr = new Date().toISOString().substring(0, 10);
    const upcoming = lives.filter(l => l.concert_date >= todayStr);
    const past = lives.filter(l => l.concert_date < todayStr).reverse();

    let nextLive = null;
    if (upcoming.length > 0) {
        nextLive = upcoming[0];
    }

    const existingPill = topBarContainer.querySelector('.top-nav-pill');

    if (existingPill) {
        const links = existingPill.querySelectorAll('a');
        const leftLink = links[0];
        const rightLink = links[1];

        leftLink.href = "/?tab=year";
        leftLink.className = `nav-idx-year ${tab === 'year' ? 'active' : ''}`;
        leftLink.textContent = 'year';

        rightLink.href = "/?tab=artist";
        rightLink.className = `nav-idx-artist ${tab === 'artist' ? 'active' : ''}`;
        rightLink.textContent = 'artist';

        const track = existingPill.querySelector('.liquid-capsule-track');
        const wasArtist = track.classList.contains('right');
        track.classList.toggle('right', tab === 'artist');
        track.classList.toggle('left', tab !== 'artist');
        if (wasArtist !== (tab === 'artist')) {
            triggerCapsuleMorph(track);
        }
    } else {
        topBarContainer.innerHTML = `
            <div class="fixed-top-bar transparent-top-bar">
                <div class="top-bar-wash"></div>
                <div class="liquid-glass top-nav-pill">
                    <div class="liquid-capsule-track ${tab === 'artist' ? 'right' : 'left'}">
                        <div class="liquid-capsule"></div>
                    </div>
                    <a href="/?tab=year" class="nav-idx-year ${tab === 'year' ? 'active' : ''}">year</a>
                    <a href="/?tab=artist" class="nav-idx-artist ${tab === 'artist' ? 'active' : ''}">artist</a>
                </div>
                <a href="/search" class="liquid-glass liquid-glass-control dynamic-search-btn" aria-label="検索">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </a>
            </div>
        `;
    }

    let html = '';

    if (lives.length === 0) {
        html += `
            <div class="empty-state" style="margin-top: 100px;">
                <div style="font-size: 48px; margin-bottom: 16px;">🎸</div>
                <h3>No Live Records Yet</h3>
                <p style="font-size: 14px;">Add your first concert by tapping the <span style="font-weight: bold; color: var(--text-main);">＋</span> button in the bottom right!</p>
            </div>
        `;
    } else if (tab === 'year') {
        if (nextLive) {
            html += `
            <a href="/detail/${escapeHtml(nextLive.id)}" class="next-live ${nextLive.time_class}">
                <div class="next-live-content">
                    <div class="next-live-label">NEXT LIVE</div>
                    <div class="next-live-title">${escapeHtml(nextLive.card_main_title)}</div>
                    <div class="card-title next-live-subtitle">${escapeHtml(nextLive.card_sub_title)}</div>
                    <div class="card-title next-live-venue">
                        <svg class="inline-icon" viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> ${escapeHtml(nextLive.venue)}
                    </div>
                </div>
                <div class="next-live-countdown-container">
                    <div class="card-title next-live-date">${escapeHtml(nextLive.concert_date)}</div>
                    ${nextLive.days_left === 0 ? 
                        `<div class="next-live-countdown-num next-live-today">TODAY</div>` : 
                        `<div class="next-live-countdown-num">${nextLive.days_left}</div>
                         <div class="next-live-countdown-text">DAYS</div>`
                    }
                </div>
            </a>
            `;
        }

        if (upcoming.length > 1) {
            html += `<div class="section-title">upcoming</div><div class="card-list">`;
            upcoming.slice(1, 4).forEach(h => html += liveCard(h));
            html += `</div>`;
        }

        if (past.length > 0) {
            html += `<div class="section-title">past</div><div class="card-list">`;
            past.slice(0, 3).forEach(h => html += liveCard(h));
            html += `</div>`;
        }

    } else if (tab === 'artist') {
        const artists = await getArtistStats(lives);
        html += `
        <div class="section-title section-title-row section-title-flush">
            <span>${artists.length} artists</span>
            <span class="section-title-meta">most seen ↓</span>
        </div>
        <div class="artist-grid">
        `;
        artists.forEach(a => html += artistTile(a));
        html += `</div>`;
    }


    container.innerHTML = html;
}

async function getArtistStats(lives) {
    const artistMap = {};
    for (const live of lives) {
        if (live.performances) {
            for (const p of live.performances) {
                const name = p.artist_name;
                if (!name) continue;
                if (!artistMap[name]) artistMap[name] = { count: 0, latest_date: '0000-00-00' };
                artistMap[name].count++;
                if (live.concert_date > artistMap[name].latest_date) {
                    artistMap[name].latest_date = live.concert_date;
                }
            }
        }
    }

    const artistNames = Object.keys(artistMap);
    const dbArtists = await db.artists.where('name').anyOf(artistNames).toArray();
    const dbArtistMap = {};
    dbArtists.forEach(a => dbArtistMap[a.name] = a);

    return artistNames.map(name => {
        return {
            name: name,
            count: artistMap[name].count,
            latest_date: artistMap[name].latest_date,
            image_data: dbArtistMap[name] ? dbArtistMap[name].image_data : null
        };
    }).sort((a, b) => b.count - a.count);
}
