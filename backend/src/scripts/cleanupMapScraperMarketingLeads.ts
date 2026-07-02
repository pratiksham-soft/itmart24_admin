import "../config/env";

import fs from "fs";
import path from "path";
import { getAnalyticsPool } from "../services/analyticsPostgres.service";

type LeadRow = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  emails: unknown;
  phones: unknown;
  address: string | null;
  company_name: string | null;
  job_title: string | null;
  website: string | null;
  lead_type: string | null;
  lead_source: string | null;
  lead_status: string | null;
  lead_priority: string | null;
  lead_score: number | string | null;
  estimated_value: number | string | null;
  currency: string | null;
  assigned_to: number | null;
  tags: unknown;
  notes: unknown;
  next_follow_up_at: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
};

type KeywordMatch = {
  keyword: string;
  field: string;
  score: number;
};

type Classification = {
  action: "keep" | "delete" | "review";
  reason: string;
  keepMatches: KeywordMatch[];
  blockedMatches: KeywordMatch[];
  tagOnlyKeep: boolean;
};

type ClassifiedLead = {
  lead: LeadRow;
  classification: Classification;
};

const REVIEW_TAG = "cleanup-review";
const SCRIPT_LABEL = "cleanup-map-scraper-marketing-leads";
const SAMPLE_SIZE = 5;
const BACKUP_DIR = path.join(__dirname, "../../backups");

const keepKeywordConfig = [
  { keyword: "digital marketing", score: 8 },
  { keyword: "marketing agency", score: 8 },
  { keyword: "marketing company", score: 7 },
  { keyword: "advertising agency", score: 8 },
  { keyword: "search engine optimization", score: 8 },
  { keyword: "seo", score: 7, wordBoundary: true },
  { keyword: "ppc", score: 7, wordBoundary: true },
  { keyword: "performance marketing", score: 8 },
  { keyword: "social media marketing", score: 8 },
  { keyword: "content marketing", score: 7 },
  { keyword: "online marketing", score: 7 },
  { keyword: "internet marketing", score: 7 },
  { keyword: "growth marketing", score: 7 },
  { keyword: "branding agency", score: 7 },
  { keyword: "web marketing", score: 7 },
  { keyword: "lead generation", score: 6 },
  { keyword: "media agency", score: 6 },
  { keyword: "creative agency", score: 6 },
  { keyword: "digital agency", score: 8 },
  { keyword: "email marketing", score: 7 },
  { keyword: "local seo", score: 7 },
  { keyword: "marketing consultant", score: 6 },
  { keyword: "digital strategy", score: 6 },
  { keyword: "seo agency", score: 8 },
  { keyword: "seo company", score: 8 },
  { keyword: "advertising", score: 4 },
  { keyword: "branding", score: 4 },
  { keyword: "digital", score: 2 },
  { keyword: "marketing", score: 3 },
  { keyword: "agency", score: 2 },
];

const blockedKeywordConfig = [
  { keyword: "college", score: 8 },
  { keyword: "university", score: 8 },
  { keyword: "school", score: 8 },
  { keyword: "education", score: 7 },
  { keyword: "institute", score: 7 },
  { keyword: "campus", score: 7 },
  { keyword: "academy", score: 7 },
  { keyword: "commercial printer", score: 8 },
  { keyword: "printing", score: 7 },
  { keyword: "print shop", score: 8 },
  { keyword: "printer", score: 6 },
  { keyword: "signs", score: 5, wordBoundary: true },
  { keyword: "signage", score: 6 },
  { keyword: "telecom", score: 7 },
  { keyword: "telecommunications", score: 8 },
  { keyword: "photographer", score: 8 },
  { keyword: "photography", score: 8 },
  { keyword: "photo studio", score: 8 },
  { keyword: "corporate office", score: 7 },
  { keyword: "office", score: 3, wordBoundary: true },
  { keyword: "real estate", score: 7 },
  { keyword: "restaurant", score: 7 },
  { keyword: "hotel", score: 7 },
  { keyword: "hospital", score: 8 },
  { keyword: "clinic", score: 7 },
  { keyword: "construction", score: 7 },
  { keyword: "law firm", score: 8 },
  { keyword: "attorney", score: 8 },
  { keyword: "accounting", score: 7 },
  { keyword: "insurance", score: 7 },
  { keyword: "travel agency", score: 7 },
  { keyword: "car dealer", score: 8 },
  { keyword: "logistics", score: 7 },
  { keyword: "warehouse", score: 7 },
  { keyword: "courier", score: 7 },
  { keyword: "manufacturing", score: 7 },
];

