// This is the "Offline copy of pages" service worker

const CACHE = "pwabuilder-offline";

importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.1.2/workbox-sw.js');

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  // ÚJ: helyi (nem push-alapú) emlékeztető-ütemezés. Az index.html a
  // "schedule-summary-notifications" üzenettel küldi el a mai napra
  // érvényes időpont-listát (times: ["HH:MM", ...]) minden alkalommal,
  // amikor ez megváltozik (Save Settings, Smart/DND/Wake-up beállítás,
  // app-indítás). Ez a rész felelt korábban HIÁNYZOTT — a régi sw.js
  // csendben eldobta ezt az üzenetet, ezért háttérben/bezárt appnál
  // sosem jött semmilyen emlékeztető.
  //
  // FONTOS KORLÁT: ez NEM valódi push (nincs FCM/szerver ebben a
  // verzióban) — a böngésző/OS bármikor "elaltathatja" ezt a Service
  // Workert, és ilyenkor az itt beállított időzítők elvesznek. A
  // legjobb eredményt úgy kapod, ha az app (vagy legalább a böngésző)
  // időnként a háttérben fut/nyitva marad — teljesen bezárt állapotban,
  // hosszabb ideig, nem garantált a kézbesítés. Ez a jelenlegi (FCM
  // nélküli) architektúra ismert, vállalt korlátja, nem hiba.
  if (event.data && event.data.type === "schedule-summary-notifications") {
    scheduleLocalNotifications(event.data.times || []);
  }
});

let scheduledTimeoutIds = [];

function scheduleLocalNotifications(times) {
  // Előző ütemezés törlése, hogy ne halmozódjanak/duplikálódjanak az időzítők.
  scheduledTimeoutIds.forEach(id => clearTimeout(id));
  scheduledTimeoutIds = [];

  if (!Array.isArray(times) || times.length === 0) return;

  const now = new Date();

  times.forEach(timeStr => {
    const parts = String(timeStr).split(':').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return;

    const target = new Date();
    target.setHours(parts[0], parts[1], 0, 0);
    if (target <= now) {
      target.setDate(target.getDate() + 1); // ha ma már elmúlt, holnapra ütemezzük
    }

    const delay = target.getTime() - now.getTime();
    // A böngészők jellemzően nem engednek meg felelősségteljesen nagyon
    // hosszú (több napos) setTimeout-ot Service Workerben — csak akkor
    // ütemezünk, ha ésszerű (max. kb. 36 órán belüli) időpontról van szó.
    if (delay > 0 && delay < 36 * 60 * 60 * 1000) {
      const id = setTimeout(() => {
        self.registration.showNotification('Aftercup Brief', {
          body: 'Time to check your daily summary.',
          icon: '/icons/icon-192x192.png',
          tag: 'daily-summary'
        });
      }, delay);
      scheduledTimeoutIds.push(id);
    }
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

// ÚJ: valódi FCM (Firebase Cloud Messaging) push kezelése. A fő Aftercup
// Calendar backend adat-only (nem "notification") payload-ot küld, hogy a
// megjelenítést teljes egészében mi vezéreljük itt — ugyanaz a formátum
// (title/body/icon/badge a data mezőben), mint a fő appnál.
self.addEventListener('push', (event) => {
  let notificationData = {
    title: 'Aftercup Brief',
    body: 'Time to check your daily summary.',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png'
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      notificationData = Object.assign({}, notificationData, payload.data || payload);
    } catch (e) {
      // Ha nem JSON, hagyjuk az alapértelmezett szöveget.
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: 'daily-summary'
    })
  );
});

workbox.routing.registerRoute(
  new RegExp('/*'),
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: CACHE
  })
);
