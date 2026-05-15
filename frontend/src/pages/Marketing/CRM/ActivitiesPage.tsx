import { useEffect, useState } from "react";
import PageMeta from "../../../components/common/PageMeta";
import CRMFilters from "./components/CRMFilters";
import CRMPageHeader from "./components/CRMPageHeader";
import ActivityTimeline from "./components/ActivityTimeline";
import { getActivities } from "./services/crmApi";
import type { CRMActivity } from "./types/crm.types";
import { defaultCRMSettings, readErrorMessage, toOptions } from "./utils/crmHelpers";

export default function ActivitiesPage() {
  const [items, setItems] = useState<CRMActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchValue, setSearchValue] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getActivities({
          page: 1,
          limit: 50,
          q: searchValue,
          status: filterValues.status,
          source: filterValues.source,
        });
        if (isMounted) {
          setItems(response.items);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(readErrorMessage(loadError, "Failed to load activities."));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }, searchValue ? 300 : 0);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [filterValues, searchValue]);

  return (
    <>
      <PageMeta title="CRM Activities | ITMart24 Admin" description="Review CRM activity logs across records, stages, and outreach events." />
      <CRMPageHeader
        title="Activities"
        description="Review CRM actions across lead updates, notes, tasks, conversions, and campaign events in one timeline."
      />
      {error ? <div className="mb-4 rounded-2xl bg-error-50 px-4 py-3 text-sm text-error-600">{error}</div> : null}
      <CRMFilters
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        filterValues={filterValues}
        filterConfigs={[
          { key: "status", label: "Activity Type", options: toOptions(defaultCRMSettings.activityTypes) },
          { key: "source", label: "Entity Type", options: toOptions(["lead", "contact", "company", "deal", "campaign", "segment"]) },
        ]}
        onFilterChange={(key, value) => setFilterValues((current) => ({ ...current, [key]: value }))}
        onReset={() => {
          setSearchValue("");
          setFilterValues({});
        }}
      />
      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
          Loading activity timeline...
        </div>
      ) : (
        <ActivityTimeline activities={items} />
      )}
    </>
  );
}
