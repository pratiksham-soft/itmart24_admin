import Badge from "../../../../components/ui/badge/Badge";
import type { CRMActivity } from "../types/crm.types";
import { formatDateTime, getStatusBadgeColor } from "../utils/crmHelpers";

export default function ActivityTimeline({ activities }: { activities: CRMActivity[] }) {
  if (activities.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-400">
        No activity recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activities.map((activity) => (
        <div key={activity.id} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={getStatusBadgeColor(activity.activityType)} size="sm">
                  {activity.activityType}
                </Badge>
                <span className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(activity.createdAt)}</span>
              </div>
              <h3 className="mt-2 text-sm font-semibold text-gray-800 dark:text-white/90">{activity.title}</h3>
              {activity.description ? (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{activity.description}</p>
              ) : null}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {activity.actorName || "System"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
