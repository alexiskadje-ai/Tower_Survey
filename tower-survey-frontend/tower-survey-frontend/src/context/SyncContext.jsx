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
    const [drafts, checkins] = await Promise.all([
      db.draftResponses.where("status").equals("queued").count(),
      db.queuedCheckins.where("status").equals("pending").count(),
    ]);
    setPendingCount(drafts + checkins);
  }, []);

  // Flush des check-ins en attente (multipart upload). Best-effort : on
  // loggue sans bloquer. À appeler AVANT de tenter la sync des réponses,
  // car le serveur rejettera toute réponse dont la session n'a pas
  // encore ses deux check-ins en base.
  const flushQueuedCheckins = useCallback(async () => {
    const pending = await db.queuedCheckins.where("status").equals("pending").toArray();
    for (const item of pending) {
      try {
        // Récupère la session côté serveur (idempotent sur client_uuid)
        const session = await api.createCheckinSession({
          client_uuid: item.session_client_uuid,
        });

        // Attache le site si on le connaît maintenant
        if (item.site_id) {
          try {
            await api.attachSiteToCheckinSession(session.id, item.site_id);
          } catch {
            // non-bloquant : on pourra attacher plus tard
          }
        }

        const formData = new FormData();
        formData.append("file", item.blob, item.filename || "selfie.jpg");
        formData.append("session_id", session.id);
        formData.append("role", item.role);
        if (item.user_id) formData.append("user_id_override", item.user_id);
        if (item.latitude != null) formData.append("latitude", String(item.latitude));
        if (item.longitude != null) formData.append("longitude", String(item.longitude));
        if (item.gps_accuracy_meters != null) formData.append("gps_accuracy_meters", String(item.gps_accuracy_meters));
        if (item.device_fingerprint) formData.append("device_fingerprint", item.device_fingerprint);
        if (item.captured_at) formData.append("captured_at", item.captured_at);

        await api.uploadCheckinSelfie(formData);
        await db.queuedCheckins.update(item.localId, { status: "uploaded", server_session_id: session.id });
      } catch (err) {
        await db.queuedCheckins.update(item.localId, { status: "pending", error: err.message });
      }
    }
  }, []);

  const runSync = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setIsSyncing(true);
    setLastSyncError(null);

    try {
      // 1) Check-ins d'abord (sans eux, la sync des réponses échoue avec
      //    "checkins_pending"). Best-effort, on continue même si partiel.
      await flushQueuedCheckins();

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
          session_id: r.checkin_session_id || null,
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
          if (media.slot) formData.append("slot", media.slot);
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
    <SyncContext.Provider value={{ isOnline, isSyncing, pendingCount, lastSyncError, runSync, refreshPendingCount, flushQueuedCheckins }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync doit être utilisé dans <SyncProvider>");
  return ctx;
}
