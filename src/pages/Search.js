import { db } from '../db.js';
import { liveCard, artistTile, processLiveData, escapeHtml, isSafeImageSrc } from '../utils.js';
import { syncArtistImages } from '../main.js';
import Papa from 'papaparse';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const LIVE_TYPES = ['ワンマン', 'フェス', '対バン'];
const MAX_IMPORT_RECORDS = 10000;
const MAX_PERFORMANCES = 100;
const MAX_TEXT_LENGTH = 500;
const MAX_SETLIST_LENGTH = 20000;

function cleanText(value, maxLength = MAX_TEXT_LENGTH) {
    return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function sanitizeLive(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(raw.id)) return null;
    if (typeof raw.concert_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.concert_date)) return null;
    if (raw.performances !== undefined && !Array.isArray(raw.performances)) return null;
    if (raw.image_data != null && !isSafeImageSrc(raw.image_data)) return null;

    const performances = (raw.performances || [])
        .slice(0, MAX_PERFORMANCES)
        .filter(p => p && typeof p === 'object')
        .map(p => ({
            artist_name: cleanText(p.artist_name),
            setlist: cleanText(p.setlist, MAX_SETLIST_LENGTH)
        }));

    return {
        id: raw.id,
        live_type: LIVE_TYPES.includes(raw.live_type) ? raw.live_type : 'ワンマン',
        title: cleanText(raw.title),
        venue: cleanText(raw.venue),
        concert_date: raw.concert_date,
        artist_name: cleanText(raw.artist_name),
        performances,
        memo: cleanText(raw.memo, MAX_SETLIST_LENGTH),
        image_data: raw.image_data || null,
        created_at: cleanText(raw.created_at, 40),
        updated_at: cleanText(raw.updated_at, 40)
    };
}

