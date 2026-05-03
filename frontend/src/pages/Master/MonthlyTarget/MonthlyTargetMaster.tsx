import { useEffect, useState } from "react";
import PageMeta from "../../../components/common/PageMeta";
import ComponentCard from "../../../components/common/ComponentCard";
import Badge from "../../../components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import {
  fetchMonthlyTargetRecommendation,
  fetchMonthlyTargets,
  saveMonthlyTarget,
} from "../../../services/monthlyTargets.service";
import type {
  MonthlyTargetRecommendation,
  MonthlyTargetRecord,
} from "../../../types/monthlyTarget";

type TargetFormState = {
  month: string;
  targetRevenue: number;
  targetSubscriptions: number;
  targetVendorOnboarding: number;
  remarks: string;
  status: string;
};

const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

const sortTargets = (targets: MonthlyTargetRecord[]) =>
  [...targets].sort((left, right) => right.month.localeCompare(left.month));

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
};

const getStatusColor = (status: string) => {
  if (status === "active") {
    return "success" as const;
  }

  if (status === "closed") {
    return "light" as const;
  }

  return "warning" as const;
};

const defaultFormState = (): TargetFormState => ({
  month: getCurrentMonth(),
  targetRevenue: 0,
  targetSubscriptions: 0,
  targetVendorOnboarding: 0,
  remarks: "",
  status: "draft",
});

