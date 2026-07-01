import Badge from "../../../components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { calculateDiscountedPrice, formatMoney } from "./pricingConfig";
import { OneTimeReportPlan } from "./types";

type Props = {
  plans: OneTimeReportPlan[];
  onEdit: (plan: OneTimeReportPlan) => void;
  onDelete: (planId: string) => void;
  onView: (plan: OneTimeReportPlan) => void;
};

const TOOL_LABELS: Record<OneTimeReportPlan["toolKey"], string> = {
  seo_health: "SEO Health",
  ai_analysis: "AI Analysis",
  competitor_comparison: "Competitor Comparison",
};

const OneTimeReportPlanTable = ({ plans, onEdit, onDelete, onView }: Props) => {
  if (!plans.length) {
    return (
      <div className="rounded-lg border p-6 text-center text-gray-500">
        No one-time report plans created yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
            <TableRow>
              <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                Plan
              </TableCell>
              <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                Tool & Pricing
              </TableCell>
              <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                Status
              </TableCell>
              <TableCell isHeader className="px-5 py-3 text-end text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                Action
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
            {plans.map((plan) => (
              <TableRow key={plan.id}>
                <TableCell className="px-5 py-4 text-start">
                  <div>
                    <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                      {plan.displayName}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {plan.planKey}
                    </p>
                    {plan.summaryLine ? (
                      <p className="mt-1 max-w-[320px] text-xs text-gray-500 dark:text-gray-400">
                        {plan.summaryLine}
                      </p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3 text-start text-theme-sm text-gray-500 dark:text-gray-400">
                  <div className="space-y-2">
                    <div className="rounded-xl border border-gray-100 px-3 py-2 dark:border-white/[0.05]">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="font-medium text-gray-700 dark:text-gray-200">
                          {TOOL_LABELS[plan.toolKey]}
                        </span>
                        <span className="font-medium text-gray-800 dark:text-white/90">
                          {formatMoney(plan.fallbackPriceUsd, "USD")}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>{plan.maxCompetitors} max competitors</span>
                        <span>&bull;</span>
                        <span>{formatMoney(plan.priceInr, "INR")} INR base</span>
                        <span>&bull;</span>
                        <span>{plan.countryPricing.length} country override{plan.countryPricing.length === 1 ? "" : "s"}</span>
                        <span>&bull;</span>
                        <span>{plan.pdfExportEnabled ? "PDF export on" : "PDF export off"}</span>
                      </div>
                    </div>
                    {plan.countryPricing.slice(0, 2).map((market) => (
                      <div
                        key={market.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-gray-200 px-3 py-2 text-xs dark:border-white/[0.06]"
                      >
                        <span className="text-gray-600 dark:text-gray-300">
                          {market.countryName} ({market.currencyCode})
                        </span>
                        <span className="font-medium text-gray-800 dark:text-white/90">
                          {formatMoney(
                            calculateDiscountedPrice(
                              market.price,
                              market.discountPercentage
                            ),
                            market.currencyCode
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3 text-start">
                  <Badge size="sm" color={plan.isActive ? "success" : "error"}>
                    {plan.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="px-4 py-3 text-end">
                  <div className="flex justify-end gap-4 text-theme-sm">
                    <button
                      onClick={() => onView(plan)}
                      className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                    >
                      View
                    </button>
                    <button
                      onClick={() => onEdit(plan)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(plan.id!)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default OneTimeReportPlanTable;