export async function renderSearch(container) {
    const urlParams = new URLSearchParams(window.location.search);
    const q = urlParams.get('q') || '';

    const topBarContainer = document.getElementById('top-bar-container');
    topBarContainer.innerHTML = `
        <div class="fixed-top-bar">
            <a href="/" data-nav="back-root" class="close-btn top-bar-left">←</a>
            <div class="top-bar-title">search</div>
            <div class="top-bar-spacer"></div>
        </div>
    `;

    let html = `
        <div class="content-wrapper">
            <div class="form-container">
                <form id="search-form" class="search-form">
                    <div class="form-group">
                        <input type="text" name="q" value="${escapeHtml(q)}" placeholder="アーティスト名、ライブ名、会場で検索..." required>
                    </div>
                    <button type="submit" class="submit-btn submit-btn-flush">検索</button>
                </form>
            </div>

            <div class="card-list results-list" id="search-results" style="margin-bottom: 40px;">
                <!-- 検索結果がここに入ります -->
            </div>

            <div class="accordion-item" style="margin-top: 30px; margin-bottom: 60px; border-radius: 12px; background: var(--bg-card); overflow: hidden; max-width: 350px; margin-left: auto; margin-right: auto;">
                <div class="accordion-header" data-action="accordion-toggle" style="padding: 15px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                    <div style="font-weight: bold; color: var(--text-main);">設定・データ管理</div>
                    <span class="accordion-icon" style="color: var(--text-sub);">＋</span>
                </div>
                <div class="accordion-content" style="display: none; padding: 0 15px 15px 15px;">
                    <div style="margin-bottom: 25px; display: flex; flex-direction: column; gap: 15px;">
                        <div class="form-group" style="margin: 0;">
                            <label style="font-size:13px; display:block; margin-bottom:8px; color:var(--text-main); font-weight:bold;">
                                データ出力 <span style="color:var(--text-sub); font-size:11px; font-weight:normal; margin-left:6px;">(JSONバックアップ)</span>
                            </label>
                            <button type="button" class="submit-btn submit-btn-flush" id="export-btn" style="padding: 12px; font-size: 14px; width:100%;">
                                エクスポート
                            </button>
                        </div>
                        <div class="form-group" style="margin: 0;">
                            <label style="font-size:13px; display:block; margin-bottom:8px; color:var(--text-main); font-weight:bold;">
                                データ入力 <span style="color:var(--text-sub); font-size:11px; font-weight:normal; margin-left:6px;">(CSV または JSON)</span>
                            </label>
                            <button type="button" class="submit-btn submit-btn-flush" id="import-btn" style="padding: 12px; font-size: 14px; background-color: var(--bg-card-strong); width:100%; border: 1px solid var(--border-strong); color: var(--text-main);">
                                インポート
                            </button>
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom: 10px;">
                        <label class="form-label" style="font-size: 12px; color: var(--text-sub);">Client ID</label>
                        <input type="text" id="spotify-client-id" class="form-input" placeholder="Spotify Client ID" style="padding: 8px; font-size: 14px;">
                    </div>
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label class="form-label" style="font-size: 12px; color: var(--text-sub);">Client Secret</label>
                        <input type="password" id="spotify-client-secret" class="form-input" placeholder="Spotify Client Secret" style="padding: 8px; font-size: 14px;">
                    </div>
                    <button type="button" class="submit-btn submit-btn-flush" id="save-settings-btn" style="padding: 10px; font-size: 14px; margin-top: 5px; width:100%;">設定を保存</button>
                    
                    <div style="margin-top:25px; border-top:1px solid var(--border-color); padding-top:15px; display:flex; flex-direction:column; gap:10px;">
                        <button type="button" class="submit-btn submit-btn-secondary" id="reset-data-btn" style="color:var(--danger);border-color:var(--danger); width:100%;">全データリセット</button>
                        <button type="button" class="submit-btn submit-btn-secondary" id="refresh-images-btn" style="color:var(--text-main);border-color:var(--border-strong); width:100%;">画像再取得</button>
                    </div>
                </div>
            </div>

            <input type="file" id="csv-import-input" accept="*/*" hidden>
        </div>
    `;

    container.innerHTML = html;

    const form = document.getElementById('search-form');
    const resultsContainer = document.getElementById('search-results');
    
    // Settings UI logic
    const clientIdInput = document.getElementById('spotify-client-id');
    const clientSecretInput = document.getElementById('spotify-client-secret');
    clientIdInput.value = localStorage.getItem('spotify_client_id') || '';
    clientSecretInput.value = localStorage.getItem('spotify_client_secret') || '';

    document.getElementById('save-settings-btn').addEventListener('click', () => {
        localStorage.setItem('spotify_client_id', clientIdInput.value.trim());
        localStorage.setItem('spotify_client_secret', clientSecretInput.value.trim());
        localStorage.removeItem('spotify_app_token'); // force refresh token
        alert('設定を保存しました！');
    });

    // Accordion toggle logic for settings
    container.querySelector('.accordion-header').addEventListener('click', (e) => {
        const header = e.currentTarget;
        const content = header.nextElementSibling;
        const icon = header.querySelector('.accordion-icon');
        if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.textContent = '－';
        } else {
            content.style.display = 'none';
            icon.textContent = '＋';
        }
    });

    document.getElementById('reset-data-btn').addEventListener('click', async () => {
        if (confirm('すべてのライブデータをリセットしますか？この操作は元に戻せません。')) {
            await db.lives.clear();
            alert('データをリセットしました。');
            window.location.reload();
        }
    });

    document.getElementById('refresh-images-btn').addEventListener('click', async () => {
        const clientId = localStorage.getItem('spotify_client_id');
        if (!clientId) {
            alert('先にSpotify API設定を行ってください。');
            return;
        }
        if (confirm('これまでに自動取得したすべてのアーティスト画像を削除し、再度最新の画像を取得し直しますか？')) {
            await db.artists.clear();
            syncArtistImages();
            alert('画像の再取得をバックグラウンドで開始しました！少し待ってから再度確認してください。');
        }
    });

// Bind Export/Import
document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('csv-import-input').click();
});

document.getElementById('export-btn').addEventListener('click', async () => {
    const rawLives = await db.lives.toArray();
    const jsonStr = JSON.stringify(rawLives);
    
    try {
        if (Capacitor.isNativePlatform()) {
            const fileName = 'livefolio_backup.json';
            const result = await Filesystem.writeFile({
                path: fileName,
                data: jsonStr,
                directory: Directory.Cache,
                encoding: Encoding.UTF8,
            });
            alert('エクスポート画面が開きます。「ドライブに保存」や「ファイルに保存」などの出力先を指定してください。');
            await Share.share({
                title: 'LIVEFolio Backup',
                url: result.uri,
            });
        } else {
            if (window.showSaveFilePicker) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: 'livefolio_backup.json',
                        types: [{ description: 'JSON Files', accept: {'application/json': ['.json']} }]
                    });
                    const writable = await handle.createWritable();
                    await writable.write(jsonStr);
                    await writable.close();
                    alert('バックアップを保存しました！');
                    return;
                } catch(err) {
                    // Canceled by user
                    return;
                }
            }
            
            // Fallback for older browsers
            const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'livefolio_backup.json');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    } catch(e) {
        console.error('Export failed', e);
        alert('出力に失敗しました');
    }
});

