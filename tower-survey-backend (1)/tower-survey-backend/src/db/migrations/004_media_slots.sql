-- =============================================================
-- Migration 004 — Slots nommés sur media_attachments
-- =============================================================
-- Permet de regrouper les photos d'une même question par "slot"
-- (ex: "Avant" / "Après" pour Fix-on-visit) ou de gérer une liste
-- libre (slot NULL).
--
-- La contrainte d'unicité est posée sur (response_id, question_id,
-- slot) en utilisant NULLS NOT DISTINCT pour que plusieurs lignes
-- avec slot=NULL soient considérées comme en conflit (sinon PG les
-- traite comme distinctes par défaut et on ne pourrait pas garantir
-- l'idempotence de l'upload).
-- Requiert PostgreSQL 15+.
-- =============================================================

ALTER TABLE media_attachments
  ADD COLUMN IF NOT EXISTS slot VARCHAR(30);

DROP INDEX IF EXISTS uq_media_response_question_slot;
CREATE UNIQUE INDEX uq_media_response_question_slot
  ON media_attachments (response_id, question_id, slot) NULLS NOT DISTINCT;

-- Index secondaire pour les requêtes d'export par slot
CREATE INDEX IF NOT EXISTS idx_media_response_slot
  ON media_attachments (response_id, slot);
