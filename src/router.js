import { App } from '@capacitor/app';
import { closeTopOverlay } from './ui/components.js';
import { EASE_IOS, reducedMotion, flyShared, morphCapsule, reveal } from './ui/motion.js';
import { icon } from './ui/icons.js';
import { tick } from './ui/haptics.js';
import { escapeHtml } from './utils.js';
import { dataVersion } from './db.js';
import { hydrateTrackArt } from './trackArt.js';

const NAV_MS = 400;
const SHARED_IN_MS = 480;
const SHARED_OUT_MS = 300;
const PARALLAX = '-30%';
const TABS = ['home', 'stats'];

let routes = [];
let stack = [];
let curIdx = 0;
let queue = Promise.resolve();
let animating = false;
let swipeCommitted = false;
let suppressClick = false;
const tabMemory = {};

const pagesEl = () => document.getElementById('pages');
const top = () => stack[stack.length - 1];
const keyOf = url => url.pathname + url.search;

// GitHub Pages のようにサブパス（例: /LIVEFolio/）で配信しても動くよう、アプリ内のパスと実際の URL を相互に変換する
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const toAppPath = pathname => (BASE && pathname.startsWith(BASE) ? pathname.slice(BASE.length) || '/' : pathname);
function toLocationUrl(href) {
    const url = new URL(href, location.origin);
    if (BASE && url.pathname !== BASE && !url.pathname.startsWith(`${BASE}/`)) url.pathname = BASE + url.pathname;
    return url;
}
const dur = ms => (reducedMotion() ? 0 : ms);

export function defineRoutes(list) {
    routes = list;
}

function safeDecode(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function match(fullPath) {
    const pathname = toAppPath(fullPath);
    for (const route of routes) {
        const m = route.path.exec(pathname);
        if (m) return { route, params: m.slice(1).map(safeDecode) };
    }
    return { route: routes.find(r => r.notFound), params: [] };
}

// ---------- ページの殻 ----------
function buildShell(entry, opts) {
    const { title = '', largeTitle = true, back = false, left = '', actions = '', collapseAt = 36, className = '' } = opts;
    const el = entry.el;
    el.className = `page ${className} ${largeTitle ? 'has-large-title' : 'no-large-title'} ${entry.route.hideTabbar ? '' : 'has-tabbar'} ${entry.route.modal ? 'is-modal' : ''}`;
    const backBtn = back
        ? `<a href="#" data-nav="back" class="glass glass--control glass-btn pressable" style="--size:36px" aria-label="戻る">${icon(entry.route.modal ? 'close' : 'back', 17)}</a>`
        : '';
    el.innerHTML = `
        <div class="page-dim"></div>
        <div class="page-edge"></div>
        <header class="page-bar">
            <div class="bar-side bar-left">${backBtn}${left}</div>
            <div class="bar-title">${escapeHtml(title)}</div>
            <div class="bar-side bar-right">${actions}</div>
        </header>
        <div class="page-scroll">
            <div class="page-inner">
                ${largeTitle ? `<h1 class="large-title">${escapeHtml(title)}</h1>` : ''}
                <div class="page-body"></div>
            </div>
        </div>`;
    const scroll = el.querySelector('.page-scroll');
    const body = el.querySelector('.page-body');
    let collapsed = false;
    scroll.addEventListener('scroll', () => {
        const next = scroll.scrollTop > collapseAt;
        if (next !== collapsed) {
            collapsed = next;
            el.classList.toggle('is-collapsed', collapsed);
        }
    }, { passive: true });
    return { body, scroll, bar: el.querySelector('.page-bar') };
}

function createEntry(route, params, url) {
    const el = document.createElement('section');
    el.className = 'page';
    const entry = { route, params, key: keyOf(url), el, version: dataVersion, handlers: { show: [], data: [], destroy: [] } };
    const ctx = {
        params,
        query: new URLSearchParams(url.search),
        el,
        isRefresh: false,
        shell(opts) {
            const parts = buildShell(entry, opts);
            Object.assign(ctx, parts);
            return parts;
        },
        reveal(root = ctx.body) {
            reveal(root, ctx.scroll, !ctx.isRefresh);
            hydrateTrackArt(root);
        },
        setQuery(obj) {
            const qs = new URLSearchParams();
            Object.entries(obj).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, v); });
            const s = qs.toString();
            const key = location.pathname + (s ? `?${s}` : '');
            history.replaceState(history.state, '', key);
            entry.key = key;
            ctx.query = qs;
            if (route.tab) tabMemory[route.tab] = key;
        },
        onShow: fn => entry.handlers.show.push(fn),
        onData: fn => entry.handlers.data.push(fn),
        onDestroy: fn => entry.handlers.destroy.push(fn),
    };
    entry.ctx = ctx;
    return entry;
}

