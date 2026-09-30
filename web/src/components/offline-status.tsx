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
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  if (!offline) return null;
  return <div className="offlineBanner" role="status"><strong>{locale === "en" ? "No network connection." : "Нет подключения к сети."}</strong> {locale === "en" ? "Data remains in this open tab; server saving will be available when the connection returns." : "Данные остаются в открытой вкладке; серверное сохранение станет доступно после восстановления связи."}</div>;
}
