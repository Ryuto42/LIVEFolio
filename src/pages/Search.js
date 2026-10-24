import { loadLives, loadArtistImages, rankArtists } from '../domain/stats.js';
import { escapeHtml, nf, liveArtists, artistHref } from '../utils.js';
import { sectionHeader, liveRow, artistRow, artwork, emptyState } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { topActions } from './Home.js';

const RECENT_KEY = 'livefolio_recent_searches';

function loadRecent() {
    try {
        const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
        return Array.isArray(list) ? list.filter(s => typeof s === 'string').slice(0, 10) : [];
    } catch {
        return [];
    }
}

function saveRecent(list) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10))); } catch { /* 保存できなくても検索は続ける */ }
}

function rememberQuery(q) {
    const query = q.trim();
    if (!query) return;
    saveRecent([query, ...loadRecent().filter(s => s !== query)]);
}

function highlighter(q) {
    const lower = q.toLowerCase();
    return text => {
        const s = String(text || '');
        const i = s.toLowerCase().indexOf(lower);
        if (!lower || i < 0) return escapeHtml(s);
        return `${escapeHtml(s.slice(0, i))}<b>${escapeHtml(s.slice(i, i + q.length))}</b>${escapeHtml(s.slice(i + q.length))}`;
    };
}

export default async function renderSearch(ctx) {
    ctx.shell({ title: '検索', actions: topActions() });
    let query = ctx.query.get('q') || '';
    let lives = [];
    let images = new Map();

    ctx.body.innerHTML = `
        <form class="search-bar-wrap" id="search-form" role="search">
            <label class="search-field">
                ${icon('search', 14)}
                <input type="search" name="q" value="${escapeHtml(query)}" placeholder="アーティスト、ライブ名、会場" autocomplete="off" enterkeyhint="search">
                <button type="button" class="search-clear pressable" aria-label="クリア" ${query ? '' : 'hidden'}>${icon('closeCircle', 14)}</button>
            </label>
            <button type="button" class="search-cancel" hidden>キャンセル</button>
        </form>
        <div class="search-content" id="search-results"></div>`;

    const form = ctx.body.querySelector('#search-form');
    const input = form.querySelector('input');
    const clearBtn = form.querySelector('.search-clear');
    const cancelBtn = form.querySelector('.search-cancel');
    const content = ctx.body.querySelector('#search-results');
    let timer = null;

    const setSearching = on => {
        ctx.el.classList.toggle('is-searching', on);
        cancelBtn.hidden = !on;
    };

    input.addEventListener('focus', () => setSearching(true));
    input.addEventListener('blur', () => setSearching(!!input.value));
    input.addEventListener('input', () => {
        query = input.value;
        clearBtn.hidden = !query;
        setSearching(document.activeElement === input || !!query);
        clearTimeout(timer);
        timer = setTimeout(() => {
            ctx.setQuery({ q: query.trim() || undefined });
            draw();
        }, 120);
    });
    form.addEventListener('submit', e => {
        e.preventDefault();
        rememberQuery(query);
        input.blur();
    });
    clearBtn.addEventListener('click', () => {
        input.value = '';
        input.dispatchEvent(new Event('input'));
        input.focus();
    });
    cancelBtn.addEventListener('click', () => {
        input.value = '';
        query = '';
        clearBtn.hidden = true;
        ctx.setQuery({});
        input.blur();
        setSearching(false);
        draw();
    });
    ctx.scroll.addEventListener('touchmove', () => { if (document.activeElement === input) input.blur(); }, { passive: true });

    content.addEventListener('click', e => {
        const del = e.target.closest('[data-remove-recent]');
        if (del) {
            e.stopPropagation();
            saveRecent(loadRecent().filter(s => s !== del.dataset.removeRecent));
            draw();
            return;
        }
        if (e.target.closest('[data-clear-recent]')) {
            saveRecent([]);
            draw();
            return;
        }
        const recent = e.target.closest('[data-recent]');
        if (recent) {
            input.value = recent.dataset.recent;
            input.dispatchEvent(new Event('input'));
            setSearching(true);
            return;
        }
        if (e.target.closest('a[href]') && query.trim()) rememberQuery(query);
    });

    function draw() {
        const q = query.trim();
        content.innerHTML = q ? results(q) : idle();
        ctx.reveal(content);
    }

    function idle() {
        const recent = loadRecent();
        const top = rankArtists(lives).slice(0, 9);
        let html = '';
        if (recent.length) {
            html += `<div class="section-header"><h2>最近の検索</h2><button type="button" class="section-action pressable" data-clear-recent>消去</button></div>
                <div class="list">${recent.map(s => `<div class="recent-row pressable" data-recent="${escapeHtml(s)}" role="button" tabindex="0">
                    <span class="recent-icon">${icon('history', 13)}</span><span class="recent-text">${escapeHtml(s)}</span>
                    <button type="button" class="recent-remove pressable" data-remove-recent="${escapeHtml(s)}" aria-label="削除">${icon('close', 12)}</button>
                </div>`).join('')}</div>`;
        }
        if (top.length) {
            html += `${sectionHeader('よく行くアーティスト')}
                <div class="artist-grid">${top.map((a, i) => `
                    <a href="${escapeHtml(artistHref(a.name))}" class="artist-cell pressable" data-reveal="${i * 40}">
                        ${artwork({ src: images.get(a.name), seed: a.name, size: 96, round: true, shared: `artist-${a.name}`, className: 'art--fluid' })}
                        <div class="artist-name">${escapeHtml(a.name)}</div>
                        <div class="artist-meta">${nf.format(a.count)}回</div>
                    </a>`).join('')}</div>`;
        }
        if (!html) html = emptyState({ iconName: 'search', title: 'ライブを検索', body: 'アーティスト名・公演名・会場から探せます。' });
        return html;
    }

    function results(q) {
        const lower = q.toLowerCase();
        const hl = highlighter(q);
        const matchedLives = [...lives].reverse().filter(l =>
            (l.title || '').toLowerCase().includes(lower)
            || (l.venue || '').toLowerCase().includes(lower)
            || liveArtists(l).some(n => n.toLowerCase().includes(lower)));
        const artists = rankArtists(lives).filter(a => a.name.toLowerCase().includes(lower));
        if (!matchedLives.length && !artists.length) {
            return emptyState({ iconName: 'search', title: '見つかりませんでした', body: `「${q}」に一致するライブはありません。` });
        }
        let html = '';
        if (artists.length) {
            html += `${sectionHeader('アーティスト', { count: `${artists.length}組` })}
                <div class="list">${artists.map((a, i) => artistRow({ ...a, image: images.get(a.name) }, { reveal: Math.min(i, 6) * 30, highlight: hl })).join('')}</div>`;
        }
        if (matchedLives.length) {
            html += `${sectionHeader('ライブ', { count: `${matchedLives.length}件` })}
                <div class="list">${matchedLives.map((l, i) => liveRow(l, { reveal: Math.min(i, 8) * 30, highlight: hl })).join('')}</div>`;
        }
        return html;
    }

    async function load() {
        [lives, images] = await Promise.all([loadLives(), loadArtistImages()]);
        draw();
    }

    if (query) setSearching(true);
    ctx.onData(load);
    await load();
}
