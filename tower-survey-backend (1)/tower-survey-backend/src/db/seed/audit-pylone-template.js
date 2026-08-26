/**
 * Seed des templates "Power Audit" et "Site Infrastructure" — TELEINFRA
 * Usage : npm run db:seed
 *
 * Crée (si absent) : une organisation par défaut, un compte admin,
 * et les deux templates (un par feuille du fichier Excel IHS_SBC_Site_Audit_Simplified_Template.xlsx).
 */
const bcrypt = require("bcrypt");
const pool = require("../../config/db");

// Options réutilisables
const YES_NO_NA = ["Yes", "No", "N/A"];
const PASS_FAIL_NA = ["Pass", "Fail", "N/A"];
const GOOD_FAIR_POOR_NA = ["Good", "Fair", "Poor", "N/A"];

// ============================================================================
// FORM 1 : POWER & ENERGY AUDIT (feuille 01_Power_Audit)
// ============================================================================
const POWER_AUDIT_SECTIONS = [
  {
    title: "Site Identification",
    icon: "map-pin",
    questions: [
      { label: "IHS Site ID", type: "text", required: true },
      { label: "Site Name", type: "text", required: true },
      { label: "Site ID / Reference", type: "text", required: true },
      { label: "Region / State", type: "text", required: true },
      { label: "SBC / Vendor", type: "text", required: true },
      { label: "Audit Date", type: "date", required: true },
      { label: "Auditor Name(s)", type: "text", required: true },
      { label: "Number of Tenants", type: "number", required: true },
    ],
  },
  {
    title: "Generator – Main Data",
    icon: "zap",
    questions: [
      { label: "Generator 1 – Type", type: "select", options: ["Diesel", "Gas", "Solar", "Hybrid", "Other"], required: true },
      { label: "Generator 1 – Brand / Make", type: "text", required: true },
      { label: "Generator 1 – Capacity", type: "number", unit: "kVA", required: true },
      { label: "Generator 1 – Rated Power Factor", type: "number", unit: "PF", required: true },
      { label: "Generator 1 – Running Hours", type: "number", unit: "h", required: true },
      { label: "Generator 1 – Condition", type: "select", options: GOOD_FAIR_POOR_NA, required: true },
      { label: "Generator 1 – Current Load", type: "number", unit: "A", required: true },
      { label: "Generator 1 – Measured/Estimated Load", type: "select", options: ["Measured", "Estimated"], required: true },
      { label: "Generator 2 – Type", type: "text", required: true },
      { label: "Generator 2 – Brand / Make", type: "text", required: true },
      { label: "Generator 2 – Capacity", type: "number", unit: "kVA", required: true },
      { label: "Generator 2 – Rated Power Factor", type: "number", unit: "PF", required: true },
      { label: "Generator 2 – Running Hours", type: "number", unit: "h", required: true },
      { label: "Generator 2 – Condition", type: "select", options: GOOD_FAIR_POOR_NA, required: true },
    ],
  },
  {
    title: "Site Load Calculation",
    icon: "calculator",
    questions: [
      { label: "Measured Site Load", type: "number", unit: "kW", required: true },
      { label: "Generator Rated Capacity", type: "number", unit: "kVA", required: true },
      { label: "Generator Power Factor Used", type: "number", unit: "PF", required: true },
      { label: "Generator Rated Power", type: "number", unit: "kW", required: true },
      { label: "Generator Utilization / Loading", type: "number", unit: "%", required: true },
      { label: "Site Load Source", type: "select", options: ["Controller", "Meter", "Calculation"], required: true },
      { label: "Site Categorization", type: "text", required: true },
      { label: "Load Comments", type: "text", required: true },
    ],
  },
  {
    title: "Rectifier / DC Power",
    icon: "cpu",
    questions: [
      { label: "Rectifier Brand / Make", type: "text", required: true },
      { label: "Module Rating", type: "number", unit: "kW", required: true },
      { label: "Number of Slots Available", type: "number", required: true },
      { label: "Number of Slots Used", type: "number", required: true },
      { label: "Rectifier Rated Capacity", type: "number", unit: "kW", required: true },
      { label: "Rectifier Used Power", type: "number", unit: "kW", required: true },
      { label: "Extra DC-DC / AC-DC Slot Available", type: "select", options: YES_NO_NA, required: true },
      { label: "Upgrade Recommendation", type: "text", required: true },
    ],
  },
  {
    title: "Battery",
    icon: "battery-charging",
    questions: [
      { label: "Battery Type", type: "text", required: true },
      { label: "Battery Brand / Make", type: "text", required: true },
      { label: "Number of Battery Blocks", type: "number", required: true },
      { label: "Capacity per Block", type: "number", unit: "Ah", required: true },
      { label: "Total Installed Capacity", type: "number", unit: "Ah", required: true },
      { label: "Battery Autonomy", type: "number", unit: "h", required: true },
      { label: "Charging Coefficient", type: "number", required: true },
      { label: "Battery Condition", type: "select", options: GOOD_FAIR_POOR_NA, required: true },
      { label: "Upgrade Recommendation", type: "text", required: true },
    ],
  },
  {
    title: "Solar",
    icon: "sun",
    questions: [
      { label: "PV Available", type: "select", options: YES_NO_NA, required: true },
      { label: "PV Brand / Make", type: "text", required: true },
      { label: "PV Quantity", type: "number", required: true },
      { label: "PV Module Capacity", type: "number", unit: "Wp", required: true },
      { label: "Total Installed PV Capacity", type: "number", unit: "kWp", required: true },
      { label: "Solar Charger Brand / Make", type: "text", required: true },
      { label: "Solar Charger Current", type: "number", unit: "A", required: true },
      { label: "Solar Charger Voltage", type: "number", unit: "V", required: true },
      { label: "Solar Panel Condition", type: "select", options: GOOD_FAIR_POOR_NA, required: true },
      { label: "Recommended PV Size", type: "number", unit: "kWp", required: true },
      { label: "Recommended Battery Addition", type: "text", unit: "kWh / Ah", required: true },
      { label: "Solar Feasibility Rating", type: "select", options: ["High", "Medium", "Low", "Not Feasible"], required: true },
      { label: "Solar Comments", type: "text", required: true },
    ],
  },
  {
    title: "Functional Checks & Photos",
    icon: "camera",
    questions: [
      { label: "Mains–DG–Battery Changeover", type: "select", options: PASS_FAIL_NA, required: true },
      { label: "Alarm Reporting to NOC", type: "select", options: PASS_FAIL_NA, required: true },
      { label: "Earthing / Lightning Protection", type: "select", options: PASS_FAIL_NA, required: true },
      { label: "DC / AC Distribution Board", type: "select", options: GOOD_FAIR_POOR_NA, required: true },
      { label: "Overall Power Chain", type: "select", options: ["Functional", "Partial", "Non-Functional", "N/A"], required: true },
      { label: "Before/After Photos Captured", type: "select", options: YES_NO_NA, required: true },
      { label: "Open Follow-Up Item", type: "select", options: YES_NO_NA, required: true },
      { label: "Follow-Up Comments", type: "text", required: true },
    ],
  },
];

