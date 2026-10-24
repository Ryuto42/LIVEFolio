import { db } from '../db.js';
import { loadLives, loadArtistImages, rankArtists } from '../domain/stats.js';
import { processLiveData, escapeHtml, formatDate, splitSetlist, liveArtists, spotifySearchUrl, artistHref } from '../utils.js';
import { liveArtwork, trackArtwork, trackLink, glassButton, typeTag, sectionHeader, artistRow, emptyState, pillButton } from '../ui/components.js';
import { countUp } from '../ui/motion.js';
import { icon } from '../ui/icons.js';

export default async function renderDetail(ctx) {
    const [id] = ctx.params;
    const raw = await db.lives.get(id);
    if (!raw) {
        ctx.shell({ title: '', largeTitle: false, back: true });
        ctx.body.innerHTML = emptyState({ iconName: 'ticket', title: '見つかりませんでした', body: 'このライブは削除された可能性があります。' });
        return;
    }
    const live = processLiveData(raw);
    ctx.shell({
        title: live.detail_main_title,
        largeTitle: false,
        back: true,
        collapseAt: 250,
        actions: glassButton({ href: `/edit/${id}`, iconName: 'edit', label: '編集' }),
        className: 'page--detail',
    });

    async function draw() {
        const fresh = await db.lives.get(id);
        if (!fresh) return;
        const l = processLiveData(fresh);
        ctx.el.querySelector('.bar-title').textContent = l.detail_main_title;
        const [allLives, images] = await Promise.all([loadLives(), loadArtistImages()]);
        const counts = new Map(rankArtists(allLives).map(a => [a.name, a]));
        const upcoming = l.days_left !== undefined && l.days_left >= 0;
        const multi = l.live_type === 'フェス' || l.live_type === '対バン';

        let html = `
            <div class="detail-hero">
                ${liveArtwork(l, { size: 220, shared: `live-${l.id}`, target: true, className: 'hero-art' })}
                <div class="detail-eyebrow">${escapeHtml(formatDate(l.concert_date, { style: 'ja', weekday: true }))}</div>
                <h1 class="detail-title">${escapeHtml(l.detail_main_title || '（無題）')}</h1>
                ${l.detail_sub_title ? `<div class="detail-sub">${escapeHtml(l.detail_sub_title)}</div>` : ''}
                ${l.venue ? `<div class="detail-venue">${icon('pin', 11)}${escapeHtml(l.venue)}</div>` : ''}
                <div class="detail-tags">${typeTag(l)}</div>
            </div>`;

        if (upcoming) {
            html += `<div class="countdown-card" data-reveal="0">
                ${l.days_left === 0
                    ? '<div class="countdown-word">TODAY</div><div class="countdown-unit">今日はライブの日</div>'
                    : `<div class="countdown-num num" data-count="${l.days_left}">0</div><div class="countdown-unit">${l.days_left === 1 ? '明日がライブ' : '日後'}</div>`}
            </div>`;
        } else {
            const blocks = (l.performances || []).map(p => ({ artist: p.artist_name, songs: splitSetlist(p.setlist) })).filter(b => b.songs.length);
            const total = blocks.reduce((s, b) => s + b.songs.length, 0);
            if (blocks.length) {
                html += sectionHeader('セットリスト', { count: `${total}曲` });
                blocks.forEach((b, bi) => {
                    if (multi) {
                        html += `<a href="${escapeHtml(artistHref(b.artist))}" class="setlist-artist pressable">${escapeHtml(b.artist)}${icon('chevronRight', 11)}</a>`;
                    }
                    html += `<ol class="setlist">${b.songs.map((song, i) => `
                        <li data-reveal="${Math.min(i, 12) * 25 + bi * 40}">
                            <a href="${escapeHtml(trackLink(b.artist, song) || spotifySearchUrl(b.artist, song))}" target="_blank" rel="noopener" class="setlist-row pressable">
                                <span class="setlist-num num">${i + 1}</span>
                                ${trackArtwork(b.artist, song, 40)}
                                <span class="setlist-song">${escapeHtml(song)}</span>
                                <span class="setlist-link">${icon('external', 12)}</span>
                            </a>
                        </li>`).join('')}</ol>`;
                });
            } else {
                html += `<div class="note-card">${icon('music', 14)}<span>セットリストは未登録です</span>${pillButton({ href: `/edit/${l.id}`, label: '追加する', variant: 'secondary' })}</div>`;
            }
        }

        const artists = liveArtists(l);
        if (artists.length) {
            html += sectionHeader(artists.length > 1 ? '出演アーティスト' : 'アーティスト');
            html += `<div class="list">${artists.map(name => {
                const a = counts.get(name) || { name, count: 0 };
                return artistRow({ name, count: a.count, last: a.last, image: images.get(name) });
            }).join('')}</div>`;
        }

        ctx.body.innerHTML = html;
        ctx.body.querySelectorAll('[data-count]').forEach(el => countUp(el, +el.dataset.count, `detail-${l.id}`));
        ctx.reveal();
    }

    ctx.onData(draw);
    await draw();
}

