import { db } from '../db.js';
import { setupImageUpload } from '../imageUtils.js';
import { escapeHtml, isSafeImageSrc, liveArtists, todayStr } from '../utils.js';
import { radioSegmented, bindRadioSegmented, confirmDialog, alertDialog, emptyState, toast } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { back, backBy } from '../router.js';
import { tick } from '../ui/haptics.js';

const TYPES = [
    { value: 'ワンマン', label: 'ワンマン' },
    { value: 'フェス', label: 'フェス' },
    { value: '対バン', label: '対バン' },
];

function perfCard(perf = {}) {
    return `<div class="perf-card performance-group">
        <div class="perf-head">
            <span class="perf-index"></span>
            <button type="button" class="remove-btn pressable">${icon('trash', 12)}削除</button>
        </div>
        <label class="field">
            <span class="field-label">アーティスト名 <em>*</em></span>
            <input type="text" name="artist_name[]" list="artist-list" value="${escapeHtml(perf.artist_name || '')}" required>
        </label>
        <label class="field">
            <span class="field-label">セットリスト（1行に1曲）</span>
            <textarea name="setlist[]" rows="5">${escapeHtml(perf.setlist || '')}</textarea>
        </label>
    </div>`;
}

async function datalists() {
    const lives = await db.lives.toArray();
    const venues = new Set();
    const artists = new Set();
    lives.forEach(l => {
        if (l.venue) venues.add(l.venue);
        liveArtists(l).forEach(a => artists.add(a));
    });
    return `<datalist id="venue-list">${[...venues].map(v => `<option value="${escapeHtml(v)}"></option>`).join('')}</datalist>
        <datalist id="artist-list">${[...artists].map(a => `<option value="${escapeHtml(a)}"></option>`).join('')}</datalist>`;
}