async function renderEntry(entry) {
    try {
        await entry.route.render(entry.ctx);
    } catch (e) {
        console.error(e);
        // 戻るボタンと暗幕を持つ通常の殻で作り直し、エラー画面からも戻れるようにする
        entry.handlers.data.length = 0;
        entry.ctx.shell({ title: '', largeTitle: false, back: true });
        entry.ctx.body.innerHTML = '<div class="page-error">画面を表示できませんでした</div>';
    }
    if (entry.route.tab) tabMemory[entry.route.tab] = entry.key;
}

async function refreshEntry(entry) {
    entry.version = dataVersion;
    if (!entry.handlers.data.length) return;
    entry.ctx.isRefresh = true;
    for (const fn of entry.handlers.data) await fn();
    entry.ctx.isRefresh = false;
}

function destroyEntry(entry) {
    entry.handlers.destroy.forEach(fn => fn());
    entry.el.remove();
}

// ---------- タブバー ----------
function syncTabbar() {
    const t = top();
    const bar = document.querySelector('.tabbar');
    if (!bar || !t) return;
    const rootTab = stack[0]?.route.tab;
    const pill = bar.querySelector('.tabbar-pill');
    const prev = pill.style.getPropertyValue('--i');
    const idx = TABS.indexOf(rootTab);
    bar.querySelectorAll('[data-tab]').forEach(a => a.classList.toggle('is-selected', a.dataset.tab === rootTab));
    pill.classList.toggle('capsule-hidden', idx < 0);
    if (idx >= 0) {
        pill.style.setProperty('--i', idx);
        if (prev !== '' && String(idx) !== prev) morphCapsule(pill.querySelector('.tab-capsule'));
    }
    bar.classList.toggle('is-hidden', !!t.route.hideTabbar);
}

// ---------- アニメーション ----------
function anim(el, keyframes, ms, easing = EASE_IOS) {
    if (!el) return Promise.resolve();
    return el.animate(keyframes, { duration: dur(ms), easing, fill: 'both' }).finished.catch(() => {});
}

function clearAnims(el) {
    el.getAnimations().forEach(a => a.cancel());
    el.querySelector('.page-dim')?.getAnimations().forEach(a => a.cancel());
}

function findShared(root, key) {
    return [...root.querySelectorAll('[data-shared]')].find(n => n.dataset.shared === key && n.getClientRects().length);
}

async function animatePush(entry, under, sharedFrom) {
    const pages = pagesEl();
    pages.appendChild(entry.el);
    const modal = entry.route.modal;
    if (sharedFrom && !modal) {
        const target = entry.el.querySelector(`[data-shared-target="${CSS.escape(sharedFrom.dataset.shared)}"]`);
        flyShared(sharedFrom, target, dur(SHARED_IN_MS));
    }
    const jobs = [];
    if (modal) {
        jobs.push(anim(entry.el, [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], NAV_MS));
    } else {
        jobs.push(anim(entry.el, [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }], NAV_MS));
        jobs.push(anim(entry.el.querySelector('.page-dim'), [{ opacity: 0 }, { opacity: 1 }], NAV_MS));
        if (under) jobs.push(anim(under.el, [{ transform: 'translateX(0)' }, { transform: `translateX(${PARALLAX})` }], NAV_MS));
    }
    await Promise.all(jobs);
    clearAnims(entry.el);
    if (under) {
        clearAnims(under.el);
        under.el.classList.add('is-under');
    }
}

async function animatePop(topEntry, under) {
    under.el.classList.remove('is-under');
    const target = topEntry.el.querySelector('[data-shared-target]');
    if (target && !topEntry.route.modal) {
        flyShared(target, findShared(under.el, target.dataset.sharedTarget), dur(SHARED_OUT_MS));
    }
    if (topEntry.route.modal) {
        await anim(topEntry.el, [{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }], NAV_MS);
    } else {
        await Promise.all([
            anim(topEntry.el, [{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }], NAV_MS),
            anim(topEntry.el.querySelector('.page-dim'), [{ opacity: 1 }, { opacity: 0 }], NAV_MS),
            anim(under.el, [{ transform: `translateX(${PARALLAX})` }, { transform: 'translateX(0)' }], NAV_MS),
        ]);
    }
    clearAnims(under.el);
}

