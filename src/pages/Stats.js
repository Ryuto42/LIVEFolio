import { loadLives, loadArtistImages, availableYears, filterYear, rankArtists, rankVenues, rankTracks, assignRanks, withDelta } from '../domain/stats.js';
import { escapeHtml, formatDate, nf, seedColors, spotifySearchUrl, artistHref, parseYear } from '../utils.js';
import { sectionHeader, liveRow, artwork, trackArtwork, trackLink, emptyState, deltaBadge, statTile } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { tick } from '../ui/haptics.js';
import { topActions } from './Home.js';

const CATS = [
    { value: 'lives', label: 'ライブ' },
    { value: 'artists', label: 'アーティスト' },
    { value: 'venues', label: '会場' },
    { value: 'tracks', label: '曲' },
];

export default async function renderStats(ctx) {
    ctx.shell({ title: '統計', actions: topActions() });
    const q = ctx.query;
    const state = {
        year: q.get('tab') === 'year' ? (parseYear(q.get('y')) || new Date().getFullYear()) : null,
        cat: CATS.some(c => c.value === q.get('cat')) ? q.get('cat') : 'lives',
        open: new Set(),
    };

    ctx.body.innerHTML = `
        <div class="chip-row h-scroll" data-period></div>
        <div class="stat-grid" data-summary></div>
        <div class="stats-content"></div>`;
    const periodEl = ctx.body.querySelector('[data-period]');
    const summaryEl = ctx.body.querySelector('[data-summary]');
    const content = ctx.body.querySelector('.stats-content');
    let lives = [];
    let images = new Map();

    const syncQuery = () => ctx.setQuery({
        tab: state.year ? 'year' : undefined,
        y: state.year || undefined,
        cat: state.cat === 'lives' ? undefined : state.cat,
    });

    periodEl.addEventListener('click', e => {
        const chip = e.target.closest('[data-year]');
        if (!chip) return;
        const year = chip.dataset.year === 'all' ? null : +chip.dataset.year;
        if (year === state.year) return;
        tick();
        state.year = year;
        state.open.clear();
        syncQuery();
        drawAll(true);
    });

    summaryEl.addEventListener('click', e => {
        const tile = e.target.closest('[data-cat]');
        if (!tile || tile.dataset.cat === state.cat) return;
        tick();
        state.cat = tile.dataset.cat;
        state.open.clear();
        syncQuery();
        drawContent(true);
    });

    content.addEventListener('click', e => {
        if (e.target.closest('a')) return;
        const row = e.target.closest('[data-toggle]');
        if (!row) return;
        const item = row.closest('.rank-item');
        const key = item.dataset.key;
        tick();
        if (state.open.has(key)) state.open.delete(key);
        else state.open.add(key);
        item.classList.toggle('is-open', state.open.has(key));
    });

    function drawAll(swap = false) {
        const years = availableYears(lives);
        if (state.year && !years.includes(state.year)) state.year = years[0] || null;
        periodEl.innerHTML = [`<button type="button" class="chip pressable ${state.year ? '' : 'is-selected'}" data-year="all">全期間</button>`]
            .concat(years.map(y => `<button type="button" class="chip pressable ${state.year === y ? 'is-selected' : ''}" data-year="${y}">${y}年</button>`)).join('');
        const scoped = filterYear(lives, state.year);
        const counts = {
            lives: scoped.length,
            artists: rankArtists(scoped).length,
            venues: rankVenues(scoped).length,
            tracks: rankTracks(scoped).length,
        };
        summaryEl.innerHTML = CATS.map(c => `<button type="button" class="stat-button pressable ${state.cat === c.value ? 'is-selected' : ''}" data-cat="${c.value}">
            ${statTile(c.label, `<span class="num">${nf.format(counts[c.value])}</span>`, '', { compact: true })}</button>`).join('');
        drawContent(swap);
    }

    function drawContent(swap = false) {
        summaryEl.querySelectorAll('[data-cat]').forEach(b => b.classList.toggle('is-selected', b.dataset.cat === state.cat));
        const scoped = filterYear(lives, state.year);
        const prev = state.year ? filterYear(lives, state.year - 1) : null;
        content.innerHTML = renderCategory(state, scoped, prev, images);
        if (swap) {
            content.classList.remove('fade-swap');
            void content.offsetWidth;
            content.classList.add('fade-swap');
        }
        ctx.reveal(content);
    }

    async function load() {
        [lives, images] = await Promise.all([loadLives(), loadArtistImages()]);
        if (lives.length === 0) {
            periodEl.innerHTML = '';
            summaryEl.innerHTML = '';
            content.innerHTML = emptyState({ iconName: 'chart', title: 'まだ記録がありません', body: 'ライブを記録すると、ここにランキングや集計が表示されます。' });
            return;
        }
        drawAll();
    }

    ctx.onData(load);
    await load();
}

