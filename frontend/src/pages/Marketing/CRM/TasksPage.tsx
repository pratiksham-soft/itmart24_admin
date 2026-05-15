import { useState } from "react";
import PageMeta from "../../../components/common/PageMeta";
import Badge from "../../../components/ui/badge/Badge";
import TaskFormModal from "./components/TaskFormModal";
import CRMEntityPage from "./components/CRMEntityPage";
import { completeTask, createTask, deleteTask, getTasks, updateTask } from "./services/crmApi";
import type { BannerState, CRMTask } from "./types/crm.types";
import { defaultCRMSettings, formatDateTime, getPriorityBadgeColor, getStatusBadgeColor, readErrorMessage, taskLabel, toOptions } from "./utils/crmHelpers";

export default function TasksPage() {
  const [editing, setEditing] = useState<CRMTask | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [banner, setBanner] = useState<BannerState>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const showBanner = (tone: "success" | "error" | "info", message: string) => {
    setBanner({ tone, message });
    window.setTimeout(() => setBanner(null), 3000);
  };

  return (
    <>
      <PageMeta title="CRM Tasks | ITMart24 Admin" description="Manage CRM follow-ups, due dates, reminders, and completion tracking." />
      <CRMEntityPage
        title="Tasks & Follow-ups"
        description="Manage calls, emails, demos, meetings, and internal follow-up tasks with clear due-date visibility."
        actionLabel="Create Task"
        filters={[
          { key: "status", label: "Status", options: toOptions(defaultCRMSettings.taskStatuses) },
          { key: "priority", label: "Priority", options: toOptions(defaultCRMSettings.taskPriorities) },
        ]}
        loadItems={getTasks}
        deleteItem={deleteTask}
        columns={[
          {
            key: "task",
            label: "Task",
            render: (item) => (
              <div>
                <div className="font-semibold text-gray-800 dark:text-white/90">{taskLabel(item as CRMTask)}</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{(item as CRMTask).taskType}</div>
              </div>
            ),
          },
          {
            key: "status",
            label: "Status",
            render: (item) => <Badge color={getStatusBadgeColor((item as CRMTask).status)} size="sm">{(item as CRMTask).status}</Badge>,
          },
          {
            key: "priority",
            label: "Priority",
            render: (item) => <Badge color={getPriorityBadgeColor((item as CRMTask).priority)} size="sm">{(item as CRMTask).priority}</Badge>,
          },
          {
            key: "dueAt",
            label: "Due At",
            render: (item) => formatDateTime((item as CRMTask).dueAt),
          },
          {
            key: "relation",
            label: "Related To",
            render: (item) => `${(item as CRMTask).relatedType || "Not linked"}${(item as CRMTask).relatedId ? ` #${(item as CRMTask).relatedId}` : ""}`,
          },
        ]}
        rowKey={(item) => (item as CRMTask).id}
        getItemId={(item) => (item as CRMTask).id}
        getDeleteMessage={(item) => `Delete task "${taskLabel(item as CRMTask)}"?`}
        formModal={
          <TaskFormModal
            isOpen={isOpen}
            initialValue={editing}
            onClose={() => {
              setIsOpen(false);
              setEditing(null);
            }}
            onSubmit={async (payload) => {
              try {
                if (editing) {
                  await updateTask(editing.id, payload);
                  showBanner("success", "Task updated successfully.");
                } else {
                  await createTask(payload);
                  showBanner("success", "Task created successfully.");
                }
                setReloadKey((current) => current + 1);
              } catch (error) {
                throw new Error(readErrorMessage(error, "Failed to save task."));
              }
            }}
          />
        }
        onCreate={() => {
          setEditing(null);
          setIsOpen(true);
        }}
        onEdit={(item) => {
          setEditing(item as CRMTask);
          setIsOpen(true);
        }}
        onView={async (item) => {
          try {
            if ((item as CRMTask).status !== "Completed") {
              await completeTask((item as CRMTask).id);
              showBanner("success", "Task marked as completed.");
              setReloadKey((current) => current + 1);
            } else {
              showBanner("info", "Task is already completed.");
            }
          } catch (error) {
            showBanner("error", readErrorMessage(error, "Failed to complete task."));
          }
        }}
        banner={banner}
        reloadKey={reloadKey}
      />
    </>
  );
}