async function animateFade(entry, oldEntries) {
    pagesEl().appendChild(entry.el);
    const old = oldEntries[oldEntries.length - 1];
    await Promise.all([
        anim(entry.el, [{ opacity: 0 }, { opacity: 1 }], 200, 'cubic-bezier(0, 0, 0.2, 1)'),
        old ? anim(old.el, [{ opacity: 1 }, { opacity: 0 }], 120, 'linear') : null,
    ]);
    clearAnims(entry.el);
}

// ---------- 遷移 ----------
async function goForward(url, { sharedFrom, replace } = {}) {
    const { route, params } = match(url.pathname);
    const entry = createEntry(route, params, url);
    await renderEntry(entry);
    animating = true;
    const old = [...stack];
    if (route.tab || replace) {
        stack = [entry];
        syncTabbar();
        await animateFade(entry, old);
        old.forEach(destroyEntry);
    } else {
        const under = top();
        stack.push(entry);
        syncTabbar();
        await animatePush(entry, under, sharedFrom);
    }
    animating = false;
}

async function goBack(url) {
    const key = keyOf(url);
    const j = stack.map(e => e.key).lastIndexOf(key, stack.length - 2);
    if (j >= 0) {
        const removed = stack.splice(j + 1);
        const topEntry = removed[removed.length - 1];
        const under = stack[j];
        removed.slice(0, -1).forEach(destroyEntry);
        syncTabbar();
        animating = true;
        if (swipeCommitted) {
            swipeCommitted = false;
            under.el.classList.remove('is-under');
            under.el.style.transform = '';
        } else {
            await animatePop(topEntry, under);
        }
        destroyEntry(topEntry);
        animating = false;
        await showEntry(under);
        return;
    }

    // 履歴に画面が残っていないときは、その場で作り直して戻る演出をする
    swipeCommitted = false;
    const { route, params } = match(url.pathname);
    const entry = createEntry(route, params, url);
    await renderEntry(entry);
    const old = [...stack];
    stack = [entry];
    syncTabbar();
    animating = true;
    const prevTop = old[old.length - 1];
    pagesEl().insertBefore(entry.el, pagesEl().firstChild);
    if (prevTop) {
        await Promise.all([
            prevTop.route.modal
                ? anim(prevTop.el, [{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }], NAV_MS)
                : anim(prevTop.el, [{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }], NAV_MS),
            prevTop.route.modal ? null : anim(entry.el, [{ transform: `translateX(${PARALLAX})` }, { transform: 'translateX(0)' }], NAV_MS),
        ]);
    }
    clearAnims(entry.el);
    old.forEach(destroyEntry);
    animating = false;
}

async function showEntry(entry) {
    if (entry.version !== dataVersion) await refreshEntry(entry);
    entry.handlers.show.forEach(fn => fn());
}

let pendingJobs = 0;

function enqueue(job) {
    pendingJobs++;
    queue = queue.then(job).catch(e => console.error(e)).finally(() => { pendingJobs--; });
    return queue;
}

export function navigate(href, { replace = false, sharedFrom = null } = {}) {
    const url = toLocationUrl(href);
    const key = keyOf(url);
    enqueue(async () => {
        if (!replace && top() && key === top().key) return;
        if (replace) {
            history.replaceState({ idx: curIdx }, '', key);
        } else {
            curIdx++;
            history.pushState({ idx: curIdx }, '', key);
        }
        await goForward(url, { sharedFrom, replace });
    });
}

export function back(fallback = '/') {
    if (stack.length > 1 || curIdx > 0) {
        history.back();
    } else {
        navigate(fallback, { replace: true });
    }
}

// 履歴を n 件まとめて戻る（削除後に詳細へ戻らないようにする等）
export function backBy(n, fallback = '/') {
    if (curIdx >= n) history.go(-n);
    else navigate(fallback, { replace: true });
}

export function switchTab(tab, href) {
    const root = stack[0];
    tick();
    if (root && root.route.tab === tab) {
        if (stack.length > 1) {
            history.go(-(stack.length - 1));
        } else {
            root.ctx.scroll?.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
        }
        return;
    }
    navigate(tabMemory[tab] || href);
}

