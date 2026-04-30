import { useEffect, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import Button from "../../../components/ui/button/Button";
import InputField from "../../../components/form/input/InputField";
import BlogPostFormModal from "./BlogPostFormModal";
import BlogPostViewModal from "./BlogPostViewModal";
import {
  createBlogPost,
  deleteBlogPost,
  fetchBlogJobs,
  fetchBlogPost,
  fetchBlogPosts,
  fetchBlogTemplates,
  publishBlogPostToShopify,
  updateBlogPost,
} from "../../../services/blogManager.service";
import type { BlogJob, BlogPost, BlogPostPayload, BlogTemplate } from "../../../types/blogManager";

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const StatusBadge = ({ status }: { status: string }) => {
  const styles =
    status === "published"
      ? "bg-green-100 text-green-700"
      : status === "publish_failed"
      ? "bg-red-100 text-red-700"
      : status === "generated"
      ? "bg-blue-100 text-blue-700"
      : "bg-gray-100 text-gray-700";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${styles}`}>
      {status}
    </span>
  );
};

const Blogs = () => {
  const [blogs, setBlogs] = useState<BlogPost[]>([]);
  const [jobs, setJobs] = useState<BlogJob[]>([]);
  const [templates, setTemplates] = useState<BlogTemplate[]>([]);
  const [selectedBlog, setSelectedBlog] = useState<BlogPost | null>(null);
  const [viewBlog, setViewBlog] = useState<BlogPost | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [publishingBlogId, setPublishingBlogId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [blogResponse, jobResponse, templateResponse] = await Promise.all([
        fetchBlogPosts({
          category: categoryFilter || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
        fetchBlogJobs(),
        fetchBlogTemplates(),
      ]);
      setBlogs(blogResponse);
      setJobs(jobResponse);
      setTemplates(templateResponse);
    } catch (requestError) {
      console.error(requestError);
      setError(
        (requestError as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Failed to load blogs"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [categoryFilter, startDate, endDate]);

  const categoryOptions = useMemo(
    () =>
      Array.from(new Set(blogs.map((blog) => blog.category)))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
    [blogs]
  );

  const handleSave = async (payload: BlogPostPayload, blogId?: number) => {
    try {
      setIsSaving(true);
      const savedBlog = blogId
        ? await updateBlogPost(blogId, payload)
        : await createBlogPost(payload);
      setBlogs((previous) => {
        const hasExisting = previous.some((entry) => entry.id === savedBlog.id);
        if (hasExisting) {
          return previous.map((entry) => (entry.id === savedBlog.id ? savedBlog : entry));
        }

        return [savedBlog, ...previous];
      });
      setSelectedBlog(null);
      setIsFormOpen(false);
      setSuccessMessage(blogId ? "Blog updated successfully." : "Blog created successfully.");
    } catch (requestError: any) {
      alert(requestError?.response?.data?.error ?? "Failed to save blog");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (blogId: number) => {
    if (!confirm("Delete this blog record?")) {
      return;
    }

    try {
      await deleteBlogPost(blogId);
      setBlogs((previous) => previous.filter((entry) => entry.id !== blogId));
      setSuccessMessage("Blog deleted successfully.");
    } catch (requestError: any) {
      alert(requestError?.response?.data?.error ?? "Failed to delete blog");
    }
  };

  const handleView = async (blogId: number) => {
    try {
      const blog = await fetchBlogPost(blogId);
      setViewBlog(blog);
      setIsViewOpen(true);
    } catch (requestError: any) {
      alert(requestError?.response?.data?.error ?? "Failed to load blog detail");
    }
  };

  const handlePublish = async (blog: BlogPost) => {
    if (!confirm(`Publish "${blog.title}" to Shopify now?`)) {
      return;
    }

    try {
      setPublishingBlogId(blog.id);
      setError(null);
      const response = await publishBlogPostToShopify(blog.id, true);
      if (response.post) {
        setBlogs((previous) =>
          previous.map((entry) => (entry.id === response.post.id ? response.post : entry))
        );
      }
      setSuccessMessage(response.message ?? "Blog published successfully.");
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.message ??
          requestError?.response?.data?.error ??
          "Failed to publish blog to Shopify"
      );
    } finally {
      setPublishingBlogId(null);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-800 dark:text-white/90">
            Blogs
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage generated or posted blogs, review details, and keep category-based content organized.
          </p>
        </div>
        <Button
          onClick={() => {
            setSelectedBlog(null);
            setIsFormOpen(true);
          }}
        >
          Create Blog
        </Button>
      </div>

      {successMessage ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMessage}
        </div>
      ) : null}

      <div className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/[0.05] dark:bg-white/[0.03] lg:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Category filter
          </label>
          <select
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="">All categories</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Start date
          </label>
          <InputField type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            End date
          </label>
          <InputField type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </div>
      </div>

      {loading ? <div className="text-gray-500">Loading blogs...</div> : null}
      {error ? <div className="text-red-600">{error}</div> : null}

      {!loading && !error ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                <TableRow>
                  {["Blog title", "Category", "Status", "Created date", "Actions"].map((label) => (
                    <TableCell
                      key={label}
                      isHeader
                      className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                    >
                      {label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                {blogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="px-5 py-8 text-center text-sm text-gray-500">
                      No blogs found for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  blogs.map((blog) => (
                    <TableRow key={blog.id}>
                      <TableCell className="px-5 py-4 text-sm font-medium text-gray-800 dark:text-white/90">
                        <div>{blog.title}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          Template: {blog.templateName ?? "Not assigned"}
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                        {blog.category}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                        <div className="space-y-1">
                          <StatusBadge status={blog.status} />
                          {blog.publishError ? (
                            <div className="text-xs text-red-600">{blog.publishError}</div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                        {formatDate(blog.createdAt)}
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => handleView(blog.id)}>
                            View
                          </Button>
                          {["generated", "draft", "publish_failed"].includes(blog.status) ? (
                            <Button
                              variant="outline"
                              onClick={() => handlePublish(blog)}
                              disabled={publishingBlogId === blog.id}
                            >
                              {publishingBlogId === blog.id ? "Publishing..." : "Publish"}
                            </Button>
                          ) : null}
                          <Button
                            variant="outline"
                            onClick={() => {
                              setSelectedBlog(blog);
                              setIsFormOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button variant="outline" onClick={() => handleDelete(blog.id)}>
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      <BlogPostFormModal
        blog={selectedBlog}
        jobs={jobs}
        templates={templates}
        isOpen={isFormOpen}
        isSaving={isSaving}
        onClose={() => {
          setSelectedBlog(null);
          setIsFormOpen(false);
        }}
        onSubmit={handleSave}
      />

      <BlogPostViewModal
        blog={viewBlog}
        isOpen={isViewOpen}
        onClose={() => {
          setViewBlog(null);
          setIsViewOpen(false);
        }}
        onEdit={(blog) => {
          setIsViewOpen(false);
          setViewBlog(null);
          setSelectedBlog(blog);
          setIsFormOpen(true);
        }}
      />
    </div>
  );
};

export default Blogs;
