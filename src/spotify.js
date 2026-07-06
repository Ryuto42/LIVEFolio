const SPOTIFY_CLIENT_ID = 'TODO_YOUR_CLIENT_ID'; // User must provide
const REDIRECT_URI = window.location.origin + '/callback';

function generateRandomString(length) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function generateCodeChallenge(codeVerifier) {
    function base64encode(string) {
        return btoa(String.fromCharCode.apply(null, new Uint8Array(string)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return base64encode(digest);
}

export async function loginWithSpotify() {
    const codeVerifier = generateRandomString(128);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    let state = generateRandomString(16);

    localStorage.setItem('spotify_code_verifier', codeVerifier);

    let args = new URLSearchParams({
        response_type: 'code',
        client_id: SPOTIFY_CLIENT_ID,
        scope: 'user-read-private',
        redirect_uri: REDIRECT_URI,
        state: state,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge
    });

    window.location = 'https://accounts.spotify.com/authorize?' + args;
}

export async function handleSpotifyCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    let code = urlParams.get('code');
    let codeVerifier = localStorage.getItem('spotify_code_verifier');

    if (!code || !codeVerifier) return null;

    let body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
        client_id: SPOTIFY_CLIENT_ID,
        code_verifier: codeVerifier
    });

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body
        });
        const data = await response.json();
        if (data.access_token) {
            localStorage.setItem('spotify_access_token', data.access_token);
            window.history.replaceState({}, document.title, '/'); // Clean URL
            return data.access_token;
        }
    } catch (e) {
        console.error(e);
    }
    return null;
}

export async function getSpotifyAppToken() {
    const clientId = localStorage.getItem('spotify_client_id');
    const clientSecret = localStorage.getItem('spotify_client_secret');
    if (!clientId || !clientSecret) return null;

    let token = localStorage.getItem('spotify_app_token');
    const expiresAt = localStorage.getItem('spotify_app_token_expires');
    if (token && expiresAt && Date.now() < parseInt(expiresAt)) {
        return token;
    }

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + btoa(clientId + ':' + clientSecret)
            },
            body: new URLSearchParams({ grant_type: 'client_credentials' })
        });
        const data = await response.json();
        if (data.access_token) {
            localStorage.setItem('spotify_app_token', data.access_token);
            localStorage.setItem('spotify_app_token_expires', Date.now() + (data.expires_in * 1000) - 60000); // 1 min buffer
            return data.access_token;
        }
    } catch (e) {
        console.error('Failed to get Spotify App token', e);
    }
    return null;
}

export async function searchArtistImage(artistName) {
    const token = await getSpotifyAppToken();
    if (!token) return null;

    try {
        const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`, {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        const data = await res.json();
        if (data && data.artists && data.artists.items && data.artists.items.length > 0) {
            const images = data.artists.items[0].images;
            if (images && images.length > 0) {
                return images[0].url;
            }
        }
    } catch(e) {
        console.error('Failed to search artist on Spotify', e);
    }
    return null;
}
