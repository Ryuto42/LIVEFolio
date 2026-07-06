import { db } from '../db.js';
import { setupImageUpload } from '../imageUtils.js';

export async function renderNewLive(container) {
    const topBarContainer = document.getElementById('top-bar-container');
    topBarContainer.innerHTML = `
        <div class="fixed-top-bar">
            <a href="/" data-nav="back" class="close-btn top-bar-left">×</a>
            <div class="top-bar-title">new live record</div>
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

    container.innerHTML = datalistsHTML + `
        <div class="content-wrapper">
            <form id="new-live-form">
            <div class="form-shell">
                <div class="toggle-radio form-toggle">
                    <input type="radio" id="type_oneman" name="live_type" value="ワンマン" checked>
                    <label for="type_oneman">ワンマン</label>
                    <input type="radio" id="type_fes" name="live_type" value="フェス">
                    <label for="type_fes">フェス</label>
                    <input type="radio" id="type_taiban" name="live_type" value="対バン">
                    <label for="type_taiban">対バン</label>
                </div>
            </div>

            <div class="form-container">
                <div class="form-group form-group-tight">
                    <label class="form-label-lg">写真 <span class="label-note">会場やチケットの写真を記録しよう</span></label>
                </div>
                <label class="image-upload-box">
                    <span id="upload-icon">＋</span>
                    <img id="image-preview" src="" hidden>
                    <input type="file" name="image" accept="image/*" id="image-input">
                </label>

                <div class="form-group">
                    <label>公演名 *</label>
                    <input type="text" name="event_title" required>
                </div>
                <div class="form-group">
                    <label>会場</label>
                    <input type="text" name="venue_name" list="venue-list">
                </div>
                <div class="form-group">
                    <label>日付 *</label>
                    <input type="date" name="concert_date" required>
                </div>

                <div id="performances-container">
                    <div class="performance-group">
                        <div class="form-group">
                            <label>アーティスト名 *</label>
                            <input type="text" name="artist_name[]" list="artist-list" required>
                        </div>
                        <div class="form-group form-group-compact">
                            <label>セットリスト (1行に1曲)</label>
                            <textarea name="setlist[]" rows="4"></textarea>
                        </div>
                    </div>
                </div>

                <button type="button" id="add-perf-btn" class="add-perf-btn" hidden>＋ アーティストを追加</button>
                <button type="submit" class="submit-btn">記録する</button>
            </div>
            </form>
        </div>
    `;

    const form = document.getElementById('new-live-form');
    setupImageUpload(container);

    const addPerfBtn = document.getElementById('add-perf-btn');
    const containerEl = document.getElementById('performances-container');

    document.querySelectorAll('input[name="live_type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'ワンマン') {
                addPerfBtn.hidden = true;
                containerEl.innerHTML = containerEl.firstElementChild.outerHTML; // Keep only first
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
        const liveType = formData.get('live_type');
        const title = formData.get('event_title');
        const venue = formData.get('venue_name');
        const date = formData.get('concert_date');
        
        const artistNames = formData.getAll('artist_name[]');
        const setlists = formData.getAll('setlist[]');
        
        const performances = artistNames.map((name, i) => ({
            artist_name: name,
            setlist: setlists[i]
        }));

        const id = crypto.randomUUID();
        
        const mainArtist = artistNames[0] || 'Unknown';
        const imageInput = document.getElementById('image-input');
        const imageData = imageInput && imageInput.dataset.base64 ? imageInput.dataset.base64 : null;
        
        await db.lives.add({
            id: id,
            live_type: liveType,
            title: title,
            venue: venue,
            concert_date: date,
            artist_name: mainArtist,
            performances: performances,
            image_data: imageData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });

        window.history.back();
    });
}