document.getElementById('csv-import-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        const text = event.target.result;
        
        // 1. Try to parse as JSON backup
        try {
            const data = JSON.parse(text);
            if (Array.isArray(data)) {
                if (data.length > MAX_IMPORT_RECORDS) {
                    alert('データ件数が多すぎます（上限 ' + MAX_IMPORT_RECORDS + ' 件）。');
                    return;
                }
                const lives = data.map(sanitizeLive).filter(Boolean);
                await db.lives.bulkPut(lives);
                const skipped = data.length - lives.length;
                alert(lives.length + '件のライブデータを復元しました！' + (skipped > 0 ? `（不正な${skipped}件をスキップ）` : ''));
                window.location.reload();
                return;
            }
        } catch(err) {
            // Not a valid JSON array, fallback to CSV parsing
        }

        // 2. Parse as CSV
        Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
            const data = results.data.slice(0, MAX_IMPORT_RECORDS);
            let importedCount = 0;
            for (const row of data) {
                if (!row.concert_date || !row.artist_name) continue; // Minimum required

                let perfs = [];
                try {
                    if (row.performances_json) {
                        const parsed = JSON.parse(row.performances_json);
                        if (Array.isArray(parsed)) {
                            perfs = parsed.map(p => ({
                                artist_name: p?.artist_name || p?.artist || '',
                                setlist: p?.setlist || ''
                            }));
                        }
                    }
                } catch(e) {}

                let dateStr = row.concert_date;
                if (/[\/-]/.test(dateStr)) {
                    const parts = dateStr.split(/[\/-]/);
                    if (parts.length === 3) {
                        const y = parts[0];
                        const m = parts[1].padStart(2, '0');
                        const d = parts[2].padStart(2, '0');
                        dateStr = `${y}-${m}-${d}`;
                    } else {
                        dateStr = dateStr.replace(/\//g, '-');
                    }
                }

                const live = sanitizeLive({
                    id: crypto.randomUUID(),
                    concert_date: dateStr,
                    artist_name: row.artist_name,
                    title: row.event_title || '',
                    venue: row.venue_name || '',
                    live_type: row.live_type || 'ワンマン',
                    performances: perfs,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
                if (!live) continue;
                await db.lives.add(live);
                importedCount++;
            }
            alert(importedCount + '件のライブをインポートしました！');
            window.location.reload();
        },
        error: (err) => {
            alert('ファイルの読み込みに失敗しました。');
            console.error(err);
        }
    });
    };
    reader.readAsText(file);
});


    const performSearch = async (query) => {
        if (!query) {
            resultsContainer.innerHTML = '';
            return;
        }

        const rawLives = await db.lives.toArray();
        const lives = rawLives.map(l => processLiveData(l)).sort((a,b) => a.concert_date > b.concert_date ? -1 : 1);
        
        const qLower = query.toLowerCase();

        const filteredLives = lives.filter(live => {
            if (live.title && live.title.toLowerCase().includes(qLower)) return true;
            if (live.artist_name && live.artist_name.toLowerCase().includes(qLower)) return true;
            if (live.venue && live.venue.toLowerCase().includes(qLower)) return true;
            if (live.performances) {
                return live.performances.some(p => p.artist_name.toLowerCase().includes(qLower));
            }
            return false;
        });

        // Unique artists matching
        const artistSet = new Set();
        filteredLives.forEach(live => {
            if (live.artist_name.toLowerCase().includes(qLower)) artistSet.add(live.artist_name);
            if (live.performances) {
                live.performances.forEach(p => {
                    if (p.artist_name.toLowerCase().includes(qLower)) artistSet.add(p.artist_name);
                });
            }
        });

        let resultsHtml = '';

        if (artistSet.size > 0) {
            resultsHtml += `
                <div class="section-title section-title-inline section-title-flush">Artists</div>
                <div class="artist-grid artist-grid-inline">
            `;
            
            // fetch images for these artists
            const dbArtists = await db.artists.where('name').anyOf(Array.from(artistSet)).toArray();
            const artistImageMap = {};
            dbArtists.forEach(a => artistImageMap[a.name] = a.image_data);

            const arr = Array.from(artistSet).map(name => ({
                name,
                image_data: artistImageMap[name],
                count: 0, latest_date: ''
            }));
            
            arr.forEach(a => resultsHtml += artistTile(a));
            resultsHtml += `</div>`;
        }

        if (filteredLives.length > 0) {
            resultsHtml += `<div class="section-title section-title-inline">Lives</div>`;
            filteredLives.forEach(live => {
                resultsHtml += liveCard(live);
            });
        }

        if (filteredLives.length === 0 && artistSet.size === 0) {
            resultsHtml = `<div class="empty-state">一致する結果が見つかりません。</div>`;
        }

        resultsContainer.innerHTML = resultsHtml;
    };

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = form.querySelector('input[name="q"]').value;
        window.history.replaceState({}, '', '/search?q=' + encodeURIComponent(query));
        performSearch(query);
    });

    if (q) {
        performSearch(q);
    }
}
