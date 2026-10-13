// 讓頁面在沒網路時也打得開：網路優先，失敗才用快取。議程資料本身在 localStorage，不經過這裡。
const CACHE = 'agenda-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname.endsWith('supabase.co')) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok || res.type === 'opaque') { // opaque：CDN 的 supabase-js（跨網域 script）
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })) // ignoreSearch：?now= 也能命中
  );
});