const normalizeWhitespace = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeText = (value: unknown) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[_/|]+/g, " ")
    .replace(/[^\w\s.+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const matchesKeyword = (
  text: string,
  keyword: string,
  useWordBoundary = false
) => {
  if (!text || !keyword) {
    return false;
  }

  if (!useWordBoundary) {
    return text.includes(keyword);
  }

  const regex = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i");
  return regex.test(text);
};

const uniqueStrings = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

const normalizeStringArray = (value: unknown) => {
  if (Array.isArray(value)) {
    return uniqueStrings(value.map((entry) => normalizeWhitespace(entry)));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [] as string[];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return uniqueStrings(parsed.map((entry) => normalizeWhitespace(entry)));
      }
    } catch {
      // Ignore and fall through to delimiter parsing.
    }

    return uniqueStrings(
      trimmed
        .split(/[|,;\n]/)
        .map((entry) => normalizeWhitespace(entry))
    );
  }

  return [] as string[];
};

const normalizeNoteText = (notes: unknown) => {
  if (!Array.isArray(notes)) {
    return [] as string[];
  }

  return uniqueStrings(
    notes
      .map((entry) => {
        if (entry && typeof entry === "object" && "text" in entry) {
          return normalizeWhitespace((entry as { text?: unknown }).text);
        }
        return "";
      })
      .filter(Boolean)
  );
};

const getWebsiteSearchText = (website: string | null) => {
  const normalized = normalizeWhitespace(website);
  if (!normalized) {
    return "";
  }

  try {
    const parsed = new URL(normalized);
    return normalizeText(`${parsed.hostname} ${parsed.pathname}`);
  } catch {
    return normalizeText(normalized);
  }
};

const buildSearchFields = (lead: LeadRow) => {
  const tags = normalizeStringArray(lead.tags);
  const notes = normalizeNoteText(lead.notes);

  return {
    companyName: normalizeText(lead.company_name),
    website: getWebsiteSearchText(lead.website),
    notes: normalizeText(notes.join(" ")),
    tags: normalizeText(tags.join(" ")),
    jobTitle: normalizeText(lead.job_title),
    leadType: normalizeText(lead.lead_type),
    source: normalizeText(lead.lead_source),
    tagsRaw: tags,
    notesRaw: notes,
  };
};

const collectMatches = (
  fields: Record<string, string>,
  config: Array<{ keyword: string; score: number; wordBoundary?: boolean }>
) => {
  const matches: KeywordMatch[] = [];

  config.forEach((entry) => {
    Object.entries(fields).forEach(([field, text]) => {
      if (
        matchesKeyword(
          text,
          normalizeText(entry.keyword),
          Boolean(entry.wordBoundary)
        )
      ) {
        const fieldMultiplier = field === "tags" ? 0.45 : field === "notes" ? 0.8 : 1;
        matches.push({
          keyword: entry.keyword,
          field,
          score: Number((entry.score * fieldMultiplier).toFixed(2)),
        });
      }
    });
  });

  return matches.sort((left, right) => right.score - left.score);
};

