
import { SubscriptionPlan } from "./types";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import Badge from "../../../components/ui/badge/Badge";
import { calculateDiscountedPrice, formatMoney } from "./pricingConfig";

type PlanTableProps = {
  plans: SubscriptionPlan[];
  onEdit: (plan: SubscriptionPlan) => void;
  onDelete: (planId: string) => void;
  onView: (plan: SubscriptionPlan) => void;
};


const PlanTable = ({ plans, onEdit, onDelete, onView }: PlanTableProps) => {
  if (!plans.length) {
    return (
      <div className="border rounded-lg p-6 text-center text-gray-500">
        No subscription plans created yet.
      </div>
    );
  }

   return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
      <div className="max-w-full overflow-x-auto">
        <Table>
          {/* Header */}
          <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
            <TableRow>
              <TableCell
                isHeader
                className="px-5 py-3 text-start font-medium text-gray-500 text-theme-xs dark:text-gray-400"
              >
                Plan
              </TableCell>

              <TableCell
                isHeader
                className="px-5 py-3 text-start font-medium text-gray-500 text-theme-xs dark:text-gray-400"
              >
                Periods & Pricing
              </TableCell>

              <TableCell
                isHeader
                className="px-5 py-3 text-start font-medium text-gray-500 text-theme-xs dark:text-gray-400"
              >
                Status
              </TableCell>

              <TableCell
                isHeader
                className="px-5 py-3 text-end font-medium text-gray-500 text-theme-xs dark:text-gray-400"
              >
                Action
              </TableCell>
            </TableRow>
          </TableHeader>

          {/* Body */}
          <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
            {plans.map((plan) => (
              <TableRow key={plan.id}>
                {/* Plan Name */}
                <TableCell className="px-5 py-4 text-start">
                  <span className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                    {plan.name}
                  </span>
                </TableCell>

                {/* Periods */}
                <TableCell className="px-4 py-3 text-start text-theme-sm text-gray-500 dark:text-gray-400">
                  <div className="max-w-[340px] space-y-2">
                    {Array.isArray(plan.periods) && plan.periods.length > 0 ? (
                      plan.periods.map((period) => (
                        <div
                          key={period.id}
                          className="rounded-xl border border-gray-100 px-3 py-2 dark:border-white/[0.05]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-gray-700 dark:text-gray-200">
                              {period.label}
                            </span>
                            <span className="font-medium text-gray-800 dark:text-white/90">
                              {formatMoney(
                                calculateDiscountedPrice(
                                  period.price,
                                  period.discountPercentage
                                )
                              )}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <span>{period.durationInMonths} months</span>
                            <span>•</span>
                            <span>{period.discountPercentage ?? 0}% off</span>
                            <span>•</span>
                            <span>
                              {period.countryPricing?.length ?? 0} country override
                              {(period.countryPricing?.length ?? 0) === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <span className="text-gray-400">
                        No periods defined
                      </span>
                    )}
                  </div>
                </TableCell>

                {/* Status */}
                <TableCell className="px-4 py-3 text-start">
                  <Badge
                    size="sm"
                    color={plan.isActive ? "success" : "error"}
                  >
                    {plan.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>

                {/* Actions */}
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

export default PlanTable;
