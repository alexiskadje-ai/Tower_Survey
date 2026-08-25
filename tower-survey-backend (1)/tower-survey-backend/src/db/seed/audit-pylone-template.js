/**
 * Seed du template "Audit Pylône Standard" — TELEINFRA
 * Usage : npm run db:seed
 *
 * Crée (si absent) : une organisation par défaut, un compte admin,
 * et le template complet avec ses sections et questions.
 */
const bcrypt = require("bcrypt");
const pool = require("../../config/db");

// Options réutilisables
const OK_NOK_NA = ["OK", "NOK", "N/A"];
const YES_NO = ["Oui", "Non"];

// Définition déclarative du template — reflète les catégories métier définies plus haut
const SECTIONS = [
  {
    title: "Structure Pylône",
    icon: "tower",
    questions: [
      { label: "Type de pylône", type: "select", options: ["Treillis (Lattice)", "Monopole", "Haubané (Guyed)", "Rooftop"], required: true },
      { label: "Hauteur totale (m)", type: "number", unit: "m", required: true },
      { label: "Nombre de niveaux / plateformes", type: "number" },
      { label: "État peinture / corrosion", type: "select", options: OK_NOK_NA, required: true },
      { label: "État des échelons / anti-chute (safety climb)", type: "select", options: OK_NOK_NA, required: true },
      { label: "Éclairage aviation fonctionnel", type: "select", options: YES_NO, required: true },
      { label: "Mise à la terre / paratonnerre — continuité vérifiée", type: "select", options: OK_NOK_NA },
      { label: "Fondation — fissures ou affaissement visible", type: "select", options: YES_NO },
      { label: "Photo générale du pylône", type: "photo", required: true },
    ],
  },
  {
    title: "BBU (Baseband Unit)",
    icon: "server",
    questions: [
      { label: "Modèle BBU", type: "text", required: true },
      { label: "Nombre de BBU installées", type: "number" },
      { label: "Statut BBU", type: "select", options: ["Actif", "En panne", "Standby"], required: true },
      { label: "Alarmes actives sur BBU", type: "select", options: YES_NO },
      { label: "Détail des alarmes (si applicable)", type: "text" },
      { label: "Version logiciel", type: "text" },
      { label: "Photo BBU / cabinet ouvert", type: "photo", required: true },
    ],
  },
  {
    title: "Radios (RRU / AAU)",
    icon: "radio",
    questions: [
      { label: "Nombre de radios par secteur", type: "number" },
      { label: "Modèle radio (RRU/RRH/AAU)", type: "text" },
      { label: "Bande(s) de fréquence", type: "multiselect", options: ["900 MHz", "1800 MHz", "2100 MHz", "2600 MHz", "3500 MHz"] },
      { label: "Technologie", type: "multiselect", options: ["2G", "3G", "4G", "5G"] },
      { label: "État fixation / câblage / étanchéité", type: "select", options: OK_NOK_NA, required: true },
      { label: "Photo radios par secteur", type: "photo", required: true },
    ],
  },
  {
    title: "Cabinets & Alimentation",
    icon: "battery",
    questions: [
      { label: "Type de cabinet", type: "select", options: ["Indoor", "Outdoor"] },
      { label: "État physique du cabinet (portes, joints, ventilation)", type: "select", options: OK_NOK_NA, required: true },
      { label: "Rectifieur — modules actifs / en panne", type: "text" },
      { label: "Batteries — état de santé général", type: "select", options: OK_NOK_NA, required: true },
      { label: "Âge des batteries (années)", type: "number", unit: "ans" },
      { label: "Générateur présent", type: "select", options: YES_NO },
      { label: "Niveau carburant générateur (%)", type: "number", unit: "%" },
      { label: "Source secteur (ENEO) disponible", type: "select", options: YES_NO },
      { label: "Climatisation / free cooling fonctionnel", type: "select", options: OK_NOK_NA },
      { label: "Photo compteur générateur / carburant", type: "photo" },
    ],
  },
  {
    title: "Sécurité & Environnement",
    icon: "shield",
    questions: [
      { label: "Clôture / enceinte en bon état", type: "select", options: OK_NOK_NA },
      { label: "Gardiennage présent", type: "select", options: YES_NO },
      { label: "Extincteur présent et valide", type: "select", options: OK_NOK_NA },
      { label: "Signalisation danger / radiations visible", type: "select", options: YES_NO },
      { label: "Commentaires / anomalies constatées", type: "text" },
    ],
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Organisation par défaut
    let { rows: orgRows } = await client.query(
      `SELECT id FROM organizations WHERE name = 'TELEINFRA Cameroon' LIMIT 1`
    );
    let orgId;
    if (orgRows.length === 0) {
      const { rows } = await client.query(
        `INSERT INTO organizations (name) VALUES ('TELEINFRA Cameroon') RETURNING id`
      );
      orgId = rows[0].id;
      console.log("✅ Organisation créée:", orgId);
    } else {
      orgId = orgRows[0].id;
      console.log("ℹ️  Organisation déjà existante:", orgId);
    }

    // 2. Compte admin par défaut (à changer immédiatement après premier login)
    const { rows: existingAdmin } = await client.query(
      `SELECT id FROM users WHERE matricule = 'ADMIN001' LIMIT 1`
    );
    if (existingAdmin.length === 0) {
      const passwordHash = await bcrypt.hash("ChangeMe123!", 10);
      await client.query(
        `INSERT INTO users (org_id, full_name, matricule, role, password_hash, is_email_verified)
         VALUES ($1, 'Administrateur Système', 'ADMIN001', 'admin', $2, true)`,
        [orgId, passwordHash]
      );
      console.log("✅ Compte admin créé — matricule: ADMIN001 / mot de passe: ChangeMe123!");
      console.log("   ⚠️  À changer immédiatement en production.");
    } else {
      console.log("ℹ️  Compte admin déjà existant.");
    }

    // 3. Template "Audit Pylône Standard"
    const { rows: existingTemplate } = await client.query(
      `SELECT id FROM survey_templates WHERE org_id = $1 AND name = 'Audit Pylône Standard' LIMIT 1`,
      [orgId]
    );

    if (existingTemplate.length > 0) {
      console.log("ℹ️  Template 'Audit Pylône Standard' déjà existant — seed ignoré (supprime-le en DB pour ré-exécuter).");
      await client.query("COMMIT");
      return;
    }

    const { rows: adminRow } = await client.query(
      `SELECT id FROM users WHERE matricule = 'ADMIN001' LIMIT 1`
    );

    const { rows: templateRows } = await client.query(
      `INSERT INTO survey_templates (org_id, name, category, version, created_by)
       VALUES ($1, 'Audit Pylône Standard', 'Tower Audit', 1, $2)
       RETURNING id`,
      [orgId, adminRow[0].id]
    );
    const templateId = templateRows[0].id;
    console.log("✅ Template créé:", templateId);

    let sectionOrder = 0;
    for (const section of SECTIONS) {
      const { rows: sectionRows } = await client.query(
        `INSERT INTO survey_sections (template_id, title, order_index, icon)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [templateId, section.title, sectionOrder++, section.icon]
      );
      const sectionId = sectionRows[0].id;

      let questionOrder = 0;
      for (const q of section.questions) {
        await client.query(
          `INSERT INTO survey_questions
             (section_id, label, question_type, options, unit, is_required, order_index)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            sectionId,
            q.label,
            q.type,
            q.options ? JSON.stringify(q.options) : null,
            q.unit || null,
            !!q.required,
            questionOrder++,
          ]
        );
      }
      console.log(`   ↳ Section "${section.title}" : ${section.questions.length} questions insérées`);
    }

    await client.query("COMMIT");
    console.log("🎉 Seed terminé avec succès.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Erreur pendant le seed:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
