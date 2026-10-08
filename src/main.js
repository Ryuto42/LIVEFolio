import './style.css';
import { renderHome } from './pages/Home.js';
import { searchArtistImage } from './spotify.js';
import { db } from './db.js';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}

if (Capacitor.getPlatform() === 'ios') {
    document.body.classList.add('ios-theme');
}

document.body.classList.add('app-launch');
setTimeout(() => {
    document.body.classList.remove('app-launch');
}, 600);

import { renderNewLive } from './pages/NewLive.js';
import { renderDetail } from './pages/Detail.js';
import { renderEditLive } from './pages/Edit.js';
import { renderStats } from './pages/Stats.js';
import { renderSearch } from './pages/Search.js';
import { renderArtist } from './pages/Artist.js';

let lastBottomNavTab = null;

function triggerCapsuleMorph(track) {
    const capsule = track && track.querySelector('.liquid-capsule');
    if (!capsule) return;
    capsule.classList.remove('is-morphing');
    void capsule.offsetWidth;
    capsule.classList.add('is-morphing');
}

App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
        window.history.back();
    } else {
        App.exitApp();
    }
});

window.appState = window.appState || {};

function saveCurrentState() {
    const path = window.location.pathname + window.location.search;
    window.appState[path] = {
        scrollY: window.scrollY,
        activeTabId: document.querySelector('.stat-card.active')?.id,
        openAccordions: Array.from(document.querySelectorAll('.accordion-item.open')).map(el => el.getAttribute('data-accordion-id'))
    };
}

const appContent = document.getElementById('app-content');

async function router(isPopState = false) {
    const path = window.location.pathname;

    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const navHighlight = document.getElementById('nav-highlight');
    let bottomNavTab = null;

    if (path === '/' || path === '/index.html') {
        bottomNavTab = 'home';
        document.querySelector('.nav-home')?.classList.add('active');
        if (navHighlight) {
            navHighlight.classList.remove('right');
            navHighlight.classList.add('left');
        }
        const urlParams = new URLSearchParams(window.location.search);
        const tab = urlParams.get('tab') || 'year';
        await renderHome(appContent, tab);
    } else if (path.startsWith('/stats')) {
        bottomNavTab = 'stats';
        document.querySelector('.nav-stats')?.classList.add('active');
        if (navHighlight) {
            navHighlight.classList.remove('left');
            navHighlight.classList.add('right');
        }
        await renderStats(appContent);
    } else if (path.startsWith('/detail/')) {
        const id = path.split('/detail/')[1];
        await renderDetail(appContent, id);
    } else if (path.startsWith('/edit/')) {
        const id = path.split('/edit/')[1];
        await renderEditLive(appContent, id);
    } else if (path.startsWith('/artist/')) {
        const artistName = path.split('/artist/')[1];
        await renderArtist(appContent, artistName);
    } else if (path === '/new') {
        await renderNewLive(appContent);
    } else if (path === '/search') {
        await renderSearch(appContent);
    } else {
        appContent.innerHTML = '<h2>404 Not Found</h2>';
    }

    // Trigger screen transition animation after DOM update
    appContent.classList.remove('page-enter');
    void appContent.offsetWidth; // force reflow
    if (!isPopState) {
        appContent.classList.add('page-enter');
    }


    if (bottomNavTab && lastBottomNavTab && lastBottomNavTab !== bottomNavTab) {
        triggerCapsuleMorph(navHighlight);
    }
    if (bottomNavTab) lastBottomNavTab = bottomNavTab;

    const bottomNav = document.querySelector('.liquid-tabbar-wrap');
    if (bottomNav) {
        bottomNav.style.display = bottomNavTab ? 'flex' : 'none';
    }

    const fullPath = window.location.pathname + window.location.search;
    if (isPopState === true && window.appState[fullPath]) {
        const state = window.appState[fullPath];
        if (state.activeTabId) {
            const btn = document.getElementById(state.activeTabId);
            if (btn) btn.click();
        }
        if (state.openAccordions) {
            state.openAccordions.forEach(id => {
                const item = document.querySelector(`.accordion-item[data-accordion-id="${id}"]`);
                if (item) {
                    const toggle = item.querySelector('[data-action="accordion-toggle"]');
                    if (toggle && !item.classList.contains('open')) toggle.click();
                }
            });
        }
        setTimeout(() => window.scrollTo(0, state.scrollY || 0), 10);
    } else {
        window.scrollTo(0, 0);
    }
}

// Intercept link clicks for SPA routing
document.addEventListener('click', e => {
    const link = e.target.closest('a');
    if (link && link.href.startsWith(window.location.origin) && !link.hasAttribute('data-external')) {
        e.preventDefault();
        
        saveCurrentState();

        const navType = link.getAttribute('data-nav');
        if (navType === 'back' || navType === 'back-root') {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.history.pushState({}, '', '/');
                router();
            }
            return;
        }

        window.history.pushState({}, '', link.href);
        router(navType === 'tab');
    }
});

document.addEventListener('error', e => {
    if (e.target instanceof HTMLImageElement && e.target.closest('.artist-tile-image')) {
        e.target.hidden = true;
    }
}, true);

window.addEventListener('popstate', () => {
    router(true);
});

export async function syncArtistImages() {
    try {
        const lives = await db.lives.toArray();
        const artistNames = new Set();
        lives.forEach(l => {
            if (l.artist_name) artistNames.add(l.artist_name);
            if (l.performances) {
                l.performances.forEach(p => {
                    if (p.artist_name) artistNames.add(p.artist_name);
                });
            }
        });
        
        for (const name of artistNames) {
            const artist = await db.artists.get(name);
            if (!artist || !artist.image_data) {
                const imgUrl = await searchArtistImage(name);
                if (imgUrl) {
                    await db.artists.put({ name: name, image_data: imgUrl, updated_at: new Date().toISOString() });
                }
                // Sleep slightly to prevent rate limits
                await new Promise(r => setTimeout(r, 500));
            }
        }
        
        // Notify the app that background sync is finished so UI can update
        window.dispatchEvent(new Event('artists-updated'));
    } catch(e) {
        console.error('Background image sync failed', e);
    }
}

// Init
window.addEventListener('DOMContentLoaded', () => {
    router();
    // Run sync in background
    setTimeout(syncArtistImages, 2000);
});
