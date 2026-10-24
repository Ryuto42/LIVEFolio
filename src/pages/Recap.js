import { loadLives, loadArtistImages, availableYears, filterYear, rankArtists, rankVenues, rankTracks, monthCounts, dayMap, newArtistsInYear, yearCounts } from '../domain/stats.js';
import { escapeHtml, nf, isSafeImageSrc, seedColors } from '../utils.js';
import { sectionHeader, emptyState, pillButton } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { tick } from '../ui/haptics.js';

export function buildRecap(allLives, year) {
    const lives = filterYear(allLives, year);
    const months = monthCounts(lives);
    const peak = Math.max(...months);
    return {
        year,
        lives,
        total: lives.length,
        days: dayMap(lives).size,
        artists: rankArtists(lives),
        venues: rankVenues(lives),
        tracks: rankTracks(lives),
        newArtists: newArtistsInYear(allLives, year),
        months,
        peakMonth: peak > 0 ? months.indexOf(peak) : -1,
        first: lives[0],
        last: lives[lives.length - 1],
    };
}

export default async function renderRecapHub(ctx) {
    ctx.shell({ title: 'リキャップ', back: true });

    async function draw() {
        const [allLives, images] = await Promise.all([loadLives(), loadArtistImages()]);
        const years = availableYears(allLives);
        if (!years.length) {
            ctx.body.innerHTML = emptyState({ iconName: 'sparkles', title: 'まだリキャップはありません', body: 'ライブを記録すると、年ごとの振り返りが作られます。', action: pillButton({ href: '/new', label: 'ライブを記録', iconName: 'plus' }) });
            return;
        }
        const counts = yearCounts(allLives);
        const max = Math.max(...counts.map(c => c[1]));
        ctx.body.innerHTML = `
            <div class="recap-pager">${years.map(y => {
                const r = buildRecap(allLives, y);
                const top = r.artists[0];
                const img = top && images.get(top.name);
                const [c1, c2] = seedColors(top ? top.name : String(y));
                return `<a href="/recap/${y}" class="recap-card pressable" data-year="${y}" style="--c1:${c1};--c2:${c2}">
                    ${isSafeImageSrc(img) ? `<img src="${escapeHtml(img)}" alt="" loading="lazy">` : ''}
                    <div class="recap-card-shade"></div>
                    <div class="recap-card-body">
                        <div class="recap-card-label">LIVEFolio Replay</div>
                        <div class="recap-card-year num">${y}</div>
                        <div class="recap-card-meta">${nf.format(r.total)}回のライブ · ${nf.format(r.artists.length)}組</div>
                        ${top ? `<div class="recap-card-top">いちばん会いに行った<br><b>${escapeHtml(top.name)}</b></div>` : ''}
                    </div>
                    <span class="recap-card-play">${icon('play', 17)}</span>
                </a>`;
            }).join('')}</div>
            ${sectionHeader('年ごとの参戦数')}
            <div class="year-bars">${[...counts].reverse().map(([y, n], i) => `
                <button type="button" class="year-bar ${n === max ? 'is-peak' : ''}" data-jump="${y}" style="--w:${(n / max) * 100}%;--delay:${i * 60}ms">
                    <span class="year-bar-label num">${y}</span>
                    <span class="year-bar-track"><span class="year-bar-fill"></span></span>
                    <span class="year-bar-value num">${n}回</span>
                </button>`).join('')}
            </div>`;

        const pager = ctx.body.querySelector('.recap-pager');
        const cards = [...pager.querySelectorAll('.recap-card')];
        const update = () => {
            const center = pager.scrollLeft + pager.clientWidth / 2;
            cards.forEach(c => {
                if (!c.offsetWidth) return;
                const d = Math.min(1, Math.abs(c.offsetLeft + c.offsetWidth / 2 - center) / c.offsetWidth);
                c.style.setProperty('--dist', d.toFixed(3));
            });
        };
        pager.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
        requestAnimationFrame(update);
        ctx.body.querySelector('.year-bars').addEventListener('click', e => {
            const bar = e.target.closest('[data-jump]');
            if (!bar) return;
            tick();
            const card = pager.querySelector(`[data-year="${bar.dataset.jump}"]`);
            pager.scrollTo({ left: card.offsetLeft - (pager.clientWidth - card.offsetWidth) / 2, behavior: 'smooth' });
        });
    }

    ctx.onData(draw);
    await draw();
}
