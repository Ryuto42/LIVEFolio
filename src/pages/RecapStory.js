import { loadLives, loadArtistImages } from '../domain/stats.js';
import { buildRecap } from './Recap.js';
import { escapeHtml, nf, formatDate, isSafeImageSrc, seedColors, initialOf } from '../utils.js';
import { icon } from '../ui/icons.js';
import { tick } from '../ui/haptics.js';
import { countUp, EASE_IOS } from '../ui/motion.js';
import { back } from '../router.js';
import { trackArtwork } from '../ui/components.js';
import { hydrateTrackArt } from '../trackArt.js';

const SLIDE_MS = 6000;
const PALETTES = [
    ['#0A84FF', '#071a3a'], ['#5E5CE6', '#120f3a'], ['#30B0C7', '#062a33'], ['#FF375F', '#2a0b1a'],
    ['#FF9F0A', '#3a2004'], ['#64D2FF', '#0a2540'], ['#BF5AF2', '#24082f'], ['#34C759', '#06301a'],
];

function enter(order, html, cls = '') {
    return `<div class="enter ${cls}" style="--o:${order}">${html}</div>`;
}

function avatar(name, src, size) {
    const [c1, c2] = seedColors(name);
    return `<div class="art art--round story-art" style="--s:${size}px;--c1:${c1};--c2:${c2}"><span class="art-initial">${escapeHtml(initialOf(name))}</span>${isSafeImageSrc(src) ? `<img src="${escapeHtml(src)}" alt="">` : ''}</div>`;
}

