import { ArrowUpRight, Bell, Bookmark, Gift, LayoutGrid, ShieldCheck, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "../../components/common/EmptyState";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { PageHeader } from "../../components/common/PageHeader";
import { SectionCard } from "../../components/common/SectionCard";
import { StatCard } from "../../components/common/StatCard";
import { StatusBadge } from "../../components/common/StatusBadge";
import { fetchDashboardSummary } from "../../services/dashboard.service";

function findUrlValue(value: unknown): string {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return /^https?:\/\//i.test(value) ? value : "";
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findUrlValue(entry);
      if (found) {
        return found;
      }
    }
    return "";
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const directCandidates = [record.url, record.src, record.value, record.link, record.website, record.websiteUrl, record.official_url, record.officialUrl, record.custom];

    for (const candidate of directCandidates) {
      const found = findUrlValue(candidate);
      if (found) {
        return found;
      }
    }

    for (const nestedValue of Object.values(record)) {
      const found = findUrlValue(nestedValue);
      if (found) {
        return found;
      }
    }
  }

  return "";
}

function getRenewalProductWebsite(item: any) {
  return (
    findUrlValue(item?.official_url) ||
    findUrlValue(item?.metadata?.savedSnapshot?.custom?.custom) ||
    findUrlValue(item?.metadata?.savedSnapshot?.metafields?.custom?.custom) ||
    findUrlValue(item?.metadata?.savedSnapshot?.productUrl) ||
    findUrlValue(item?.metadata?.productUrl)
  );
}

