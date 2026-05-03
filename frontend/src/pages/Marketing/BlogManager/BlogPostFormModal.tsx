import { useEffect, useState } from "react";
import { Modal } from "../../../components/ui/modal";
import Button from "../../../components/ui/button/Button";
import InputField from "../../../components/form/input/InputField";
import TextArea from "../../../components/form/input/TextArea";
import type { BlogJob, BlogPost, BlogPostPayload, BlogTemplate } from "../../../types/blogManager";

type BlogPostFormModalProps = {
  blog: BlogPost | null;
  jobs: BlogJob[];
  templates: BlogTemplate[];
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (payload: BlogPostPayload, blogId?: number) => Promise<void>;
};

const BlogPostFormModal = ({
  blog,
  jobs,
  templates,
  isOpen,
  isSaving,
  onClose,
  onSubmit,
}: BlogPostFormModalProps) => {
  const [jobId, setJobId] = useState<number | null>(null);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [status, setStatus] = useState("draft");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setJobId(blog?.jobId ?? null);
    setTemplateId(blog?.templateId ?? null);
    setTitle(blog?.title ?? "");
    setCategory(blog?.category ?? "");
    setContent(blog?.contentHtml ?? blog?.content ?? "");
    setCoverImageUrl(blog?.coverImageUrl ?? "");
    setStatus(blog?.status ?? "draft");
  }, [blog, isOpen]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      alert("Blog title is required");
      return;
    }

    if (!category.trim()) {
      alert("Blog category is required");
      return;
    }

    await onSubmit(
      {
        jobId,
        templateId,
        title: title.trim(),
        category: category.trim(),
        content,
        contentHtml: content,
        coverImageUrl: coverImageUrl.trim(),
        status,
      },
      blog?.id
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-4xl p-6 lg:p-8">
      <div className="space-y-6">
        <div className="border-b border-gray-200 pb-4">
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
            {blog ? "Edit Blog" : "Create Blog"}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Generated blog content should be professional and human-like.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Blog Title
              </label>
              <InputField
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Top managed cloud backup solutions for SMBs"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Category
              </label>
              <InputField
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Cloud Services"
              />
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
                <option value="draft">Draft</option>
                <option value="generated">Generated</option>
                <option value="published">Published</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Source Job
              </label>
              <select
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                value={jobId ?? ""}
                onChange={(event) => setJobId(event.target.value ? Number(event.target.value) : null)}
              >
                <option value="">No linked job</option>
                {jobs.map((jobEntry) => (
                  <option key={jobEntry.id} value={jobEntry.id}>
                    {jobEntry.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Template
              </label>
              <select
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                value={templateId ?? ""}
                onChange={(event) =>
                  setTemplateId(event.target.value ? Number(event.target.value) : null)
                }
              >
                <option value="">No template</option>
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
                Cover Image URL
              </label>
              <InputField
                value={coverImageUrl}
                onChange={(event) => setCoverImageUrl(event.target.value)}
                placeholder="https://example.com/cover-image.png"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Content
          </label>
          <TextArea
            rows={12}
            value={content}
            onChange={setContent}
            hint="TODO placeholders exist only in the backend for generation, research, posting, and logging."
          />
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? "Saving..." : blog ? "Update Blog" : "Create Blog"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default BlogPostFormModal;
