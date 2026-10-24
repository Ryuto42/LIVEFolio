import { escapeHtml, isSafeImageSrc, seedColors, initialOf, formatDate, countdownLabel, nf, liveArtists, artistHref } from '../utils.js';
import { artistImageCache } from '../domain/stats.js';
import { cachedTrack } from '../trackArt.js';
import { icon } from './icons.js';
import { tick, impact } from './haptics.js';
import { morphCapsule, EASE_IOS, reducedMotion } from './motion.js';

// ---------- アートワーク ----------
export function artwork({ src, seed, size = 48, round = false, shared = '', target = false, className = '', faded = false }) {
    const [c1, c2] = seedColors(seed);
    const usable = typeof src === 'string' && (src.startsWith('blob:') || isSafeImageSrc(src));
    const img = usable ? `<img src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async">` : '';
    const sharedAttr = shared ? `${target ? 'data-shared-target' : 'data-shared'}="${escapeHtml(shared)}"` : '';
    return `<div class="art ${round ? 'art--round' : ''} ${img && faded ? 'art--faded' : ''} ${className}" style="--s:${size}px;--c1:${c1};--c2:${c2}" ${sharedAttr}><span class="art-initial">${escapeHtml(initialOf(seed))}</span>${img}</div>`;
}

// 写真（数百 KB の data URL）を一覧の HTML に毎回埋め込むと重いため、1 件ごとに 1 度だけ Blob URL に変えて使い回す
const photoUrls = new Map();

function photoSrc(live) {
    const data = live.image_data;
    if (!isSafeImageSrc(data)) return null;
    if (!data.startsWith('data:')) return data;
    const sig = `${live.updated_at || ''}:${data.length}`;
    const hit = photoUrls.get(live.id);
    if (hit && hit.sig === sig) return hit.url;
    if (hit) URL.revokeObjectURL(hit.url);
    try {
        const comma = data.indexOf(',');
        const mime = data.slice(5, data.indexOf(';'));
        const bin = atob(data.slice(comma + 1));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
        photoUrls.set(live.id, { sig, url });
        return url;
    } catch {
        return data;
    }
}

// ライブの写真が無いときは、出演アーティストの写真を半分の濃さで代わりに出す
export function liveArtwork(live, opts = {}) {
    const photo = photoSrc(live);
    if (photo) return artwork({ src: photo, seed: live.card_main_title, ...opts });
    const artist = liveArtists(live)[0];
    return artwork({ src: artist && artistImageCache.get(artist), seed: live.card_main_title, faded: true, ...opts });
}

// 曲のジャケット。未取得なら枠だけ描き、取得後に hydrateTrackArt が画像を差し込む
export function trackArtwork(artist, song, size = 40, extra = {}) {
    const row = cachedTrack(artist, song);
    const html = artwork({ src: row?.image, seed: song, size, ...extra });
    return html.replace('<div class="art', `<div data-track-artist="${escapeHtml(artist)}" data-track-song="${escapeHtml(song)}" class="art`);
}

export function trackLink(artist, song) {
    return cachedTrack(artist, song)?.spotify_url || null;
}

// ---------- ボタン ----------
export function glassButton({ href, action, iconName, label, size = 36, iconSize = 15, className = '' }) {
    const inner = icon(iconName, iconSize);
    const attrs = `class="glass glass--control glass-btn pressable ${className}" style="--size:${size}px" aria-label="${escapeHtml(label)}"`;
    return href
        ? `<a href="${escapeHtml(href)}" ${attrs}>${inner}</a>`
        : `<button type="button" data-action="${escapeHtml(action)}" ${attrs}>${inner}</button>`;
}

export function pillButton({ href, action, label, iconName, variant = 'primary', type = 'button' }) {
    const inner = `${iconName ? icon(iconName, 15) : ''}<span>${escapeHtml(label)}</span>`;
    const cls = `pill-btn pill-btn--${variant} pressable`;
    return href
        ? `<a href="${escapeHtml(href)}" class="${cls}">${inner}</a>`
        : `<button type="${type}" ${action ? `data-action="${escapeHtml(action)}"` : ''} class="${cls}">${inner}</button>`;
}

