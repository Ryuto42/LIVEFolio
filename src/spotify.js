import { encodeText } from './utils.js';

const TOKEN_KEY = 'spotify_app_token';
const EXPIRES_KEY = 'spotify_app_token_expires';

export function clearSpotifyToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRES_KEY);
}

// Client Credentials フロー（ユーザーのログインは不要）。キーは利用者が設定画面で入力し、端末内にだけ保存する
export async function getSpotifyAppToken() {
    const clientId = localStorage.getItem('spotify_client_id');
    const clientSecret = localStorage.getItem('spotify_client_secret');
    if (!clientId || !clientSecret) return null;

    const token = localStorage.getItem(TOKEN_KEY);
    const expiresAt = parseInt(localStorage.getItem(EXPIRES_KEY), 10);
    if (token && expiresAt && Date.now() < expiresAt) return token;

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
            },
            body: new URLSearchParams({ grant_type: 'client_credentials' }),
        });
        if (!response.ok) return null;
        const data = await response.json();
        if (typeof data.access_token !== 'string') return null;
        localStorage.setItem(TOKEN_KEY, data.access_token);
        localStorage.setItem(EXPIRES_KEY, String(Date.now() + (Number(data.expires_in) || 3600) * 1000 - 60000));
        return data.access_token;
    } catch (e) {
        // キーに使えない文字が含まれる（btoa の例外）か、通信に失敗した
        console.error('Failed to get Spotify App token', e);
        return null;
    }
}

// 認証付きの GET。トークンが失効していたら 1 度だけ取り直し、レート制限は呼び出し側に伝える
export async function spotifyGet(url) {
    for (let attempt = 0; attempt < 2; attempt++) {
        const token = await getSpotifyAppToken();
        if (!token) return null;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (res.status === 401) { clearSpotifyToken(); continue; }
        if (res.status === 429) throw new Error('rate-limited');
        if (!res.ok) return null;
        return res.json();
    }
    return null;
}

// 見つかれば画像 URL、見つからなければ null。通信できなかったときは例外にする
export async function searchArtistImage(artistName) {
    const data = await spotifyGet(`https://api.spotify.com/v1/search?q=${encodeText(artistName)}&type=artist&limit=1&market=JP`);
    if (!data) return null;
    const url = data.artists?.items?.[0]?.images?.[0]?.url;
    return typeof url === 'string' ? url : null;
}