export function DashboardPage() {
  const [summary, setSummary] = useState<any | null>(null);

  useEffect(() => {
    fetchDashboardSummary().then(setSummary);
  }, []);

  const nextRewardProgress = useMemo(() => {
    if (!summary) return 0;
    const current = Number(summary.stats.rewardsPoints ?? 0);
    return Math.min(100, Math.round((current / 500) * 100));
  }, [summary]);

  if (!summary) {
    return <LoadingSkeleton lines={6} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dashboard"
        title={`Welcome back, ${summary.welcomeName}`}
        description="Track the tools you use, keep research moving, and spot the next action that deserves your attention."
        actions={
          <>
            <a href="https://itmart24.com/" target="_blank" rel="noreferrer" className="portal-button-primary">Explore Products</a>
            <Link to="/products-in-use" className="portal-button-secondary">Add Product I Use</Link>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Saved Products" value={summary.stats.savedProducts} icon={<Bookmark className="h-6 w-6" />} hint="Products saved for later research." tone="light" to="/saved-products" />
        <StatCard label="Saved Comparisons" value={summary.stats.savedComparisons} icon={<LayoutGrid className="h-6 w-6" />} hint="Decision reports you can revisit anytime." tone="light" to="/saved-comparisons" />
        <StatCard label="Products I Use" value={summary.stats.productsInUse} icon={<Star className="h-6 w-6" />} hint="Active tools and subscriptions you track." tone="light" to="/products-in-use" />
        <StatCard label="Reward Points" value={summary.stats.rewardsPoints} icon={<Gift className="h-6 w-6" />} hint="Trusted activity turns into member benefits." tone="dark" to="/rewards" />
        <StatCard label="Reviews Written" value={summary.stats.reviews} icon={<ShieldCheck className="h-6 w-6" />} hint="Your buyer perspective helps future customers." tone="dark" to="/reviews" />
        <StatCard label="Unread Alerts" value={summary.stats.unreadNotifications} icon={<Bell className="h-6 w-6" />} hint="Updates waiting for a quick check-in." tone="dark" to="/notifications" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard title="Workspace overview" description="A quick pulse on setup, trust, and research momentum across your member workspace.">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="portal-section p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">Profile completion</p>
                <StatusBadge label={`${summary.profileCompletion}% complete`} tone="dark" />
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-600">Complete your profile and preferences to improve recommendations, trust signals, and notification relevance.</p>
              <div className="portal-progress mt-5">
                <span style={{ width: `${summary.profileCompletion}%` }} />
              </div>
            </div>

            <div className="portal-section p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">Verified reviewer status</p>
                <StatusBadge label={String(summary.verifiedReviewerStatus).replace(/_/g, " ")} tone={summary.verifiedReviewerStatus === "verified" ? "success" : "info"} />
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-600">Verification helps other buyers trust your reviews and gives your public contributions more credibility.</p>
              <Link to="/settings" className="portal-button-secondary mt-5">Become verified reviewer</Link>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Rewards progress" description="Stay motivated with a clearer view of your next benefit milestone.">
          <div className="portal-section p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">Next reward target</p>
              <StatusBadge label="500 points = 1 month premium" tone="info" />
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-600">You are {summary.stats.rewardsPoints} points into your next premium access reward milestone.</p>
            <div className="portal-progress mt-5">
              <span style={{ width: `${nextRewardProgress}%` }} />
            </div>
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">{nextRewardProgress}% progress</p>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard title="Upcoming renewal alerts" description="Products that need a renewal decision soon are grouped here first." tone="dark">
          {summary.upcomingRenewals.length === 0 ? (
            <EmptyState
              title="No renewals need attention yet"
              description="Add the tools you actively use and ITMart24 will group upcoming renewals, expiries, and reminders here."
              actions={<Link to="/products-in-use" className="portal-button-primary">Add Product I Use</Link>}
            />
          ) : (
            <div className="space-y-3">
              {summary.upcomingRenewals.map((item: any) => (
                <div key={item.id} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-white">{item.product_name}</p>
                      <p className="mt-1 text-sm text-slate-300">{item.vendor_name} • {item.billing_period || "Renewal tracking"}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge label={item.status === "expired" ? "Expired" : "Due soon"} tone={item.status === "expired" ? "warning" : "info"} />
                      <StatusBadge label={item.renewal_date || item.expiry_date || "Date pending"} tone="dark" />
                      {getRenewalProductWebsite(item) ? (
                        <a
                          href={getRenewalProductWebsite(item)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open ${item.product_name} website`}
                          title={`Open ${item.product_name} website`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sky-200 transition hover:bg-white/10 hover:text-white"
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Quick highlights" description="Recent activity snapshots that make it easier to scan your account at a glance.">
          <div className="space-y-4">
            <div className="portal-section p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">Recent notifications</p>
                <ArrowUpRight className="h-4 w-4 text-sky-700" />
              </div>
              {summary.recentNotifications.length === 0 ? (
                <p className="mt-3 text-sm leading-7 text-slate-600">You are all caught up.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {summary.recentNotifications.slice(0, 3).map((item: any) => (
                    <div key={item.id} className="portal-subtle-card p-4">
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-1 text-sm text-slate-600">{item.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="portal-section p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">Recent reviews</p>
                <ArrowUpRight className="h-4 w-4 text-sky-700" />
              </div>
              {summary.recentReviews.length === 0 ? (
                <p className="mt-3 text-sm leading-7 text-slate-600">Write your first genuine review to help other buyers make informed decisions.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {summary.recentReviews.slice(0, 3).map((item: any) => (
                    <div key={item.id} className="portal-subtle-card p-4">
                      <p className="text-sm font-semibold text-slate-900">{item.review_title}</p>
                      <p className="mt-1 text-sm text-slate-600">{item.product_name} • {item.status}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      {summary.stats.productsInUse === 0 ? (
        <EmptyState
          title="Your workspace is ready for the first tracked tool"
          description="Save products while browsing ITMart24, keep unlimited comparisons, and track the services you actually use from one calmer buyer workspace."
          actions={
            <>
              <a href="https://itmart24.com/" target="_blank" rel="noreferrer" className="portal-button-primary">Browse Products</a>
              <Link to="/saved-comparisons" className="portal-button-secondary">View Comparisons</Link>
            </>
          }
        />
      ) : null}
    </div>
  );
}
