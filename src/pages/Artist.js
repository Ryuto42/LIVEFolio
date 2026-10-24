import { loadLives, loadArtistImages, rankTracks, yearCounts } from '../domain/stats.js';
import { fetchArtistImage } from '../sync.js';
import { escapeHtml, formatDate, nf, liveArtists, spotifySearchUrl } from '../utils.js';
import { artwork, trackArtwork, trackLink, statTile, sectionHeader, liveRow, emptyState } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { countUp } from '../ui/motion.js';
import { tick } from '../ui/haptics.js';

const SONG_PREVIEW = 10;

export default async function renderArtist(ctx) {
    const [name] = ctx.params;
    ctx.shell({ title: name, largeTitle: false, back: true, collapseAt: 220, className: 'page--detail' });
    let showAllSongs = false;
    let imageRequested = false;

    ctx.body.addEventListener('click', e => {
        if (e.target.closest('[data-more-songs]')) {
            tick();
            showAllSongs = !showAllSongs;
            draw();
        }
    });

    async function draw() {
        const [allLives, images] = await Promise.all([loadLives(), loadArtistImages()]);
        const lives = allLives.filter(l => liveArtists(l).includes(name));
        const image = images.get(name);
        if (!image && !imageRequested && localStorage.getItem('spotify_client_id')) {
            imageRequested = true;
            fetchArtistImage(name).catch(() => {});
        }
        if (!lives.length) {
            ctx.body.innerHTML = `<div class="detail-hero">${artwork({ src: image, seed: name, size: 180, round: true, shared: `artist-${name}`, target: true, className: 'hero-art' })}
                <h1 class="detail-title">${escapeHtml(name)}</h1></div>${emptyState({ iconName: 'ticket', title: '参戦記録がありません' })}`;
            return;
        }

        const attended = lives.filter(l => l.days_left === undefined || l.days_left < 0);
        const own = lives.map(l => ({ ...l, performances: (l.performances || []).filter(p => (p.artist_name || '').trim() === name) }));
        const songs = rankTracks(own);
        const years = yearCounts(lives);
        const maxYear = Math.max(...years.map(y => y[1]));
        const first = lives[0];
        const last = lives[lives.length - 1];

        let html = `
            <div class="detail-hero">
                ${artwork({ src: image, seed: name, size: 180, round: true, shared: `artist-${name}`, target: true, className: 'hero-art' })}
                <h1 class="detail-title">${escapeHtml(name)}</h1>
                <div class="detail-sub">${nf.format(lives.length)}回のライブ · ${escapeHtml(String(first.concert_date).slice(0, 4))}年から</div>
                <a href="${escapeHtml(spotifySearchUrl(name))}" target="_blank" rel="noopener" class="pill-btn pill-btn--secondary pressable">${icon('external', 12)}<span>Spotifyで開く</span></a>
            </div>
            <div class="stat-grid">
                ${statTile('参戦回数', `<span class="num" data-count="${lives.length}">0</span><small>回</small>`, attended.length !== lives.length ? `うち予定 ${lives.length - attended.length}回` : '')}
                ${statTile('聴いた曲', `<span class="num" data-count="${songs.length}">0</span><small>曲</small>`, songs.length ? `のべ ${nf.format(songs.reduce((s, x) => s + x.count, 0))}曲` : 'セットリスト未登録')}
                ${statTile('初参戦', escapeHtml(formatDate(first.concert_date)))}
                ${statTile('最新', escapeHtml(formatDate(last.concert_date)))}
            </div>

            <a href="/detail/${escapeHtml(first.id)}" class="first-card pressable" data-reveal="0">
                <div class="first-eyebrow">${icon('sparkles', 11)}はじまりのライブ</div>
                <div class="first-title">${escapeHtml(first.title || first.card_main_title)}</div>
                <div class="first-meta">${escapeHtml(formatDate(first.concert_date, { weekday: true }))}${first.venue ? ` · ${escapeHtml(first.venue)}` : ''}</div>
            </a>`;

        if (years.length) {
            html += `${sectionHeader('年ごとの参戦数')}
                <div class="year-bars">${years.map(([y, n], i) => `
                    <div class="year-bar ${n === maxYear ? 'is-peak' : ''}" style="--w:${(n / maxYear) * 100}%;--delay:${Math.round((i / Math.max(1, years.length - 1)) * 350)}ms">
                        <span class="year-bar-label num">${y}</span>
                        <span class="year-bar-track"><span class="year-bar-fill"></span></span>
                        <span class="year-bar-value num">${n}回</span>
                    </div>`).join('')}
                </div>`;
        }

        if (songs.length) {
            const shown = showAllSongs ? songs : songs.slice(0, SONG_PREVIEW);
            html += `${sectionHeader('よく聴いた曲', { count: `${songs.length}曲` })}
                <ol class="setlist">${shown.map((s, i) => `
                    <li data-reveal="${Math.min(i, 10) * 25}">
                        <a href="${escapeHtml(trackLink(name, s.song) || spotifySearchUrl(name, s.song))}" target="_blank" rel="noopener" class="setlist-row pressable">
                            <span class="setlist-num num">${i + 1}</span>
                            ${trackArtwork(name, s.song, 40)}
                            <span class="setlist-song">${escapeHtml(s.song)}</span>
                            <span class="setlist-count num">${s.count}回</span>
                        </a>
                    </li>`).join('')}</ol>
                ${songs.length > SONG_PREVIEW ? `<button type="button" class="more-btn pressable" data-more-songs>${showAllSongs ? '閉じる' : `すべて表示（${songs.length}曲）`}</button>` : ''}`;
        }

        html += `${sectionHeader('ライブ', { count: `${lives.length}件` })}
            <div class="list">${[...lives].reverse().map((l, i) => liveRow(l, { reveal: Math.min(i, 8) * 30 })).join('')}</div>`;

        ctx.body.innerHTML = html;
        ctx.body.querySelectorAll('[data-count]').forEach(el => countUp(el, +el.dataset.count, `artist-${name}-${el.dataset.count}`));
        ctx.reveal();
    }

    ctx.onData(draw);
    await draw();
}

