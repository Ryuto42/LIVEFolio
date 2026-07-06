import { db } from '../db.js';
import { setupImageUpload } from '../imageUtils.js';

export async function renderEditLive(container, id) {
    const live = await db.lives.get(id);
    if (!live) return;

    const topBarContainer = document.getElementById('top-bar-container');
    topBarContainer.innerHTML = `
        <div class="fixed-top-bar">
            <a href="/detail/${id}" data-nav="back" class="close-btn top-bar-left">←</a>
            <div class="top-bar-title">edit</div>
            <div class="top-bar-spacer"></div>
        </div>
    `;

    const rawLives = await db.lives.toArray();
    const venueSet = new Set();
    const artistSet = new Set();
    rawLives.forEach(l => {
        if (l.venue) venueSet.add(l.venue);
        if (l.artist_name) artistSet.add(l.artist_name);
        if (l.performances) {
            l.performances.forEach(p => {
                if (p.artist_name) artistSet.add(p.artist_name);
            });
        }
    });

    const datalistsHTML = `
        <datalist id="venue-list">
            ${Array.from(venueSet).map(v => `<option value="${v}"></option>`).join('')}
        </datalist>
        <datalist id="artist-list">
            ${Array.from(artistSet).map(a => `<option value="${a}"></option>`).join('')}
        </datalist>
    `;

    let html = datalistsHTML + `
        <div class="content-wrapper">
            <form id="edit-live-form">
            <div class="form-shell">
                <div class="toggle-radio form-toggle">
                    <input type="radio" id="type_oneman" name="live_type" value="ワンマン" ${live.live_type==='ワンマン'?'checked':''}>
                    <label for="type_oneman">ワンマン</label>
                    <input type="radio" id="type_fes" name="live_type" value="フェス" ${live.live_type==='フェス'?'checked':''}>
                    <label for="type_fes">フェス</label>
                    <input type="radio" id="type_taiban" name="live_type" value="対バン" ${live.live_type==='対バン'?'checked':''}>
                    <label for="type_taiban">対バン</label>
                </div>
            </div>

            <div class="form-container">
                <div class="form-group form-group-tight">
                    <label class="form-label-lg">写真 <span class="label-note">会場やチケットの写真を記録しよう</span></label>
                </div>
                <label class="image-upload-box">
                    <span id="upload-icon" ${live.image_data ? 'hidden' : ''}>＋</span>
                    <img id="image-preview" src="${live.image_data || ''}" ${live.image_data ? '' : 'hidden'}>
                    <input type="file" name="image" accept="image/*" id="image-input" data-base64="${live.image_data || ''}">
                </label>
                <div class="form-group">
                    <label>公演名 *</label>
                    <input type="text" name="event_title" value="${live.title}" required>
                </div>
                <div class="form-group">
                    <label>会場</label>
                    <input type="text" name="venue_name" value="${live.venue}" list="venue-list">
                </div>
                <div class="form-group">
                    <label>日付 *</label>
                    <input type="date" name="concert_date" value="${live.concert_date}" required>
                </div>

                <div id="performances-container">
    `;

    for (const perf of live.performances) {
        html += `
            <div class="performance-group" style="margin-top:20px;">
                <div class="form-group">
                    <label>アーティスト名 *</label>
                    <input type="text" name="artist_name[]" value="${perf.artist_name}" list="artist-list" required>
                </div>
                <div class="form-group form-group-compact">
                    <label>セットリスト (1行に1曲)</label>
                    <textarea name="setlist[]" rows="4">${perf.setlist || ''}</textarea>
                </div>
                <button type="button" class="remove-btn" style="color:var(--danger); background:none; border:none; padding:10px 0;">削除</button>
            </div>
        `;
    }

    html += `
                </div>
                <button type="button" id="add-perf-btn" class="add-perf-btn" ${live.live_type==='ワンマン'?'hidden':''}>＋ アーティストを追加</button>
                <button type="submit" class="submit-btn">更新する</button>
                <div style="margin-top:40px; text-align:center;">
                    <button type="button" id="delete-btn" style="color:var(--danger); background:none; border:none; padding:10px;">この記録を削除する</button>
                </div>
            </div>
            </form>
        </div>
    `;

    container.innerHTML = html;
    setupImageUpload(container);

    const form = document.getElementById('edit-live-form');
    const addPerfBtn = document.getElementById('add-perf-btn');
    const containerEl = document.getElementById('performances-container');

    document.querySelectorAll('input[name="live_type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'ワンマン') {
                addPerfBtn.hidden = true;
                if(containerEl.children.length > 1) {
                    containerEl.innerHTML = containerEl.firstElementChild.outerHTML;
                }
            } else {
                addPerfBtn.hidden = false;
            }
        });
    });

    addPerfBtn.addEventListener('click', () => {
        const template = `
            <div class="performance-group" style="margin-top:20px; border-top: 1px solid var(--border-subtle); padding-top: 20px;">
                <div class="form-group">
                    <label>アーティスト名 *</label>
                    <input type="text" name="artist_name[]" list="artist-list" required>
                </div>
                <div class="form-group form-group-compact">
                    <label>セットリスト (1行に1曲)</label>
                    <textarea name="setlist[]" rows="4"></textarea>
                </div>
                <button type="button" class="remove-btn" style="color:var(--danger); background:none; border:none; padding:10px 0;">削除</button>
            </div>
        `;
        containerEl.insertAdjacentHTML('beforeend', template);
    });

    containerEl.addEventListener('click', e => {
        if (e.target.classList.contains('remove-btn')) {
            e.target.closest('.performance-group').remove();
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const performances = formData.getAll('artist_name[]').map((name, i) => ({
            artist_name: name,
            setlist: formData.getAll('setlist[]')[i]
        }));

        const imageInput = document.getElementById('image-input');
        const imageData = imageInput && imageInput.dataset.base64 ? imageInput.dataset.base64 : (live.image_data || null);

        await db.lives.update(id, {
            live_type: formData.get('live_type'),
            title: formData.get('event_title'),
            venue: formData.get('venue_name'),
            concert_date: formData.get('concert_date'),
            artist_name: performances[0]?.artist_name || 'Unknown',
            performances: performances,
            image_data: imageData,
            updated_at: new Date().toISOString()
        });

        window.history.back();
    });

    document.getElementById('delete-btn').addEventListener('click', async () => {
        if (confirm('本当に削除しますか？')) {
            await db.lives.delete(id);
            window.history.pushState({}, '', '/');
            window.dispatchEvent(new Event('popstate'));
        }
    });
}
