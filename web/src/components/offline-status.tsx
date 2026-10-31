"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/i18n/provider";

export function OfflineStatus() {
  const locale = useLocale();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") navigator.serviceWorker.register("/offline-worker", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
      else navigator.serviceWorker.getRegistrations().then(async (registrations) => {
        const ours = (scriptURL: string) => { const url = new URL(scriptURL); return url.origin === location.origin && ["/sw.js", "/offline-worker"].includes(url.pathname); };
        const rootScope = new URL("/", location.href).href;
        const legacy = registrations.some((r) => r.scope === rootScope && [r.active, r.installing, r.waiting].some((worker) => worker && ours(worker.scriptURL)));
        const controlled = navigator.serviceWorker.controller && ours(navigator.serviceWorker.controller.scriptURL);
        if (legacy || controlled) {
          // unregister alone leaves the old worker controlling open tabs.
          await navigator.serviceWorker.register("/offline-worker", { scope: "/", updateViaCache: "none" });
        }
      }).catch(() => undefined);
    }
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  if (!offline) return null;
  return <div className="offlineBanner" role="status"><strong>{locale === "en" ? "No network connection." : "Нет подключения к сети."}</strong> {locale === "en" ? "Use the offline workspace on an enrolled hospital computer." : "На подключённом компьютере больницы используйте offline-раздел."} <a href="/offline">{locale === "en" ? "Offline workspace" : "Работа без интернета"}</a></div>;
}
