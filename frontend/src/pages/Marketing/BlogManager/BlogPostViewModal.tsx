import { Modal } from "../../../components/ui/modal";
import Button from "../../../components/ui/button/Button";
import type { BlogPost } from "../../../types/blogManager";

type BlogPostViewModalProps = {
  blog: BlogPost | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (blog: BlogPost) => void;
};

const BlogPostViewModal = ({
  blog,
  isOpen,
  onClose,
  onEdit,
}: BlogPostViewModalProps) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-4xl p-6 lg:p-8">
      <div className="space-y-6">
        <div className="border-b border-gray-200 pb-4">
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
            {blog?.title ?? "Blog Detail"}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Review the saved blog record before editing or deleting elsewhere.
          </p>
        </div>

        {blog ? (
          <>
            <div className="grid gap-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800 lg:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Category
                </p>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                  {blog.category}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Status
                </p>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                  {blog.status}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Topic
                </p>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                  {blog.topic ?? "Not set"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Template
                </p>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                  {blog.templateName ?? "Not assigned"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Cover Image URL
                </p>
                <p className="mt-1 break-all text-sm text-gray-700 dark:text-gray-300">
                  {blog.coverImageUrl ?? "Not set"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Published At
                </p>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                  {blog.publishedAt ?? "Not published"}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                Excerpt
              </p>
              <div className="mb-5 text-sm leading-6 text-gray-700 dark:text-gray-300">
                {blog.excerpt || "No excerpt saved yet."}
              </div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                Content
              </p>
              <div
                className="prose max-h-[420px] overflow-y-auto text-sm leading-6 text-gray-700 dark:prose-invert dark:text-gray-300"
                dangerouslySetInnerHTML={{
                  __html: blog.contentHtml || blog.content || "<p>No content saved yet.</p>",
                }}
              />
              {blog.errorMessage ? (
                <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {blog.errorMessage}
                </div>
              ) : null}
              {blog.tags.length > 0 ? (
                <div className="mt-5">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                    Tags
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {blog.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {blog.shopifyArticleId ? (
                <div className="mt-5 text-xs text-gray-500 dark:text-gray-400">
                  Shopify article id: {blog.shopifyArticleId}
                </div>
              ) : null}
              {blog.slug ? (
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Slug: {blog.slug}
                </div>
              ) : null}
              {blog.metaTitle || blog.metaDescription ? (
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                      Meta Title
                    </p>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                      {blog.metaTitle ?? "Not set"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                      Meta Description
                    </p>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                      {blog.metaDescription ?? "Not set"}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            No blog selected.
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {blog ? <Button onClick={() => onEdit(blog)}>Edit Blog</Button> : null}
        </div>
      </div>
    </Modal>
  );
};

export default BlogPostViewModal;