// ============================================================================
// FORM 2 : SITE INFRASTRUCTURE AUDIT (feuille 02_Site_Infra)
// ============================================================================
const SITE_INFRA_SECTIONS = [
  {
    title: "Site Identification",
    icon: "map-pin",
    questions: [
      { label: "IHS Site ID", type: "text", required: true },
      { label: "Site Name", type: "text", required: true },
      { label: "Region / State", type: "text", required: true },
      { label: "SBC / Vendor", type: "text", required: true },
      { label: "Audit Date", type: "date", required: true },
      { label: "Auditor Name(s)", type: "text", required: true },
    ],
  },
  {
    title: "Shelter / Cooling",
    icon: "home",
    questions: [
      { label: "Number of Shelters", type: "number", required: true },
      { label: "Shelter Type", type: "text", required: true },
      { label: "Shelter Condition", type: "select", options: GOOD_FAIR_POOR_NA, required: true },
      { label: "Number of AC Units", type: "number", required: true },
      { label: "AC Capacity", type: "number", unit: "HP", required: true },
      { label: "AC Type", type: "text", required: true },
      { label: "Cooling Unit Brand / Make", type: "text", required: true },
      { label: "Cooling Unit Condition", type: "select", options: GOOD_FAIR_POOR_NA, required: true },
      { label: "Shelter Temperature", type: "number", unit: "°C", required: true },
      { label: "Heat Extractor", type: "select", options: YES_NO_NA, required: true },
      { label: "Cooling Upgrade Recommendation", type: "text", required: true },
    ],
  },
  {
    title: "ATS / Diesel Tank",
    icon: "fuel",
    questions: [
      { label: "ATS Available", type: "select", options: YES_NO_NA, required: true },
      { label: "ATS Capacity", type: "number", required: true },
      { label: "ATS Brand / Make", type: "text", required: true },
      { label: "ATS Condition", type: "select", options: GOOD_FAIR_POOR_NA, required: true },
      { label: "Diesel Tank Capacity", type: "number", unit: "Litres", required: true },
      { label: "Tank Type", type: "text", required: true },
      { label: "Tank Shape", type: "text", required: true },
      { label: "Tank Condition", type: "select", options: GOOD_FAIR_POOR_NA, required: true },
      { label: "Water Separator Available", type: "select", options: YES_NO_NA, required: true },
      { label: "Water Separator Condition", type: "select", options: GOOD_FAIR_POOR_NA, required: true },
    ],
  },
  {
    title: "Grid / Gas / Generator Feasibility",
    icon: "lightbulb",
    questions: [
      { label: "Grid Connected", type: "select", options: YES_NO_NA, required: true },
      { label: "Grid Connection Type", type: "text", required: true },
      { label: "Pipeline Owner", type: "text", required: true },
      { label: "Pipeline Accessibility", type: "select", options: ["Accessible", "Not Accessible"], required: true },
      { label: "Gas Pressure Available", type: "select", options: YES_NO_NA, required: true },
      { label: "Gas Type", type: "text", required: true },
      { label: "Generator Type", type: "text", required: true },
      { label: "Existing Generator Capacity", type: "number", unit: "kVA", required: true },
      { label: "Gas Generator Feasible", type: "select", options: YES_NO_NA, required: true },
      { label: "Infrastructure Requirements", type: "text", required: true },
      { label: "Safety Constraints", type: "text", required: true },
      { label: "Regulatory Constraints", type: "text", required: true },
      { label: "Overall Feasibility Rating", type: "text", required: true },
      { label: "Comments", type: "text", required: true },
    ],
  },
  {
    title: "Site Space / Solar Feasibility",
    icon: "maximize",
    questions: [
      { label: "Available Space for Solar", type: "select", options: YES_NO_NA, required: true },
      { label: "Space Type", type: "select", options: ["Roof", "Ground", "Tower Compound"], required: true },
      { label: "Shading Assessment", type: "select", options: ["None", "Partial", "Significant"], required: true },
      { label: "Structural Load Suitability", type: "select", options: ["Suitable", "Review Required", "Not Suitable"], required: true },
      { label: "Existing Load Profile Reviewed", type: "select", options: YES_NO_NA, required: true },
      { label: "Recommended PV Size", type: "number", unit: "kWp", required: true },
      { label: "Recommended Battery Addition", type: "text", unit: "kWh / Ah", required: true },
      { label: "Estimated DG Run-Hour Reduction", type: "number", unit: "%", required: true },
      { label: "Overall Solar Rating", type: "select", options: ["High", "Medium", "Low", "Not Feasible"], required: true },
      { label: "Solar Comments", type: "text", required: true },
    ],
  },
  {
    title: "Minor Fix / Closure",
    icon: "tool",
    questions: [
      { label: "Breaker / MCB Fault Identified", type: "select", options: YES_NO_NA, required: true },
      { label: "Replacement Required", type: "select", options: YES_NO_NA, required: true },
      { label: "Free-Issued by IHS", type: "select", options: YES_NO_NA, required: true },
      { label: "Replacement Completed", type: "select", options: YES_NO_NA, required: true },
      { label: "Rectifier Module Fault Identified", type: "select", options: YES_NO_NA, required: true },
      { label: "Rectifier Replacement Required", type: "select", options: YES_NO_NA, required: true },
      { label: "Rectifier Free-Issued by IHS", type: "select", options: YES_NO_NA, required: true },
      { label: "Rectifier Replacement Completed", type: "select", options: YES_NO_NA, required: true },
      { label: "Other Minor Fix Description", type: "text", required: true },
      { label: "Free-Issue Material Required", type: "select", options: YES_NO_NA, required: true },
      { label: "Other Fix Completed", type: "select", options: YES_NO_NA, required: true },
      { label: "Date Completed", type: "date", required: true },
      { label: "Before / After Photos", type: "select", options: YES_NO_NA, required: true },
      { label: "Open Follow-Up Required", type: "select", options: YES_NO_NA, required: true },
      { label: "Follow-Up Comments", type: "text", required: true },
    ],
  },
];

