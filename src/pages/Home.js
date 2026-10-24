import { loadLives, loadArtistImages, splitByToday, rankArtists, rankVenues, filterYear, dayMap } from '../domain/stats.js';
import { escapeHtml, formatDate, nf, parseDate, toDateStr, yearOf, todayStr } from '../utils.js';
import { glassButton, sectionHeader, liveRow, liveArtwork, emptyState, pillButton } from '../ui/components.js';
import { countUp } from '../ui/motion.js';
import { icon } from '../ui/icons.js';

export function topActions() {
    return glassButton({ href: '/settings', iconName: 'gear', label: '設定' });
}

export default async function renderHome(ctx) {
    ctx.shell({ title: 'ホーム', actions: topActions() });
    const content = ctx.body;

    async function draw() {
        const [lives] = await Promise.all([loadLives(), loadArtistImages()]);
        if (lives.length === 0) {
            content.innerHTML = emptyState({
                iconName: 'ticket',
                title: 'ようこそ',
                body: '参戦したライブを記録して、あなただけのライブ年表をつくりましょう。',
                action: pillButton({ href: '/new', label: 'ライブを記録', iconName: 'plus' })
                    + pillButton({ href: '/settings', label: 'データを読み込む', variant: 'secondary' }),
            });
            return;
        }
        content.innerHTML = yearView(lives);
        content.querySelectorAll('[data-count]').forEach(el => countUp(el, +el.dataset.count, el.dataset.countKey));
        ctx.reveal(content);
    }

    ctx.onData(draw);
    await draw();
}

function yearView(lives) {
    const { upcoming, past } = splitByToday(lives);
    const thisYear = new Date().getFullYear();
    const lastYear = filterYear(lives, thisYear - 1).length;
    const yearCount = filterYear(lives, thisYear).length;
    const recapYear = yearCount > 0 ? thisYear : yearOf(lives[lives.length - 1].concert_date);
    const artistsCount = rankArtists(lives).length;
    const venuesCount = rankVenues(lives).length;
    const days = new Set(lives.filter(l => l.concert_date <= todayStr()).map(l => l.concert_date)).size;
    let order = 0;
    const d = () => Math.min(order++, 7) * 60;
    let html = '';

    const next = upcoming[0];
    if (next) {
        const big = next.days_left === 0 ? 'TODAY' : next.days_left === 1 ? '明日' : null;
        html += `
        <a href="/detail/${escapeHtml(next.id)}" class="next-card pressable ${next.days_left <= 1 ? 'is-soon' : ''}" data-reveal="${d()}">
            <div class="next-eyebrow">${icon('ticket', 11)}NEXT LIVE</div>
            <div class="next-main">
                <div class="next-text">
                    <div class="next-title">${escapeHtml(next.card_main_title)}</div>
                    ${next.card_sub_title ? `<div class="next-sub">${escapeHtml(next.card_sub_title)}</div>` : ''}
                    <div class="next-meta">${escapeHtml(formatDate(next.concert_date, { weekday: true }))}</div>
                    ${next.venue ? `<div class="next-meta">${icon('pin', 11)}${escapeHtml(next.venue)}</div>` : ''}
                </div>
                <div class="next-count">
                    ${big ? `<span class="next-num next-num--word">${big}</span>` : `<span class="next-num num" data-count="${next.days_left}" data-count-key="next-${next.id}">0</span><span class="next-unit">日後</span>`}
                </div>
            </div>
        </a>`;
    }

    html += `
        <a href="/recap" class="replay-banner pressable" data-reveal="${d()}">
            <div class="replay-label">LIVEFolio Replay</div>
            <div class="replay-year">${recapYear}</div>
            <div class="replay-watermark">${recapYear}</div>
            <div class="replay-foot"><span>${recapYear}年のライブを振り返る</span><span class="replay-go">${icon('play', 12)}</span></div>
        </a>`;

    html += sectionHeader('あなたの記録');
    html += `
        <div class="total-card" data-reveal="${d()}">
            <div class="total-label">これまでの参戦</div>
            <div class="total-number"><span class="num" data-count="${lives.filter(l => l.concert_date <= todayStr()).length}" data-count-key="home-total">0</span><span class="total-unit">回</span></div>
            <div class="total-note">${nf.format(days)}日、ライブ会場にいました</div>
            <div class="total-stats">
                <div><b class="num">${nf.format(yearCount)}</b><span>今年</span></div>
                <div><b class="num">${nf.format(upcoming.length)}</b><span>予定</span></div>
                <div><b class="num">${nf.format(artistsCount)}</b><span>アーティスト</span></div>
                <div><b class="num">${nf.format(venuesCount)}</b><span>会場</span></div>
            </div>
        </div>
        <div class="tile-row" data-reveal="${d()}">
            <a href="/stats?tab=year&y=${thisYear}" class="tile pressable">
                <div class="tile-head">${thisYear}年の参戦${icon('chevronRight', 11)}</div>
                <div class="main-number"><span class="num">${nf.format(yearCount)}</span><small>回</small></div>
                <div class="tile-note ${yearCount >= lastYear ? 'is-up' : 'is-down'}">昨年 ${nf.format(lastYear)}回${yearCount !== lastYear ? `（${yearCount > lastYear ? '+' : ''}${yearCount - lastYear}）` : ''}</div>
            </a>
            <a href="/calendar" class="tile pressable">
                <div class="tile-head">参戦カレンダー${icon('chevronRight', 11)}</div>
                ${miniHeatmap(lives)}
            </a>
        </div>`;

    if (upcoming.length > 1) {
        html += sectionHeader('これからのライブ', upcoming.length > 4 ? { href: '/stats?cat=lives', label: 'すべて見る' } : {});
        html += `<div class="list">${upcoming.slice(1, 4).map(l => liveRow(l, { reveal: d() })).join('')}</div>`;
    }

    if (past.length > 0) {
        html += sectionHeader('最近のライブ', { href: '/stats?cat=lives' });
        html += `<div class="h-scroll" data-reveal="${d()}">${past.slice(0, 10).map(pastCard).join('')}</div>`;
    }
    return html;
}

function pastCard(live) {
    return `<a href="/detail/${escapeHtml(live.id)}" class="past-card pressable">
        ${liveArtwork(live, { size: 128, shared: `live-${live.id}` })}
        <div class="past-title">${escapeHtml(live.card_main_title)}</div>
        <div class="past-sub">${escapeHtml(formatDate(live.concert_date))}</div>
    </a>`;
}

function miniHeatmap(lives) {
    const map = dayMap(lives);
    const today = parseDate(todayStr());
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const start = new Date(end);
    start.setDate(start.getDate() - 7 * 14 + 1);
    let cells = '';
    let total = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = toDateStr(d);
        const n = map.get(key)?.length || 0;
        if (d <= today) total += n;
        const level = n === 0 ? 0 : Math.min(4, n + 1);
        cells += `<i class="hm-cell lv${level} ${d > today ? 'is-future' : ''}" style="--col:${Math.floor((d - start) / 604800000)}"></i>`;
    }
    return `<div class="main-number"><span class="num">${nf.format(total)}</span><small>回</small></div>
        <div class="tile-note">直近14週</div>
        <div class="mini-heatmap">${cells}</div>`;
}
