import { useEffect, useMemo, useState } from "react";
import { Modal } from "../../../components/ui/modal";
import Button from "../../../components/ui/button/Button";
import InputField from "../../../components/form/input/InputField";
import TextArea from "../../../components/form/input/TextArea";
import MultiSelect from "../../../components/form/MultiSelect";
import Switch from "../../../components/form/switch/Switch";
import type {
  BlogJob,
  BlogJobCategory,
  BlogJobPayload,
  BlogTemplate,
} from "../../../types/blogManager";

type BlogJobFormModalProps = {
  job: BlogJob | null;
  templates: BlogTemplate[];
  categoryOptions: string[];
  pendingTopicsByCategory: Record<string, string[]>;
  isSaving: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: BlogJobPayload, jobId?: number) => Promise<void>;
  onSaveTemplate: (payload: {
    id?: number;
    name: string;
    content: string;
    isDefault: boolean;
  }) => Promise<BlogTemplate>;
};

type TemplateDraft = {
  id?: number;
  name: string;
  content: string;
  isDefault: boolean;
};

const emptyCategory = (category: string): BlogJobCategory => ({
  category,
  blogCount: 1,
  topics: [],
});

const buildInitialTemplateDraft = (
  job: BlogJob | null,
  templates: BlogTemplate[]
): TemplateDraft => {
  const selectedTemplate = templates.find((template) => template.id === job?.templateId);
  const defaultTemplate = templates.find((template) => template.isDefault);
  const template = selectedTemplate ?? defaultTemplate;

  return {
    id: selectedTemplate?.id,
    name: template?.name ?? "",
    content:
      typeof job?.settings?.templateNotes === "string"
        ? String(job.settings.templateNotes)
        : template?.content ?? "",
    isDefault: selectedTemplate?.isDefault ?? false,
  };
};