const TEMPLATES = [
  {
    name: "IHS Power & Energy Audit",
    category: "Power Audit",
    sections: POWER_AUDIT_SECTIONS,
  },
  {
    name: "IHS Site Infrastructure Audit",
    category: "Site Infrastructure",
    sections: SITE_INFRA_SECTIONS,
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

    // 3. Nettoyage des anciens templates IHS (catégories Power Audit & Site Infrastructure)
    const { rows: existingTemplates } = await client.query(
      `SELECT id FROM survey_templates WHERE org_id = $1 AND category IN ('Power Audit', 'Site Infrastructure', 'Tower Audit')`,
      [orgId]
    );

    if (existingTemplates.length > 0) {
      const ids = existingTemplates.map((t) => t.id);
      const sectionIds = await client.query(`SELECT id FROM survey_sections WHERE template_id = ANY($1::uuid[])`, [ids]).then(r => r.rows.map(s => s.id));
      const responseIds = await client.query(`SELECT id FROM survey_responses WHERE template_id = ANY($1::uuid[])`, [ids]).then(r => r.rows.map(r => r.id));
      const questionIds = sectionIds.length > 0 ? await client.query(`SELECT id FROM survey_questions WHERE section_id = ANY($1::uuid[])`, [sectionIds]).then(r => r.rows.map(q => q.id)) : [];

      if (responseIds.length > 0) {
        await client.query(`DELETE FROM media_attachments WHERE response_id = ANY($1::uuid[])`, [responseIds]);
        await client.query(`DELETE FROM response_answers WHERE response_id = ANY($1::uuid[])`, [responseIds]);
      }
      if (questionIds.length > 0) {
        await client.query(`DELETE FROM response_answers WHERE question_id = ANY($1::uuid[])`, [questionIds]);
      }
      if (responseIds.length > 0) {
        await client.query(`DELETE FROM survey_responses WHERE id = ANY($1::uuid[])`, [responseIds]);
      }
      if (questionIds.length > 0) {
        await client.query(`DELETE FROM survey_questions WHERE id = ANY($1::uuid[])`, [questionIds]);
      }
      await client.query(`DELETE FROM survey_sections WHERE template_id = ANY($1::uuid[])`, [ids]);
      await client.query(`DELETE FROM survey_templates WHERE id = ANY($1::uuid[])`, [ids]);
      console.log(`ℹ️  ${existingTemplates.length} ancien(s) template(s) supprimé(s) — recréation en cours.`);
    }

    const { rows: adminRow } = await client.query(
      `SELECT id FROM users WHERE matricule = 'ADMIN001' LIMIT 1`
    );

    // 4. Création des deux templates
    for (const tpl of TEMPLATES) {
      const { rows: templateRows } = await client.query(
        `INSERT INTO survey_templates (org_id, name, category, version, created_by)
         VALUES ($1, $2, $3, 1, $4)
         RETURNING id`,
        [orgId, tpl.name, tpl.category, adminRow[0].id]
      );
      const templateId = templateRows[0].id;
      console.log(`✅ Template créé: ${tpl.name} (${tpl.category}) — ${templateId}`);

      let sectionOrder = 0;
      for (const section of tpl.sections) {
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
