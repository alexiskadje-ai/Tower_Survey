import { createContext, useContext, useCallback, useEffect, useState, useRef } from "react";
import { db } from "../db/db";
import { api } from "../api/client";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

const SyncContext = createContext(null);

export function SyncProvider({ children }) {
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncError, setLastSyncError] = useState(null);
  const syncingRef = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    const count = await db.draftResponses.where("status").equals("queued").count();
    setPendingCount(count);
  }, []);

  const runSync = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setIsSyncing(true);
    setLastSyncError(null);

    try {
      const queued = await db.draftResponses.where("status").equals("queued").toArray();

      if (queued.length > 0) {
        const payload = queued.map((r) => ({
          client_uuid: r.client_uuid,
          template_id: r.template_id,
          site_id: r.site_id,
          started_at: r.started_at,
          submitted_at: r.submitted_at,
          gps_latitude: r.gps_latitude,
          gps_longitude: r.gps_longitude,
          gps_accuracy_m: r.gps_accuracy_m,
          device_id: r.device_id,
          answers: r.answers,
        }));

        const { results } = await api.syncResponses(payload);

        for (const r of results) {
          if (r.status === "synced") {
            await db.draftResponses.update(r.client_uuid, {
              status: "synced",
              server_id: r.response_id,
              sync_error: null,
            });
          } else {
            await db.draftResponses.update(r.client_uuid, { sync_error: r.error });
          }
        }
      }

      // Upload des médias en attente pour les réponses maintenant synchronisées
      const pendingMedia = await db.queuedMedia.where("status").equals("pending").toArray();
      for (const media of pendingMedia) {
        const parentResponse = await db.draftResponses.get(media.response_client_uuid);
        if (!parentResponse?.server_id) continue; // pas encore synced côté serveur

        try {
          const formData = new FormData();
          formData.append("file", media.blob, media.filename);
          formData.append("question_id", media.question_id);
          if (media.gps_latitude) formData.append("gps_latitude", media.gps_latitude);
          if (media.gps_longitude) formData.append("gps_longitude", media.gps_longitude);
          if (media.captured_at) formData.append("captured_at", media.captured_at);

          await api.uploadMedia(parentResponse.server_id, formData);
          await db.queuedMedia.update(media.localId, { status: "uploaded" });
        } catch (err) {
          await db.queuedMedia.update(media.localId, { status: "pending", error: err.message });
        }
      }
    } catch (err) {
      setLastSyncError(err.message);
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
      await refreshPendingCount();
    }
  }, [refreshPendingCount]);

  // Sync auto dès retour réseau + sync périodique légère
  useEffect(() => {
    refreshPendingCount();
    if (isOnline) runSync();
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const interval = setInterval(() => {
      if (navigator.onLine) runSync();
    }, 60_000);
    return () => clearInterval(interval);
  }, [runSync]);

  return (
    <SyncContext.Provider value={{ isOnline, isSyncing, pendingCount, lastSyncError, runSync, refreshPendingCount }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync doit être utilisé dans <SyncProvider>");
  return ctx;
}
