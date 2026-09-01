-- =============================================================
-- Migration 006 — Verrouillage du rôle utilisateur (V1)
-- =============================================================
-- La colonne `role` existe déjà sur la table `users` (définie dans
-- schema.sql, default 'technician'). On ajoute :
--   1. Une contrainte CHECK pour figer les valeurs possibles à
--      'technician' | 'admin' (l'ancien commentaire mentionnait
--      aussi 'supervisor' mais ce rôle n'est utilisé nulle part).
--   2. Un index sur role pour accélérer les filtres admin.
--   3. Un garde-fou : refuse d'écrire un rôle invalide via la
--      contrainte CHECK (PostgreSQL valide l'UPDATE).
--
-- NOTE MANUELLE (à exécuter après cette migration par l'admin) :
--   L'admin historique créé par le seed (matricule='ADMIN001') a
--   déjà role='admin' dans la base. Si ce n'est PAS le cas (par
--   ex. suite à un import ou une manipulation manuelle), exécutez :
--
--     UPDATE users SET role = 'admin' WHERE matricule = 'ADMIN001';
--
--   Aucun autre utilisateur n'a role='admin' après cette migration.
-- =============================================================

DO $$
BEGIN
  -- Supprime l'éventuelle ancienne CHECK (idempotent)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT users_role_check;
  END IF;
END $$;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('technician', 'admin'));

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_org_role ON users (org_id, role);
