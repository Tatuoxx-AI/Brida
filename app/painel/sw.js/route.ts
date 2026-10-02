import { managerPath } from "@/lib/manager-auth";

/**
 * Service worker do painel. Só trata notificações push — sem cache de páginas,
 * para o painel mostrar sempre dados atuais.
 */
export function GET() {
  const base = managerPath();
  if (!base) return new Response("Not found", { status: 404 });

  const js = `
const BASE = ${JSON.stringify(base)};
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { title: "Brida", body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || "Brida Coiffeur", {
    body: data.body || "",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    icon: BASE + "/icone/192",
    badge: BASE + "/icone/192",
    data: { url: data.url || BASE + "#agenda" },
    vibrate: [120, 60, 120],
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || BASE + "#agenda";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.includes(BASE)) { await c.focus(); c.navigate(url).catch(() => {}); return; }
    }
    await self.clients.openWindow(url);
  })());
});
`;
  return new Response(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": `${base}/`,
      "X-Robots-Tag": "noindex",
    },
  });
}