function buildSlides(r, images) {
    const slides = [];
    slides.push(`
        ${enter(0, 'LIVEFolio Replay', 'story-kicker')}
        ${enter(1, `<span class="num">${r.year}</span>`, 'story-huge')}
        ${enter(2, 'あなたの1年のライブを振り返ろう', 'story-text')}`);
    slides.push(`
        ${enter(0, `${r.year}年、ライブに行った回数`, 'story-kicker')}
        ${enter(1, `<span class="num" data-count="${r.total}">0</span><small>回</small>`, 'story-huge')}
        ${enter(2, `${nf.format(r.days)}日間、${nf.format(r.venues.length)}か所の会場で`, 'story-text')}`);
    if (r.artists[0]) {
        const a = r.artists[0];
        slides.push(`
            ${enter(0, 'いちばん会いに行ったアーティスト', 'story-kicker')}
            ${enter(1, avatar(a.name, images.get(a.name), 168), 'story-float')}
            ${enter(2, escapeHtml(a.name), 'story-title')}
            ${enter(3, `${nf.format(a.count)}回`, 'story-text')}
            ${r.artists.length > 1 ? enter(4, `<ol class="story-list">${r.artists.slice(1, 5).map((x, i) => `<li><span>${i + 2}</span>${escapeHtml(x.name)}<em>${x.count}回</em></li>`).join('')}</ol>`) : ''}`);
    }
    if (r.venues[0]) {
        const v = r.venues[0];
        slides.push(`
            ${enter(0, 'いちばん通った会場', 'story-kicker')}
            ${enter(1, icon('pin', 48), 'story-float story-icon')}
            ${enter(2, escapeHtml(v.name), 'story-title')}
            ${enter(3, `${nf.format(v.count)}回`, 'story-text')}`);
    }
    if (r.tracks[0]) {
        const t = r.tracks[0];
        slides.push(`
            ${enter(0, 'いちばん多く聴いた曲', 'story-kicker')}
            ${enter(1, trackArtwork(t.artist, t.song, 168, { className: 'story-art' }), 'story-float')}
            ${enter(2, escapeHtml(t.song), 'story-title')}
            ${enter(3, `${escapeHtml(t.artist)} · ${nf.format(t.count)}回`, 'story-text')}
            ${enter(4, `今年聴いた曲は全部で <b class="num">${nf.format(r.tracks.length)}</b> 曲`, 'story-text story-text--small')}`);
    }
    if (r.newArtists.length) {
        slides.push(`
            ${enter(0, 'はじめて出会ったアーティスト', 'story-kicker')}
            ${enter(1, `<span class="num" data-count="${r.newArtists.length}">0</span><small>組</small>`, 'story-huge')}
            ${enter(2, `<div class="story-chips">${r.newArtists.slice(0, 8).map(n => `<span>${escapeHtml(n)}</span>`).join('')}</div>`)}`);
    }
    if (r.peakMonth >= 0 && r.total > 1) {
        const max = Math.max(...r.months);
        slides.push(`
            ${enter(0, 'いちばんライブに行った月', 'story-kicker')}
            ${enter(1, `<span class="num">${r.peakMonth + 1}</span><small>月</small>`, 'story-huge')}
            ${enter(2, `<div class="story-bars">${r.months.map((n, i) => `<span class="${i === r.peakMonth ? 'is-peak' : ''}" style="--h:${Math.max(3, (n / max) * 100)}%;--i:${i}"><i></i><b>${i + 1}</b></span>`).join('')}</div>`)}`);
    }
    if (r.first) {
        slides.push(`
            ${enter(0, `${r.year}年のはじまりのライブ`, 'story-kicker')}
            ${enter(1, escapeHtml(formatDate(r.first.concert_date, { style: 'ja' })), 'story-date')}
            ${enter(2, escapeHtml(r.first.card_main_title), 'story-title')}
            ${enter(3, escapeHtml([r.first.card_sub_title, r.first.venue].filter(Boolean).join(' · ')), 'story-text')}`);
    }
    slides.push(`
        ${enter(0, `${r.year}年のまとめ`, 'story-kicker')}
        ${enter(1, `<div class="story-summary">
            <div><span>ライブ</span><b class="num">${nf.format(r.total)}回</b></div>
            <div><span>アーティスト</span><b class="num">${nf.format(r.artists.length)}組</b></div>
            <div><span>会場</span><b class="num">${nf.format(r.venues.length)}か所</b></div>
            <div><span>曲</span><b class="num">${nf.format(r.tracks.length)}曲</b></div>
            ${r.artists[0] ? `<div class="wide"><span>トップアーティスト</span><b>${escapeHtml(r.artists[0].name)}</b></div>` : ''}
            ${r.venues[0] ? `<div class="wide"><span>トップ会場</span><b>${escapeHtml(r.venues[0].name)}</b></div>` : ''}
        </div>`)}
        ${enter(2, 'また来年も、たくさんのライブを。', 'story-text')}`);
    return slides;
}

