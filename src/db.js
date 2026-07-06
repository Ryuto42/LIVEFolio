import Dexie from 'dexie';

export const db = new Dexie('LIVEFolioDB');
db.version(1).stores({
  lives: 'id, artist_name, concert_date, title, venue, memo, created_at, updated_at',
  artists: 'name, image_data, updated_at'
});