const BlogJobFormModal = ({
  job,
  templates,
  categoryOptions,
  pendingTopicsByCategory,
  isSaving,
  isOpen,
  onClose,
  onSubmit,
  onSaveTemplate,
}: BlogJobFormModalProps) => {
  const [name, setName] = useState("");
  const [cronExpression, setCronExpression] = useState("0 9 * * *");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [categories, setCategories] = useState<BlogJobCategory[]>([]);
  const [sourceLinks, setSourceLinks] = useState<string[]>([""]);
  const [status, setStatus] = useState("inactive");
  const [imagePromptEnabled, setImagePromptEnabled] = useState(false);
  const [autoPublishEnabled, setAutoPublishEnabled] = useState(false);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>({
    name: "",
    content: "",
    isDefault: false,
  });
  const [customCategoryName, setCustomCategoryName] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);
  const [contentGuidance, setContentGuidance] = useState(
    "Generated blog content should be professional and human-like."
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const initialCategories = job?.categories ?? [];
    const initialSelectedCategories = initialCategories.map((entry) => entry.category);

    setName(job?.name ?? "");
    setCronExpression(job?.cronExpression ?? "0 9 * * *");
    setSelectedCategories(initialSelectedCategories);
    setCategories(
      initialCategories.length > 0 ? initialCategories : []
    );
    setSourceLinks(
      job?.sourceLinks?.length
        ? job.sourceLinks.map((entry) => entry.url)
        : [""]
    );
    setStatus(job?.status ?? "inactive");
    setImagePromptEnabled(Boolean(job?.imagePromptEnabled));
    setAutoPublishEnabled(Boolean(job?.autoPublishEnabled));
    setTemplateId(job?.templateId ?? null);
    setTemplateDraft(buildInitialTemplateDraft(job, templates));
    setContentGuidance(
      typeof job?.settings?.contentGuidance === "string"
        ? String(job.settings.contentGuidance)
        : "Generated blog content should be professional and human-like."
    );
  }, [isOpen, job, templates]);

  const resolvedCategoryOptions = useMemo(() => {
    const merged = new Set<string>([
      ...categoryOptions,
      ...Object.keys(pendingTopicsByCategory),
      ...categories.map((entry) => entry.category),
    ]);

    return Array.from(merged)
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
  }, [categories, categoryOptions, pendingTopicsByCategory]);

  const handleCategorySelection = (values: string[]) => {
    setSelectedCategories(values);
    setCategories((previous) =>
      values.map(
        (category) =>
          previous.find((entry) => entry.category === category) ?? emptyCategory(category)
      )
    );
  };

  const handleCategoryChange = (
    categoryName: string,
    updater: (category: BlogJobCategory) => BlogJobCategory
  ) => {
    setCategories((previous) =>
      previous.map((entry) =>
        entry.category === categoryName ? updater(entry) : entry
      )
    );
  };

  const handleSaveTemplate = async () => {
    if (!templateDraft.name.trim()) {
      alert("Template name is required");
      return;
    }

    try {
      setTemplateSaving(true);
      const savedTemplate = await onSaveTemplate({
        id: templateDraft.id,
        name: templateDraft.name.trim(),
        content: templateDraft.content,
        isDefault: templateDraft.isDefault,
      });
      setTemplateId(savedTemplate.id);
      setTemplateDraft({
        id: savedTemplate.id,
        name: savedTemplate.name,
        content: savedTemplate.content,
        isDefault: savedTemplate.isDefault,
      });
    } catch (error: any) {
      alert(error?.response?.data?.error ?? error?.message ?? "Failed to save template");
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      alert("Job name is required");
      return;
    }

    if (!cronExpression.trim()) {
      alert("Cron schedule is required");
      return;
    }

    if (categories.length === 0) {
      alert("At least one category is required");
      return;
    }

    if (categories.some((entry) => entry.blogCount <= 0)) {
      alert("Blog count must be greater than 0");
      return;
    }

    const cleanedSourceLinks = sourceLinks.map((entry) => entry.trim()).filter(Boolean);
    const urlPattern = /^https?:\/\/.+/i;
    if (cleanedSourceLinks.some((entry) => !urlPattern.test(entry))) {
      alert("All preferred source URLs must be valid");
      return;
    }

    await onSubmit(
      {
        name: name.trim(),
        cronExpression: cronExpression.trim(),
        templateId,
        imagePromptEnabled,
        autoPublishEnabled,
        status,
        settings: {
          templateNotes: templateDraft.content,
          contentGuidance: contentGuidance.trim(),
        },
        categories,
        sourceLinks: cleanedSourceLinks,
      },
      job?.id
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-h-[calc(100vh-2rem)] max-w-5xl overflow-hidden"
    >
      <div className="flex max-h-[calc(100vh-2rem)] flex-col">
        <div className="shrink-0 border-b border-gray-200 px-6 pb-4 pt-6 lg:px-8 lg:pt-8">
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
            {job ? "Edit Job" : "Create Job"}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Generated blog content should be professional and human-like.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 lg:px-8">
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Job Name
              </label>
              <InputField
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Daily cloud services blog batch"
                hint="Required"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Cron Schedule
              </label>
              <InputField
                value={cronExpression}
                onChange={(event) => setCronExpression(event.target.value)}
                placeholder="0 9 * * *"
                hint="Required. Example: 0 9 * * * (daily 9 AM)"
              />
            </div>

            <div>
              <MultiSelect
                label="Blog Categories"
                options={resolvedCategoryOptions.map((category) => ({
                  value: category,
                  text: category,
                }))}
                value={selectedCategories}
                onChange={handleCategorySelection}
                placeholder="Choose one or more categories"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Required. Each selected category needs its own blog count and topic list.
              </p>
              <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_120px]">
                <InputField
                  value={customCategoryName}
                  onChange={(event) => setCustomCategoryName(event.target.value)}
                  placeholder="Add new category"
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    const nextCategory = customCategoryName.trim();
                    if (!nextCategory) {
                      return;
                    }

                    if (!selectedCategories.includes(nextCategory)) {
                      handleCategorySelection([...selectedCategories, nextCategory]);
                    }
                    setCustomCategoryName("");
                  }}
                >
                  Add
                </Button>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Status
              </label>
              <select
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
              <Switch
                label="Enable image prompt generation"
                defaultChecked={imagePromptEnabled}
                onChange={setImagePromptEnabled}
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Helper only for now. No image generation implementation is included in this release.
              </p>
            </div>

            <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
              <Switch
                label="Auto Publish to Shopify"
                defaultChecked={autoPublishEnabled}
                onChange={setAutoPublishEnabled}
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Default is off. Generated blogs will publish to Shopify automatically only when this is enabled.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Content Guidance
              </label>
              <TextArea
                rows={3}
                value={contentGuidance}
                onChange={setContentGuidance}
                hint="This helper text is saved with the job settings."
              />
            </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                  Blog Template
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Select an existing template or save the current draft as a reusable default.
                </p>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Selected Template
              </label>
              <select
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                value={templateId ?? ""}
                onChange={(event) => {
                  const nextValue = event.target.value ? Number(event.target.value) : null;
                  setTemplateId(nextValue);
                  const selectedTemplate = templates.find(
                    (template) => template.id === nextValue
                  );
                  if (selectedTemplate) {
                    setTemplateDraft({
                      id: selectedTemplate.id,
                      name: selectedTemplate.name,
                      content: selectedTemplate.content,
                      isDefault: selectedTemplate.isDefault,
                    });
                  }
                }}
              >
                <option value="">Use default template when job template is empty</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                    {template.isDefault ? " (Default)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Template Name
              </label>
              <InputField
                value={templateDraft.name}
                onChange={(event) =>
                  setTemplateDraft((previous) => ({
                    ...previous,
                    name: event.target.value,
                  }))
                }
                placeholder="Long-form comparison blog"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Template Settings and Notes
              </label>
              <TextArea
                rows={6}
                value={templateDraft.content}
                onChange={(value) =>
                  setTemplateDraft((previous) => ({
                    ...previous,
                    content: value,
                  }))
                }
                hint="You can save or update this template before saving the job."
              />
            </div>

            <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
              <Switch
                label="Mark template as default"
                defaultChecked={templateDraft.isDefault}
                onChange={(checked) =>
                  setTemplateDraft((previous) => ({
                    ...previous,
                    isDefault: checked,
                  }))
                }
              />
            </div>

            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={handleSaveTemplate}
                disabled={templateSaving}
              >
                {templateSaving ? "Saving Template..." : "Save Template"}
              </Button>
            </div>
            </div>
          </div>

            <div className="space-y-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                  Blog Category Configuration
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Manual topics logic: use pending topics first. If a category has no pending topics, it should be skipped.
                  If all categories are empty, do nothing and log &quot;No pending topics&quot; later in automation.
                </p>
              </div>

              {categories.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 p-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  Select at least one category to configure blog counts and topics.
                </div>
              ) : (
                <div className="space-y-4">
                  {categories.map((category) => {
                    const pendingTopics = pendingTopicsByCategory[category.category] ?? [];

                    return (
                      <div
                        key={category.category}
                        className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800"
                      >
                        <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
                          <div>
                            <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
                              {category.category}
                            </h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Pending saved topics: {pendingTopics.length}
                            </p>
                          </div>
                          <div>
                            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                              Blogs Count
                            </label>
                            <InputField
                              type="number"
                              min="1"
                              value={category.blogCount}
                              onChange={(event) =>
                                handleCategoryChange(category.category, (previous) => ({
                                  ...previous,
                                  blogCount: Number(event.target.value || 0),
                                }))
                              }
                            />
                          </div>
                        </div>

                        {pendingTopics.length > 0 && (
                          <div className="mt-4">
                            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                              Saved Topics
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {pendingTopics.map((topic) => {
                                const alreadyAdded = category.topics.some(
                                  (entry) => entry.topic.toLowerCase() === topic.toLowerCase()
                                );

                                return (
                                  <button
                                    key={topic}
                                    type="button"
                                    className={`rounded-full border px-3 py-1.5 text-xs ${
                                      alreadyAdded
                                        ? "border-brand-200 bg-brand-50 text-brand-700"
                                        : "border-gray-300 text-gray-600 hover:border-brand-300 hover:text-brand-600 dark:border-gray-700 dark:text-gray-300"
                                    }`}
                                    onClick={() => {
                                      if (alreadyAdded) {
                                        return;
                                      }

                                      handleCategoryChange(category.category, (previous) => ({
                                        ...previous,
                                        topics: [
                                          ...previous.topics,
                                          { topic, status: "pending" },
                                        ],
                                      }));
                                    }}
                                  >
                                    {topic}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="mt-4 space-y-3">
                          {category.topics.map((topicEntry, topicIndex) => (
                            <div
                              key={`${category.category}-${topicIndex}`}
                              className="grid gap-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50 lg:grid-cols-[1fr_130px_88px]"
                            >
                              <InputField
                                value={topicEntry.topic}
                                onChange={(event) =>
                                  handleCategoryChange(category.category, (previous) => ({
                                    ...previous,
                                    topics: previous.topics.map((entry, index) =>
                                      index === topicIndex
                                        ? { ...entry, topic: event.target.value }
                                        : entry
                                    ),
                                  }))
                                }
                                placeholder="Enter topic"
                              />
                              <select
                                className="h-11 rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                                value={topicEntry.status}
                                onChange={(event) =>
                                  handleCategoryChange(category.category, (previous) => ({
                                    ...previous,
                                    topics: previous.topics.map((entry, index) =>
                                      index === topicIndex
                                        ? { ...entry, status: event.target.value }
                                        : entry
                                    ),
                                  }))
                                }
                              >
                                <option value="pending">Pending</option>
                                <option value="used">Used</option>
                                <option value="archived">Archived</option>
                              </select>
                              <Button
                                variant="outline"
                                onClick={() =>
                                  handleCategoryChange(category.category, (previous) => ({
                                    ...previous,
                                    topics: previous.topics.filter(
                                      (_entry, index) => index !== topicIndex
                                    ),
                                  }))
                                }
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4">
                          <Button
                            variant="outline"
                            onClick={() =>
                              handleCategoryChange(category.category, (previous) => ({
                                ...previous,
                                topics: [
                                  ...previous.topics,
                                  {
                                    topic: "",
                                    status: "pending",
                                  },
                                ],
                              }))
                            }
                          >
                            Add Topic
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                    Preferred Research Source Links
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Add trusted URLs for future research flow. Only valid URLs are allowed.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setSourceLinks((previous) => [...previous, ""])}
                >
                  Add URL
                </Button>
              </div>

              <div className="space-y-3">
                {sourceLinks.map((sourceLink, index) => (
                  <div
                    key={`source-link-${index}`}
                    className="grid gap-3 lg:grid-cols-[1fr_88px]"
                  >
                    <InputField
                      value={sourceLink}
                      onChange={(event) =>
                        setSourceLinks((previous) =>
                          previous.map((entry, entryIndex) =>
                            entryIndex === index ? event.target.value : entry
                          )
                        )
                      }
                      placeholder="https://example.com/research-source"
                    />
                    <Button
                      variant="outline"
                      onClick={() =>
                        setSourceLinks((previous) =>
                          previous.length === 1
                            ? [""]
                            : previous.filter((_entry, entryIndex) => entryIndex !== index)
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-200 px-6 py-4 dark:border-gray-800 lg:px-8">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? "Saving..." : job ? "Update Job" : "Create Job"}
          </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default BlogJobFormModal;
