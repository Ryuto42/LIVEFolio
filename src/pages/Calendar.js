import { loadLives, loadArtistImages, availableYears, filterYear, dayMap, monthCounts, weekdayCounts, longestGap } from '../domain/stats.js';
import { formatDate, nf, toDateStr, todayStr, parseYear, escapeHtml } from '../utils.js';
import { statTile, liveRow, openSheet, toast, emptyState, sectionHeader } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { tick, impact } from '../ui/haptics.js';

const WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export default async function renderCalendar(ctx) {
    ctx.shell({ title: 'カレンダー', back: true });
    const thisYear = new Date().getFullYear();
    let year = parseYear(ctx.query.get('y')) || thisYear;
    let lives = [];
    let selected = null;

    ctx.body.innerHTML = `
        <div class="year-switch">
            <button type="button" class="glass glass--control glass-btn pressable" style="--size:34px" data-step="-1" aria-label="前の年">${icon('chevronLeft', 14)}</button>
            <div class="year-label num"></div>
            <button type="button" class="glass glass--control glass-btn pressable" style="--size:34px" data-step="1" aria-label="次の年">${icon('chevronRight', 14)}</button>
        </div>
        <div class="calendar-content"></div>`;
    const content = ctx.body.querySelector('.calendar-content');
    const label = ctx.body.querySelector('.year-label');

    const years = () => {
        const ys = new Set(availableYears(lives));
        ys.add(thisYear);
        return [...ys].sort((a, b) => a - b);
    };

    ctx.body.querySelector('.year-switch').addEventListener('click', e => {
        const btn = e.target.closest('[data-step]');
        if (!btn) return;
        const ys = years();
        const next = ys[ys.indexOf(year) + Number(btn.dataset.step)];
        if (next === undefined) return;
        tick();
        const dir = Number(btn.dataset.step);
        year = next;
        selected = null;
        ctx.setQuery({ y: year === thisYear ? undefined : year });
        draw();
        content.animate([{ opacity: 0, transform: `translateX(${dir * 33}%)` }, { opacity: 1, transform: 'none' }], { duration: 340, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
    });

    content.addEventListener('click', e => {
        const cell = e.target.closest('[data-date]');
        if (cell) return openDay(cell);
        const bar = e.target.closest('[data-bar]');
        if (bar) {
            const group = bar.closest('.bars');
            const already = bar.classList.contains('is-selected');
            group.querySelectorAll('[data-bar]').forEach(b => b.classList.remove('is-selected'));
            group.classList.toggle('has-selection', !already);
            if (!already) bar.classList.add('is-selected');
            const cap = group.closest('.chart-card').querySelector('.chart-caption');
            cap.textContent = already ? cap.dataset.default : bar.dataset.caption;
            tick();
        }
    });

    function openDay(cell) {
        const date = cell.dataset.date;
        const dayLives = dayMap(lives).get(date) || [];
        impact('light');
        content.querySelectorAll('.hm-cell.is-selected').forEach(c => c.classList.remove('is-selected'));
        if (!dayLives.length) {
            toast(`${formatDate(date, { weekday: true })} はライブなし`);
            return;
        }
        cell.classList.add('is-selected');
        selected = date;
        openSheet({
            title: formatDate(date, { style: 'ja', weekday: true }),
            html: `<div class="list">${dayLives.map(l => liveRow(l)).join('')}</div>`,
        });
    }

    function draw() {
        const ys = years();
        if (!ys.includes(year)) year = thisYear;
        label.textContent = `${year}年`;
        ctx.body.querySelector('[data-step="-1"]').disabled = ys.indexOf(year) <= 0;
        ctx.body.querySelector('[data-step="1"]').disabled = ys.indexOf(year) >= ys.length - 1;

        const scoped = filterYear(lives, year);
        const map = dayMap(scoped);
        const months = monthCounts(scoped);
        const weekdays = weekdayCounts(scoped);
        const peakMonth = months.indexOf(Math.max(...months));
        const attended = scoped.filter(l => l.concert_date <= todayStr());

        content.innerHTML = `
            <div class="heatmap-card">
                <div class="chart-caption-static">${nf.format(map.size)}日にライブがありました</div>
                <div class="heatmap-scroll">${heatmap(year, map, selected)}</div>
                <div class="legend"><span>少ない</span>${[0, 1, 2, 3, 4].map(l => `<i class="hm-cell lv${l}"></i>`).join('')}<span>多い</span></div>
            </div>
            <div class="stat-grid">
                ${statTile('参戦数', `<span class="num">${nf.format(scoped.length)}</span><small>回</small>`, attended.length !== scoped.length ? `うち予定 ${scoped.length - attended.length}回` : '')}
                ${statTile('参戦日数', `<span class="num">${nf.format(map.size)}</span><small>日</small>`)}
                ${statTile('最も行った月', scoped.length ? `<span class="num">${peakMonth + 1}</span><small>月</small>` : '—', scoped.length ? `${months[peakMonth]}回` : '')}
                ${statTile('最長ブランク', scoped.length > 1 ? `<span class="num">${nf.format(longestGap(scoped))}</span><small>日</small>` : '—')}
            </div>
            ${scoped.length ? `
            ${sectionHeader('月別の参戦数')}
            ${barChart(months.map((n, i) => ({ n, label: `${i + 1}`, caption: `${i + 1}月 · ${n}回` })), `最も多いのは ${peakMonth + 1}月（${months[peakMonth]}回）`)}
            ${sectionHeader('曜日別の参戦数')}
            ${barChart(weekdays.map((n, i) => ({ n, label: WEEK_LABELS[i], caption: `${WEEK_LABELS[i]}曜日 · ${n}回` })), `よく行く曜日は ${WEEK_LABELS[weekdays.indexOf(Math.max(...weekdays))]}曜日`, true)}
            ` : emptyState({ iconName: 'calendar', title: `${year}年のライブはまだありません` })}`;

        // 描画直後はまだ画面に配置されておらず幅が 0 のため、次のフレームで今日の列まで送る
        requestAnimationFrame(() => {
            const scroll = content.querySelector('.heatmap-scroll');
            const col = year === thisYear && content.querySelector('.hm-cell.is-today')?.closest('.hm-col');
            if (scroll) scroll.scrollLeft = col ? Math.max(0, col.offsetLeft - scroll.clientWidth + 60) : 0;
        });
    }

    async function load() {
        [lives] = await Promise.all([loadLives(), loadArtistImages()]);
        draw();
    }

    ctx.onData(load);
    await load();
}

function heatmap(year, map, selected) {
    const start = new Date(year, 0, 1);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(year, 11, 31);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const today = todayStr();
    let cols = '';
    let monthLabels = '';
    let col = 0;
    for (let w = new Date(start); w <= end; w.setDate(w.getDate() + 7), col++) {
        let cells = '';
        for (let i = 0; i < 7; i++) {
            const d = new Date(w);
            d.setDate(d.getDate() + i);
            const key = toDateStr(d);
            if (d.getFullYear() !== year) { cells += '<i class="hm-cell is-out"></i>'; continue; }
            if (d.getDate() === 1) monthLabels += `<span style="--col:${col}">${d.getMonth() + 1}月</span>`;
            const n = map.get(key)?.length || 0;
            const level = n === 0 ? 0 : Math.min(4, n + 1);
            cells += `<button type="button" class="hm-cell lv${level} ${key > today ? 'is-future' : ''} ${key === today ? 'is-today' : ''} ${key === selected ? 'is-selected' : ''}" data-date="${key}" aria-label="${key} ${n}件"></button>`;
        }
        cols += `<div class="hm-col" style="--col:${col}">${cells}</div>`;
    }
    return `<div class="heatmap">
        <div class="hm-months">${monthLabels}</div>
        <div class="hm-body">
            <div class="hm-weekdays">${WEEK_LABELS.map((w, i) => `<span>${i % 2 ? w : ''}</span>`).join('')}</div>
            <div class="hm-grid">${cols}</div>
        </div>
    </div>`;
}

function barChart(items, defaultCaption, narrow = false) {
    const max = Math.max(1, ...items.map(i => i.n));
    const peak = items.findIndex(i => i.n === max);
    const n = items.length;
    return `<div class="chart-card">
        <div class="chart-caption" data-default="${escapeHtml(defaultCaption)}">${escapeHtml(defaultCaption)}</div>
        <div class="bars ${narrow ? 'bars--narrow' : ''}">
            ${items.map((it, i) => `<button type="button" class="bar ${i === peak && it.n ? 'is-peak' : ''}" data-bar data-caption="${escapeHtml(it.caption)}" style="--h:${Math.max(it.n ? 4 : 1.5, (it.n / max) * 100)}%;--delay:${Math.round((i / Math.max(1, n - 1)) * 315)}ms">
                <span class="bar-fill"></span><span class="bar-label">${escapeHtml(it.label)}</span>
            </button>`).join('')}
        </div>
    </div>`;
}