// ---------- 左端スワイプで戻る ----------
function installEdgeSwipe() {
    let drag = null;
    const width = () => window.innerWidth;

    document.addEventListener('pointerdown', e => {
        if (animating || pendingJobs > 0 || stack.length < 2 || top().route.modal || e.clientX > 24) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        drag = { x: e.clientX, y: e.clientY, t: performance.now(), active: false, id: e.pointerId };
    }, { passive: true });

    document.addEventListener('pointermove', e => {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (!drag.active) {
            if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
            if (dx < 10) return;
            drag.active = true;
            drag.topEl = top().el;
            drag.underEl = stack[stack.length - 2].el;
            drag.underEl.classList.remove('is-under');
            document.body.classList.add('is-swiping');
        }
        const p = Math.min(1, Math.max(0, dx / width()));
        drag.p = p;
        drag.lastX = e.clientX;
        drag.lastT = performance.now();
        drag.topEl.style.transform = `translateX(${p * 100}%)`;
        const dimEl = drag.topEl.querySelector('.page-dim');
        if (dimEl) dimEl.style.opacity = String(1 - p);
        drag.underEl.style.transform = `translateX(${-30 * (1 - p)}%)`;
    }, { passive: true });

    const end = async e => {
        if (!drag || e.pointerId !== drag.id) return;
        const d = drag;
        drag = null;
        if (!d.active) return;
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 50);
        document.body.classList.remove('is-swiping');
        const elapsed = Math.max(1, performance.now() - d.t);
        const velocity = (e.clientX - d.x) / elapsed;
        const commit = d.p > 0.35 || (velocity > 0.5 && d.p > 0.08);
        const ms = 300;
        animating = true;
        const dim = d.topEl.querySelector('.page-dim');
        try {
            await Promise.all([
                anim(d.topEl, [{ transform: d.topEl.style.transform }, { transform: commit ? 'translateX(100%)' : 'translateX(0)' }], ms),
                dim ? anim(dim, [{ opacity: dim.style.opacity || 1 }, { opacity: commit ? 0 : 1 }], ms) : null,
                anim(d.underEl, [{ transform: d.underEl.style.transform }, { transform: commit ? 'translateX(0)' : `translateX(${PARALLAX})` }], ms),
            ]);
        } finally {
            animating = false;
        }
        if (commit) {
            d.topEl.style.visibility = 'hidden';
            swipeCommitted = true;
            tick();
            history.back();
        } else {
            [d.topEl, d.underEl].forEach(el => { clearAnims(el); el.style.transform = ''; });
            if (dim) dim.style.opacity = '';
            d.underEl.classList.add('is-under');
        }
    };
    document.addEventListener('pointerup', end, { passive: true });
    document.addEventListener('pointercancel', end, { passive: true });
}

// ---------- 起動 ----------
export function startRouter() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    document.addEventListener('click', e => {
        // 遷移の演出中は画面内の操作を受け付けない（保存ボタンの連打などで二重に処理されないように）
        if (suppressClick || (animating && e.target.closest('#pages, .tabbar'))) { e.preventDefault(); e.stopPropagation(); return; }
        const a = e.target.closest('a[href]');
        if (!a || a.target === '_blank' || a.hasAttribute('download') || a.hasAttribute('data-external')) return;
        if (a.origin !== location.origin) return;
        e.preventDefault();
        if (animating) return;
        if (a.dataset.nav === 'back') return back();
        if (a.dataset.tab) return switchTab(a.dataset.tab, a.getAttribute('href'));
        const shared = a.matches('[data-shared]') ? a : a.querySelector('[data-shared]');
        navigate(a.getAttribute('href'), { sharedFrom: shared });
    }, true);

    window.addEventListener('popstate', e => {
        const idx = e.state?.idx ?? 0;
        const url = new URL(location.href);
        const forward = idx > curIdx;
        curIdx = idx;
        // iOS Safari の端スワイプなど、ブラウザ自身が戻る演出をした場合は重ねて再生しない
        if (!forward && e.hasUAVisualTransition && stack.length > 1) swipeCommitted = true;
        closeTopOverlay();
        enqueue(() => (forward ? goForward(url) : goBack(url)));
    });

    // 遷移の演出中に届いた更新も取りこぼさないよう、キューに積んで最新の画面に反映する
    window.addEventListener('livefolio:data', () => {
        enqueue(() => {
            const t = top();
            if (t && t.version !== dataVersion) return refreshEntry(t);
        });
    });

    App.addListener('backButton', () => {
        if (closeTopOverlay()) return;
        if (curIdx > 0 || stack.length > 1) history.back();
        else App.exitApp();
    }).catch?.(() => {});

    installEdgeSwipe();

    // リロードしても履歴の番号が保たれるよう、既存の番号を引き継ぐ
    const url = new URL(location.href);
    curIdx = Number.isInteger(history.state?.idx) ? history.state.idx : 0;
    history.replaceState({ idx: curIdx }, '', keyOf(url));
    enqueue(async () => {
        const { route, params } = match(url.pathname);
        const entry = createEntry(route, params, url);
        await renderEntry(entry);
        stack = [entry];
        pagesEl().appendChild(entry.el);
        syncTabbar();
    });
}
