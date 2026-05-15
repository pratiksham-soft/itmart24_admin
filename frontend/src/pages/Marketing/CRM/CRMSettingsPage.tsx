import { useEffect, useState } from "react";
import PageMeta from "../../../components/common/PageMeta";
import CRMPageHeader from "./components/CRMPageHeader";
import { getCRMSettings, updateCRMSettings } from "./services/crmApi";
import type { BannerState, CRMSettings } from "./types/crm.types";
import { defaultCRMSettings, readErrorMessage } from "./utils/crmHelpers";

const textAreaClassName =
  "w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export default function CRMSettingsPage() {
  const [settings, setSettings] = useState<CRMSettings>(defaultCRMSettings);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<BannerState>(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const response = await getCRMSettings();
        if (isMounted) {
          setSettings(response);
        }
      } catch (error) {
        if (isMounted) {
          setBanner({ tone: "error", message: readErrorMessage(error, "Failed to load CRM settings.") });
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  const arrayToText = (items: string[]) => items.join(", ");
  const textToArray = (value: string) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

  const showBanner = (tone: "success" | "error" | "info", message: string) => {
    setBanner({ tone, message });
    window.setTimeout(() => setBanner(null), 3000);
  };

  return (
    <>
      <PageMeta title="CRM Settings | ITMart24 Admin" description="Maintain CRM statuses, sources, stages, and CRM defaults." />
      <CRMPageHeader
        title="CRM Settings"
        description="Maintain the CRM default statuses, sources, stages, task types, and account-wide defaults used across the module."
        actionLabel="Save Settings"
        onAction={async () => {
          try {
            const response = await updateCRMSettings(settings as unknown as Record<string, unknown>);
            setSettings(response);
            showBanner("success", "CRM settings updated successfully.");
          } catch (error) {
            showBanner("error", readErrorMessage(error, "Failed to save CRM settings."));
          }
        }}
      />

      {banner ? (
        <div className={`mb-4 rounded-2xl px-4 py-3 text-sm ${
          banner.tone === "error" ? "bg-error-50 text-error-600" : banner.tone === "success" ? "bg-success-50 text-success-600" : "bg-blue-light-50 text-blue-light-600"
        }`}>
          {banner.message}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
          Loading settings...
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {[
            ["Lead Statuses", "leadStatuses"],
            ["Lead Sources", "leadSources"],
            ["Deal Stages", "dealStages"],
            ["Task Types", "taskTypes"],
            ["Contact Types", "contactTypes"],
          ].map(([label, key]) => (
            <div key={key} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="text-sm font-semibold text-gray-800 dark:text-white/90">{label}</div>
              <textarea
                rows={4}
                className={`${textAreaClassName} mt-4`}
                value={arrayToText(((settings as unknown as Record<string, string[]>)[key] ?? []))}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    [key]: textToArray(event.target.value),
                  }))
                }
              />
            </div>
          ))}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="text-sm font-semibold text-gray-800 dark:text-white/90">Default Currency</div>
            <input
              className={`${textAreaClassName} mt-4 h-11`}
              value={settings.defaultCurrency}
              onChange={(event) => setSettings((current) => ({ ...current, defaultCurrency: event.target.value }))}
            />
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="text-sm font-semibold text-gray-800 dark:text-white/90">Assignment Rules</div>
            <textarea
              rows={6}
              className={`${textAreaClassName} mt-4`}
              value={JSON.stringify(settings.assignmentRules ?? { mode: "manual" }, null, 2)}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  assignmentRules: JSON.parse(event.target.value || "{}"),
                }))
              }
            />
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="text-sm font-semibold text-gray-800 dark:text-white/90">Email Campaign Defaults</div>
            <textarea
              rows={6}
              className={`${textAreaClassName} mt-4`}
              value={JSON.stringify(settings.emailCampaignDefaults ?? { senderPolicy: "default-account" }, null, 2)}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  emailCampaignDefaults: JSON.parse(event.target.value || "{}"),
                }))
              }
            />
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="text-sm font-semibold text-gray-800 dark:text-white/90">CRM Permissions</div>
            <textarea
              rows={6}
              className={`${textAreaClassName} mt-4`}
              value={JSON.stringify(
                settings.permissions ?? {
                  view: true,
                  create: true,
                  update: true,
                  delete: true,
                  reports: true,
                  settings: true,
                  campaigns: true,
                },
                null,
                2
              )}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  permissions: JSON.parse(event.target.value || "{}"),
                }))
              }
            />
          </div>
        </div>
      )}
    </>
  );
}
