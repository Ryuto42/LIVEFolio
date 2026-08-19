import { db } from '../db.js';
import { liveCard, processLiveData } from '../utils.js';

function triggerCapsuleMorph(track) {
    const capsule = track && track.querySelector('.liquid-capsule');
    if (!capsule) return;
    capsule.classList.remove('is-morphing');
    void capsule.offsetWidth;
    capsule.classList.add('is-morphing');
}

export async function renderStats(container) {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab') || 'total';
    let currentYear = urlParams.get('y') ? parseInt(urlParams.get('y')) : new Date().getFullYear();

    const rawLives = await db.lives.toArray();
    
    // Sort and process lives
    const lives = rawLives.map(l => processLiveData(l)).sort((a, b) => a.concert_date > b.concert_date ? -1 : 1);

    // Filter by year if needed
    let filteredLives = lives;
    let availableYearsSet = new Set();
    lives.forEach(l => {
        if(l.concert_date) {
            availableYearsSet.add(new Date(l.concert_date).getFullYear());
        }
    });
    
    let availableYears = Array.from(availableYearsSet).sort((a,b) => b - a);
    if (availableYears.length === 0) availableYears = [currentYear];
    if (!availableYears.includes(currentYear)) {
        currentYear = availableYears[0];
    }

    if (tab === 'year') {
        filteredLives = lives.filter(l => new Date(l.concert_date).getFullYear() === currentYear);
    }

    // Calculations
    const trackMap = {};
    const venueMap = {};
    const artistMap = {};

    filteredLives.forEach(live => {
        if (live.venue) {
            if (!venueMap[live.venue]) {
                venueMap[live.venue] = { count: 0, lives: [] };
            }
            venueMap[live.venue].count++;
            venueMap[live.venue].lives.push({ id: live.id, date: live.concert_date, title: live.title });
        }

        if (live.performances) {
            live.performances.forEach(perf => {
                const aName = perf.artist_name || 'Unknown';
                artistMap[aName] = (artistMap[aName] || 0) + 1;

                if (perf.setlist) {
                    perf.setlist.split(/\r?\n|\\n/).forEach(song => {
                        const s = song.trim();
                        if (s) {
                            const key = aName + '|' + s;
                            if (!trackMap[key]) {
                                trackMap[key] = { artist: aName, song: s, count: 0, lives: [] };
                            }
                            trackMap[key].count++;
                            trackMap[key].lives.push({ id: live.id, date: live.concert_date, title: live.title });
                        }
                    });
                }
            });
        }
    });

    const venueRanking = Object.keys(venueMap).map(k => ({
        name: k,
        count: venueMap[k].count,
        lives: venueMap[k].lives.sort((a, b) => a.date > b.date ? 1 : -1)
    })).sort((a, b) => b.count - a.count);
    const artistRanking = Object.keys(artistMap).map(k => ({ name: k, count: artistMap[k] })).sort((a, b) => b.count - a.count);
    const trackRanking = Object.values(trackMap)
        .map(t => {
            t.lives.sort((a, b) => a.date > b.date ? 1 : -1);
            return t;
        })
        .sort((a, b) => b.count - a.count);

    const topBarContainer = document.getElementById('top-bar-container');
    const existingPill = topBarContainer.querySelector('.top-nav-pill');
    if (existingPill) {
        const links = existingPill.querySelectorAll('a');
        const leftLink = links[0];
        const rightLink = links[1];

        leftLink.href = `/stats?tab=year&y=${currentYear}`;
        leftLink.className = `nav-st-year ${tab === 'year' ? 'active' : ''}`;
        leftLink.textContent = 'year';
        leftLink.setAttribute('onclick', `window.history.pushState({},'','/stats?tab=year&y=${currentYear}'); window.dispatchEvent(new Event('popstate')); return false;`);

        rightLink.href = `/stats?tab=total`;
        rightLink.className = `nav-st-total ${tab === 'total' ? 'active' : ''}`;
        rightLink.textContent = 'total';
        rightLink.setAttribute('onclick', `window.history.pushState({},'','/stats?tab=total'); window.dispatchEvent(new Event('popstate')); return false;`);

        const track = existingPill.querySelector('.liquid-capsule-track');
        const wasTotal = track.classList.contains('right');
        track.classList.toggle('right', tab === 'total');
        track.classList.toggle('left', tab !== 'total');
        if (wasTotal !== (tab === 'total')) {
            triggerCapsuleMorph(track);
        }
    } else {
        topBarContainer.innerHTML = `
            <div class="fixed-top-bar transparent-top-bar">
                <div class="top-bar-wash"></div>
                <div class="liquid-glass top-nav-pill">
                    <div class="liquid-capsule-track ${tab === 'total' ? 'right' : 'left'}">
                        <div class="liquid-capsule"></div>
                    </div>
                    <a href="/stats?tab=year&y=${currentYear}" class="nav-st-year ${tab === 'year' ? 'active' : ''}" onclick="window.history.pushState({},'','/stats?tab=year&y=${currentYear}'); window.dispatchEvent(new Event('popstate')); return false;">year</a>
                    <a href="/stats?tab=total" class="nav-st-total ${tab === 'total' ? 'active' : ''}" onclick="window.history.pushState({},'','/stats?tab=total'); window.dispatchEvent(new Event('popstate')); return false;">total</a>
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
        container.innerHTML = html;
        return;
    }

    if (tab === 'year') {
        let currentIdx = availableYears.indexOf(currentYear);
        html += `<div class="year-selector">`;
        if (currentIdx < availableYears.length - 1) {
            const nextYear = availableYears[currentIdx + 1];
            html += `<a href="#" onclick="window.history.pushState({},'','/stats?tab=year&y=${nextYear}'); window.dispatchEvent(new Event('popstate')); return false;">＜</a>`;
        } else {
            html += `<span class="year-selector-placeholder">＜</span>`;
        }
        
        html += `<span>${currentYear}</span>`;
        
        if (currentIdx > 0) {
            const prevYear = availableYears[currentIdx - 1];
            html += `<a href="#" onclick="window.history.pushState({},'','/stats?tab=year&y=${prevYear}'); window.dispatchEvent(new Event('popstate')); return false;">＞</a>`;
        } else {
            html += `<span class="year-selector-placeholder">＞</span>`;
        }
        html += `</div>`;
    }

    html += `
        <div class="stats-grid">
            <button type="button" class="stat-card active" id="card-lives" data-action="stats-tab" data-tab-target="lives">
                <div class="stat-card-title">LIVE</div>
                <div class="stat-card-value">${filteredLives.length}</div>
            </button>
            <button type="button" class="stat-card" id="card-tracks" data-action="stats-tab" data-tab-target="tracks">
                <div class="stat-card-title">tracks</div>
                <div class="stat-card-value">${trackRanking.length}</div>
            </button>
            <button type="button" class="stat-card" id="card-venues" data-action="stats-tab" data-tab-target="venues">
                <div class="stat-card-title">venues</div>
                <div class="stat-card-value">${venueRanking.length}</div>
            </button>
            <button type="button" class="stat-card" id="card-artists" data-action="stats-tab" data-tab-target="artists">
                <div class="stat-card-title">artists</div>
                <div class="stat-card-value">${artistRanking.length}</div>
            </button>
        </div>

        <div class="section-title" id="list-title">live log</div>

        <div id="lives" class="list-container active">
            <div class="card-list">
    `;

    filteredLives.forEach(h => html += liveCard(h));

    html += `
            </div>
        </div>
        
        <div id="tracks" class="list-container">
    `;

    trackRanking.forEach((t, i) => {
        html += `
            <div class="accordion-item" data-accordion-id="track-${i}">
                <div class="ranking-item accordion-header" data-action="accordion-toggle">
                    <div class="ranking-name ranking-name-main">
                        <div class="ranking-track-line">
                            <a href="https://open.spotify.com/search/${encodeURIComponent(t.artist)} ${encodeURIComponent(t.song)}" target="_blank" class="ranking-spotify-link">
                                <svg class="spotify-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 11.973c2.5-1.473 5.5-.973 7.5.527M9 15c1.5-1 4-1 5 .5M7 9c3-2 6-2 9 0"></path></svg>
                            </a>
                            <span class="ranking-track-title">${t.song}</span>
                        </div>
                        <div class="ranking-track-artist">${t.artist}</div>
                    </div>
                    <div class="ranking-count">
                        <span>${t.count}</span>times 
                        <svg class="accordion-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                </div>
                <div class="accordion-wrapper">
                    <div class="accordion-content">
                        <div class="accordion-inner">
        `;
        t.lives.forEach(live => {
            html += `
                            <a href="/detail/${live.id}" class="accordion-live-link">
                                <span class="accordion-live-date">${live.date}</span>
                                <span class="accordion-live-title">${live.title}</span>
                            </a>
            `;
        });
        html += `
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    html += `
        </div>
        <div id="venues" class="list-container">
    `;

    venueRanking.forEach((v, i) => {
        html += `
            <div class="accordion-item" data-accordion-id="venue-${i}">
                <div class="ranking-item accordion-header" data-action="accordion-toggle">
                    <div class="ranking-name ranking-name-main">${v.name}</div>
                    <div class="ranking-count">
                        <span>${v.count}</span>times
                        <svg class="accordion-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                </div>
                <div class="accordion-wrapper">
                    <div class="accordion-content">
                        <div class="accordion-inner">
        `;
        v.lives.forEach(live => {
            html += `
                            <a href="/detail/${live.id}" class="accordion-live-link">
                                <span class="accordion-live-date">${live.date}</span>
                                <span class="accordion-live-title">${live.title}</span>
                            </a>
            `;
        });
        html += `
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    html += `
        </div>
        <div id="artists" class="list-container">
    `;

    artistRanking.forEach(a => {
        html += `
            <a href="/artist/${encodeURIComponent(a.name)}" class="card-link">
                <div class="ranking-item">
                    <div class="ranking-name">${a.name}</div>
                    <div class="ranking-count"><span>${a.count}</span>times <span class="ranking-chevron">＞</span></div>
                </div>
            </a>
        `;
    });

    html += `
        </div>
    `;


    container.innerHTML = html;

    // Attach logic for tabs and accordions
    container.querySelectorAll('[data-action="stats-tab"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = btn.getAttribute('data-tab-target');
            
            container.querySelectorAll('.list-container').forEach(el => {
                el.classList.remove('active');
                el.classList.remove('animate-fade');
                void el.offsetWidth; // trigger reflow
            });
            container.querySelectorAll('.stat-card').forEach(el => el.classList.remove('active'));
            
            const targetEl = container.querySelector('#' + targetId);
            if (targetEl) {
                targetEl.classList.add('active');
                targetEl.classList.add('animate-fade');
            }
            
            btn.classList.add('active');

            const titleEl = container.querySelector('#list-title');
            if (titleEl) {
                if (targetId === 'lives') titleEl.textContent = 'live log';
                else if (targetId === 'tracks') titleEl.textContent = 'track ranking';
                else if (targetId === 'venues') titleEl.textContent = 'venue ranking';
                else if (targetId === 'artists') titleEl.textContent = 'artist ranking';
            }
        });
    });

    container.querySelectorAll('[data-action="accordion-toggle"]').forEach(el => {
        el.addEventListener('click', () => {
            const item = el.closest('.accordion-item');
            if (el.classList.contains('active')) {
                el.classList.remove('active');
                if (item) item.classList.remove('open');
            } else {
                el.classList.add('active');
                if (item) item.classList.add('open');
            }
        });
    });
}
