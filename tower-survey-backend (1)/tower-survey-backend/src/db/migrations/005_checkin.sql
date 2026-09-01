-- =============================================================
-- Migration 005 — Check-in dual-technician (V1)
-- =============================================================
-- Ajoute le système de vérification de présence à 2 techniciens
-- (lead + assistant) avant déblocage du formulaire d'audit.
--
-- Modèle :
--   * checkin_sessions    : un UUID généré côté client AVANT la sync
--                          (clé offline-first, alignée sur client_uuid
--                          des survey_responses). État : awaiting_checkins
--                          → ready → submitted.
--   * checkin_verifications : un selfie + GPS par rôle. Lié à un user_id
--                          (technicien authentifié). Plusieurs check-ins
--                          peuvent exister pour un même (session, role)
--                          si retry (idempotence sur le triplet
--                          session_id + user_id + role).
--
-- Le flag de distance (distance_to_tower_meters > CHECKIN_FLAG_DISTANCE_M)
-- est appliqué côté serveur quand le site devient connu (PATCH
-- /api/checkin/session/:id). On NE BLOQUE PAS la soumission sur le
-- flag : on l'enregistre pour review superviseur.
-- =============================================================

CREATE TABLE IF NOT EXISTS checkin_sessions (
  id              UUID PRIMARY KEY,
  client_uuid     UUID UNIQUE NOT NULL,           -- généré offline, clé offline-first
  org_id          UUID REFERENCES organizations(id),
  site_id         UUID REFERENCES sites(id),      -- peut être NULL tant que le site n'est pas choisi
  lead_user_id    UUID REFERENCES users(id),     -- défini après le 1er check-in
  assistant_user_id UUID REFERENCES users(id),   -- défini après le 2e check-in
  status          VARCHAR(30) NOT NULL DEFAULT 'awaiting_checkins'
                  CHECK (status IN ('awaiting_checkins','ready','submitted','cancelled')),
  flagged         BOOLEAN NOT NULL DEFAULT false, -- OR des flags des check-ins
  flag_reason     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkin_sessions_org
  ON checkin_sessions (org_id);
CREATE INDEX IF NOT EXISTS idx_checkin_sessions_site
  ON checkin_sessions (site_id);

-- Table des check-ins individuels (selfie + GPS + role)
CREATE TABLE IF NOT EXISTS checkin_verifications (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                  UUID NOT NULL REFERENCES checkin_sessions(id) ON DELETE CASCADE,
  user_id                     UUID NOT NULL REFERENCES users(id),
  role                        VARCHAR(20) NOT NULL CHECK (role IN ('lead','assistant')),
  selfie_url                  TEXT NOT NULL,
  latitude                    DOUBLE PRECISION,
  longitude                   DOUBLE PRECISION,
  gps_accuracy_meters         DOUBLE PRECISION,
  device_fingerprint          TEXT,
  captured_at                 TIMESTAMPTZ,             -- horodatage client
  synced_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  distance_to_tower_meters    DOUBLE PRECISION,        -- calculé côté serveur quand site connu
  flagged                     BOOLEAN NOT NULL DEFAULT false,
  flag_reason                 TEXT,
  -- Un même user peut refaire son check-in (mauvais selfie, etc.) : on
  -- permet plusieurs lignes par (session, user, role) mais UN seul
  -- "actif" — les versions antérieures sont marquées superseded_at.
  superseded_at               TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_checkin_ver_session
  ON checkin_verifications (session_id);
CREATE INDEX IF NOT EXISTS idx_checkin_ver_user
  ON checkin_verifications (user_id);

-- Empêche deux check-ins ACTIFS pour le même (session, user, role)
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkin_ver_session_user_role_active
  ON checkin_verifications (session_id, user_id, role)
  WHERE superseded_at IS NULL;

-- Lie la survey_response à sa session de check-in
ALTER TABLE survey_responses
  ADD COLUMN IF NOT EXISTS checkin_session_id UUID REFERENCES checkin_sessions(id);

CREATE INDEX IF NOT EXISTS idx_survey_responses_checkin
  ON survey_responses (checkin_session_id);
