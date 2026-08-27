const xlsx = require("xlsx");
const path = require("path");
const pool = require("../../config/db");

const EXCEL_PATH = path.join(__dirname, "../../../IHSCAM Site List 250526 - Audit PIP.xlsx");

async function importSites() {
  const workbook = xlsx.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  if (rows.length < 2) {
    console.log("Aucune donnée à importer.");
    return;
  }

  const dataRows = rows.slice(1).filter((r) => r && String(r[1]).trim());

  let inserted = 0;
  let skipped = 0;

  for (const row of dataRows) {
    const operatorSiteId = String(row[1] || "").trim();
    const ihsId = String(row[2] || "").trim();
    const siteCode = ihsId || operatorSiteId;

    if (!siteCode) {
      skipped++;
      continue;
    }

    const state = String(row[4] || "").trim() || null;
    const siteName = String(row[5] || "").trim() || null;
    const accessStatus = String(row[6] || "").trim() || null;
    const siteConfiguration = String(row[7] || "").trim() || null;
    const cluster = String(row[8] || "").trim() || null;
    const division = String(row[9] || "").trim() || null;
    const subDivision = String(row[10] || "").trim() || null;
    const town = String(row[11] || "").trim() || null;
    const latitudeRaw = row[12];
    const latitude = typeof latitudeRaw === "number" ? latitudeRaw : Number(latitudeRaw) || null;
    const longitudeRaw = row[13];
    const longitude = typeof longitudeRaw === "number" ? longitudeRaw : Number(longitudeRaw) || null;
    const siteType = String(row[14] || "").trim() || null;

    const displayName = siteName || siteCode;

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
        `INSERT INTO sites (
            org_id, site_code, operator_site_id, site_name, region, site_type,
            department, arrondissement, address_village, tower_height_m,
            latitude, longitude, cluster, access_status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (site_code) DO UPDATE SET
            operator_site_id = EXCLUDED.operator_site_id,
            site_name = EXCLUDED.site_name,
            region = EXCLUDED.region,
            site_type = EXCLUDED.site_type,
            department = EXCLUDED.department,
            arrondissement = EXCLUDED.arrondissement,
            address_village = EXCLUDED.address_village,
            tower_height_m = EXCLUDED.tower_height_m,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            cluster = EXCLUDED.cluster,
            access_status = EXCLUDED.access_status`,
        [orgId, siteCode, operatorSiteId || null, displayName, state, siteType,
         division, subDivision, town, null, latitude, longitude, cluster, accessStatus]
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
  console.log(`Import terminé: ${inserted} sites importés/mis à jour, ${skipped} ignorés/erreurs.`);
}

importSites();
