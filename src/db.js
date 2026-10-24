import Dexie from 'dexie';

export const db = new Dexie('LIVEFolioDB');
db.version(1).stores({
  lives: 'id, artist_name, concert_date, title, venue, memo, created_at, updated_at',
  artists: 'name, image_data, updated_at'
});
db.version(2).stores({
  tracks: 'key, updated_at'
});

export let dataVersion = 0;
const pending = { lives: null, artists: null };
const DEBOUNCE = { lives: 60, artists: 1200 };

function notify(table) {
  clearTimeout(pending[table]);
  pending[table] = setTimeout(() => {
    dataVersion++;
    window.dispatchEvent(new CustomEvent('livefolio:data', { detail: { table } }));
  }, DEBOUNCE[table]);
}

for (const table of ['lives', 'artists']) {
  const fire = () => notify(table);
  db[table].hook('creating', function () { this.onsuccess = fire; });
  db[table].hook('updating', function () { this.onsuccess = fire; });
  db[table].hook('deleting', function () { this.onsuccess = fire; });
}

// データは変わらないが表示を作り直したいとき（日付が変わったときなど）に使う
export function touchData() {
  dataVersion++;
  window.dispatchEvent(new CustomEvent('livefolio:data', { detail: { table: 'none' } }));
}

// clear() は hook を通らないため明示的に通知する
export async function clearTable(table) {
  await db[table].clear();
  notify(table);
}
