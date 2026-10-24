import Papa from 'papaparse';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { db, clearTable } from '../db.js';
import { isSafeImageSrc, nf, escapeHtml, parseDate, toDateStr } from '../utils.js';
import { syncArtistImages } from '../sync.js';
import { clearTrackArt, countTrackArt } from '../trackArt.js';
import { confirmDialog, alertDialog, toast } from '../ui/components.js';
import { icon } from '../ui/icons.js';

const LIVE_TYPES = ['ワンマン', 'フェス', '対バン'];
const MAX_IMPORT_RECORDS = 10000;
const MAX_PERFORMANCES = 100;
const MAX_TEXT_LENGTH = 500;
const MAX_SETLIST_LENGTH = 20000;
const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

// 文字数の上限で切るときにサロゲートペアを分断しない（分断すると encodeURIComponent が例外を投げる）
function cleanText(value, maxLength = MAX_TEXT_LENGTH) {
    if (typeof value !== 'string') return '';
    const chars = Array.from(value);
    return chars.length > maxLength ? chars.slice(0, maxLength).join('') : value;
}

function isRealDate(str) {
    if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    const d = parseDate(str);
    return !!d && toDateStr(d) === str && d.getFullYear() >= 1900 && d.getFullYear() <= 2100;
}

function sanitizeLive(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(raw.id)) return null;
    if (!isRealDate(raw.concert_date)) return null;
    if (raw.performances !== undefined && !Array.isArray(raw.performances)) return null;

    const performances = (raw.performances || [])
        .slice(0, MAX_PERFORMANCES)
        .filter(p => p && typeof p === 'object')
        .map(p => ({
            artist_name: cleanText(p.artist_name).trim(),
            setlist: cleanText(p.setlist, MAX_SETLIST_LENGTH)
        }));

    // 写真は端末で撮った data URL だけを受け付ける（外部 URL を読み込ませて閲覧を追跡されないように）。不正なら写真だけ外して取り込む
    const image = typeof raw.image_data === 'string' && raw.image_data.startsWith('data:') && isSafeImageSrc(raw.image_data)
        ? raw.image_data
        : null;

    return {
        id: raw.id,
        live_type: LIVE_TYPES.includes(raw.live_type) ? raw.live_type : 'ワンマン',
        title: cleanText(raw.title),
        venue: cleanText(raw.venue),
        concert_date: raw.concert_date,
        artist_name: cleanText(raw.artist_name).trim(),
        performances,
        memo: cleanText(raw.memo, MAX_SETLIST_LENGTH),
        image_data: image,
        created_at: cleanText(raw.created_at, 40),
        updated_at: cleanText(raw.updated_at, 40)
    };
}

function row({ iconName, title, value = '', action, danger = false, chevron = true }) {
    return `<button type="button" class="setting-row pressable ${danger ? 'is-danger' : ''}" data-action="${action}">
        <span class="setting-icon">${icon(iconName, 18)}</span>
        <span class="setting-title">${escapeHtml(title)}</span>
        ${value ? `<span class="setting-value">${escapeHtml(value)}</span>` : ''}
        ${chevron ? `<span class="setting-chevron">${icon('chevronRight', 12)}</span>` : ''}
    </button>`;
}

