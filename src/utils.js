export function processLiveData(d) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const perfArtists = d.performances ? d.performances.map(p => p.artist_name ? p.artist_name.trim() : '').filter(x => x) : [];
    if (perfArtists.length === 0 && d.artist_name) {
        perfArtists.push(d.artist_name.trim());
    }

    const allArtistsStr = perfArtists.join(" / ");
    let cardSubArtists = allArtistsStr;

    if (perfArtists.length > 2) {
        cardSubArtists = perfArtists.slice(0, 2).join(" / ") + " ...";
    } else if (allArtistsStr.length > 30) {
        cardSubArtists = allArtistsStr.substring(0, 30) + "...";
    }

    if (d.live_type === 'フェス' || d.live_type === '対バン') {
        d.card_main_title = d.title || '';
        d.card_sub_title = cardSubArtists;
        d.detail_main_title = d.title || '';
        d.detail_sub_title = allArtistsStr;
        d.live_type_class = d.live_type === 'フェス' ? 'type-fes' : 'type-taiban';
    } else {
        d.card_main_title = d.artist_name || '';
        d.card_sub_title = d.title || '';
        d.detail_main_title = d.artist_name || '';
        d.detail_sub_title = d.title || '';
        d.live_type_class = 'type-oneman';
    }

    if (d.concert_date) {
        const dateObj = new Date(d.concert_date);
        const diffTime = dateObj - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        d.days_left = diffDays;
        if (diffDays < 0) {
            d.time_class = 'card-past';
        } else if (diffDays === 0 || diffDays === 1) {
            d.time_class = 'card-soon';
        } else {
            d.time_class = 'card-future';
        }
    } else {
        d.time_class = 'card-past';
    }

    return d;
}

export function liveCard(history) {
    let imgHtml = '';
    if (history.time_class === 'card-past') {
        imgHtml = `
        <div class="card-image">
            ${history.image_data ? `<img src="${history.image_data}" loading="lazy" decoding="async" alt="">` : ''}
        </div>
        `;
    }

    return `
    <a href="/detail/${history.id}" class="card-link">
        <div class="card ${history.time_class}">
            ${imgHtml}
            <div class="card-info">
                <div class="card-date">${history.concert_date}</div>
                <div class="card-artist">${history.card_main_title}</div>
                <div class="card-title">${history.card_sub_title}</div>
            </div>
            <div class="detail-type-tag live-type-card ${history.live_type_class}">${history.live_type || ''}</div>
        </div>
    </a>
    `;
}

export function artistTile(artist) {
    return `
    <a href="/artist/${encodeURIComponent(artist.name)}" class="artist-tile">
        <div class="artist-tile-image">
            <img src="${artist.image_data || '/icon.png'}" loading="lazy" decoding="async" alt="" onerror="this.hidden=true">
        </div>
        <div class="artist-tile-name">${artist.name}</div>
        <div class="artist-tile-meta">${artist.latest_date || ''} • ${artist.count || 0} Live</div>
    </a>
    `;
}
