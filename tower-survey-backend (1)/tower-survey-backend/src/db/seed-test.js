const p = require('../config/db');
(async () => {
  // Find or create a site
  let site = await p.query("SELECT id FROM sites LIMIT 1");
  let siteId;
  if (site.rows.length > 0) {
    siteId = site.rows[0].id;
  } else {
    const s = await p.query(
      "INSERT INTO sites (site_code, site_name) VALUES ('TEST001', 'Test Site') RETURNING id"
    );
    siteId = s.rows[0].id;
  }

  // Get a photo question
  const q = await p.query("SELECT id, validation_rules FROM survey_questions WHERE question_type = 'photo' LIMIT 1");
  if (q.rows.length === 0) {
    console.log('No photo question found, cannot test photo features');
    await p.end();
    return;
  }
  const photoQ = q.rows[0];
  console.log('Photo question:', photoQ.id, 'rules:', photoQ.validation_rules);

  // Find or create a response
  const tech = await p.query("SELECT id FROM users WHERE role = 'technician' LIMIT 1");
  const tpl = await p.query("SELECT id FROM survey_templates LIMIT 1");
  if (tech.rows.length === 0 || tpl.rows.length === 0) {
    console.log('Missing technician or template');
    await p.end();
    return;
  }

  const resp = await p.query(
    `INSERT INTO survey_responses (client_uuid, template_id, site_id, technician_id, status, submitted_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'submitted', now())
     RETURNING id`,
    [tpl.rows[0].id, siteId, tech.rows[0].id]
  );
  const responseId = resp.rows[0].id;
  console.log('Created response:', responseId);

  // Insert 3 media: 1 with slot='Avant', 1 with slot='Après', 1 with slot=NULL (multi-style)
  await p.query(
    `INSERT INTO media_attachments (response_id, question_id, slot, file_url) VALUES ($1, $2, 'Avant', '/uploads/test-avant.jpg')`,
    [responseId, photoQ.id]
  );
  await p.query(
    `INSERT INTO media_attachments (response_id, question_id, slot, file_url) VALUES ($1, $2, 'Après', '/uploads/test-apres.jpg')`,
    [responseId, photoQ.id]
  );
  await p.query(
    `INSERT INTO media_attachments (response_id, question_id, slot, file_url) VALUES ($1, $2, NULL, '/uploads/test-null1.jpg')`,
    [responseId, photoQ.id]
  );
  console.log('Inserted 3 media rows: 2 named slots, 1 NULL');

  // Now update the question validation_rules to have photo_slots
  await p.query(
    "UPDATE survey_questions SET validation_rules = $1::jsonb WHERE id = $2",
    [JSON.stringify({ photo_slots: ["Avant", "Après"] }), photoQ.id]
  );
  console.log('Updated question validation_rules to have photo_slots');

  // Create a second question for multi-mode
  const q2 = await p.query(
    `SELECT id FROM survey_questions WHERE question_type = 'photo' AND id != $1 LIMIT 1`,
    [photoQ.id]
  );
  if (q2.rows.length > 0) {
    await p.query(
      "UPDATE survey_questions SET validation_rules = $1::jsonb WHERE id = $2",
      [JSON.stringify({ photo_multi: true, photo_max: 4 }), q2.rows[0].id]
    );
    console.log('Set multi-mode on second photo question:', q2.rows[0].id);
  }

  // Output
  console.log('site_id=' + siteId);
  console.log('response_id=' + responseId);
  console.log('photo_q_id=' + photoQ.id);

  await p.end();
})().catch(e => { console.error('err', e.message); process.exit(1); });