const MonthlyTargetMaster = () => {
  const [targets, setTargets] = useState<MonthlyTargetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<MonthlyTargetRecord | null>(
    null
  );
  const [form, setForm] = useState<TargetFormState>(defaultFormState);
  const [recommendation, setRecommendation] =
    useState<MonthlyTargetRecommendation | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadTargets = async () => {
    try {
      setLoading(true);
      setError(null);
      const nextTargets = await fetchMonthlyTargets();
      setTargets(sortTargets(nextTargets));
    } catch (loadError) {
      setError("Failed to load monthly targets.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTargets();
  }, []);

  useEffect(() => {
    if (!formOpen || !form.month) {
      return;
    }

    let isMounted = true;

    const loadRecommendation = async () => {
      try {
        setRecommendationLoading(true);
        const nextRecommendation = await fetchMonthlyTargetRecommendation(form.month);

        if (!isMounted) {
          return;
        }

        setRecommendation(nextRecommendation);

        if (!selectedTarget) {
          setForm((currentForm) => ({
            ...currentForm,
            targetRevenue: nextRecommendation.suggested.targetRevenue,
            targetSubscriptions: nextRecommendation.suggested.targetSubscriptions,
            targetVendorOnboarding:
              nextRecommendation.suggested.targetVendorOnboarding,
            status: currentForm.month === getCurrentMonth() ? "active" : "draft",
          }));
        }
      } catch (recommendationError) {
        if (isMounted) {
          setRecommendation(null);
        }
      } finally {
        if (isMounted) {
          setRecommendationLoading(false);
        }
      }
    };

    loadRecommendation();

    return () => {
      isMounted = false;
    };
  }, [form.month, formOpen, selectedTarget]);

  const openCreate = () => {
    setSelectedTarget(null);
    setRecommendation(null);
    setForm(defaultFormState());
    setFormOpen(true);
  };

  const openEdit = (target: MonthlyTargetRecord) => {
    setSelectedTarget(target);
    setRecommendation(null);
    setForm({
      month: target.month,
      targetRevenue: target.targetRevenue,
      targetSubscriptions: target.targetSubscriptions,
      targetVendorOnboarding: target.targetVendorOnboarding,
      remarks: target.remarks,
      status: target.status,
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setSelectedTarget(null);
    setRecommendation(null);
    setForm(defaultFormState());
  };

  const handleSave = async () => {
    if (!form.month) {
      alert("Month is required.");
      return;
    }

    try {
      setSaving(true);

      const savedTarget = await saveMonthlyTarget(form.month, {
        targetRevenue: Number(form.targetRevenue),
        targetSubscriptions: Number(form.targetSubscriptions),
        targetVendorOnboarding: Number(form.targetVendorOnboarding),
        remarks: form.remarks,
        status: form.status,
      });

      setTargets((previousTargets) => {
        const existingIndex = previousTargets.findIndex(
          (target) => target.id === savedTarget.id
        );

        if (existingIndex === -1) {
          return sortTargets([...previousTargets, savedTarget]);
        }

        const nextTargets = [...previousTargets];
        nextTargets[existingIndex] = savedTarget;
        return sortTargets(nextTargets);
      });
      closeForm();
    } catch (saveError) {
      alert("Failed to save monthly target.");
    } finally {
      setSaving(false);
    }
  };

  const currentMonthTarget =
    targets.find((target) => target.month === getCurrentMonth()) ?? targets[0] ?? null;

  return (
    <>
      <PageMeta
        title="Monthly Target Master | ITMart24 Admin"
        description="Manage monthly targets for revenue, subscriptions, and vendor onboarding."
      />

      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-800 dark:text-white/90">
              Monthly Target Master
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Set revenue, subscription, and onboarding targets using last month&apos;s achievement as the default baseline.
            </p>
          </div>

          <button
            onClick={openCreate}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            + Create Monthly Target
          </button>
        </div>

        {currentMonthTarget ? (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Active Revenue Target
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
                {formatCurrency(currentMonthTarget.targetRevenue)}
              </h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Achieved {formatCurrency(currentMonthTarget.actual.revenue)} so far in {currentMonthTarget.label}.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Subscription Goal
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
                {currentMonthTarget.actual.subscriptions}/
                {currentMonthTarget.targetSubscriptions}
              </h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Activated subscriptions in {currentMonthTarget.label}.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Vendor Onboarding Goal
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
                {currentMonthTarget.actual.vendorOnboarding}/
                {currentMonthTarget.targetVendorOnboarding}
              </h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                New vendor profiles created in {currentMonthTarget.label}.
              </p>
            </div>
          </div>
        ) : null}

        <ComponentCard
          title="Monthly Target Registry"
          desc="Stored targets with live achievement tracking from subscription, invoice, and vendor onboarding data."
        >
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Loading monthly targets...
            </p>
          ) : error ? (
            <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
          ) : targets.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No monthly targets have been created yet.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
              <div className="max-w-full overflow-x-auto">
                <Table>
                  <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                    <TableRow>
                      <TableCell
                        isHeader
                        className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        Month
                      </TableCell>
                      <TableCell
                        isHeader
                        className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        Revenue
                      </TableCell>
                      <TableCell
                        isHeader
                        className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        Subscriptions
                      </TableCell>
                      <TableCell
                        isHeader
                        className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        Vendor Onboarding
                      </TableCell>
                      <TableCell
                        isHeader
                        className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        Progress
                      </TableCell>
                      <TableCell
                        isHeader
                        className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        Updated
                      </TableCell>
                      <TableCell
                        isHeader
                        className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        Action
                      </TableCell>
                    </TableRow>
                  </TableHeader>

                  <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                    {targets.map((target) => (
                      <TableRow key={target.id}>
                        <TableCell className="px-5 py-4 text-start">
                          <div className="flex flex-col gap-2">
                            <span className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                              {target.label}
                            </span>
                            <div className="flex items-center gap-2">
                              <Badge size="sm" color={getStatusColor(target.status)}>
                                {target.status}
                              </Badge>
                              {target.manualOverride ? (
                                <Badge size="sm" color="info">
                                  Manual override
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                          <div>{formatCurrency(target.targetRevenue)}</div>
                          <div className="text-theme-xs text-gray-400">
                            Actual {formatCurrency(target.actual.revenue)}
                          </div>
                        </TableCell>

                        <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                          <div>{target.targetSubscriptions}</div>
                          <div className="text-theme-xs text-gray-400">
                            Actual {target.actual.subscriptions}
                          </div>
                        </TableCell>

                        <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                          <div>{target.targetVendorOnboarding}</div>
                          <div className="text-theme-xs text-gray-400">
                            Actual {target.actual.vendorOnboarding}
                          </div>
                        </TableCell>

                        <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                          <div className="min-w-[120px]">
                            <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-800">
                              <div
                                className="h-2 rounded-full bg-brand-500"
                                style={{ width: `${Math.min(100, target.progressPct)}%` }}
                              ></div>
                            </div>
                            <div className="mt-2 text-theme-xs text-gray-400">
                              {target.progressPct.toFixed(1)}% of revenue goal
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                          {formatDateTime(target.updatedAt)}
                        </TableCell>

                        <TableCell className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() => openEdit(target)}
                            className="rounded-md border border-gray-300 px-3 py-1 text-theme-xs text-gray-700 dark:border-gray-700 dark:text-white"
                          >
                            Edit
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </ComponentCard>
      </div>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
          <div className="h-full w-full max-w-[460px] overflow-y-auto bg-white p-6 dark:bg-gray-900">
            <div className="mb-6 flex items-center justify-between border-b pb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">
                  {selectedTarget ? "Edit Monthly Target" : "Create Monthly Target"}
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Default target is 20% above the previous month&apos;s actual achievement.
                </p>
              </div>
              <button
                onClick={closeForm}
                className="text-2xl text-gray-500 dark:text-gray-400"
              >
                ×
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Month
                </label>
                <input
                  type="month"
                  value={form.month}
                  onChange={(event) =>
                    setForm((currentForm) => ({
                      ...currentForm,
                      month: event.target.value,
                    }))
                  }
                  disabled={Boolean(selectedTarget)}
                  className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Target Revenue
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.targetRevenue}
                    onChange={(event) =>
                      setForm((currentForm) => ({
                        ...currentForm,
                        targetRevenue: Number(event.target.value),
                      }))
                    }
                    className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Target Subscriptions
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.targetSubscriptions}
                    onChange={(event) =>
                      setForm((currentForm) => ({
                        ...currentForm,
                        targetSubscriptions: Number(event.target.value),
                      }))
                    }
                    className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Target Vendor Onboarding
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.targetVendorOnboarding}
                    onChange={(event) =>
                      setForm((currentForm) => ({
                        ...currentForm,
                        targetVendorOnboarding: Number(event.target.value),
                      }))
                    }
                    className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Status
                  </label>
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm((currentForm) => ({
                        ...currentForm,
                        status: event.target.value,
                      }))
                    }
                    className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Remarks
                </label>
                <textarea
                  rows={4}
                  value={form.remarks}
                  onChange={(event) =>
                    setForm((currentForm) => ({
                      ...currentForm,
                      remarks: event.target.value,
                    }))
                  }
                  placeholder="Add any planning notes, assumptions, or review comments."
                  className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  Baseline and Recommendation
                </h3>
                {recommendationLoading ? (
                  <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                    Calculating recommended target...
                  </p>
                ) : recommendation ? (
                  <div className="mt-3 space-y-3 text-sm text-gray-600 dark:text-gray-300">
                    <p>
                      Previous month ({recommendation.baseline.label}) actual achievement:
                    </p>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-800">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Revenue
                        </p>
                        <p className="mt-1 font-semibold text-gray-800 dark:text-white/90">
                          {formatCurrency(recommendation.baseline.revenue)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-800">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Subscriptions
                        </p>
                        <p className="mt-1 font-semibold text-gray-800 dark:text-white/90">
                          {recommendation.baseline.subscriptions}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-800">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Vendor Onboarding
                        </p>
                        <p className="mt-1 font-semibold text-gray-800 dark:text-white/90">
                          {recommendation.baseline.vendorOnboarding}
                        </p>
                      </div>
                    </div>

                    <p className="pt-2">
                      Suggested target for {recommendation.label}:
                    </p>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-800">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Revenue
                        </p>
                        <p className="mt-1 font-semibold text-gray-800 dark:text-white/90">
                          {formatCurrency(recommendation.suggested.targetRevenue)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-800">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Subscriptions
                        </p>
                        <p className="mt-1 font-semibold text-gray-800 dark:text-white/90">
                          {recommendation.suggested.targetSubscriptions}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-800">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Vendor Onboarding
                        </p>
                        <p className="mt-1 font-semibold text-gray-800 dark:text-white/90">
                          {recommendation.suggested.targetVendorOnboarding}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                    Recommendation unavailable for this month.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3 border-t pt-4">
              <button
                onClick={closeForm}
                className="px-4 py-2 text-gray-600 dark:text-gray-300"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Target"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default MonthlyTargetMaster;