function renderCategory(state, lives, prevLives, images) {
    const periodLabel = state.year ? `${state.year}年` : '全期間';
    if (lives.length === 0) {
        return emptyState({ iconName: 'calendar', title: `${periodLabel}のライブはありません` });
    }
    if (state.cat === 'lives') {
        const sorted = [...lives].reverse();
        return `${sectionHeader('ライブ記録', { count: `${nf.format(sorted.length)}件` })}
            <div class="list">${sorted.map((l, i) => liveRow(l, { reveal: Math.min(i, 8) * 40 })).join('')}</div>`;
    }

    const rankers = { artists: rankArtists, venues: rankVenues, tracks: rankTracks };
    const list = assignRanks(rankers[state.cat](lives));
    if (prevLives && prevLives.length) withDelta(list, rankers[state.cat](prevLives));
    if (list.length === 0) {
        return emptyState({ iconName: 'music', title: 'セットリストが未登録です', body: 'ライブ詳細の編集からセットリストを追加すると、曲のランキングが表示されます。' });
    }
    const titles = { artists: 'アーティストランキング', venues: '会場ランキング', tracks: '曲ランキング' };
    const [first, ...rest] = list;
    return `${sectionHeader(titles[state.cat], { count: periodLabel })}
        ${heroItem(state, first, images)}
        <div class="rank-list">${rest.map((item, i) => rankItem(state, item, images, Math.min(i, 10) * 35)).join('')}</div>`;
}

function itemArt(cat, item, images, size, extra = {}) {
    if (cat === 'artists') return artwork({ src: images.get(item.name), seed: item.name, size, round: true, shared: `artist-${item.name}`, ...extra });
    if (cat === 'venues') return `<div class="art art--icon" style="--s:${size}px">${icon('pin', Math.round(size * 0.36))}</div>`;
    return trackArtwork(item.artist, item.song, size, extra);
}

function subtitle(cat, item) {
    if (cat === 'tracks') return escapeHtml(item.artist);
    return `最終 ${escapeHtml(formatDate(item.last))}`;
}

function livesList(item) {
    const sorted = [...item.lives].sort((a, b) => a.concert_date.localeCompare(b.concert_date));
    return `<div class="rank-expand"><div class="rank-expand-inner">
        ${sorted.map(l => `<a href="/detail/${escapeHtml(l.id)}" class="expand-link pressable">
            <span class="expand-date">${escapeHtml(formatDate(l.concert_date))}</span>
            <span class="expand-title">${escapeHtml(l.title || l.card_main_title)}</span>
            ${icon('chevronRight', 11)}
        </a>`).join('')}
    </div></div>`;
}

function spotifyButton(item) {
    return `<a href="${escapeHtml(trackLink(item.artist, item.song) || spotifySearchUrl(item.artist, item.song))}" target="_blank" rel="noopener" class="icon-link pressable" aria-label="Spotifyで検索">${icon('external', 13)}</a>`;
}

function heroItem(state, item, images) {
    const [c1] = seedColors(item.name);
    const cat = state.cat;
    const body = `
        ${itemArt(cat, item, images, 96)}
        <div class="hero-text">
            <div class="hero-rank">No.1</div>
            <div class="hero-title">${escapeHtml(item.name)}</div>
            <div class="hero-sub">${subtitle(cat, item)}</div>
            <div class="hero-value"><b class="num">${nf.format(item.count)}</b>回 ${deltaBadge(item.delta)}</div>
        </div>`;
    if (cat === 'artists') {
        return `<a href="${escapeHtml(artistHref(item.name))}" class="hero-card pressable" style="--seed:${c1}" data-reveal="0">${body}</a>`;
    }
    return `<div class="rank-item ${state.open.has(item.key) ? 'is-open' : ''}" data-key="${escapeHtml(item.key)}" data-reveal="0">
        <div class="hero-card pressable" style="--seed:${c1}" data-toggle role="button" tabindex="0">${body}
            ${cat === 'tracks' ? `<div class="hero-action">${spotifyButton(item)}</div>` : ''}
        </div>
        ${livesList(item)}
    </div>`;
}

function rankItem(state, item, images, delay) {
    const cat = state.cat;
    const inner = `
        <span class="rank-num ${item.rank <= 3 ? 'is-top' : ''}">${item.rank}</span>
        ${itemArt(cat, item, images, 44)}
        <div class="media-text">
            <div class="media-title">${escapeHtml(item.name)}</div>
            <div class="media-sub">${subtitle(cat, item)}</div>
        </div>
        <div class="rank-trailing"><span class="rank-value num">${nf.format(item.count)}回</span>${deltaBadge(item.delta)}</div>`;
    if (cat === 'artists') {
        return `<a href="${escapeHtml(artistHref(item.name))}" class="rank-row pressable" data-reveal="${delay}">${inner}</a>`;
    }
    return `<div class="rank-item ${state.open.has(item.key) ? 'is-open' : ''}" data-key="${escapeHtml(item.key)}" data-reveal="${delay}">
        <div class="rank-row pressable" data-toggle role="button" tabindex="0">${inner}
            ${cat === 'tracks' ? spotifyButton(item) : ''}
            <span class="rank-chevron">${icon('chevronDown', 13)}</span>
        </div>
        ${livesList(item)}
    </div>`;
}
