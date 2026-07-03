import { ensureTables, getAnalyticsPool } from "../services/analyticsPostgres.service";

type CliOptions = {
  dryRun: boolean;
  apply: boolean;
  force: boolean;
  city: string | null;
  state: string | null;
  country: string | null;
  tagFilter: string | null;
  sourceFilter: string | null;
  leadIds: number[];
  createdAfter: string | null;
  createdBefore: string | null;
};

type LeadRow = {
  id: number;
  company_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  lead_source: string | null;
  tags: unknown;
  notes: unknown;
  created_at: string | null;
  updated_at: string | null;
};

type DetectionRule = {
  key: "new_york" | "nagpur" | "bengaluru";
  city: string;
  state: string;
  country: string;
  tags: string[];
  patterns: RegExp[];
};

type DetectionResult = {
  city: string;
  state: string;
  country: string;
  tags: string[];
  reason: string;
};

type Summary = {
  mode: "dry-run" | "apply";
  totalLeadsScanned: number;
  newYorkMatches: number;
  nagpurMatches: number;
  bengaluruMatches: number;
  indiaTaggedLeads: number;
  usaTaggedLeads: number;
  skippedBecauseLocationAlreadyExisted: number;
  ambiguousLeads: number;
  updatedLeads: number;
  manualOverrideMatches: number;
  unchangedLeads: number;
};

const LOCATION_RULES: DetectionRule[] = [
  {
    key: "new_york",
    city: "New York",
    state: "New York",
    country: "United States",
    tags: ["city_new_york", "country_usa", "location_backfilled"],
    patterns: [/\bnew york\b/i],
  },
  {
    key: "nagpur",
    city: "Nagpur",
    state: "Maharashtra",
    country: "India",
    tags: ["city_nagpur", "country_india", "location_backfilled"],
    patterns: [/\bnagpur\b/i],
  },
  {
    key: "bengaluru",
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
    tags: ["city_bengaluru", "country_india", "location_backfilled"],
    patterns: [/\bbengaluru\b/i, /\bbangalore\b/i],
  },
];

const printUsageAndExit = (message?: string) => {
  if (message) {
    console.error(message);
  }
  console.error(
    [
      "Usage:",
      "  npx ts-node --transpile-only src/scripts/backfillCrmLeadLocations.ts --dry-run",
      "  npx ts-node --transpile-only src/scripts/backfillCrmLeadLocations.ts --apply",
      "  npx ts-node --transpile-only src/scripts/backfillCrmLeadLocations.ts --city=\"Nagpur\" --state=\"Maharashtra\" --country=\"India\" --where-created-after=\"2026-01-01 00:00:00\" --where-created-before=\"2026-01-31 23:59:59\" --apply",
      "Optional filters:",
      "  --lead-ids=\"1,2,3\"",
      "  --tag-filter=\"some_import_tag\"",
      "  --source-filter=\"Map Scraper\"",
      "  --force",
    ].join("\n")
  );
  process.exit(1);
};

