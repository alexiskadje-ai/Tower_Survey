import { useEffect, useState } from "react";
import { db } from "../db/db";

/**
 * Empreinte de l'appareil, persistée en IndexedDB une fois générée.
 *
 * Objectif : distinguer les deux techniciens sur le terrain (lead et
 * assistant utilisent potentiellement des téléphones différents) sans
 * demander une authentification technique au niveau OS. Ce n'est PAS
 * un mécanisme d'anti-fraude dur — un superviseur peut la consulter
 * plus tard pour détecter deux check-ins "anormalement" sur le même
 * device pour deux rôles distincts.
 *
 * Stable pour un même navigateur/appareil (UA + taille d'écran + TZ),
 * change seulement après un clear-storage ou un changement de device.
 */
function computeRaw() {
  const tz = (typeof Intl !== "undefined" && Intl.DateTimeFormat)
    ? Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown"
    : "unknown";
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "unknown";
  const sw = (typeof screen !== "undefined" && screen.width) || 0;
  const sh = (typeof screen !== "undefined" && screen.height) || 0;
  return `${ua}|${sw}x${sh}|${tz}`;
}

async function sha256Hex(str) {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback basique (rare, navigateurs anciens)
  return `plain-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

let cached = null;

async function getOrCreateFingerprint() {
  if (cached) return cached;
  const existing = await db.table("cachedSites").count(); // dummy read to wake db
  void existing;
  // On stocke le hash dans localStorage (simple, pas besoin d'une table
  // Dexie supplémentaire). Survit aux clear-cache IndexedDB.
  const KEY = "ti_device_fp";
  try {
    const fromLs = localStorage.getItem(KEY);
    if (fromLs) { cached = fromLs; return fromLs; }
  } catch {}
  const fp = await sha256Hex(computeRaw());
  try { localStorage.setItem(KEY, fp); } catch {}
  cached = fp;
  return fp;
}

export function useDeviceFingerprint() {
  const [fp, setFp] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getOrCreateFingerprint().then((v) => { if (!cancelled) setFp(v); });
    return () => { cancelled = true; };
  }, []);
  return fp;
}
