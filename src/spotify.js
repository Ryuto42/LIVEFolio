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
