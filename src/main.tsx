import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);

// Earlier versions installed an offline cache (service worker) that can serve an old copy of the app.
// Remove it and its caches from devices that still have it.
navigator.serviceWorker
  ?.getRegistrations()
  .then((rs) => rs.forEach((r) => r.unregister()))
  .catch(() => {});
if ("caches" in window)
  caches
    .keys()
    .then((ks) => ks.forEach((k) => caches.delete(k)))
    .catch(() => {});
