import { ensureTables, getAnalyticsPool } from "../services/analyticsPostgres.service";
import { canSendEmailToLead, computeLeadCampaignSafetyState, previewSegmentDefinition } from "../services/crm.service";

const REQUIRED_COLUMNS = [
  "id",
  "company_name",
  "email",
  "emails",
  "phone",
  "website",
  "country",
  "state",
  "city",
  "industry",
  "category",
  "sub_category",
  "lead_type",
  "lead_status",
  "lead_source",
  "lifecycle_stage",
  "tags",
  "notes",
  "estimated_value",
  "assigned_to",
  "last_activity_at",
  "next_follow_up_at",
  "created_at",
  "updated_at",
  "deleted_at",
  "unsubscribed",
  "bounced",
  "bounce_type",
  "spam_complaint",
  "do_not_contact",
  "email_consent_status",
  "last_email_sent_at",
  "email_sent_count",
  "last_email_opened_at",
  "email_open_count",
  "last_email_clicked_at",
  "email_click_count",
  "last_email_replied_at",
  "email_reply_count",
  "last_campaign_name",
  "last_campaign_status",
  "last_campaign_id",
] as const;

const REQUIRED_INDEXES = [
  "idx_crm_leads_email",
  "idx_crm_leads_created_at",
  "idx_crm_leads_lead_type",
  "idx_crm_leads_lead_status",
  "idx_crm_leads_lead_source",
  "idx_crm_leads_lifecycle_stage",
  "idx_crm_leads_tags_gin",
  "idx_crm_leads_unsubscribed",
  "idx_crm_leads_bounced",
  "idx_crm_leads_spam_complaint",
  "idx_crm_leads_do_not_contact",
  "idx_crm_leads_last_email_sent_at",
] as const;

const logSection = (label: string) => {
  console.log(`\n=== ${label} ===`);
};

const main = async () => {
  await ensureTables();
  const pool = await getAnalyticsPool();

  logSection("Columns");
  const columnResult = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'crm_leads'
    `
  );
  const columnNames = new Set(
    (columnResult.rows as Array<{ column_name: string }>).map((row) => row.column_name)
  );
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !columnNames.has(column));
  console.log(`Found ${columnNames.size} crm_leads columns.`);
  if (missingColumns.length > 0) {
    console.error(`Missing columns: ${missingColumns.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("All required CRM lead columns are present.");
  }

  logSection("Indexes");
  const indexResult = await pool.query(
    `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'crm_leads'
    `
  );
  const indexNames = new Set(
    (indexResult.rows as Array<{ indexname: string }>).map((row) => row.indexname)
  );
  const missingIndexes = REQUIRED_INDEXES.filter((index) => !indexNames.has(index));
  console.log(`Found ${indexNames.size} crm_leads indexes.`);
  if (missingIndexes.length > 0) {
    console.error(`Missing indexes: ${missingIndexes.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("All required CRM lead indexes are present.");
  }

  logSection("Tag Formats");
  const tagFormatResult = await pool.query(
    `
      SELECT
        CASE
          WHEN tags IS NULL THEN 'null'
          ELSE COALESCE(jsonb_typeof(tags), 'unknown')
        END AS tag_format,
        COUNT(*)::int AS total
      FROM crm_leads
      WHERE deleted_at IS NULL
      GROUP BY 1
      ORDER BY 2 DESC, 1 ASC
    `
  );
  console.log(
    JSON.stringify(
      (tagFormatResult.rows as Array<{ tag_format: string; total: number }>).map((row) => ({
        format: row.tag_format,
        count: Number(row.total ?? 0),
      })),
      null,
      2
    )
  );

  logSection("Sample Safety");
  const leadResult = await pool.query(
    `
      SELECT id, email, phone, tags, unsubscribed, bounced, spam_complaint, do_not_contact, email_consent_status, last_campaign_status
      FROM crm_leads
      WHERE deleted_at IS NULL
      ORDER BY updated_at DESC, id DESC
      LIMIT 5
    `
  );
  if (leadResult.rows.length === 0) {
    console.log("No active leads found to verify.");
  } else {
    (leadResult.rows as Array<Record<string, unknown>>).forEach((lead, index) => {
      const safety = computeLeadCampaignSafetyState(lead);
      console.log(
        JSON.stringify(
          {
            sample: index + 1,
            id: lead.id,
            email: lead.email,
            phone: lead.phone,
            rawTags: lead.tags,
            doNotContact: lead.do_not_contact,
            lastCampaignStatus: lead.last_campaign_status,
            campaignReady: safety.campaignReady,
            agencyOutreachReady: safety.agencyOutreachReady,
            emailType: safety.emailType,
            emailRiskLevel: safety.emailRiskLevel,
            canSend: canSendEmailToLead(lead),
          },
          null,
          2
        )
      );
    });
  }

  logSection("Segment Preview");
  const preview = await previewSegmentDefinition({
    entityType: "leads",
    matchType: "all",
    conditions: [
      {
        field: "campaignReady",
        operator: "is_true",
        value: null,
      },
    ],
  });
  console.log(
    JSON.stringify(
      {
        count: preview.count,
        emailRiskDistribution: preview.emailRiskDistribution,
        emailTypeDistribution: preview.emailTypeDistribution,
        campaignReadinessSummary: preview.campaignReadinessSummary,
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error("CRM lead safety verification failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
