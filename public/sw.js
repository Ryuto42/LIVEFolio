// ビルド成果物のファイル名はハッシュ付きで毎回変わるため、事前キャッシュではなく実行時にキャッシュする。
// サブパス配信（GitHub Pages など）でも動くよう、パスは登録スコープを基準にする。
const CACHE = 'livefolio-v2';
const MAX_ENTRIES = 80;
const ROOT = new URL(self.registration.scope).pathname;
const SHELL = [ROOT, `${ROOT}manifest.webmanifest`, `${ROOT}icons/icon-192.png`, `${ROOT}icons/icon-512.png`];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// 古い版のハッシュ付きファイルが溜まり続けないよう、古いものから捨てる
async function trim(cache) {
    const keys = await cache.keys();
    const shell = new Set(SHELL.map(p => new URL(p, self.location.origin).href));
    const extra = keys.filter(req => !shell.has(req.url));
    await Promise.all(extra.slice(0, Math.max(0, extra.length - MAX_ENTRIES)).map(req => cache.delete(req)));
}

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin || !url.pathname.startsWith(ROOT)) return;

    // 画面遷移はネットワーク優先。オフライン時は保存済みの index.html を返し、SPA のルーターに任せる
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(res => {
                    if (res.ok) {
                        const copy = res.clone();
                        caches.open(CACHE).then(cache => cache.put(ROOT, copy));
                    }
                    return res;
                })
                .catch(() => caches.match(ROOT))
        );
        return;
    }

    // JS・CSS・画像はキャッシュを先に返し、裏で更新する
    event.respondWith(
        caches.open(CACHE).then(async cache => {
            const cached = await cache.match(request);
            const network = fetch(request)
                .then(res => {
                    if (res.ok && res.type === 'basic') {
                        cache.put(request, res.clone()).then(() => trim(cache));
                    }
                    return res;
                })
                .catch(() => cached || Response.error());
            return cached || network;
        })
    );
});
