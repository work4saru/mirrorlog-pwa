self.addEventListener('install', event => {
  event.waitUntil(caches.open('mirrorlog-v1').then(c => c.addAll(['/','/manifest.webmanifest'])));
});
self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request).then(resp => resp || fetch(event.request)));
});
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : { title: 'Mirrorlog', body: 'Time to reflect' };
  event.waitUntil(self.registration.showNotification(data.title || 'Mirrorlog', {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    data
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});