export default async function renderSettings(ctx) {
    ctx.shell({ title: '設定', back: true });

    async function draw() {
        const count = await db.lives.count();
        const artists = await db.artists.count();
        const tracks = await countTrackArt();
        const clientId = localStorage.getItem('spotify_client_id') || '';
        const hasSecret = !!localStorage.getItem('spotify_client_secret');
        ctx.body.innerHTML = `
            <div class="settings-header">データ</div>
            <div class="settings-group">
                ${row({ iconName: 'ticket', title: '保存されているライブ', value: `${nf.format(count)}件`, action: '', chevron: false })}
                ${row({ iconName: 'upload', title: 'エクスポート', value: 'JSON', action: 'export' })}
                ${row({ iconName: 'download', title: 'インポート', value: 'CSV / JSON', action: 'import' })}
            </div>
            <div class="settings-footer">エクスポートしたJSONでバックアップと復元ができます。CSVは concert_date・artist_name 列が必須です（任意: event_title, venue_name, live_type, performances_json）。</div>

            <div class="settings-header">Spotify 連携</div>
            <div class="settings-group">
                <label class="setting-field"><span class="setting-icon">${icon('key', 15)}</span><span class="setting-title">Client ID</span>
                    <input type="text" id="spotify-client-id" value="${escapeHtml(clientId)}" placeholder="未設定" autocomplete="off" spellcheck="false"></label>
                <label class="setting-field"><span class="setting-icon">${icon('key', 15)}</span><span class="setting-title">Client Secret</span>
                    <input type="password" id="spotify-client-secret" value="" placeholder="${hasSecret ? '設定済み（変更する場合のみ入力）' : '未設定'}" autocomplete="off"></label>
                ${row({ iconName: 'sparkles', title: '設定を保存', action: 'save-spotify', chevron: false })}
                ${clientId || hasSecret ? row({ iconName: 'close', title: '連携を解除', action: 'clear-spotify', danger: true, chevron: false }) : ''}
                ${row({ iconName: 'refresh', title: 'アーティスト画像を再取得', value: `${nf.format(artists)}件`, action: 'refresh-images' })}
            </div>
            <div class="settings-footer">アーティスト画像と曲の特定に使います。Spotify for Developers で発行した、このアプリ専用のキーを入力してください。キーはこの端末（ブラウザ）の中にだけ保存されます。Web 版を github.io などの共有ドメインで使う場合、同じドメインの別のページから読まれるおそれがあるため、独自ドメインでの利用をおすすめします。</div>

            <div class="settings-header">アートワーク</div>
            <div class="settings-group">
                ${row({ iconName: 'music', title: '曲のアートワークを再取得', value: `${nf.format(tracks)}曲`, action: 'refresh-tracks' })}
            </div>
            <div class="settings-footer">セットリストの曲のジャケットは、Spotify 連携がある場合は Spotify（oEmbed）、ない場合や見つからない場合は iTunes から自動で取得します。</div>

            <div class="settings-group settings-group--spaced">
                ${row({ iconName: 'trash', title: 'すべてのライブデータを削除', action: 'reset', danger: true, chevron: false })}
            </div>

            <div class="settings-header">情報</div>
            <div class="settings-group">
                ${row({ iconName: 'info', title: 'LIVEFolio', value: 'ライブ参戦記録', action: '', chevron: false })}
            </div>
            <input type="file" id="csv-import-input" accept="*/*" hidden>`;
    }

    ctx.body.addEventListener('click', async e => {
        const btn = e.target.closest('[data-action]');
        if (!btn || !btn.dataset.action) return;
        const action = btn.dataset.action;
        if (action === 'export') return exportData();
        if (action === 'import') return ctx.body.querySelector('#csv-import-input').click();
        if (action === 'save-spotify') {
            localStorage.setItem('spotify_client_id', ctx.body.querySelector('#spotify-client-id').value.trim());
            const secret = ctx.body.querySelector('#spotify-client-secret').value.trim();
            if (secret) localStorage.setItem('spotify_client_secret', secret);
            localStorage.removeItem('spotify_app_token');
            localStorage.removeItem('spotify_app_token_expires');
            toast('設定を保存しました');
            syncArtistImages();
            draw();
            return;
        }
        if (action === 'clear-spotify') {
            const ok = await confirmDialog({ title: 'Spotify 連携を解除しますか？', message: '保存した Client ID と Client Secret をこの端末から削除します。', confirmLabel: '解除', destructive: true });
            if (!ok) return;
            ['spotify_client_id', 'spotify_client_secret', 'spotify_app_token', 'spotify_app_token_expires'].forEach(k => localStorage.removeItem(k));
            toast('連携を解除しました');
            draw();
            return;
        }
        if (action === 'refresh-images') {
            if (!localStorage.getItem('spotify_client_id')) {
                await alertDialog('Spotify 連携が未設定です', '先に Client ID と Client Secret を保存してください。');
                return;
            }
            const ok = await confirmDialog({ title: 'アーティスト画像を再取得しますか？', message: 'これまでに取得した画像を削除して、最新の画像を取り直します。', confirmLabel: '再取得' });
            if (!ok) return;
            await clearTable('artists');
            syncArtistImages();
            toast('バックグラウンドで再取得を開始しました');
            return;
        }
        if (action === 'refresh-tracks') {
            const ok = await confirmDialog({ title: '曲のアートワークを再取得しますか？', message: '保存済みのジャケットを削除し、表示したときに取り直します。', confirmLabel: '再取得' });
            if (!ok) return;
            await clearTrackArt();
            toast('アートワークを削除しました');
            draw();
            return;
        }
        if (action === 'reset') {
            const ok = await confirmDialog({ title: 'すべてのライブデータを削除しますか？', message: 'この操作は元に戻せません。', confirmLabel: '削除', destructive: true });
            if (!ok) return;
            await clearTable('lives');
            toast('データをリセットしました');
            draw();
        }
    });

    ctx.body.addEventListener('change', e => {
        if (e.target.id !== 'csv-import-input') return;
        const file = e.target.files[0];
        e.target.value = '';
        if (file) importFile(file).then(draw);
    });

    await draw();
}

