// Service Worker básico para cumplir los requisitos de PWA en iOS
// Este archivo es obligatorio para que iPhone reconozca la app como instalable

self.addEventListener('install', (e) => {
  console.log('Service Worker instalado');
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  console.log('Service Worker activado');
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Permite que la app cargue de manera normal
  e.respondWith(fetch(e.request));
});
