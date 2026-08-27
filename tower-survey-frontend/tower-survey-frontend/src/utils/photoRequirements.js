/**
 * Évaluation de la règle `conditional_logic.requiredIf` pour les questions photo Tier 2.
 *
 * Format de la règle (généré par le script backend `apply-photo-tiers.js`) :
 * {
 *   "requiredIf": {
 *     "anyOf": [
 *       { "question_id": "<uuid>", "in": ["NOK", "En panne", "Défaillant", "Non"] },
 *       { "question_id": "<uuid>", "in": ["..."] }
 *     ]
 *   }
 * }
 *
 * La règle se déclenche (la photo devient obligatoire) si AU MOINS UNE condition
 * de la liste `anyOf` est satisfaite — c'est-à-dire si la réponse à la question
 * `question_id` est dans le tableau `in` associé.
 *
 * Cette fonction est PURE (pas de side-effect, pas de dépendance React).
 * Elle est testable indépendamment avec des entrées en dur.
 */

/**
 * @param {object|undefined|null} rule - L'objet conditional_logic d'une question
 * @param {object} answersMap - Map { questionId: value } (valeur courante du formulaire)
 * @returns {boolean} true si la règle se déclenche (la photo est requise)
 */
export function evaluateRequiredIf(rule, answersMap) {
  if (!rule || typeof rule !== "object") return false;
  const requiredIf = rule.requiredIf;
  if (!requiredIf || !Array.isArray(requiredIf.anyOf) || requiredIf.anyOf.length === 0) {
    return false;
  }

  return requiredIf.anyOf.some((cond) => {
    if (!cond || typeof cond.question_id !== "string" || !Array.isArray(cond.in)) return false;
    const answer = answersMap?.[cond.question_id];
    if (answer === undefined || answer === null || answer === "") return false;
    // Comparaison insensible à la casse + trim pour absorber les variations UI
    const normalized = String(answer).trim().toLowerCase();
    return cond.in.some((v) => String(v).trim().toLowerCase() === normalized);
  });
}

/**
 * Calcule la liste des questions photo d'une section qui sont actuellement
 * obligatoires (Tier 1 OU Tier 2 déclenché), avec un message d'erreur
 * si la photo est manquante.
 *
 * @param {Array} sectionQuestions - Questions de la section courante
 * @param {object} answersMap - Map des réponses { questionId: value }
 * @param {object} photosMap - Map des photos déjà prises { questionId: { previewUrl, blob, ... } }
 * @returns {Array<{ question, missing: boolean, triggered: boolean, reason: 'tier1'|'tier2'|'tier3' }>}
 */
export function getPhotoRequirements(sectionQuestions, answersMap, photosMap) {
  if (!Array.isArray(sectionQuestions)) return [];
  return sectionQuestions
    .filter((q) => q.question_type === "photo")
    .map((question) => {
      const triggered = evaluateRequiredIf(question.conditional_logic, answersMap);
      const isTier1 = !!question.is_required;
      const required = isTier1 || triggered;
      const hasPhoto = !!photosMap?.[question.id]?.previewUrl;
      return {
        question,
        required,
        missing: required && !hasPhoto,
        triggered,
        reason: isTier1 ? "tier1" : triggered ? "tier2" : "tier3",
      };
    });
}
