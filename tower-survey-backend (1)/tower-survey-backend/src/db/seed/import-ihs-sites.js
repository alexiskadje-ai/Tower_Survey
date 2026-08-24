const xlsx = require("xlsx");
const path = require("path");
const pool = require("../../config/db");

const EXCEL_PATH = path.join(__dirname, "../../../864112967-List-of-Sites-IHS-Cameroon-Juillet-2024.xlsx");

async function importSites() {
  const workbook = xlsx.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  if (rows.length < 2) {
    console.log("Aucune donnée à importer.");
    return;
  }

  const headers = rows[0];
  console.log("Headers:", headers);

  const dataRows = rows.slice(1).filter((r) => r && String(r[1]).trim());

  let inserted = 0;
  let skipped = 0;

  for (const row of dataRows) {
    const siteCode = String(row[1] || "").trim();
    if (!siteCode) {
      skipped++;
      continue;
    }

    const region = String(row[2] || "").trim() || null;
    const department = String(row[3] || "").trim() || null;
    const arrondissement = String(row[4] || "").trim() || null;
    const addressVillage = String(row[5] || "").trim() || null;
    const siteType = String(row[6] || "").trim() || null;
    const heightRaw = row[7];
    const towerHeight = typeof heightRaw === "number" ? heightRaw : Number(heightRaw) || null;

    const siteName = [addressVillage, region].filter(Boolean).join(", ") || siteCode;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let { rows: orgRows } = await client.query("SELECT id FROM organizations LIMIT 1");
      let orgId;
      if (orgRows.length === 0) {
        const { rows } = await client.query(
          "INSERT INTO organizations (name) VALUES ('IHS Cameroon') RETURNING id"
        );
        orgId = rows[0].id;
      } else {
        orgId = orgRows[0].id;
      }

      await client.query(
        `INSERT INTO sites (org_id, site_code, site_name, region, site_type, department, arrondissement, address_village, tower_height_m)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (site_code) DO UPDATE SET
           site_name = EXCLUDED.site_name,
           region = EXCLUDED.region,
           site_type = EXCLUDED.site_type,
           department = EXCLUDED.department,
           arrondissement = EXCLUDED.arrondissement,
           address_village = EXCLUDED.address_village,
           tower_height_m = EXCLUDED.tower_height_m`,
        [orgId, siteCode, siteName, region, siteType, department, arrondissement, addressVillage, towerHeight]
      );

      await client.query("COMMIT");
      inserted++;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`Erreur pour ${siteCode}:`, err.message);
      skipped++;
    } finally {
      client.release();
    }
  }

  await pool.end();
  console.log(`Import terminé: ${inserted} sites importés, ${skipped} ignorés/erreurs.`);
}

importSites();
