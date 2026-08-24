import { useEffect, useState } from "react";
import { db } from "../db/db";
import { useSync } from "../context/SyncContext";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import "./SyncStatusPage.css";

const STATUS_LABEL = {
  draft: { text: "Brouillon", tone: "offline" },
  queued: { text: "En attente d'envoi", tone: "pending" },
  synced: { text: "Synchronisé", tone: "ok" },
};

export default function SyncStatusPage() {
  const { isOnline, isSyncing, runSync, lastSyncError } = useSync();
  const [rows, setRows] = useState([]);
  const [sites, setSites] = useState({});

  async function reload() {
    const all = await db.draftResponses.orderBy("submitted_at").reverse().toArray();
    setRows(all);
    const siteList = await db.cachedSites.toArray();
    setSites(Object.fromEntries(siteList.map((s) => [s.id, s])));
  }

  useEffect(() => {
    reload();
  }, [isSyncing]);

  return (
    <div className="app-shell">
      <TopBar />
      <div className="sync-page">
        <div className="sync-page__header">
          <h1 className="sync-page__title">Synchronisation</h1>
          <button
            type="button"
            className="btn btn-secondary sync-page__refresh"
            onClick={runSync}
            disabled={!isOnline || isSyncing}
          >
            {isSyncing ? "Envoi…" : "Forcer la sync"}
          </button>
        </div>

        {!isOnline && (
          <p className="sync-page__banner sync-page__banner--offline">
            Hors ligne — les audits en attente seront envoyés automatiquement au retour du réseau.
          </p>
        )}
        {lastSyncError && (
          <p className="sync-page__banner sync-page__banner--error">Dernière erreur : {lastSyncError}</p>
        )}

        {rows.length === 0 ? (
          <p className="sync-page__empty">Aucun audit enregistré sur ce device pour l'instant.</p>
        ) : (
          <ul className="sync-page__list">
            {rows.map((r) => {
              const status = STATUS_LABEL[r.status] || STATUS_LABEL.draft;
              const site = sites[r.site_id];
              return (
                <li key={r.client_uuid} className="sync-row">
                  <div className="sync-row__main">
                    <span className="mono sync-row__code">{site?.site_code || "Site"}</span>
                    <span className="sync-row__name">{site?.site_name || "—"}</span>
                    {r.sync_error && <span className="sync-row__error">Erreur : {r.sync_error}</span>}
                  </div>
                  <span className={`pill sync-row__pill sync-row__pill--${status.tone}`}>{status.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
