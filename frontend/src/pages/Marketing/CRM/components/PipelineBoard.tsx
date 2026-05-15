import Badge from "../../../../components/ui/badge/Badge";
import Button from "../../../../components/ui/button/Button";
import type { CRMDeal } from "../types/crm.types";
import { formatCurrency, formatDate, getStatusBadgeColor } from "../utils/crmHelpers";

type PipelineBoardProps = {
  deals: CRMDeal[];
  stages: string[];
  onEdit: (deal: CRMDeal) => void;
  onDelete: (deal: CRMDeal) => void;
  onStageChange: (deal: CRMDeal, stage: string) => void;
};

const selectClassName =
  "mt-3 h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export default function PipelineBoard({
  deals,
  stages,
  onEdit,
  onDelete,
  onStageChange,
}: PipelineBoardProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-7">
      {stages.map((stage) => {
        const stageDeals = deals.filter((deal) => deal.stage === stage);

        return (
          <div key={stage} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{stage}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{stageDeals.length} deals</p>
              </div>
              <Badge color={getStatusBadgeColor(stage)} size="sm">
                {stageDeals.length}
              </Badge>
            </div>

            <div className="space-y-3">
              {stageDeals.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 px-3 py-6 text-center text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  No deals
                </div>
              ) : (
                stageDeals.map((deal) => (
                  <div key={deal.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900">
                    <div className="text-sm font-semibold text-gray-800 dark:text-white/90">{deal.title}</div>
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {formatCurrency(deal.value, deal.currency)}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Close: {formatDate(deal.expectedCloseDate)}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Probability: {deal.probability}%
                    </div>
                    <select
                      value={deal.stage}
                      onChange={(event) => onStageChange(deal, event.target.value)}
                      className={selectClassName}
                    >
                      {stages.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <div className="mt-3 flex gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => onEdit(deal)}>
                        Edit
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => onDelete(deal)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
