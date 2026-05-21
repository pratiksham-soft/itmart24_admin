import "../config/env";

import { getAnalyticsPool } from "../services/analyticsPostgres.service";

async function main() {
  const pool = await getAnalyticsPool();

  const customLeadResult = await pool.query(
    `
      SELECT
        id,
        company_name,
        business_email,
        website,
        source_page,
        shopify_page_id,
        status,
        created_at
      FROM crm_custom_leads
      WHERE source_page = 'vendor_page'
      ORDER BY created_at DESC, id DESC
      LIMIT 10
    `
  );

  const crmLeadResult = await pool.query(
    `
      SELECT
        id,
        first_name,
        last_name,
        email,
        website,
        company_name,
        lead_source,
        lead_status,
        updated_at
      FROM crm_leads
      WHERE deleted_at IS NULL
        AND lead_source = 'Vendor Page - Custom Portfolio Pricing'
      ORDER BY updated_at DESC, id DESC
      LIMIT 10
    `
  );

  console.log(
    JSON.stringify(
      {
        customLeads: customLeadResult.rows,
        crmLeads: crmLeadResult.rows,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
