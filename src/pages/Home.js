import { db } from '../db.js';
import { processLiveData, liveCard, artistTile } from '../utils.js';

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
        const leftLink = existingPill.children[1];
        const rightLink = existingPill.children[2];
        
        leftLink.href = "/?tab=year";
        leftLink.className = `nav-idx-year ${tab === 'year' ? 'active' : ''}`;
        leftLink.textContent = 'year';
        leftLink.onclick = null;
        leftLink.removeAttribute('onclick');

        rightLink.href = "/?tab=artist";
        rightLink.className = `nav-idx-artist ${tab === 'artist' ? 'active' : ''}`;
        rightLink.textContent = 'artist';
        rightLink.onclick = null;
        rightLink.removeAttribute('onclick');

        const pill = topBarContainer.querySelector('.pill-highlight');
        if (tab === 'artist') {
            pill.classList.remove('left');
            pill.classList.add('right');
        } else {
            pill.classList.remove('right');
            pill.classList.add('left');
        }

        if (!topBarContainer.querySelector('.fab')) {
            topBarContainer.insertAdjacentHTML('beforeend', `<a href="/new" class="fab">＋</a>`);
        }
    } else {
        topBarContainer.innerHTML = `
            <div class="fixed-top-bar transparent-top-bar">
                <div class="top-nav-pill">
                    <div class="pill-highlight ${tab === 'artist' ? 'right' : 'left'}"></div>
                    <a href="/?tab=year" class="nav-idx-year ${tab === 'year' ? 'active' : ''}">year</a>
                    <a href="/?tab=artist" class="nav-idx-artist ${tab === 'artist' ? 'active' : ''}">artist</a>
                </div>
                <a href="/search" class="dynamic-search-btn">🔍</a>
            </div>
            <a href="/new" class="fab">＋</a>
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
            <a href="/detail/${nextLive.id}" class="next-live ${nextLive.time_class}">
                <div class="next-live-content">
                    <div class="next-live-label">NEXT LIVE</div>
                    <div class="next-live-title">${nextLive.card_main_title}</div>
                    <div class="card-title next-live-subtitle">${nextLive.card_sub_title}</div>
                    <div class="card-title next-live-venue">
                        <svg class="inline-icon" viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> ${nextLive.venue || ''}
                    </div>
                </div>
                <div class="next-live-countdown-container">
                    <div class="card-title next-live-date">${nextLive.concert_date}</div>
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
