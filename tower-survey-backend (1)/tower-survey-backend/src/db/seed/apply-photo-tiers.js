/**
 * Classification TIER 1/2/3 des questions de type "photo" dans les templates d'audit.
 *
 * Usage : npm run photos:apply-tiers
 *
 * Idempotent : rejouable sans casser un état déjà correct.
 *   - Calcule l'état cible (is_required + conditional_logic) pour chaque photo
 *   - Met à jour uniquement si l'état actuel diffère de l'état cible
 *
 * Règles (cf. CONTEXTE.pdf) :
 *   - TIER 1 : photo obligatoire contractuellement (preuves IHS).
 *     Match par section.title. Liste explicite.
 *   - TIER 2 : photo obligatoire SI au moins une question état de la MÊME section
 *     vaut une valeur de ["NOK","En panne","Défaillant","Non"].
 *     Génère un conditional_logic = { requiredIf: { anyOf: [...] } }.
 *   - TIER 3 : toute autre photo, is_required = false, conditional_logic = null.
 */

require("dotenv").config();
const pool = require("../../config/db");

// Valeurs qui déclenchent l'obligation Tier 2 si présentes dans une section
const TRIGGER_VALUES = ["NOK", "En panne", "Défaillant", "Non"];

// Mapping Tier 1 : nom de section -> motif de match dans le label de la photo.
// On matche en insensible à la casse + sans accents pour rester robuste
// face aux variations de libellés entre Power / Infrastructure.
const TIER1_SECTION_PATTERNS = [
  { sectionPattern: /site identification/i, labelPattern: /site identification plaque|panneau/i },
  { sectionPattern: /site load/i, labelPattern: /compteur de charge/i },
  { sectionPattern: /generator/i, labelPattern: /plaque signal[ée]tique dg/i },
  { sectionPattern: /rectifier/i, labelPattern: /rectifier et modules/i },
  { sectionPattern: /battery/i, labelPattern: /batteries de secours/i },
  { sectionPattern: /solar/i, labelPattern: /installation solaire/i },
  { sectionPattern: /functional checks/i, labelPattern: /ats|automatic transfer/i },
];

function normalize(s) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function classifyPhoto(photoQuestion, sectionQuestions) {
  const sectionTitle = photoQuestion.section_title || "";
  const photoLabel = photoQuestion.label || "";

  // TIER 1
  const tier1Match = TIER1_SECTION_PATTERNS.find(
    (p) => p.sectionPattern.test(sectionTitle) && p.labelPattern.test(photoLabel)
  );
  if (tier1Match) {
    return {
      tier: 1,
      is_required: true,
      conditional_logic: null,
      reason: `Tier 1 (preuve contractuelle IHS) — section "${sectionTitle}"`,
    };
  }

  // TIER 2 : cherche des questions select/boolean de la même section dont les options
  // contiennent une valeur de TRIGGER_VALUES.
  const triggers = sectionQuestions
    .filter((q) => q.id !== photoQuestion.id)
    .filter((q) => q.question_type === "select" || q.question_type === "boolean")
    .filter((q) => Array.isArray(q.options) && q.options.some((o) => TRIGGER_VALUES.includes(o)))
    .map((q) => ({
      question_id: q.id,
      in: q.options.filter((o) => TRIGGER_VALUES.includes(o)),
    }));

  if (triggers.length > 0) {
    return {
      tier: 2,
      is_required: false,
      conditional_logic: { requiredIf: { anyOf: triggers } },
      reason: `Tier 2 (photo conditionnelle) — ${triggers.length} question(s) état dans "${sectionTitle}"`,
    };
  }

  // TIER 3
  return {
    tier: 3,
    is_required: false,
    conditional_logic: null,
    reason: `Tier 3 (libre) — section "${sectionTitle}"`,
  };
}

function jsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Charge tous les templates actifs
    const { rows: templates } = await client.query(
      `SELECT id, name FROM survey_templates WHERE is_active = true`
    );
    if (templates.length === 0) {
      console.log("ℹ️  Aucun template actif trouvé — rien à faire.");
      await client.query("COMMIT");
      return;
    }

    let totalTier1 = 0;
    let totalTier2 = 0;
    let totalTier3 = 0;
    let totalUpdated = 0;
    const tier2ByTemplate = {};

    for (const tpl of templates) {
      console.log(`\n📋 Template: ${tpl.name} (${tpl.id})`);

      const { rows: sections } = await client.query(
        `SELECT id, title, order_index FROM survey_sections WHERE template_id = $1 ORDER BY order_index ASC`,
        [tpl.id]
      );
      const sectionIds = sections.map((s) => s.id);

      if (sectionIds.length === 0) {
        console.log("   ⚠️  Aucune section — ignoré.");
        continue;
      }

      const { rows: questions } = await client.query(
        `SELECT id, section_id, label, question_type, options, is_required, conditional_logic
         FROM survey_questions
         WHERE section_id = ANY($1::uuid[])
         ORDER BY order_index ASC`,
        [sectionIds]
      );

      const sectionTitleById = new Map(sections.map((s) => [s.id, s.title]));
      const sectionQuestions = (sid) => questions
        .filter((q) => q.section_id === sid)
        .map((q) => ({ ...q, section_title: sectionTitleById.get(sid) }));

      const photos = questions.filter((q) => q.question_type === "photo");
      let t1 = 0, t2 = 0, t3 = 0, upd = 0;
      const tier2Sections = new Set();

      for (const photo of photos) {
        // Enrichir la photo avec son titre de section pour la classification
        const photoEnriched = { ...photo, section_title: sectionTitleById.get(photo.section_id) };
        const target = classifyPhoto(photoEnriched, sectionQuestions(photo.section_id));
        if (target.tier === 1) t1++;
        else if (target.tier === 2) {
          t2++;
          tier2Sections.add(sectionTitleById.get(photo.section_id));
        } else t3++;

        const currentLogic = photo.conditional_logic || null;
        const needsUpdate =
          !!photo.is_required !== target.is_required ||
          !jsonEqual(currentLogic, target.conditional_logic);

        if (needsUpdate) {
          await client.query(
            `UPDATE survey_questions
             SET is_required = $1, conditional_logic = $2
             WHERE id = $3`,
            [target.is_required, target.conditional_logic ? JSON.stringify(target.conditional_logic) : null, photo.id]
          );
          upd++;
        }
      }

      totalTier1 += t1;
      totalTier2 += t2;
      totalTier3 += t3;
      totalUpdated += upd;
      tier2ByTemplate[tpl.name] = Array.from(tier2Sections);

      console.log(`   Tier 1 : ${t1}  |  Tier 2 : ${t2}  |  Tier 3 : ${t3}  |  Mises à jour : ${upd}`);
      if (tier2Sections.size > 0) {
        console.log(`   Sections Tier 2 : ${Array.from(tier2Sections).join(", ")}`);
      }
    }

    await client.query("COMMIT");

    console.log("\n" + "=".repeat(60));
    console.log("✅ Classification TIER 1/2/3 appliquée avec succès");
    console.log("=".repeat(60));
    console.log(`Tier 1 (toujours obligatoire) : ${totalTier1} question(s)`);
    console.log(`Tier 2 (conditionnel)         : ${totalTier2} question(s)`);
    console.log(`Tier 3 (libre)                : ${totalTier3} question(s)`);
    console.log(`Lignes mises à jour           : ${totalUpdated}`);
    for (const [name, sections] of Object.entries(tier2ByTemplate)) {
      if (sections.length > 0) {
        console.log(`  → ${name} : sections Tier 2 = ${sections.join(", ")}`);
      }
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Erreur :", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
