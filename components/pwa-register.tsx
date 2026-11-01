"use client";

import { useEffect } from "react";

/** Registers the service worker in production only, so dev hot-reload is never served from a cache. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