const dedupeMatches = (matches: KeywordMatch[]) => {
  const seen = new Set<string>();
  return matches.filter((entry) => {
    const key = `${entry.keyword}::${entry.field}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const sumScores = (matches: KeywordMatch[]) =>
  Number(matches.reduce((total, entry) => total + entry.score, 0).toFixed(2));

const classifyLead = (lead: LeadRow): Classification => {
  const searchFields = buildSearchFields(lead);
  const businessFields = {
    companyName: searchFields.companyName,
    website: searchFields.website,
    notes: searchFields.notes,
    jobTitle: searchFields.jobTitle,
    leadType: searchFields.leadType,
  };
  const tagField = {
    tags: searchFields.tags,
  };

  const keepMatches = dedupeMatches([
    ...collectMatches(businessFields, keepKeywordConfig),
    ...collectMatches(tagField, keepKeywordConfig),
  ]);
  const blockedMatches = dedupeMatches(collectMatches(businessFields, blockedKeywordConfig));

  const strongBusinessKeepMatches = keepMatches.filter(
    (entry) => entry.field !== "tags" && entry.score >= 4
  );
  const tagOnlyKeep =
    strongBusinessKeepMatches.length === 0 &&
    keepMatches.some((entry) => entry.field === "tags");
  const keepScore = sumScores(strongBusinessKeepMatches);
  const blockedScore = sumScores(blockedMatches);

  if (strongBusinessKeepMatches.length > 0 && blockedMatches.length === 0) {
    return {
      action: "keep",
      reason: `Strong marketing signals found: ${strongBusinessKeepMatches
        .slice(0, 3)
        .map((entry) => `${entry.keyword} [${entry.field}]`)
        .join(", ")}`,
      keepMatches,
      blockedMatches,
      tagOnlyKeep,
    };
  }

  if (strongBusinessKeepMatches.length > 0 && blockedMatches.length > 0) {
    if (keepScore >= blockedScore + 3) {
      return {
        action: "keep",
        reason: `Marketing signals outweighed blocked signals (${keepScore} vs ${blockedScore}).`,
        keepMatches,
        blockedMatches,
        tagOnlyKeep,
      };
    }

    return {
      action: "review",
      reason: `Mixed signals found. Keep score ${keepScore}, blocked score ${blockedScore}.`,
      keepMatches,
      blockedMatches,
      tagOnlyKeep,
    };
  }

  if (tagOnlyKeep) {
    return {
      action: "review",
      reason: "Only tag-based marketing match found. Needs manual review.",
      keepMatches,
      blockedMatches,
      tagOnlyKeep,
    };
  }

  if (blockedMatches.length > 0) {
    return {
      action: "delete",
      reason: `Blocked business keywords found without strong marketing evidence: ${blockedMatches
        .slice(0, 3)
        .map((entry) => `${entry.keyword} [${entry.field}]`)
        .join(", ")}`,
      keepMatches,
      blockedMatches,
      tagOnlyKeep,
    };
  }

  return {
    action: "review",
    reason: "No strong marketing or blocked keywords found. Needs manual review.",
    keepMatches,
    blockedMatches,
    tagOnlyKeep,
  };
};

const csvEscape = (value: unknown) => {
  const stringValue = value == null ? "" : String(value);
  if (!/[",\r\n]/.test(stringValue)) {
    return stringValue;
  }
  return `"${stringValue.replace(/"/g, '""')}"`;
};

const timestampForFile = () => {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ];
  return parts.join("");
};

const sampleLead = (lead: LeadRow, classification: Classification) => ({
  id: lead.id,
  companyName: lead.company_name,
  website: lead.website,
  tags: normalizeStringArray(lead.tags),
  reason: classification.reason,
  keepMatches: classification.keepMatches.slice(0, 3),
  blockedMatches: classification.blockedMatches.slice(0, 3),
});

const ensureBackupDir = async () => {
  await fs.promises.mkdir(BACKUP_DIR, { recursive: true });
};

const writeBackupFile = async (
  rows: Array<{ lead: LeadRow; classification: Classification }>
) => {
  await ensureBackupDir();

  const backupPath = path.join(
    BACKUP_DIR,
    `deleted-map-scraper-leads-${timestampForFile()}.csv`
  );

  const header = [
    "id",
    "firstName",
    "lastName",
    "email",
    "phone",
    "emails",
    "phones",
    "address",
    "companyName",
    "jobTitle",
    "website",
    "leadType",
    "leadSource",
    "leadStatus",
    "leadPriority",
    "leadScore",
    "estimatedValue",
    "currency",
    "assignedTo",
    "tags",
    "notes",
    "nextFollowUpAt",
    "lastActivityAt",
    "createdAt",
    "updatedAt",
    "deletionReason",
    "keepMatches",
    "blockedMatches",
  ];

  const lines = [
    header.join(","),
    ...rows.map(({ lead, classification }) =>
      [
        lead.id,
        lead.first_name,
        lead.last_name,
        lead.email,
        lead.phone,
        JSON.stringify(normalizeStringArray(lead.emails)),
        JSON.stringify(normalizeStringArray(lead.phones)),
        lead.address,
        lead.company_name,
        lead.job_title,
        lead.website,
        lead.lead_type,
        lead.lead_source,
        lead.lead_status,
        lead.lead_priority,
        lead.lead_score,
        lead.estimated_value,
        lead.currency,
        lead.assigned_to,
        JSON.stringify(normalizeStringArray(lead.tags)),
        JSON.stringify(normalizeNoteText(lead.notes)),
        lead.next_follow_up_at,
        lead.last_activity_at,
        lead.created_at,
        lead.updated_at,
        classification.reason,
        JSON.stringify(classification.keepMatches),
        JSON.stringify(classification.blockedMatches),
      ]
        .map((value) => csvEscape(value))
        .join(",")
    ),
  ].join("\n");

  await fs.promises.writeFile(backupPath, lines, "utf8");
  const stats = await fs.promises.stat(backupPath);
  if (stats.size <= 0) {
    throw new Error("Backup file was created but is empty.");
  }

  return backupPath;
};