// ---------- セグメントコントロール ----------
// ラジオボタンを使うフォーム用のセグメント（FormData の name を保つ）
export function radioSegmented(name, items, selected) {
    const i = Math.max(0, items.findIndex(it => it.value === selected));
    return `<div class="segmented glass glass--control" data-radio-segmented style="--n:${items.length};--i:${i}">
        <span class="seg-capsule glass glass--capsule"></span>
        ${items.map((it, idx) => `<label class="seg-item ${idx === i ? 'is-selected' : ''}"><input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(it.value)}" ${idx === i ? 'checked' : ''}>${escapeHtml(it.label)}</label>`).join('')}
    </div>`;
}

export function bindRadioSegmented(el, onChange) {
    if (!el) return;
    el.addEventListener('change', e => {
        const items = [...el.querySelectorAll('.seg-item')];
        const idx = items.findIndex(l => l.contains(e.target));
        items.forEach((l, i) => l.classList.toggle('is-selected', i === idx));
        el.style.setProperty('--i', idx);
        morphCapsule(el.querySelector('.seg-capsule'));
        tick();
        onChange?.(e.target.value);
    });
}

// ---------- 見出し・行 ----------
export function sectionHeader(title, { href, label = 'すべて見る', count } = {}) {
    const action = href
        ? `<a href="${escapeHtml(href)}" class="section-action pressable">${escapeHtml(label)}${icon('chevronRight', 12)}</a>`
        : (count !== undefined ? `<span class="section-count">${escapeHtml(count)}</span>` : '');
    return `<div class="section-header"><h2>${escapeHtml(title)}</h2>${action}</div>`;
}

export function typeTag(live) {
    return `<span class="type-tag ${live.live_type_class}">${escapeHtml(live.live_type || 'ワンマン')}</span>`;
}

export function liveRow(live, { reveal, highlight = escapeHtml } = {}) {
    const upcoming = live.days_left !== undefined && live.days_left >= 0;
    const trailing = upcoming
        ? `<span class="countdown-chip ${live.days_left <= 1 ? 'is-soon' : ''}">${escapeHtml(countdownLabel(live.days_left))}</span>`
        : typeTag(live);
    return `<a href="/detail/${escapeHtml(live.id)}" class="media-row pressable" ${reveal !== undefined ? `data-reveal="${reveal}"` : ''}>
        ${liveArtwork(live, { size: 52, shared: `live-${live.id}` })}
        <div class="media-text">
            <div class="media-title">${highlight(live.card_main_title || '（無題）')}</div>
            ${live.card_sub_title ? `<div class="media-sub">${highlight(live.card_sub_title)}</div>` : ''}
            <div class="media-meta">${escapeHtml(formatDate(live.concert_date))}${live.venue ? ` · ${highlight(live.venue)}` : ''}</div>
        </div>
        <div class="media-trailing">${trailing}</div>
    </a>`;
}

export function artistRow({ name, count, image, last }, { reveal, highlight } = {}) {
    const title = highlight ? highlight(name) : escapeHtml(name);
    return `<a href="${escapeHtml(artistHref(name))}" class="media-row pressable" ${reveal !== undefined ? `data-reveal="${reveal}"` : ''}>
        ${artwork({ src: image, seed: name, size: 48, round: true, shared: `artist-${name}` })}
        <div class="media-text">
            <div class="media-title">${title}</div>
            <div class="media-sub">${nf.format(count)}回参戦${last ? ` · 最終 ${escapeHtml(formatDate(last))}` : ''}</div>
        </div>
        <div class="media-trailing">${icon('chevronRight', 13)}</div>
    </a>`;
}

export function statTile(label, value, sub = '', { compact = false } = {}) {
    return `<div class="stat-tile ${compact ? 'stat-tile--compact' : ''}">
        <div class="stat-label">${escapeHtml(label)}</div>
        <div class="stat-value">${value}</div>
        ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
    </div>`;
}

export function emptyState({ iconName = 'music', title, body = '', action = '' }) {
    return `<div class="empty-state">
        <div class="empty-icon">${icon(iconName, 38)}</div>
        <div class="empty-title">${escapeHtml(title)}</div>
        ${body ? `<div class="empty-body">${escapeHtml(body)}</div>` : ''}
        ${action ? `<div class="empty-action">${action}</div>` : ''}
    </div>`;
}

export function deltaBadge(delta) {
    if (delta === undefined) return '';
    if (delta === 'new') return '<span class="delta delta--new">NEW</span>';
    if (delta > 0) return `<span class="delta delta--up">▲${delta}</span>`;
    if (delta < 0) return `<span class="delta delta--down">▼${-delta}</span>`;
    return '<span class="delta delta--same">—</span>';
}

// ---------- オーバーレイ（シート・ダイアログ）----------
const overlays = [];

export function closeTopOverlay() {
    const top = overlays[overlays.length - 1];
    if (!top) return false;
    top();
    return true;
}

function animateIn(el, keyframes, duration = 400) {
    if (reducedMotion()) return Promise.resolve();
    return el.animate(keyframes, { duration, easing: EASE_IOS, fill: 'both' }).finished.catch(() => {});
}

export function openSheet({ title = '', html, onMount }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.innerHTML = `<div class="sheet-handle"></div>${title ? `<div class="sheet-title">${escapeHtml(title)}</div>` : ''}<div class="sheet-body">${html}</div>`;
    document.body.append(backdrop, sheet);

    let closed = false;
    const close = async () => {
        if (closed) return;
        closed = true;
        const i = overlays.indexOf(close);
        if (i >= 0) overlays.splice(i, 1);
        await Promise.all([
            animateIn(backdrop, [{ opacity: 1 }, { opacity: 0 }], 260),
            animateIn(sheet, [{ transform: sheet.style.transform || 'translateY(0)' }, { transform: 'translateY(100%)' }], 320),
        ]);
        backdrop.remove();
        sheet.remove();
    };
    overlays.push(close);
    backdrop.addEventListener('click', close);
    sheet.addEventListener('click', e => { if (e.target.closest('a[href]')) close(); });

    let startY = null;
    const handle = sheet.querySelector('.sheet-handle');
    sheet.addEventListener('pointerdown', e => {
        if (e.target !== handle && sheet.querySelector('.sheet-body').scrollTop > 0) return;
        if (e.target.closest('a, button, input')) return;
        startY = e.clientY;
    });
    sheet.addEventListener('pointermove', e => {
        if (startY === null) return;
        const dy = Math.max(0, e.clientY - startY);
        sheet.style.transform = `translateY(${dy}px)`;
    });
    const end = e => {
        if (startY === null) return;
        const dy = Math.max(0, e.clientY - startY);
        startY = null;
        if (dy > sheet.offsetHeight * 0.25) close();
        else sheet.animate([{ transform: sheet.style.transform }, { transform: 'translateY(0)' }], { duration: 320, easing: EASE_IOS }).finished.then(() => { sheet.style.transform = ''; });
    };
    sheet.addEventListener('pointerup', end);
    sheet.addEventListener('pointercancel', end);

    animateIn(backdrop, [{ opacity: 0 }, { opacity: 1 }], 260);
    animateIn(sheet, [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }]);
    onMount?.(sheet);
    return close;
}

export function confirmDialog({ title, message = '', confirmLabel = 'OK', cancelLabel = 'キャンセル', destructive = false }) {
    return new Promise(resolve => {
        const wrap = document.createElement('div');
        wrap.className = 'dialog-backdrop';
        wrap.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true">
            <div class="dialog-title">${escapeHtml(title)}</div>
            ${message ? `<div class="dialog-message">${escapeHtml(message)}</div>` : ''}
            <div class="dialog-actions">
                ${cancelLabel ? `<button type="button" class="dialog-btn pressable" data-r="0">${escapeHtml(cancelLabel)}</button>` : ''}
                <button type="button" class="dialog-btn dialog-btn--primary ${destructive ? 'is-destructive' : ''} pressable" data-r="1">${escapeHtml(confirmLabel)}</button>
            </div>
        </div>`;
        document.body.appendChild(wrap);
        const box = wrap.querySelector('.dialog');
        animateIn(wrap, [{ opacity: 0 }, { opacity: 1 }], 200);
        animateIn(box, [{ transform: 'scale(1.08)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], 320);

        let done = false;
        const finish = async result => {
            if (done) return;
            done = true;
            const i = overlays.indexOf(cancel);
            if (i >= 0) overlays.splice(i, 1);
            await animateIn(wrap, [{ opacity: 1 }, { opacity: 0 }], 160);
            wrap.remove();
            resolve(result);
        };
        const cancel = () => finish(false);
        overlays.push(cancel);
        wrap.addEventListener('click', e => {
            const btn = e.target.closest('[data-r]');
            if (btn) finish(btn.dataset.r === '1');
            else if (e.target === wrap) finish(false);
        });
        if (destructive) impact('medium');
    });
}

export function alertDialog(title, message = '') {
    return confirmDialog({ title, message, confirmLabel: 'OK', cancelLabel: null });
}

let toastTimer = null;
export function toast(message) {
    document.querySelector('.toast')?.remove();
    clearTimeout(toastTimer);
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    document.body.appendChild(el);
    animateIn(el, [{ opacity: 0, transform: 'translateX(-50%) scale(.9)' }, { opacity: 1, transform: 'translateX(-50%) scale(1)' }], 280);
    toastTimer = setTimeout(async () => {
        await animateIn(el, [{ opacity: 1 }, { opacity: 0 }], 200);
        el.remove();
    }, 2400);
}
