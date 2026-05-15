import { Table, TableBody, TableCell, TableHeader, TableRow } from "../../../../components/ui/table";
import Button from "../../../../components/ui/button/Button";

type CRMTableColumn<T> = {
  key: string;
  label: string;
  render: (item: T) => React.ReactNode;
  className?: string;
};

type CRMTableProps<T> = {
  columns: CRMTableColumn<T>[];
  items: T[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  onView?: (item: T) => void;
  rowKey: (item: T) => string | number;
};

export default function CRMTable<T>({
  columns,
  items,
  loading,
  emptyTitle = "No records found",
  emptyDescription = "Try changing the filters or add a new record.",
  onEdit,
  onDelete,
  onView,
  rowKey,
}: CRMTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/70">
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  isHeader
                  className={`px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 ${column.className || ""}`}
                >
                  {column.label}
                </TableCell>
              ))}
              {(onView || onEdit || onDelete) ? (
                <TableCell
                  isHeader
                  className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                >
                  Actions
                </TableCell>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                  Loading CRM data...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="px-5 py-12 text-center">
                  <div className="text-base font-semibold text-gray-800 dark:text-white/90">{emptyTitle}</div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{emptyDescription}</div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={rowKey(item)} className="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
                  {columns.map((column) => (
                    <TableCell key={column.key} className="px-5 py-4 align-top text-sm text-gray-700 dark:text-gray-300">
                      {column.render(item)}
                    </TableCell>
                  ))}
                  {(onView || onEdit || onDelete) ? (
                    <TableCell className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        {onView ? (
                          <Button type="button" size="sm" variant="outline" onClick={() => onView(item)}>
                            View
                          </Button>
                        ) : null}
                        {onEdit ? (
                          <Button type="button" size="sm" variant="outline" onClick={() => onEdit(item)}>
                            Edit
                          </Button>
                        ) : null}
                        {onDelete ? (
                          <Button type="button" size="sm" variant="outline" onClick={() => onDelete(item)}>
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