const parseCliOptions = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    dryRun: false,
    apply: false,
    force: false,
    city: null,
    state: null,
    country: null,
    tagFilter: null,
    sourceFilter: null,
    leadIds: [],
    createdAfter: null,
    createdBefore: null,
  };

  argv.forEach((arg) => {
    if (arg === "--dry-run") {
      options.dryRun = true;
      return;
    }
    if (arg === "--apply") {
      options.apply = true;
      return;
    }
    if (arg === "--force") {
      options.force = true;
      return;
    }
    if (arg.startsWith("--city=")) {
      options.city = arg.slice("--city=".length).trim() || null;
      return;
    }
    if (arg.startsWith("--state=")) {
      options.state = arg.slice("--state=".length).trim() || null;
      return;
    }
    if (arg.startsWith("--country=")) {
      options.country = arg.slice("--country=".length).trim() || null;
      return;
    }
    if (arg.startsWith("--tag-filter=")) {
      options.tagFilter = arg.slice("--tag-filter=".length).trim() || null;
      return;
    }
    if (arg.startsWith("--source-filter=")) {
      options.sourceFilter = arg.slice("--source-filter=".length).trim() || null;
      return;
    }
    if (arg.startsWith("--lead-ids=")) {
      options.leadIds = arg
        .slice("--lead-ids=".length)
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.round(value));
      return;
    }
    if (arg.startsWith("--where-created-after=")) {
      options.createdAfter = arg.slice("--where-created-after=".length).trim() || null;
      return;
    }
    if (arg.startsWith("--where-created-before=")) {
      options.createdBefore = arg.slice("--where-created-before=".length).trim() || null;
    }
  });

  if (options.dryRun === options.apply) {
    printUsageAndExit("Choose exactly one mode: --dry-run or --apply");
  }

  const hasManualOverride = Boolean(options.city || options.state || options.country);
  if (hasManualOverride) {
    const hasTargetFilter =
      options.leadIds.length > 0 ||
      Boolean(options.tagFilter) ||
      Boolean(options.sourceFilter) ||
      Boolean(options.createdAfter) ||
      Boolean(options.createdBefore);
    if (!hasTargetFilter) {
      printUsageAndExit(
        "Manual override mode requires at least one targeting filter: --lead-ids, --tag-filter, --source-filter, --where-created-after, or --where-created-before."
      );
    }
  }

  return options;
};

const toStringOrNull = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text ? text : null;
};

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const normalizeTagLabel = (value: unknown): string | null => {
  if (typeof value === "string") {
    const cleaned = value.trim();
    return cleaned ? cleaned : null;
  }
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    const nestedValue =
      candidate.name ?? candidate.value ?? candidate.label ?? candidate.tag ?? candidate.title ?? null;
    return typeof nestedValue === "string" && nestedValue.trim() ? nestedValue.trim() : null;
  }
  return null;
};