async function renderForm(ctx, live) {
    const isEdit = !!live;
    const data = live || { live_type: 'ワンマン', performances: [{}], concert_date: '' };
    const imageSrc = isEdit && isSafeImageSrc(live.image_data) ? live.image_data : '';
    const formId = isEdit ? 'edit-live-form' : 'new-live-form';

    ctx.shell({
        title: isEdit ? 'ライブを編集' : 'ライブを記録',
        largeTitle: false,
        back: true,
        actions: `<button type="submit" form="${formId}" class="bar-text-btn pressable">保存</button>`,
        className: 'page--form',
    });

    const perfs = data.performances && data.performances.length ? data.performances : [{ artist_name: data.artist_name || '' }];
    ctx.body.innerHTML = `${await datalists()}
        <form id="${formId}" class="live-form" novalidate>
            <div class="form-section">
                ${radioSegmented('live_type', TYPES, data.live_type || 'ワンマン')}
            </div>

            <div class="form-section">
                <div class="form-caption">写真 <span>会場やチケットの写真を記録しよう</span></div>
                <div class="photo-row">
                    <label class="image-upload-box pressable">
                        <span id="upload-icon" ${imageSrc ? 'hidden' : ''}>${icon('image', 20)}<small>写真を追加</small></span>
                        <img id="image-preview" src="${escapeHtml(imageSrc)}" alt="" ${imageSrc ? '' : 'hidden'}>
                        <input type="file" name="image" accept="image/*" id="image-input" data-base64="${escapeHtml(imageSrc)}">
                    </label>
                    <button type="button" class="text-btn text-btn--danger pressable" data-remove-photo ${imageSrc ? '' : 'hidden'}>写真を削除</button>
                </div>
            </div>

            <div class="form-group-card">
                <label class="field">
                    <span class="field-label">公演名 <em>*</em></span>
                    <input type="text" name="event_title" value="${escapeHtml(data.title || '')}" required>
                </label>
                <label class="field">
                    <span class="field-label">会場</span>
                    <input type="text" name="venue_name" value="${escapeHtml(data.venue || '')}" list="venue-list">
                </label>
                <label class="field">
                    <span class="field-label">日付 <em>*</em></span>
                    <input type="date" name="concert_date" value="${escapeHtml(data.concert_date || (isEdit ? '' : todayStr()))}" required>
                </label>
            </div>

            <div class="form-caption form-caption--section">出演者</div>
            <div id="performances-container">${perfs.map(perfCard).join('')}</div>
            <button type="button" id="add-perf-btn" class="add-perf-btn pressable" ${data.live_type === 'ワンマン' ? 'hidden' : ''}>${icon('plus', 13)}アーティストを追加</button>

            <button type="submit" class="pill-btn pill-btn--primary pill-btn--block pressable">${isEdit ? '更新する' : '記録する'}</button>
            ${isEdit ? `<button type="button" id="delete-btn" class="text-btn text-btn--danger text-btn--center pressable">${icon('trash', 13)}この記録を削除する</button>` : ''}
        </form>`;

    const form = ctx.body.querySelector('form');
    const container = ctx.body.querySelector('#performances-container');
    const addBtn = ctx.body.querySelector('#add-perf-btn');
    const imageInput = ctx.body.querySelector('#image-input');
    const removePhoto = ctx.body.querySelector('[data-remove-photo]');
    let photoRemoved = false;

    setupImageUpload(ctx.body);
    imageInput.addEventListener('image-ready', () => {
        photoRemoved = false;
        removePhoto.hidden = !imageInput.dataset.base64;
    });
    removePhoto.addEventListener('click', () => {
        imageInput.value = '';
        imageInput.dataset.base64 = '';
        photoRemoved = true;
        ctx.body.querySelector('#image-preview').hidden = true;
        ctx.body.querySelector('#upload-icon').hidden = false;
        removePhoto.hidden = true;
    });

    // ワンマンでは 2 組目以降を消さずに隠すだけにし、種別を戻したときに入力が残るようにする
    let oneman = (data.live_type || 'ワンマン') === 'ワンマン';
    const visibleGroups = () => {
        const all = [...container.querySelectorAll('.performance-group')];
        return oneman ? all.slice(0, 1) : all;
    };

    const renumber = () => {
        const all = [...container.querySelectorAll('.performance-group')];
        all.forEach((c, i) => { c.hidden = oneman && i > 0; });
        const cards = visibleGroups();
        cards.forEach((c, i) => {
            c.querySelector('.perf-index').textContent = cards.length > 1 ? `出演者 ${i + 1}` : '出演者';
            c.querySelector('.remove-btn').hidden = cards.length <= 1;
        });
    };
    renumber();

    bindRadioSegmented(ctx.body.querySelector('[data-radio-segmented]'), value => {
        oneman = value === 'ワンマン';
        addBtn.hidden = oneman;
        renumber();
    });

    addBtn.addEventListener('click', () => {
        tick();
        container.insertAdjacentHTML('beforeend', perfCard());
        const card = container.lastElementChild;
        card.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
        renumber();
        card.querySelector('input').focus();
    });

    container.addEventListener('click', e => {
        const btn = e.target.closest('.remove-btn');
        if (!btn) return;
        btn.closest('.performance-group').remove();
        renumber();
    });

    let busy = false;
    const setBusy = on => {
        busy = on;
        ctx.el.querySelectorAll('[type="submit"], #delete-btn').forEach(b => { b.disabled = on; });
    };

    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (busy) return;
        const invalid = [...form.querySelectorAll('[required]')].find(el => !el.closest('[hidden]') && !el.value.trim());
        if (invalid) {
            invalid.closest('.field')?.classList.add('is-invalid');
            invalid.focus();
            toast(`${invalid.closest('.field')?.querySelector('.field-label')?.firstChild?.textContent.trim() || '必須項目'}を入力してください`);
            return;
        }
        const fd = new FormData(form);
        const performances = visibleGroups().map(g => ({
            artist_name: g.querySelector('[name="artist_name[]"]').value.trim(),
            setlist: g.querySelector('[name="setlist[]"]').value,
        }));
        const names = performances.map(p => p.artist_name);
        const base64 = imageInput.dataset.base64 || null;
        const now = new Date().toISOString();

        setBusy(true);
        try {
            if (isEdit) {
                await db.lives.update(live.id, {
                    live_type: fd.get('live_type'),
                    title: fd.get('event_title'),
                    venue: fd.get('venue_name'),
                    concert_date: fd.get('concert_date'),
                    artist_name: performances[0]?.artist_name || 'Unknown',
                    performances,
                    image_data: base64 || (photoRemoved ? null : live.image_data || null),
                    updated_at: now,
                });
                toast('更新しました');
            } else {
                await db.lives.add({
                    id: crypto.randomUUID(),
                    live_type: fd.get('live_type'),
                    title: fd.get('event_title'),
                    venue: fd.get('venue_name'),
                    concert_date: fd.get('concert_date'),
                    artist_name: names[0] || 'Unknown',
                    performances,
                    image_data: base64,
                    created_at: now,
                    updated_at: now,
                });
                toast('ライブを記録しました');
            }
        } catch (err) {
            console.error(err);
            setBusy(false);
            alertDialog('保存できませんでした', '端末の空き容量が足りない可能性があります。写真を外すか、容量を空けてからもう一度お試しください。');
            return;
        }
        back();
    });

    form.addEventListener('input', e => e.target.closest('.field')?.classList.remove('is-invalid'));

    ctx.body.querySelector('#delete-btn')?.addEventListener('click', async () => {
        if (busy) return;
        const ok = await confirmDialog({ title: 'この記録を削除しますか？', message: 'この操作は元に戻せません。', confirmLabel: '削除', destructive: true });
        if (!ok || busy) return;
        setBusy(true);
        await db.lives.delete(live.id);
        toast('削除しました');
        backBy(2);
    });
}

export async function renderNewLive(ctx) {
    await renderForm(ctx, null);
}

export async function renderEditLive(ctx) {
    const [id] = ctx.params;
    const live = await db.lives.get(id);
    if (!live) {
        ctx.shell({ title: '', largeTitle: false, back: true });
        ctx.body.innerHTML = emptyState({ iconName: 'ticket', title: '見つかりませんでした' });
        return;
    }
    await renderForm(ctx, live);
}
