import Dexie from "dexie";

/**
 * Base locale du device. Persiste même hors-ligne / app fermée.
 *
 * - cachedSites / cachedTemplates : copies locales pour usage 100% offline
 * - draftResponses : réponses en cours ou en attente de sync (clé = client_uuid)
 * - queuedMedia : photos en attente d'upload, liées à un client_uuid de réponse
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

export default db;