const readTagStrings = (rawTags: unknown) => {
  if (Array.isArray(rawTags)) {
    return rawTags.map(normalizeTagLabel).filter((entry): entry is string => Boolean(entry));
  }
  if (typeof rawTags === "string") {
    return rawTags
      .split(/[,\n;|]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
};

const readNoteTexts = (rawNotes: unknown) => {
  if (Array.isArray(rawNotes)) {
    return rawNotes
      .map((entry) => {
        if (typeof entry === "string") {
          return entry.trim();
        }
        if (entry && typeof entry === "object") {
          const candidate = entry as Record<string, unknown>;
          return toStringOrNull(candidate.text) ?? toStringOrNull(candidate.note) ?? toStringOrNull(candidate.message) ?? "";
        }
        return "";
      })
      .filter(Boolean);
  }
  if (typeof rawNotes === "string") {
    return [rawNotes.trim()].filter(Boolean);
  }
  return [];
};

const mergeTags = (existing: unknown, nextTags: string[]) => {
  const base = Array.isArray(existing) ? [...existing] : readTagStrings(existing);
  const existingNormalized = new Set(readTagStrings(existing).map((entry) => entry.toLowerCase()));

  nextTags.forEach((tag) => {
    if (!existingNormalized.has(tag.toLowerCase())) {
      base.push(tag);
      existingNormalized.add(tag.toLowerCase());
    }
  });

  return base;
};

const appendBackfillNote = (
  existing: unknown,
  payload: {
    city: string | null;
    state: string | null;
    country: string | null;
    reason: string;
    force: boolean;
  }
) => {
  const base = Array.isArray(existing) ? [...existing] : readNoteTexts(existing).map((text) => ({ text }));
  base.push({
    text: `Location backfill applied: ${[payload.city, payload.state, payload.country].filter(Boolean).join(", ") || "location details"}.
Reason: ${payload.reason}.`,
    city: payload.city,
    state: payload.state,
    country: payload.country,
    appliedAt: new Date().toISOString(),
    source: "backfillCrmLeadLocations",
    force: payload.force,
  });
  return base;
};

const buildLegacySearchText = (lead: LeadRow) =>
  [
    lead.company_name,
    lead.address,
    lead.city,
    lead.state,
    lead.country,
    lead.lead_source,
    ...readTagStrings(lead.tags),
    ...readNoteTexts(lead.notes),
  ]
    .filter(Boolean)
    .join(" \n ");

const detectLocationFromLead = (lead: LeadRow): DetectionResult | null | "ambiguous" => {
  const haystack = buildLegacySearchText(lead);
  const matches = LOCATION_RULES.filter((rule) => rule.patterns.some((pattern) => pattern.test(haystack)));

  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    return "ambiguous";
  }

  const match = matches[0];
  return {
    city: match.city,
    state: match.state,
    country: match.country,
    tags: match.tags,
    reason: `Detected from legacy location text using ${match.key} rule`,
  };
};

const createManualOverrideDetection = (options: CliOptions): DetectionResult | null => {
  if (!options.city && !options.state && !options.country) {
    return null;
  }

  const tags = ["location_backfilled"];
  if (options.city) {
    tags.push(`city_${slugify(options.city)}`);
  }
  if (options.country) {
    const countrySlug = slugify(options.country);
    tags.push(countrySlug === "united_states" ? "country_usa" : `country_${countrySlug}`);
  }

  return {
    city: options.city ?? "",
    state: options.state ?? "",
    country: options.country ?? "",
    tags,
    reason: "Manual override from CLI filters",
  };
};

const hasStructuredLocation = (lead: LeadRow) =>
  Boolean(toStringOrNull(lead.city) && toStringOrNull(lead.state) && toStringOrNull(lead.country));

const needsUpdate = (
  lead: LeadRow,
  detection: DetectionResult,
  force: boolean
) => {
  const currentCity = toStringOrNull(lead.city);
  const currentState = toStringOrNull(lead.state);
  const currentCountry = toStringOrNull(lead.country);

  if (!force && hasStructuredLocation(lead)) {
    return false;
  }

  const nextCity = force ? detection.city || currentCity : currentCity ?? detection.city;
  const nextState = force ? detection.state || currentState : currentState ?? detection.state;
  const nextCountry = force ? detection.country || currentCountry : currentCountry ?? detection.country;

  const mergedTags = mergeTags(lead.tags, detection.tags);
  const existingTagsNormalized = new Set(readTagStrings(lead.tags).map((entry) => entry.toLowerCase()));
  const tagsChanged = detection.tags.some((tag) => !existingTagsNormalized.has(tag.toLowerCase()));

  return (
    nextCity !== currentCity ||
    nextState !== currentState ||
    nextCountry !== currentCountry ||
    tagsChanged ||
    !Array.isArray(lead.notes)
  )
    ? {
        city: nextCity,
        state: nextState,
        country: nextCountry,
        tags: mergedTags,
      }
    : false;
};

const buildWhereClause = (options: CliOptions) => {
  const clauses = ["deleted_at IS NULL"];
  const values: unknown[] = [];

  if (options.createdAfter) {
    values.push(options.createdAfter);
    clauses.push(`created_at >= $${values.length}::timestamp`);
  }
  if (options.createdBefore) {
    values.push(options.createdBefore);
    clauses.push(`created_at <= $${values.length}::timestamp`);
  }
  if (options.sourceFilter) {
    values.push(options.sourceFilter.toLowerCase());
    clauses.push(`LOWER(COALESCE(lead_source, '')) = $${values.length}`);
  }
  if (options.leadIds.length > 0) {
    values.push(options.leadIds);
    clauses.push(`id = ANY($${values.length}::bigint[])`);
  }
  if (options.tagFilter) {
    values.push(options.tagFilter.toLowerCase());
    clauses.push(`(
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(COALESCE(tags, '[]'::jsonb)) = 'array' THEN COALESCE(tags, '[]'::jsonb)
            ELSE '[]'::jsonb
          END
        ) AS item(value)
        WHERE LOWER(
          CASE
            WHEN jsonb_typeof(item.value) = 'string' THEN BTRIM(item.value::text, '"')
            WHEN jsonb_typeof(item.value) = 'object' THEN COALESCE(item.value->>'name', item.value->>'value', item.value->>'label', item.value->>'tag', '')
            ELSE ''
          END
        ) = $${values.length}
      )
      OR LOWER(COALESCE(tags::text, '')) LIKE '%' || $${values.length} || '%'
    )`);
  }

  return {
    sql: clauses.join(" AND "),
    values,
  };
};

const printSummary = (summary: Summary) => {
  console.log(
    [
      `Mode: ${summary.mode}`,
      `Total leads scanned: ${summary.totalLeadsScanned}`,
      `New York matches: ${summary.newYorkMatches}`,
      `Nagpur matches: ${summary.nagpurMatches}`,
      `Bengaluru matches: ${summary.bengaluruMatches}`,
      `India tagged leads: ${summary.indiaTaggedLeads}`,
      `USA tagged leads: ${summary.usaTaggedLeads}`,
      `Skipped because location already existed: ${summary.skippedBecauseLocationAlreadyExisted}`,
      `Ambiguous leads: ${summary.ambiguousLeads}`,
      `Manual override matches: ${summary.manualOverrideMatches}`,
      `Updated leads: ${summary.updatedLeads}`,
      `Unchanged leads: ${summary.unchangedLeads}`,
    ].join("\n")
  );
};

const main = async () => {
  const options = parseCliOptions(process.argv.slice(2));
  await ensureTables();
  const pool = await getAnalyticsPool();

  const where = buildWhereClause(options);
  const result = await pool.query(
    `
      SELECT
        id,
        company_name,
        address,
        city,
        state,
        country,
        lead_source,
        tags,
        notes,
        created_at::text,
        updated_at::text
      FROM crm_leads
      WHERE ${where.sql}
      ORDER BY id ASC
    `,
    where.values
  );

  const manualOverride = createManualOverrideDetection(options);
  const summary: Summary = {
    mode: options.dryRun ? "dry-run" : "apply",
    totalLeadsScanned: result.rows.length,
    newYorkMatches: 0,
    nagpurMatches: 0,
    bengaluruMatches: 0,
    indiaTaggedLeads: 0,
    usaTaggedLeads: 0,
    skippedBecauseLocationAlreadyExisted: 0,
    ambiguousLeads: 0,
    updatedLeads: 0,
    manualOverrideMatches: 0,
    unchangedLeads: 0,
  };

  const client = await pool.connect();
  try {
    if (options.apply) {
      await client.query("BEGIN");
    }

    for (const lead of result.rows as LeadRow[]) {
      const detection = manualOverride ?? detectLocationFromLead(lead);

      if (manualOverride) {
        summary.manualOverrideMatches += 1;
      } else if (detection && detection !== "ambiguous") {
        if (detection.city === "New York") summary.newYorkMatches += 1;
        if (detection.city === "Nagpur") summary.nagpurMatches += 1;
        if (detection.city === "Bengaluru") summary.bengaluruMatches += 1;
      }

      if (detection === "ambiguous") {
        summary.ambiguousLeads += 1;
        continue;
      }

      if (!detection) {
        summary.unchangedLeads += 1;
        continue;
      }

      const next = needsUpdate(lead, detection, options.force);
      if (!next) {
        summary.skippedBecauseLocationAlreadyExisted += 1;
        continue;
      }

      if (next.country === "India") {
        summary.indiaTaggedLeads += 1;
      }
      if (next.country === "United States") {
        summary.usaTaggedLeads += 1;
      }

      summary.updatedLeads += 1;

      if (!options.apply) {
        continue;
      }

      const notes = appendBackfillNote(lead.notes, {
        city: next.city,
        state: next.state,
        country: next.country,
        reason: detection.reason,
        force: options.force,
      });

      await client.query(
        `
          UPDATE crm_leads
          SET city = $2,
              state = $3,
              country = $4,
              tags = $5::jsonb,
              notes = $6::jsonb,
              updated_at = NOW()
          WHERE id = $1
        `,
        [
          lead.id,
          next.city,
          next.state,
          next.country,
          JSON.stringify(next.tags),
          JSON.stringify(notes),
        ]
      );
    }

    if (options.apply) {
      await client.query("COMMIT");
    }
  } catch (error) {
    if (options.apply) {
      await client.query("ROLLBACK");
    }
    throw error;
  } finally {
    client.release();
  }

  printSummary(summary);
};

void main()
  .catch((error) => {
    console.error(
      "backfillCrmLeadLocations failed:",
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    const pool = await getAnalyticsPool();
    await pool.end();
  });
