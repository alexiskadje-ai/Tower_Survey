import Dexie from "dexie";

/**
 * Base locale du device. Persiste même hors-ligne / app fermée.
 *
 * - cachedSites / cachedTemplates : copies locales pour usage 100% offline
 * - draftResponses : réponses en cours ou en attente de sync (clé = client_uuid)
 * - queuedMedia : photos en attente d'upload, liées à un client_uuid de réponse
 *
 * v4 — check-in dual-technician :
 *   - checkinSessions : une session ouverte par audit. Tant que les deux
 *     check-ins (lead + assistant) ne sont pas synchronisés, la
 *     survey_response liée ne peut pas être créée côté serveur.
 *   - queuedCheckins : check-ins capturés offline (selfie + GPS) en
 *     attente d'upload. Flushed par le SyncContext avant la sync des
 *     réponses.
 */
export const db = new Dexie("teleinfra_tower_audit");

db.version(1).stores({
  cachedSites: "id, site_code, cluster",
  cachedTemplates: "id",
  draftResponses: "client_uuid, site_id, status, submitted_at",
  queuedMedia: "++localId, response_client_uuid, question_id, status",
});

// v2 : ajout d'un index sur template_id pour permettre la reprise d'un brouillon
// spécifique à un type de formulaire (Power Audit vs Site Infrastructure)
db.version(2).stores({
  draftResponses: "client_uuid, site_id, status, submitted_at, template_id",
});

// v3 : support des photos multi-slot (Fix-on-visit "Avant/Après" et liste libre).
// Chaque entrée de queuedMedia peut désormais porter un champ `slot` (string|null).
// Aucun nouvel index n'est requis — on garde le schéma de table inchangé, le
// champ est juste un attribut de la ligne.
db.version(3).stores({
  draftResponses: "client_uuid, site_id, status, submitted_at, template_id",
  queuedMedia: "++localId, response_client_uuid, question_id, status",
});

// v4 : ajout des tables de check-in
db.version(4).stores({
  draftResponses: "client_uuid, site_id, status, submitted_at, template_id, checkin_session_id",
  checkinSessions: "id, client_uuid, status, template_id, site_id",
  queuedCheckins: "++localId, session_id, role, status",
});

export default db;
