import { ensureTables, getAnalyticsPool } from "../services/analyticsPostgres.service";
import { canSendEmailToLead } from "../services/crm.service";

const REQUIRED_TABLES = [
  "crm_campaigns",
  "crm_campaign_recipients",
  "crm_email_events",
  "crm_email_clicks",
  "crm_email_unsubscribes",
  "crm_email_links",
];

const REQUIRED_INDEXES = [
  "idx_crm_campaign_recipients_campaign_id",
  "idx_crm_campaign_recipients_lead_id",
  "idx_crm_campaign_recipients_email",
  "idx_crm_campaign_recipients_status",
  "idx_crm_email_events_campaign_id",
  "idx_crm_email_events_recipient_id",
  "idx_crm_email_events_event_type",
  "idx_crm_email_clicks_campaign_id",
  "idx_crm_email_clicks_recipient_id",
  "idx_crm_email_unsubscribes_email",
  "idx_crm_email_links_campaign_id",
  "idx_crm_email_links_recipient_id",
];

type TableRow = { table_name: string };
type IndexRow = { indexname: string };

const main = async () => {
  await ensureTables();
  const pool = await getAnalyticsPool();

  const tableResult = await pool.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name ASC
    `,
    [REQUIRED_TABLES]
  );

  const indexResult = await pool.query(
    `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = ANY($1::text[])
      ORDER BY indexname ASC
    `,
    [REQUIRED_INDEXES]
  );

  const summaryResult = await pool.query(
    `
      SELECT
        COUNT(*)::int AS campaigns,
        COUNT(*) FILTER (WHERE status = 'Sending')::int AS sending_campaigns
      FROM crm_campaigns
      WHERE deleted_at IS NULL
    `
  );

  const recipientSummaryResult = await pool.query(
    `
      SELECT
        COUNT(*)::int AS recipients,
        COUNT(*) FILTER (WHERE status = 'blocked')::int AS blocked_recipients,
        COUNT(*) FILTER (WHERE status = 'sent')::int AS sent_recipients,
        COUNT(*) FILTER (WHERE first_opened_at IS NOT NULL)::int AS opened_recipients,
        COUNT(*) FILTER (WHERE first_clicked_at IS NOT NULL)::int AS clicked_recipients
      FROM crm_campaign_recipients
    `
  );

  const sampleLeads = [
    {
      email: "good@agency.com",
      unsubscribed: false,
      bounced: false,
      spamComplaint: false,
      doNotContact: false,
      emailConsentStatus: "unknown",
      emailRiskLevel: "low",
    },
    {
      email: "blocked@agency.com",
      unsubscribed: true,
      bounced: false,
      spamComplaint: false,
      doNotContact: false,
      emailConsentStatus: "unsubscribed",
      emailRiskLevel: "blocked",
    },
  ];

  const safetyChecks = sampleLeads.map((lead) => ({
    email: lead.email,
    canSend: canSendEmailToLead(lead),
  }));

  console.log(
    JSON.stringify(
      {
        tablesFound: (tableResult.rows as TableRow[]).map((row) => row.table_name),
        missingTables: REQUIRED_TABLES.filter(
          (tableName) => !(tableResult.rows as TableRow[]).some((row) => row.table_name === tableName)
        ),
        indexesFound: (indexResult.rows as IndexRow[]).map((row) => row.indexname),
        missingIndexes: REQUIRED_INDEXES.filter(
          (indexName) => !(indexResult.rows as IndexRow[]).some((row) => row.indexname === indexName)
        ),
        campaignSummary: summaryResult.rows[0] ?? {},
        recipientSummary: recipientSummaryResult.rows[0] ?? {},
        safetyChecks,
      },
      null,
      2
    )
  );
};

void main()
  .catch((error) => {
    console.error("verifyCrmEmailTracking failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const pool = await getAnalyticsPool();
    await pool.end();
  });
