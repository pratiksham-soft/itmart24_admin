import { getUserPortalPool, normalizeDate } from "./userPortalUsers.service";

type GuestReportRow = {
  id: string;
  report_date: Date | string;
  report_time: string;
  website: string;
  report_type: string;
  created_at: Date | string;
};

export type GuestReportEntry = {
  id: string;
  reportDate: string | null;
  reportTime: string;
  website: string;
  reportType: string;
  createdAt: string | null;
};

const mapGuestReportRow = (row: GuestReportRow): GuestReportEntry => ({
  id: row.id,
  reportDate: normalizeDate(row.report_date),
  reportTime: row.report_time,
  website: row.website,
  reportType: row.report_type,
  createdAt: normalizeDate(row.created_at),
});

export const listGuestReports = async (): Promise<GuestReportEntry[]> => {
  const pool = getUserPortalPool();
  const result = await pool.query(
    `
      SELECT
        id,
        report_date,
        report_time,
        website,
        report_type,
        created_at
      FROM guest_report
      ORDER BY report_date DESC, report_time DESC, created_at DESC
    `
  );

  return (result.rows as GuestReportRow[]).map(mapGuestReportRow);
};
