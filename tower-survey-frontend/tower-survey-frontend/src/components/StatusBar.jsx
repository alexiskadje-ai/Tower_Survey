import { useSync } from "../context/SyncContext";
import "./StatusBar.css";

export default function StatusBar() {
  const { isOnline, isSyncing, pendingCount, runSync } = useSync();

  let label = "En ligne";
  let tone = "ok";

  if (!isOnline) {
    label = "Hors ligne";
    tone = "offline";
  } else if (isSyncing) {
    label = "Synchronisation…";
    tone = "pending";
  } else if (pendingCount > 0) {
    label = `${pendingCount} en attente`;
    tone = "pending";
  }

  return (
    <button
      type="button"
      className={`status-bar status-bar--${tone}`}
      onClick={() => isOnline && runSync()}
      disabled={!isOnline || isSyncing}
      title={isOnline ? "Toucher pour forcer la synchronisation" : "Reviens en ligne pour synchroniser"}
    >
      <span className="status-bar__dot" />
      {label}
    </button>
  );
}