export default async function renderRecapStory(ctx) {
    const year = parseInt(ctx.params[0], 10);
    const [allLives, images] = await Promise.all([loadLives(), loadArtistImages()]);
    const recap = buildRecap(allLives, year);
    const slides = recap.total ? buildSlides(recap, images) : [`${enter(0, `${year}年のライブ記録はありません`, 'story-title')}`];

    ctx.el.className = 'page is-modal page--story';
    ctx.el.innerHTML = `
        <div class="story">
            <div class="story-bg"><i></i><i></i><i></i></div>
            <div class="story-top">
                <div class="story-progress">${slides.map(() => '<span><i></i></span>').join('')}</div>
                <div class="story-head">
                    <span>${year}年のリキャップ</span>
                    <button type="button" class="story-close pressable" aria-label="閉じる">${icon('close', 14)}</button>
                </div>
            </div>
            <div class="story-stage"></div>
        </div>`;

    const story = ctx.el.querySelector('.story');
    const stage = story.querySelector('.story-stage');
    const bars = [...story.querySelectorAll('.story-progress > span')];
    let index = -1;
    let closed = false;
    // スライド送りは JS で時間を数える（CSS アニメーションの終了待ちだと「動きを減らす」設定で一瞬で終わるため）
    let elapsed = 0;
    let lastTs = null;
    let paused = false;
    let rafId = 0;
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
    const setPaused = on => { paused = on; story.classList.toggle('is-paused', on); };

    const close = () => {
        if (closed) return;
        closed = true;
        cancelAnimationFrame(rafId);
        back();
    };
    ctx.onDestroy(() => {
        closed = true;
        cancelAnimationFrame(rafId);
        timers.forEach(clearTimeout);
    });

    function frame(ts) {
        if (closed) return;
        if (lastTs !== null && !paused) elapsed += ts - lastTs;
        lastTs = ts;
        const p = Math.min(1, elapsed / SLIDE_MS);
        bars[index]?.querySelector('i').style.setProperty('transform', `scaleX(${p})`);
        if (p >= 1) show(index + 1);
        if (!closed) rafId = requestAnimationFrame(frame);
    }

    function show(i) {
        if (closed) return;
        if (i < 0) i = 0;
        if (i >= slides.length) return close();
        const prev = index;
        index = i;
        elapsed = 0;
        const [a, b] = PALETTES[i % PALETTES.length];
        story.style.setProperty('--a', a);
        story.style.setProperty('--b', b);
        bars.forEach((bar, j) => {
            bar.classList.toggle('is-active', j === i);
            bar.querySelector('i').style.setProperty('transform', `scaleX(${j < i ? 1 : 0})`);
        });
        const slide = document.createElement('div');
        slide.className = 'story-slide';
        slide.innerHTML = slides[i];
        const old = stage.querySelector('.story-slide');
        if (old) {
            old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }).finished.then(() => old.remove(), () => old.remove());
        }
        stage.appendChild(slide);
        hydrateTrackArt(slide);
        slide.animate([{ opacity: 0, transform: 'scale(1.04)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 520, easing: EASE_IOS });
        slide.querySelectorAll('[data-count]').forEach(el => later(() => countUp(el, +el.dataset.count, `story-${year}-${i}`, { ms: 1600 }), 350));
        if (prev !== -1) tick();
    }

    story.querySelector('.story-close').addEventListener('click', e => {
        e.stopPropagation();
        close();
    });

    // タップで前後、長押しで一時停止、下スワイプで閉じる
    let press = null;
    let holdTimer = null;
    story.addEventListener('pointerdown', e => {
        if (e.target.closest('.story-close')) return;
        press = { x: e.clientX, y: e.clientY, t: performance.now(), held: false, dy: 0 };
        holdTimer = setTimeout(() => {
            if (!press) return;
            press.held = true;
            setPaused(true);
        }, 260);
    });
    story.addEventListener('pointermove', e => {
        if (!press) return;
        const dy = e.clientY - press.y;
        if (dy > 10 && Math.abs(dy) > Math.abs(e.clientX - press.x)) {
            clearTimeout(holdTimer);
            press.dy = dy;
            setPaused(true);
            const p = dy / window.innerHeight;
            story.style.transform = `translateY(${dy}px) scale(${1 - p * 0.12})`;
            story.style.borderRadius = `${Math.min(p * 160, 36)}px`;
        }
    });
    const end = e => {
        if (!press) return;
        clearTimeout(holdTimer);
        const p = press;
        press = null;
        if (p.dy > 0) {
            if (p.dy / window.innerHeight > 0.16) return close();
            story.animate([{ transform: story.style.transform, borderRadius: story.style.borderRadius }, { transform: 'none', borderRadius: '0px' }], { duration: 420, easing: EASE_IOS })
                .finished.then(() => { story.style.transform = ''; story.style.borderRadius = ''; });
            setPaused(false);
            return;
        }
        setPaused(false);
        if (p.held || e.type === 'pointercancel' || performance.now() - p.t > 300) return;
        show(e.clientX < window.innerWidth * 0.3 ? index - 1 : index + 1);
    };
    story.addEventListener('pointerup', end);
    story.addEventListener('pointercancel', end);

    show(0);
    rafId = requestAnimationFrame(frame);
}
