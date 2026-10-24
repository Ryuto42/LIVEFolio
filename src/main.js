import './style.css';
import { defineRoutes, startRouter } from './router.js';
import { installPressable } from './ui/motion.js';
import { icon } from './ui/icons.js';
import { syncArtistImages } from './sync.js';
import { Capacitor } from '@capacitor/core';
import { touchData } from './db.js';
import { todayStr } from './utils.js';

import renderHome from './pages/Home.js';
import renderStats from './pages/Stats.js';
import renderCalendar from './pages/Calendar.js';
import renderSearch from './pages/Search.js';
import renderDetail from './pages/Detail.js';
import renderArtist from './pages/Artist.js';
import { renderNewLive, renderEditLive } from './pages/LiveForm.js';
import renderSettings from './pages/Settings.js';
import renderRecapHub from './pages/Recap.js';
import renderRecapStory from './pages/RecapStory.js';
import renderNotFound from './pages/NotFound.js';

defineRoutes([
    { path: /^\/(?:index\.html)?$/, tab: 'home', render: renderHome },
    { path: /^\/stats\/?$/, tab: 'stats', render: renderStats },
    { path: /^\/calendar\/?$/, render: renderCalendar },
    { path: /^\/search\/?$/, tab: 'search', render: renderSearch },
    { path: /^\/detail\/([^/]+)$/, render: renderDetail },
    { path: /^\/artist\/(.+)$/, render: renderArtist },
    { path: /^\/new$/, modal: true, hideTabbar: true, render: renderNewLive },
    { path: /^\/edit\/([^/]+)$/, hideTabbar: true, render: renderEditLive },
    { path: /^\/settings$/, hideTabbar: true, render: renderSettings },
    { path: /^\/recap$/, render: renderRecapHub },
    { path: /^\/recap\/(\d{4})$/, modal: true, hideTabbar: true, render: renderRecapStory },
    { path: /^$/, notFound: true, render: renderNotFound },
]);

function mountTabbar() {
    const nav = document.querySelector('.tabbar');
    nav.innerHTML = `
        <div class="tabbar-pill glass glass--bar">
            <span class="tab-capsule glass glass--capsule"></span>
            <a href="/" class="tab pressable" data-tab="home">${icon('home', 17)}<span>ホーム</span></a>
            <a href="/stats" class="tab pressable" data-tab="stats">${icon('chart', 17)}<span>統計</span></a>
        </div>
        <a href="/search" class="tabbar-circle glass glass--bar pressable" data-tab="search" aria-label="検索">${icon('search', 18)}</a>
        <a href="/new" class="tabbar-circle glass glass--bar pressable" aria-label="ライブを記録">${icon('plus', 19)}</a>`;
}

document.body.classList.add('app-launch');
setTimeout(() => document.body.classList.remove('app-launch'), 600);

// 画像が読めないときはアートワークのシード色を見せる
document.addEventListener('error', e => {
    const art = e.target instanceof HTMLImageElement && e.target.closest('.art');
    if (!art) return;
    e.target.remove();
    art.classList.remove('art--faded');
}, true);

// アプリを開いたまま日付が変わったら、カウントダウンや「今日」の表示を作り直す
let shownDate = todayStr();
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || todayStr() === shownDate) return;
    shownDate = todayStr();
    touchData();
});

// role="button" の要素も Enter / Space で押せるようにする
document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest?.('[role="button"]');
    if (!el || el !== e.target) return;
    e.preventDefault();
    el.click();
});

installPressable();
mountTabbar();
startRouter();
setTimeout(syncArtistImages, 2000);

if ('serviceWorker' in navigator && import.meta.env.PROD && !Capacitor.isNativePlatform()) {
    const base = import.meta.env.BASE_URL;
    window.addEventListener('load', () => navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {}));
}