async function exportData() {
    const jsonStr = JSON.stringify(await db.lives.toArray());
    try {
        if (Capacitor.isNativePlatform()) {
            const result = await Filesystem.writeFile({
                path: 'livefolio_backup.json',
                data: jsonStr,
                directory: Directory.Cache,
                encoding: Encoding.UTF8,
            });
            await alertDialog('エクスポート', '共有画面で「ファイルに保存」や「ドライブに保存」などの保存先を選んでください。');
            await Share.share({ title: 'LIVEFolio Backup', url: result.uri });
            return;
        }
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'livefolio_backup.json',
                    types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }]
                });
                const writable = await handle.createWritable();
                await writable.write(jsonStr);
                await writable.close();
                toast('バックアップを保存しました');
            } catch {
                // 保存ダイアログのキャンセル
            }
            return;
        }
        const url = URL.createObjectURL(new Blob([jsonStr], { type: 'application/json;charset=utf-8;' }));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'livefolio_backup.json');
        document.body.appendChild(link);
        link.click();
        link.remove();
    } catch (e) {
        console.error('Export failed', e);
        alertDialog('出力に失敗しました');
    }
}

function normalizeCsvDate(value) {
    const parts = String(value || '').trim().split(/[/-]/);
    if (parts.length !== 3) return '';
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
}

function parseCsv(text) {
    return new Promise((resolve, reject) => {
        Papa.parse(text, { header: true, skipEmptyLines: true, complete: r => resolve(r.data), error: reject });
    });
}

function csvRowToLive(r) {
    if (!r || !r.concert_date || !r.artist_name) return null;
    let perfs = [];
    try {
        const parsed = r.performances_json ? JSON.parse(r.performances_json) : null;
        if (Array.isArray(parsed)) {
            perfs = parsed.map(p => ({ artist_name: p?.artist_name || p?.artist || '', setlist: p?.setlist || '' }));
        }
    } catch { /* 出演者情報が読めない行は出演者なしで取り込む */ }
    const now = new Date().toISOString();
    return sanitizeLive({
        id: crypto.randomUUID(),
        concert_date: normalizeCsvDate(r.concert_date),
        artist_name: r.artist_name,
        title: r.event_title || '',
        venue: r.venue_name || '',
        live_type: r.live_type || 'ワンマン',
        performances: perfs,
        created_at: now,
        updated_at: now
    });
}

async function importFile(file) {
    if (file.size > MAX_IMPORT_BYTES) {
        await alertDialog('ファイルが大きすぎます', `上限は ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)}MB です。`);
        return;
    }

    let records;
    let isJson = false;
    try {
        const text = await file.text();
        let parsed = null;
        try {
            parsed = JSON.parse(text);
        } catch {
            // JSON でなければ CSV として読む
        }
        if (Array.isArray(parsed)) {
            isJson = true;
            records = parsed;
        } else if (parsed !== null) {
            await alertDialog('読み込めない形式です', 'LIVEFolio のバックアップ（JSON 配列）か CSV を選んでください。');
            return;
        } else {
            records = await parseCsv(text);
        }
    } catch (e) {
        console.error(e);
        await alertDialog('ファイルの読み込みに失敗しました');
        return;
    }

    if (records.length > MAX_IMPORT_RECORDS) {
        await alertDialog('データ件数が多すぎます', `上限は ${MAX_IMPORT_RECORDS} 件です。`);
        return;
    }
    const lives = records.map(isJson ? sanitizeLive : csvRowToLive).filter(Boolean);
    const skipped = records.length - lives.length;

    try {
        // JSON は同じ ID を上書きして復元し、CSV は新しい記録として追加する
        if (isJson) await db.lives.bulkPut(lives);
        else await db.lives.bulkAdd(lives);
    } catch (e) {
        console.error(e);
        await alertDialog('取り込みの途中で失敗しました', '端末の空き容量が足りない可能性があります。一部だけ取り込まれている場合があります。');
        return;
    }
    await alertDialog(
        isJson ? `${lives.length}件のライブデータを復元しました` : `${lives.length}件のライブをインポートしました`,
        skipped > 0 ? `読み込めない${skipped}件をスキップしました。` : ''
    );
}
