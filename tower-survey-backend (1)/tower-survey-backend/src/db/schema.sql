-- Extension requise pour gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================
-- TOWER AUDIT SURVEY BUILDER — SCHEMA POSTGRESQL
-- TELEINFRA / Huawei MS / MTN Cameroon
-- =========================================================

-- --------- 1. ORGANISATIONS & UTILISATEURS ---------------
CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(150) NOT NULL,          -- ex: TELEINFRA
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID REFERENCES organizations(id),
  full_name     VARCHAR(150) NOT NULL,
  matricule     VARCHAR(50) UNIQUE,              -- code FME
  phone         VARCHAR(30),
  email         VARCHAR(150) UNIQUE,
  password_hash TEXT NOT NULL,
  role          VARCHAR(30) NOT NULL DEFAULT 'technician', -- technician | supervisor | admin
  cluster       VARCHAR(50),                     -- Nord, Adamaoua...
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- --------- 2. SITES (Pylônes) -----------------------------
CREATE TABLE sites (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID REFERENCES organizations(id),
  site_code         VARCHAR(50) UNIQUE NOT NULL,   -- code opérateur
  site_name         VARCHAR(150) NOT NULL,
  latitude          DOUBLE PRECISION,
  longitude         DOUBLE PRECISION,
  region            VARCHAR(50),
  cluster           VARCHAR(50),
  site_type         VARCHAR(30),                   -- Macro | Rural | Rooftop | Indoor | Colocation
  tower_owner       VARCHAR(50),                   -- TowerCo | MTN | Partagé
  commissioning_date DATE,
  department        VARCHAR(100),
  arrondissement    VARCHAR(100),
  address_village   VARCHAR(200),
  tower_height_m    DOUBLE PRECISION,
  access_status     VARCHAR(100),
  site_configuration VARCHAR(100),
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- --------- 3. SURVEY BUILDER (Templates dynamiques) -------
CREATE TABLE survey_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID REFERENCES organizations(id),
  name          VARCHAR(150) NOT NULL,     -- ex: "Audit Pylône - Standard v2"
  category      VARCHAR(50),               -- Tower Audit | PM | CM | Safety
  version       INT DEFAULT 1,
  is_active     BOOLEAN DEFAULT true,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE survey_sections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID REFERENCES survey_templates(id) ON DELETE CASCADE,
  title         VARCHAR(150) NOT NULL,     -- ex: "BBU", "Radios", "Cabinets"
  order_index   INT NOT NULL DEFAULT 0,
  icon          VARCHAR(50)                -- pour l'UI mobile
);

CREATE TABLE survey_questions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id        UUID REFERENCES survey_sections(id) ON DELETE CASCADE,
  label             TEXT NOT NULL,
  question_type     VARCHAR(30) NOT NULL,   -- text|number|select|multiselect|boolean|photo|gps|date|signature|scale
  options           JSONB,                  -- pour select/multiselect: ["OK","NOK","N/A"]
  unit              VARCHAR(20),            -- ex: "Ah", "°C", "m"
  is_required       BOOLEAN DEFAULT false,
  order_index       INT NOT NULL DEFAULT 0,
  validation_rules  JSONB,                  -- {"min":0,"max":100} etc.
  conditional_logic JSONB,                  -- {"show_if": {"question_id": "...", "equals": "NOK"}}
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- --------- 4. REPONSES (Soumissions terrain) ---------------
-- client_uuid = généré côté PWA AVANT la sync, garantit idempotence
CREATE TABLE survey_responses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid    UUID UNIQUE NOT NULL,      -- généré offline par le device
  template_id    UUID REFERENCES survey_templates(id),
  site_id        UUID REFERENCES sites(id),
  technician_id  UUID REFERENCES users(id),
  device_id      VARCHAR(100),
  started_at     TIMESTAMPTZ,
  submitted_at   TIMESTAMPTZ,               -- heure de soumission LOCALE (offline)
  synced_at      TIMESTAMPTZ DEFAULT now(), -- heure d'arrivée serveur
  status         VARCHAR(20) DEFAULT 'submitted', -- draft|submitted|reviewed|rejected
  gps_latitude   DOUBLE PRECISION,          -- position réelle à la soumission
  gps_longitude  DOUBLE PRECISION,
  gps_accuracy_m DOUBLE PRECISION,
  reviewed_by    UUID REFERENCES users(id),
  review_comment TEXT
);

CREATE TABLE response_answers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id    UUID REFERENCES survey_responses(id) ON DELETE CASCADE,
  question_id    UUID REFERENCES survey_questions(id),
  value_text     TEXT,
  value_number   NUMERIC,
  value_boolean  BOOLEAN,
  value_json     JSONB                      -- multiselect, scale, etc.
);

-- --------- 5. MEDIA (Photos géolocalisées) ------------------
CREATE TABLE media_attachments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id    UUID REFERENCES survey_responses(id) ON DELETE CASCADE,
  question_id    UUID REFERENCES survey_questions(id),
  file_url       TEXT NOT NULL,             -- S3/MinIO/local path
  file_type      VARCHAR(20),               -- image/jpeg, image/png
  gps_latitude   DOUBLE PRECISION,
  gps_longitude  DOUBLE PRECISION,
  captured_at    TIMESTAMPTZ,
  uploaded_at    TIMESTAMPTZ DEFAULT now(),
  file_size_kb   INT
);

-- --------- 6. INDEXES ---------------------------------------
CREATE INDEX idx_responses_site ON survey_responses(site_id);
CREATE INDEX idx_responses_tech ON survey_responses(technician_id);
CREATE INDEX idx_responses_submitted ON survey_responses(submitted_at);
CREATE INDEX idx_answers_response ON response_answers(response_id);
CREATE INDEX idx_sites_cluster ON sites(cluster);
CREATE INDEX idx_sites_code ON sites(site_code);

-- --------- 7. EMAIL VERIFICATION ----------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'is_email_verified'
  ) THEN
    ALTER TABLE users ADD COLUMN is_email_verified BOOLEAN DEFAULT false;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS email_verifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp_code      VARCHAR(6) NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  used          BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications(user_id);

-- --------- 8. PASSWORD RESET ----------------------------
CREATE TABLE IF NOT EXISTS password_resets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp_code      VARCHAR(6) NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  used          BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
