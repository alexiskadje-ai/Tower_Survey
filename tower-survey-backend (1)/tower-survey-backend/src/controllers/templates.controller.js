const pool = require("../config/db");

/**
 * GET /api/templates/active
 * Retourne le(s) template(s) actif(s) avec sections + questions imbriquées,
 * pour mise en cache complète côté PWA (fonctionnement offline).
 */
async function getActiveTemplates(req, res, next) {
  try {
    const { rows: templates } = await pool.query(
      `SELECT id, name, category, version
       FROM survey_templates
       WHERE org_id = $1 AND is_active = true
       ORDER BY name ASC`,
      [req.user.orgId]
    );

    if (templates.length === 0) return res.json({ templates: [] });

    const templateIds = templates.map((t) => t.id);

    const { rows: sections } = await pool.query(
      `SELECT id, template_id, title, order_index, icon
       FROM survey_sections
       WHERE template_id = ANY($1)
       ORDER BY order_index ASC`,
      [templateIds]
    );

    const sectionIds = sections.map((s) => s.id);
    let questions = [];
    if (sectionIds.length > 0) {
      const { rows } = await pool.query(
        `SELECT id, section_id, label, question_type, options, unit,
                is_required, order_index, validation_rules, conditional_logic
         FROM survey_questions
         WHERE section_id = ANY($1)
         ORDER BY order_index ASC`,
        [sectionIds]
      );
      questions = rows;
    }

    // Assemblage imbriqué : template -> sections -> questions
    const result = templates.map((t) => ({
      ...t,
      sections: sections
        .filter((s) => s.template_id === t.id)
        .map((s) => ({
          ...s,
          questions: questions.filter((q) => q.section_id === s.id),
        })),
    }));

    res.json({ templates: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { getActiveTemplates };