const addReviewTag = (tags: string[]) =>
  uniqueStrings([...tags, REVIEW_TAG]);

const printSummary = (
  groups: {
    keep: Array<{ lead: LeadRow; classification: Classification }>;
    delete: Array<{ lead: LeadRow; classification: Classification }>;
    review: Array<{ lead: LeadRow; classification: Classification }>;
  },
  scannedCount: number
) => {
  console.log(`Scanned Maps Scraper leads: ${scannedCount}`);
  console.log(`Keep: ${groups.keep.length}`);
  console.log(`Delete candidates: ${groups.delete.length}`);
  console.log(`Needs review: ${groups.review.length}`);
  console.log("");

  const sections: Array<keyof typeof groups> = ["keep", "delete", "review"];
  sections.forEach((section) => {
    const label =
      section === "keep" ? "Keep samples" : section === "delete" ? "Delete samples" : "Review samples";
    console.log(`${label}:`);
    const samples = groups[section].slice(0, SAMPLE_SIZE);
    if (samples.length === 0) {
      console.log("  (none)");
      console.log("");
      return;
    }

    samples.forEach(({ lead, classification }) => {
      console.log(
        `  - ${lead.company_name || "Unnamed"} | ${lead.website || "No website"} | tags=${JSON.stringify(
          normalizeStringArray(lead.tags)
        )} | reason=${classification.reason}`
      );
    });
    console.log("");
  });
};

async function main() {
  const confirm = process.argv.includes("--confirm");
  const pool = await getAnalyticsPool();

  try {
    const result = await pool.query(
      `
        SELECT
          id,
          first_name,
          last_name,
          email,
          phone,
          emails,
          phones,
          address,
          company_name,
          job_title,
          website,
          lead_type,
          lead_source,
          lead_status,
          lead_priority,
          lead_score,
          estimated_value,
          currency,
          assigned_to,
          tags,
          notes,
          next_follow_up_at,
          last_activity_at,
          created_at,
          updated_at
        FROM crm_leads
        WHERE deleted_at IS NULL
          AND (
            lead_source = 'Map Scraper'
            OR tags::text ILIKE '%Map Scraper%'
            OR notes::text ILIKE '%Map Scraper%'
          )
        ORDER BY updated_at DESC, id DESC
      `
    );

    const classified: ClassifiedLead[] = (result.rows as LeadRow[]).map((lead: LeadRow) => ({
      lead,
      classification: classifyLead(lead),
    }));

    const groups = {
      keep: classified.filter((entry: ClassifiedLead) => entry.classification.action === "keep"),
      delete: classified.filter((entry: ClassifiedLead) => entry.classification.action === "delete"),
      review: classified.filter((entry: ClassifiedLead) => entry.classification.action === "review"),
    };

    console.log(`${SCRIPT_LABEL} :: ${confirm ? "CONFIRM MODE" : "DRY RUN MODE"}`);
    printSummary(groups, classified.length);

    if (!confirm) {
      console.log("Dry run only. No leads were modified or deleted.");
      return;
    }

    let backupPath: string | null = null;
    if (groups.delete.length > 0) {
      backupPath = await writeBackupFile(groups.delete);
      console.log(`Backup created: ${backupPath}`);
    } else {
      console.log("No delete candidates found, so no backup file was needed.");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (groups.review.length > 0) {
        for (const { lead } of groups.review) {
          const currentTags = normalizeStringArray(lead.tags);
          const nextTags = addReviewTag(currentTags);
          if (nextTags.length === currentTags.length) {
            continue;
          }

          await client.query(
            `
              UPDATE crm_leads
              SET tags = $2::jsonb,
                  last_activity_at = NOW(),
                  updated_at = NOW()
              WHERE id = $1
                AND deleted_at IS NULL
            `,
            [lead.id, JSON.stringify(nextTags)]
          );
        }
      }

      if (groups.delete.length > 0) {
        const deleteIds = groups.delete.map(({ lead }: ClassifiedLead) => lead.id);
        await client.query(
          `
            UPDATE crm_leads
            SET deleted_at = NOW(),
                last_activity_at = NOW(),
                updated_at = NOW()
            WHERE id = ANY($1::bigint[])
              AND deleted_at IS NULL
          `,
          [deleteIds]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    console.log("");
    console.log("Cleanup complete.");
    console.log(`Soft-deleted leads: ${groups.delete.length}`);
    console.log(`Tagged for review with '${REVIEW_TAG}': ${groups.review.length}`);
    if (backupPath) {
      console.log(`Deletion backup file: ${backupPath}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Map Scraper lead cleanup failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
