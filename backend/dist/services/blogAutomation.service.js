"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createShopifyArticle = exports.runAllActiveBlogJobs = exports.runBlogJob = void 0;
const analyticsPostgres_service_1 = require("./analyticsPostgres.service");
const aiProvider_service_1 = require("./aiProvider.service");
const blogManager_service_1 = require("./blogManager.service");
const openaiBlog_service_1 = require("./openaiBlog.service");
const groqReplicateBlog_service_1 = require("./groqReplicateBlog.service");
const shopifyBlog_service_1 = require("./shopifyBlog.service");
const parseEnvInteger = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
};
const BLOG_MAX_TOPICS_PER_RUN = Math.max(1, parseEnvInteger(process.env.BLOG_MAX_TOPICS_PER_RUN, 1));
const MAX_AUTOMATIC_WAIT_MS = 60000;
const BLOG_IMAGE_COUNT = Math.max(0, parseEnvInteger(process.env.BLOG_IMAGE_COUNT, 1));
const BLOG_INLINE_IMAGE_COUNT = Math.max(0, parseEnvInteger(process.env.BLOG_INLINE_IMAGE_COUNT, 0));
const BLOG_ENABLE_INLINE_IMAGES = ["1", "true", "yes", "on"].includes(String(process.env.BLOG_ENABLE_INLINE_IMAGES ?? "").trim().toLowerCase());
const MAX_OPENAI_TEXT_RETRIES = 1;
const runningBlogJobIds = new Set();
const normalizeKey = (value) => value.trim().toLowerCase().replace(/\s+/g, " ");
const escapeHtml = (value) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const stripHtmlTags = (value) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const toTitleCase = (value) => value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
const tokenize = (value) => value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
const buildExcerpt = (value) => {
    const plainText = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return plainText.slice(0, 280);
};
const combineUsage = (...usageParts) => usageParts.reduce((accumulator, current, index) => ({
    ...accumulator,
    [`part_${index + 1}`]: current,
}), {});
const extractImageSources = (contentHtml) => {
    const sources = new Set();
    const imgTagPattern = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
    let match = null;
    while ((match = imgTagPattern.exec(contentHtml)) !== null) {
        const source = String(match[1] ?? "").trim();
        if (source) {
            sources.add(source);
        }
    }
    return Array.from(sources);
};
const isShopifyHostedUrl = (value) => value.includes("cdn.shopify.com") || value.includes("/cdn/shop/files/");
const replaceImageSourcesWithShopifyUrls = async (params) => {
    let nextCoverImageUrl = params.coverImageUrl;
    let nextContentHtml = params.contentHtml;
    const sourceUrls = new Set();
    if (params.coverImageUrl && !isShopifyHostedUrl(params.coverImageUrl)) {
        sourceUrls.add(params.coverImageUrl);
    }
    extractImageSources(params.contentHtml)
        .filter((url) => !isShopifyHostedUrl(url))
        .forEach((url) => sourceUrls.add(url));
    for (const sourceUrl of sourceUrls) {
        const uploaded = await (0, shopifyBlog_service_1.uploadImageToShopifyFiles)({
            sourceUrl,
            alt: params.title,
        });
        if (nextCoverImageUrl === sourceUrl) {
            nextCoverImageUrl = uploaded.url;
        }
        nextContentHtml = nextContentHtml.split(sourceUrl).join(uploaded.url);
        if (uploaded.originalSourceUrl) {
            nextContentHtml = nextContentHtml.split(uploaded.originalSourceUrl).join(uploaded.url);
        }
    }
    return {
        coverImageUrl: nextCoverImageUrl,
        contentHtml: nextContentHtml,
    };
};
const buildPremiumImagePrompt = (params) => [
    `High-end futuristic SaaS illustration for ${params.topic}.`,
    `Show ${params.focus} inside a modern analytics dashboard, cloud platform, digital marketplace, automation system, or enterprise SaaS workspace related to ${params.category}.`,
    "Use glowing data flows, semi-3D UI cards, modern dashboard panels, cinematic soft lighting, depth, shadows, clean minimal composition, premium high-definition digital illustration.",
    "Color palette: neon blue, purple gradients, subtle dark or soft atmospheric background.",
    "Professional enterprise software feel, ultra detailed, 4K.",
    "No text in image, no logo, no watermark, no cartoonish style, no flat clipart, no low-detail stock illustration.",
    params.suggestedPrompt ? `Additional guidance: ${params.suggestedPrompt}` : "",
]
    .filter(Boolean)
    .join(" ");
const buildImageAltText = (params) => [
    params.focus ? `${params.focus} illustration` : null,
    params.topic,
    params.category,
    params.title,
]
    .filter(Boolean)
    .join(" - ")
    .slice(0, 180);
const insertCoverImageIntoHtml = (contentHtml, coverImageUrl, altText) => {
    if (!coverImageUrl) {
        return contentHtml;
    }
    const figure = `<figure class="blog-cover-image"><img src="${escapeHtml(coverImageUrl)}" alt="${escapeHtml(altText)}" loading="eager" /></figure>`;
    if (/<figure\b[^>]*blog-cover-image/i.test(contentHtml)) {
        return contentHtml;
    }
    if (/<div\b[^>]*summary-box[^>]*>[\s\S]*?<\/div>/i.test(contentHtml)) {
        return contentHtml.replace(/(<div\b[^>]*summary-box[^>]*>[\s\S]*?<\/div>)/i, `$1${figure}`);
    }
    if (/<p\b[^>]*>[\s\S]*?<\/p>/i.test(contentHtml)) {
        return contentHtml.replace(/(<p\b[^>]*>[\s\S]*?<\/p>)/i, `$1${figure}`);
    }
    return `${figure}${contentHtml}`;
};
const insertInlineImagesIntoHtml = (contentHtml, inlineImages) => {
    if (inlineImages.length === 0) {
        return contentHtml;
    }
    const matches = Array.from(contentHtml.matchAll(/<h2\b[^>]*>[\s\S]*?<\/h2>/gi));
    if (matches.length === 0) {
        return contentHtml;
    }
    let nextHtml = contentHtml;
    let appliedCount = 0;
    for (const match of matches) {
        if (appliedCount >= inlineImages.length) {
            break;
        }
        const image = inlineImages[appliedCount];
        const figure = `${match[0]}<figure class="blog-inline-image"><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt)}" loading="lazy" /></figure>`;
        if (nextHtml.includes(figure)) {
            continue;
        }
        nextHtml = nextHtml.replace(match[0], figure);
        appliedCount += 1;
    }
    return nextHtml;
};
const buildInternalLinkMarkup = (params) => {
    if (!params.collection?.handle) {
        return toTitleCase(params.requestedCategory);
    }
    return `<a href="/collections/${escapeHtml(params.collection.handle)}">${escapeHtml(params.collection.title || `${toTitleCase(params.requestedCategory)} Tools`)}</a>`;
};
const buildComparisonTableMarkup = (params) => {
    if (params.products.length === 0) {
        return `<h2>Popular Tools to Explore on ITMart24</h2><p>Browse curated ${escapeHtml(toTitleCase(params.category))} tools on ITMart24 to compare relevant options.</p>`;
    }
    const rows = params.products
        .slice(0, 6)
        .map((product) => {
        const link = product.url
            ? `<a href="${escapeHtml(product.url)}" target="_blank" rel="noopener noreferrer">View Tool</a>`
            : "Visit ITMart24";
        return `<tr><td>${escapeHtml(product.title)}</td><td>${escapeHtml(product.category || toTitleCase(params.category))}</td><td>${escapeHtml(product.useCase || `Teams exploring ${params.category} solutions`)}</td><td>${link}</td></tr>`;
    })
        .join("");
    return `<h2>Relevant Tools to Explore</h2><table><thead><tr><th>Tool</th><th>Category</th><th>Best For / Use Case</th><th>Link</th></tr></thead><tbody>${rows}</tbody></table>`;
};
const resolveBlogPlaceholders = (params) => {
    let nextHtml = params.contentHtml;
    nextHtml = nextHtml.replace(/\[Internal Link:\s*([^\]]+)\]/gi, (_match, requestedCategory) => buildInternalLinkMarkup({
        requestedCategory: String(requestedCategory ?? params.category),
        collection: params.primaryCollection,
    }));
    nextHtml = nextHtml.replace(/<p>\s*\[Dynamic Comparison Table:\s*category="([^"]+)"\]\s*<\/p>/gi, (_match, requestedCategory) => buildComparisonTableMarkup({
        category: String(requestedCategory ?? params.category),
        products: params.products,
    }));
    nextHtml = nextHtml.replace(/\[Dynamic Comparison Table:\s*category="([^"]+)"\]/gi, (_match, requestedCategory) => buildComparisonTableMarkup({
        category: String(requestedCategory ?? params.category),
        products: params.products,
    }));
    return nextHtml
        .replace(/\[Internal Link:[^\]]+\]/gi, "")
        .replace(/\[Dynamic Comparison Table:[^\]]+\]/gi, "")
        .replace(/<p>\s*<\/p>/gi, "");
};
const injectNaturalInternalLinks = (params) => {
    const uniqueTargets = params.targets.filter((target, index, array) => target.href &&
        array.findIndex((entry) => entry.href === target.href) === index);
    if (uniqueTargets.length === 0) {
        return {
            contentHtml: params.contentHtml,
            insertedCount: 0,
        };
    }
    const paragraphs = Array.from(params.contentHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi));
    let nextHtml = params.contentHtml;
    let insertedCount = 0;
    for (const paragraphMatch of paragraphs) {
        if (insertedCount >= 5 || insertedCount >= uniqueTargets.length) {
            break;
        }
        const paragraphHtml = paragraphMatch[0];
        if (/<a\b/i.test(paragraphHtml) || /<img\b/i.test(paragraphHtml)) {
            continue;
        }
        const paragraphText = stripHtmlTags(paragraphHtml);
        if (paragraphText.length < 120) {
            continue;
        }
        const target = uniqueTargets[insertedCount];
        const linkedParagraph = paragraphHtml.replace(/<\/p>$/i, ` Explore <a href="${escapeHtml(target.href)}">${escapeHtml(target.label)}</a> on ITMart24.</p>`);
        nextHtml = nextHtml.replace(paragraphHtml, linkedParagraph);
        insertedCount += 1;
    }
    return {
        contentHtml: nextHtml,
        insertedCount,
    };
};
const sanitizeBlogHtml = (contentHtml) => {
    let nextHtml = String(contentHtml ?? "");
    nextHtml = nextHtml.replace(/```[\s\S]*?```/g, "");
    nextHtml = nextHtml.replace(/<script\b[\s\S]*?<\/script>/gi, "");
    nextHtml = nextHtml.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "");
    nextHtml = nextHtml.replace(/\son\w+="[^"]*"/gi, "");
    nextHtml = nextHtml.replace(/\son\w+='[^']*'/gi, "");
    nextHtml = nextHtml.replace(/\sstyle="[^"]*expression\([^"]*"/gi, "");
    nextHtml = nextHtml.replace(/\[Internal Link:[^\]]+\]/gi, "");
    nextHtml = nextHtml.replace(/\[Dynamic Comparison Table:[^\]]+\]/gi, "");
    nextHtml = nextHtml.replace(/<([^\/>\s]+)([^>]*)>\s*<\/\1>/gi, "");
    const h1Matches = Array.from(nextHtml.matchAll(/<h1\b[^>]*>/gi));
    if (h1Matches.length > 1) {
        let h1Count = 0;
        nextHtml = nextHtml.replace(/<(\/?)h1\b/gi, (_match, closingSlash) => {
            if (!closingSlash) {
                h1Count += 1;
                return h1Count === 1 ? "<h1" : "<h2";
            }
            return h1Count === 1 ? "</h1" : "</h2";
        });
    }
    if (!/<h2\b/i.test(nextHtml)) {
        nextHtml += "<h2>Key Insights</h2><p>This article highlights practical considerations for evaluating relevant tools on ITMart24.</p>";
    }
    return nextHtml.replace(/\n{3,}/g, "\n\n").trim();
};
const topicHasNaturalKeywordCoverage = (topic, contentHtml) => {
    const topicTokens = Array.from(new Set(tokenize(topic)));
    const contentTokens = new Set(tokenize(stripHtmlTags(contentHtml)));
    const matchedCount = topicTokens.filter((token) => {
        if (contentTokens.has(token)) {
            return true;
        }
        const singular = token.endsWith("s") ? token.slice(0, -1) : token;
        const plural = `${token}s`;
        return contentTokens.has(singular) || contentTokens.has(plural);
    }).length;
    return {
        matchedCount,
        requiredCount: topicTokens.length >= 4 ? 3 : topicTokens.length >= 2 ? 2 : 1,
    };
};
const scoreContentQuality = (params) => {
    const plainText = stripHtmlTags(params.contentHtml);
    const wordCount = plainText.split(/\s+/).filter(Boolean).length;
    const h2Count = (params.contentHtml.match(/<h2\b/gi) ?? []).length;
    const paragraphs = (params.contentHtml.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? []).length;
    const lowerText = plainText.toLowerCase();
    const issues = [];
    const warnings = [];
    const criticalIssues = [];
    let score = 100;
    const keywordCoverage = topicHasNaturalKeywordCoverage(params.topic, params.contentHtml);
    if (!params.contentHtml.trim()) {
        criticalIssues.push("empty_content_html");
        score -= 100;
    }
    if (wordCount < 700) {
        criticalIssues.push("content_too_short");
        score -= 35;
        issues.push("content_too_short");
    }
    else if (wordCount < 1200) {
        score -= 5;
        warnings.push("content_too_short");
    }
    if (h2Count < 4) {
        if (h2Count === 0) {
            criticalIssues.push("no_h2_sections");
        }
        score -= 20;
        issues.push("not_enough_h2_sections");
    }
    if (paragraphs < 6) {
        score -= 10;
        issues.push("not_enough_paragraphs");
    }
    if (!/<p\b[^>]*>/i.test(params.contentHtml)) {
        score -= 10;
        issues.push("missing_intro_paragraph");
    }
    if (!/(faq|frequently asked questions)/i.test(lowerText)) {
        score -= 10;
        issues.push("missing_faq_section");
    }
    if (!/(key takeaways|conclusion)/i.test(lowerText)) {
        score -= 10;
        issues.push("missing_conclusion_section");
    }
    if (keywordCoverage.matchedCount < keywordCoverage.requiredCount) {
        score -= 8;
        issues.push("topic_not_naturally_present");
    }
    if (/\[(internal link|dynamic comparison table)/i.test(params.contentHtml)) {
        criticalIssues.push("unresolved_placeholders");
        score -= 25;
        issues.push("unresolved_placeholders");
    }
    if (/<script\b|<iframe\b|\son\w+=/i.test(params.contentHtml)) {
        criticalIssues.push("unsafe_html");
        score -= 30;
        issues.push("unsafe_html");
    }
    const repeatedParagraphs = new Set();
    const seenParagraphs = new Set();
    for (const paragraph of params.contentHtml.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? []) {
        const normalized = stripHtmlTags(paragraph).toLowerCase();
        if (!normalized) {
            continue;
        }
        if (seenParagraphs.has(normalized)) {
            repeatedParagraphs.add(normalized);
        }
        seenParagraphs.add(normalized);
    }
    if (repeatedParagraphs.size > 0) {
        score -= 15;
        issues.push("repeated_paragraphs");
    }
    if ((lowerText.match(/in today's digital landscape/gi) ?? []).length > 1) {
        score -= 10;
        issues.push("generic_filler_detected");
    }
    return {
        passed: score >= 70 && criticalIssues.length === 0,
        score,
        issues,
        warnings,
        criticalIssues,
        wordCount,
    };
};
const loadRelatedBlogLinks = async (params) => {
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const values = [params.category, `%${params.topic}%`];
    let jobClause = "";
    if (params.currentJobId != null && Number.isFinite(params.currentJobId)) {
        values.push(params.currentJobId);
        jobClause = ` AND job_id = $${values.length}`;
    }
    const result = await pool.query(`
      SELECT title, slug, shopify_article_url
      FROM blog_posts
      WHERE status IN ('generated', 'published')
        AND (category = $1 OR topic ILIKE $2)
        ${jobClause}
      ORDER BY published_at DESC NULLS LAST, updated_at DESC
      LIMIT 3
    `, values);
    return result.rows
        .map((row) => {
        const url = row.shopify_article_url && typeof row.shopify_article_url === "string"
            ? row.shopify_article_url
            : row.slug && typeof row.slug === "string"
                ? `/blogs/news/${row.slug}`
                : null;
        return {
            label: String(row.title ?? "").trim(),
            href: url,
        };
    })
        .filter((entry) => Boolean(entry.label) && Boolean(entry.href));
};
const extractH2Headings = (contentHtml) => Array.from(contentHtml.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi))
    .map((match) => stripHtmlTags(String(match[1] ?? "")))
    .filter(Boolean)
    .slice(0, 2);
const generateAndUploadShopifyImage = async (params) => {
    const imageModel = params.provider === "groq_replicate"
        ? process.env.REPLICATE_IMAGE_VERSION || "black-forest-labs/flux-schnell"
        : process.env.OPENAI_BLOG_IMAGE_MODEL || "gpt-image-1";
    await safeLogRunEvent({
        runId: params.runId,
        step: params.provider === "groq_replicate"
            ? "replicate_request_started"
            : "image_generation_started",
        categoryName: params.category,
        topic: params.topic,
        message: params.provider === "groq_replicate"
            ? "Replicate image generation started"
            : "OpenAI image generation started",
        metadata: {
            focus: params.focus,
            model: imageModel,
            aiProvider: params.provider,
        },
    });
    const prompt = buildPremiumImagePrompt({
        topic: params.topic,
        category: params.category,
        focus: params.focus,
        suggestedPrompt: params.suggestedPrompt,
    });
    const imageResult = params.provider === "groq_replicate"
        ? await (0, groqReplicateBlog_service_1.generateReplicateBlogImage)(prompt)
        : await (0, openaiBlog_service_1.generateBlogImage)(prompt);
    const uploadedImage = await (0, shopifyBlog_service_1.uploadImageToShopifyFiles)({
        sourceUrl: imageResult.imageUrl ?? "",
        alt: buildImageAltText({
            title: params.title,
            topic: params.topic,
            category: params.category,
            focus: params.focus,
        }),
    });
    await safeLogRunEvent({
        runId: params.runId,
        step: params.provider === "groq_replicate"
            ? "replicate_image_generated"
            : "image_uploaded_to_shopify",
        categoryName: params.category,
        topic: params.topic,
        message: params.provider === "groq_replicate"
            ? "Replicate image generated and uploaded to Shopify Files"
            : "Generated image uploaded to Shopify Files",
        metadata: {
            focus: params.focus,
            url: uploadedImage.url,
            aiProvider: params.provider,
        },
    });
    return {
        url: uploadedImage.url,
        usage: imageResult.usage,
        revisedPrompt: imageResult.revisedPrompt,
        alt: buildImageAltText({
            title: params.title,
            topic: params.topic,
            category: params.category,
            focus: params.focus,
        }),
    };
};
const prepareBlogContentText = async (params) => {
    let nextContentHtml = resolveBlogPlaceholders({
        category: params.category,
        contentHtml: params.contentHtml,
        primaryCollection: params.primaryCollection,
        products: params.products,
    });
    await safeLogRunEvent({
        runId: params.runId,
        step: "placeholders_resolved",
        categoryName: params.category,
        topic: params.topic,
        message: "Internal links and comparison table placeholders resolved",
        metadata: {
            primaryCollectionHandle: params.primaryCollection?.handle ?? null,
            productCount: params.products.length,
        },
    });
    const relatedBlogTargets = await loadRelatedBlogLinks({
        currentJobId: params.jobId,
        category: params.category,
        topic: params.topic,
    });
    const internalLinkTargets = [
        ...(params.primaryCollection?.handle
            ? [
                {
                    label: params.primaryCollection.title || `${toTitleCase(params.category)} Tools`,
                    href: `/collections/${params.primaryCollection.handle}`,
                },
            ]
            : []),
        ...params.products
            .filter((product) => product.url)
            .slice(0, 2)
            .map((product) => ({
            label: product.title,
            href: String(product.url),
        })),
        ...relatedBlogTargets,
    ];
    const linkedContent = injectNaturalInternalLinks({
        contentHtml: nextContentHtml,
        targets: internalLinkTargets,
    });
    nextContentHtml = linkedContent.contentHtml;
    await safeLogRunEvent({
        runId: params.runId,
        step: "internal_links_injected",
        categoryName: params.category,
        topic: params.topic,
        message: "Natural internal links injected into blog content",
        metadata: {
            insertedCount: linkedContent.insertedCount,
        },
    });
    nextContentHtml = sanitizeBlogHtml(nextContentHtml);
    await safeLogRunEvent({
        runId: params.runId,
        step: "html_sanitized",
        categoryName: params.category,
        topic: params.topic,
        message: "Blog HTML sanitized for storage and Shopify publishing",
        metadata: {
            hasCoverImage: false,
        },
    });
    return {
        contentHtml: nextContentHtml,
    };
};
const applyApprovedBlogImages = async (params) => {
    let nextContentHtml = params.contentHtml;
    let coverImageUrl = null;
    const usageParts = [];
    const inlineImages = [];
    const inlineImageLimit = params.imagePromptEnabled && BLOG_ENABLE_INLINE_IMAGES
        ? Math.min(BLOG_INLINE_IMAGE_COUNT, 2)
        : 0;
    await safeLogRunEvent({
        runId: params.runId,
        step: "expensive_steps_started",
        categoryName: params.category,
        topic: params.topic,
        message: "Starting approved expensive steps after content quality pass",
        metadata: {
            blogImageCount: BLOG_IMAGE_COUNT,
            inlineImageCount: inlineImageLimit,
        },
    });
    if (params.imagePromptEnabled && BLOG_IMAGE_COUNT > 0) {
        try {
            await safeLogRunEvent({
                runId: params.runId,
                step: "image_prompt_built",
                categoryName: params.category,
                topic: params.topic,
                message: "Premium image prompt prepared for blog visuals",
                metadata: {
                    focus: `cover image for ${params.topic}`,
                },
            });
            const coverImage = await generateAndUploadShopifyImage({
                runId: params.runId,
                category: params.category,
                topic: params.topic,
                title: params.title,
                focus: `cover image for ${params.topic}`,
                suggestedPrompt: params.imagePrompt,
                provider: params.provider,
            });
            coverImageUrl = coverImage.url;
            usageParts.push(coverImage.usage);
        }
        catch (error) {
            await safeLogRunEvent({
                runId: params.runId,
                level: "warning",
                step: params.provider === "groq_replicate"
                    ? "replicate_image_failed"
                    : "image_generation_failed",
                categoryName: params.category,
                topic: params.topic,
                message: "Cover image generation failed; continuing without image",
                metadata: {
                    error: toSafeErrorMessage(error),
                    aiProvider: params.provider,
                },
            });
        }
    }
    if (inlineImageLimit > 0) {
        const headings = extractH2Headings(nextContentHtml).slice(0, inlineImageLimit);
        for (const heading of headings) {
            try {
                await safeLogRunEvent({
                    runId: params.runId,
                    step: "image_prompt_built",
                    categoryName: params.category,
                    topic: params.topic,
                    message: "Premium image prompt prepared for inline visual",
                    metadata: {
                        focus: heading,
                    },
                });
                const inlineImage = await generateAndUploadShopifyImage({
                    runId: params.runId,
                    category: params.category,
                    topic: params.topic,
                    title: params.title,
                    focus: heading,
                    suggestedPrompt: params.imagePrompt,
                    provider: params.provider,
                });
                inlineImages.push({
                    url: inlineImage.url,
                    alt: inlineImage.alt,
                });
                usageParts.push(inlineImage.usage);
            }
            catch (error) {
                await safeLogRunEvent({
                    runId: params.runId,
                    level: "warning",
                    step: params.provider === "groq_replicate"
                        ? "replicate_image_failed"
                        : "image_generation_failed",
                    categoryName: params.category,
                    topic: params.topic,
                    message: "Inline image generation failed; continuing without inline image",
                    metadata: {
                        error: toSafeErrorMessage(error),
                        aiProvider: params.provider,
                    },
                });
            }
        }
    }
    nextContentHtml = insertCoverImageIntoHtml(nextContentHtml, coverImageUrl, buildImageAltText({
        title: params.title,
        topic: params.topic,
        category: params.category,
        focus: "cover image",
    }));
    nextContentHtml = insertInlineImagesIntoHtml(nextContentHtml, inlineImages);
    nextContentHtml = sanitizeBlogHtml(nextContentHtml);
    await safeLogRunEvent({
        runId: params.runId,
        step: "image_inserted",
        categoryName: params.category,
        topic: params.topic,
        message: "Blog images inserted into HTML",
        metadata: {
            coverImageInserted: Boolean(coverImageUrl),
            inlineImageCount: inlineImages.length,
        },
    });
    await safeLogRunEvent({
        runId: params.runId,
        step: "html_sanitized",
        categoryName: params.category,
        topic: params.topic,
        message: "Final blog HTML sanitized after image placement",
        metadata: {
            hasCoverImage: Boolean(coverImageUrl),
        },
    });
    return {
        contentHtml: nextContentHtml,
        coverImageUrl,
        usageParts,
        imagesGenerated: (coverImageUrl ? 1 : 0) + inlineImages.length,
    };
};
const getJobById = async (jobId) => {
    const jobs = await (0, blogManager_service_1.listBlogJobs)();
    return jobs.find((job) => job.id === jobId) ?? null;
};
const sleep = async (delayMs) => {
    if (delayMs <= 0) {
        return;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
};
const getAiErrorDetails = (provider, error) => {
    const classified = provider === "groq_replicate"
        ? (0, groqReplicateBlog_service_1.classifyGroqReplicateError)(error)
        : (0, openaiBlog_service_1.classifyOpenAIError)(error);
    return {
        provider: "provider" in classified && typeof classified.provider === "string"
            ? classified.provider
            : provider,
        category: classified.category,
        status: classified.status,
        code: classified.code,
        type: classified.type,
        message: classified.message,
        retryAfterMs: classified.retryAfterMs,
        responseId: classified.responseId,
        model: classified.model,
    };
};
const toSafeErrorMessage = (error) => error instanceof Error ? error.message : String(error);
const safeConsoleError = (message, error) => {
    console.error(message, toSafeErrorMessage(error));
};
const getAiTextModel = (provider) => provider === "groq_replicate"
    ? process.env.GROQ_BLOG_TEXT_MODEL || "llama3-70b-8192"
    : process.env.OPENAI_BLOG_TEXT_MODEL || "gpt-4o-mini";
const getAiImageModel = (provider) => provider === "groq_replicate"
    ? process.env.REPLICATE_IMAGE_VERSION || "black-forest-labs/flux-schnell"
    : process.env.OPENAI_BLOG_IMAGE_MODEL || "gpt-image-1";
const getRetryPlan = (category, retryAfterMs, attempt) => {
    switch (category) {
        case "rate_limit":
            return {
                maxRetries: Math.min(3, MAX_OPENAI_TEXT_RETRIES),
                waitMs: Math.min(retryAfterMs ?? [10000, 30000, 60000][attempt - 1] ?? 60000, MAX_AUTOMATIC_WAIT_MS),
            };
        case "network":
        case "server":
            return {
                maxRetries: Math.min(2, MAX_OPENAI_TEXT_RETRIES),
                waitMs: [3000, 8000][attempt - 1] ?? 8000,
            };
        case "parsing":
        case "validation":
            return {
                maxRetries: Math.min(1, MAX_OPENAI_TEXT_RETRIES),
                waitMs: 0,
            };
        case "quota":
            return {
                maxRetries: 0,
                waitMs: 0,
            };
        default:
            return {
                maxRetries: 0,
                waitMs: 0,
            };
    }
};
const createRun = async (jobId, triggerMode) => {
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const result = await pool.query(`
      INSERT INTO blog_job_runs (
        job_id,
        trigger_mode,
        run_status,
        metadata,
        summary,
        started_at
      )
      VALUES ($1, $2, 'running', '{}'::jsonb, '{}'::jsonb, NOW())
      RETURNING id
    `, [jobId, triggerMode]);
    return Number(result.rows[0].id);
};
const logRunEvent = async (params) => {
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    await pool.query(`
      INSERT INTO blog_job_run_logs (
        run_id,
        log_level,
        step,
        category_name,
        topic,
        message,
        metadata,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
    `, [
        params.runId,
        params.level ?? "info",
        params.step,
        params.categoryName ?? null,
        params.topic ?? null,
        params.message,
        JSON.stringify(params.metadata ?? {}),
    ]);
};
const finalizeRun = async (runId, summary, runStatus) => {
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    await pool.query(`
      UPDATE blog_job_runs
      SET run_status = $2,
          total_topics = $3,
          success_count = $4,
          failure_count = $5,
          summary = $6::jsonb,
          completed_at = NOW()
      WHERE id = $1
    `, [
        runId,
        runStatus,
        summary.totalTopicsProcessed,
        summary.successCount,
        summary.failureCount,
        JSON.stringify(summary),
    ]);
};
const safeLogRunEvent = async (params) => {
    try {
        await logRunEvent(params);
    }
    catch (error) {
        safeConsoleError(`Blog job run log write failed runId=${params.runId} step=${params.step}:`, error);
    }
};
const safeFinalizeRun = async (runId, summary, runStatus) => {
    try {
        await finalizeRun(runId, summary, runStatus);
    }
    catch (error) {
        safeConsoleError(`Blog job finalize failed runId=${runId}:`, error);
    }
};
const logPublishEvent = async (params) => {
    if (!params.jobId) {
        return;
    }
    try {
        const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
        const runResult = await pool.query(`
        SELECT id
        FROM blog_job_runs
        WHERE job_id = $1
        ORDER BY started_at DESC, id DESC
        LIMIT 1
      `, [params.jobId]);
        const runId = runResult.rows[0]?.id ? Number(runResult.rows[0].id) : null;
        if (!runId) {
            return;
        }
        await safeLogRunEvent({
            runId,
            level: params.level,
            step: params.step,
            message: params.message,
            metadata: params.metadata,
        });
    }
    catch (error) {
        safeConsoleError(`Blog publish log failed jobId=${params.jobId}:`, error);
    }
};
const beginJobRun = (jobId) => {
    if (runningBlogJobIds.has(jobId)) {
        throw new Error("Blog cron skipped because previous run is still running");
    }
    runningBlogJobIds.add(jobId);
};
const endJobRun = (jobId) => {
    runningBlogJobIds.delete(jobId);
};
const topicAlreadyGenerated = async (jobId, category, topic) => {
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const result = await pool.query(`
      SELECT 1
      FROM blog_posts
      WHERE job_id = $1
        AND category = $2
        AND topic = $3
        AND status IN ('generated', 'published')
      LIMIT 1
    `, [jobId, category, topic]);
    return result.rowCount > 0;
};
const markTopicUsed = async (topicId) => {
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const result = await pool.query(`
      UPDATE blog_job_topics
      SET topic_status = 'used',
          used_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
        AND topic_status = 'pending'
    `, [topicId]);
    if (result.rowCount === 0) {
        throw new Error("Topic could not be marked as used");
    }
};
const saveGeneratedBlogPost = async (params) => {
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const result = await pool.query(`
      INSERT INTO blog_posts (
        job_id,
        template_id,
        shopify_blog_id,
        category,
        topic,
        title,
        slug,
        meta_title,
        meta_description,
        excerpt,
        content,
        content_html,
        tags,
        cover_image_url,
        status,
        openai_usage,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13::text[], $14, 'generated', $15::jsonb, NOW(), NOW()
      )
      RETURNING id
    `, [
        params.jobId,
        params.templateId,
        params.shopifyBlogId,
        params.category,
        params.topic,
        params.title,
        params.slug,
        params.metaTitle,
        params.metaDescription,
        params.excerpt,
        params.contentHtml,
        params.contentHtml,
        params.tags,
        params.coverImageUrl,
        JSON.stringify(params.openaiUsage),
    ]);
    return Number(result.rows[0].id);
};
const getTemplateContent = async (templateId) => {
    if (!templateId) {
        const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
        const defaultTemplate = await pool.query(`
        SELECT content
        FROM blog_templates
        WHERE is_default = TRUE
        ORDER BY updated_at DESC
        LIMIT 1
      `);
        return String(defaultTemplate.rows[0]?.content ?? "");
    }
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const result = await pool.query("SELECT content FROM blog_templates WHERE id = $1", [templateId]);
    return String(result.rows[0]?.content ?? "");
};
const generateTopicContentWithRetry = async (params) => {
    let lastError = null;
    let parsingRetryUsed = false;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const requestStartedStep = params.provider === "groq_replicate"
                ? "groq_request_started"
                : "openai_request_started";
            const responseReceivedStep = params.provider === "groq_replicate"
                ? "groq_response_received"
                : "openai_response_received";
            const providerLabel = params.provider === "groq_replicate" ? "Groq" : "OpenAI";
            await safeLogRunEvent({
                runId: params.runId,
                step: requestStartedStep,
                categoryName: params.category,
                topic: params.topic,
                message: `${providerLabel} content generation request started`,
                metadata: {
                    attempt,
                    category: params.category,
                    model: getAiTextModel(params.provider),
                    aiProvider: params.provider,
                },
            });
            const result = params.provider === "groq_replicate"
                ? await (0, groqReplicateBlog_service_1.generateGroqBlogContent)({
                    topic: params.topic,
                    category: params.category,
                    templateContent: params.templateContent,
                    contentGuidance: params.contentGuidance,
                    preferredSourceLinks: params.preferredSourceLinks,
                    productContextCsv: params.productContextCsv,
                    collectionContextCsv: params.collectionContextCsv,
                    strictJsonOnly: parsingRetryUsed,
                    qualityRetry: params.qualityRetry,
                })
                : await (0, openaiBlog_service_1.generateBlogContent)({
                    topic: params.topic,
                    category: params.category,
                    templateContent: params.templateContent,
                    contentGuidance: params.contentGuidance,
                    preferredSourceLinks: params.preferredSourceLinks,
                    productContextCsv: params.productContextCsv,
                    collectionContextCsv: params.collectionContextCsv,
                    strictJsonOnly: parsingRetryUsed,
                    qualityRetry: params.qualityRetry,
                });
            await safeLogRunEvent({
                runId: params.runId,
                step: responseReceivedStep,
                categoryName: params.category,
                topic: params.topic,
                message: `${providerLabel} response received successfully`,
                metadata: {
                    attempt,
                    maxRetries: 0,
                    category: "success",
                    status: null,
                    code: null,
                    type: null,
                    retryAfterMs: null,
                    model: result.model,
                    responseId: result.responseId,
                    aiProvider: params.provider,
                },
            });
            return result;
        }
        catch (error) {
            lastError = error;
            const details = getAiErrorDetails(params.provider, error);
            const retryPlan = getRetryPlan(details.category, details.retryAfterMs, attempt);
            const responseReceivedStep = params.provider === "groq_replicate"
                ? "groq_response_received"
                : "openai_response_received";
            const retryStep = params.provider === "groq_replicate" ? "groq_retry" : "openai_retry";
            const providerLabel = params.provider === "groq_replicate" ? "Groq" : "OpenAI";
            if (details.category === "rate_limit") {
                params.onRateLimit(details);
            }
            if (details.category === "quota") {
                params.onQuotaError(details);
            }
            if (params.provider === "groq_replicate" &&
                params.fallbackToOpenai &&
                details.provider === "groq") {
                await safeLogRunEvent({
                    runId: params.runId,
                    level: "warning",
                    step: "groq_generation_failed",
                    categoryName: params.category,
                    topic: params.topic,
                    message: "Groq content generation failed; falling back to OpenAI",
                    metadata: {
                        attempt,
                        category: details.category,
                        status: details.status,
                        code: details.code,
                        type: details.type,
                        model: details.model,
                        responseId: details.responseId,
                    },
                });
                return generateTopicContentWithRetry({
                    ...params,
                    provider: "openai",
                    fallbackToOpenai: false,
                });
            }
            if (details.category === "parsing") {
                await safeLogRunEvent({
                    runId: params.runId,
                    level: "warning",
                    step: "openai_parse_failed",
                    categoryName: params.category,
                    topic: params.topic,
                    message: "OpenAI response parsing failed",
                    metadata: {
                        attempt,
                        maxRetries: retryPlan.maxRetries,
                        category: details.category,
                        status: details.status,
                        code: details.code,
                        type: details.type,
                        message: details.message,
                        retryAfterMs: details.retryAfterMs,
                        model: details.model,
                        responseId: details.responseId,
                        aiProvider: params.provider,
                    },
                });
            }
            if (details.category === "validation") {
                await safeLogRunEvent({
                    runId: params.runId,
                    level: "warning",
                    step: "openai_json_validation_failed",
                    categoryName: params.category,
                    topic: params.topic,
                    message: "OpenAI JSON validation failed",
                    metadata: {
                        attempt,
                        maxRetries: retryPlan.maxRetries,
                        category: details.category,
                        status: details.status,
                        code: details.code,
                        type: details.type,
                        message: details.message,
                        retryAfterMs: details.retryAfterMs,
                        model: details.model,
                        responseId: details.responseId,
                        aiProvider: params.provider,
                    },
                });
            }
            if (details.category !== "parsing" &&
                details.category !== "validation") {
                await safeLogRunEvent({
                    runId: params.runId,
                    level: details.category === "quota" ? "error" : "warning",
                    step: responseReceivedStep,
                    categoryName: params.category,
                    topic: params.topic,
                    message: details.category === "rate_limit"
                        ? `${providerLabel} returned 429. Possible causes: rate limit, insufficient quota, billing not active, usage limit reached, or burst requests.`
                        : `${providerLabel} response received with error`,
                    metadata: {
                        attempt,
                        maxRetries: retryPlan.maxRetries,
                        category: details.category,
                        status: details.status,
                        code: details.code,
                        type: details.type,
                        message: details.message,
                        retryAfterMs: details.retryAfterMs,
                        model: details.model,
                        responseId: details.responseId,
                        aiProvider: params.provider,
                    },
                });
            }
            if (attempt > retryPlan.maxRetries) {
                await safeLogRunEvent({
                    runId: params.runId,
                    level: "error",
                    step: "content_generation_failed",
                    categoryName: params.category,
                    topic: params.topic,
                    message: `${providerLabel} content generation failed`,
                    metadata: {
                        attempt,
                        maxRetries: retryPlan.maxRetries,
                        category: details.category,
                        status: details.status,
                        code: details.code,
                        type: details.type,
                        message: details.message,
                        retryAfterMs: details.retryAfterMs,
                        model: details.model,
                        responseId: details.responseId,
                        aiProvider: params.provider,
                    },
                });
                break;
            }
            if (details.category === "parsing" || details.category === "validation") {
                parsingRetryUsed = true;
            }
            await safeLogRunEvent({
                runId: params.runId,
                level: "warning",
                step: retryStep,
                categoryName: params.category,
                topic: params.topic,
                message: `Retrying ${providerLabel} content generation`,
                metadata: {
                    attempt,
                    maxRetries: retryPlan.maxRetries,
                    category: details.category,
                    status: details.status,
                    code: details.code,
                    type: details.type,
                    message: details.message,
                    retryAfterMs: details.retryAfterMs,
                    retryDelayMs: retryPlan.waitMs,
                    model: details.model,
                    aiProvider: params.provider,
                    responseId: details.responseId,
                },
            });
            await sleep(retryPlan.waitMs);
        }
    }
    throw lastError instanceof Error
        ? lastError
        : new Error("AI content generation failed");
};
const runBlogJob = async (jobId, options) => {
    console.log(`Blog run-once requested jobId=${jobId}`);
    const job = await getJobById(jobId);
    if (!job) {
        throw new Error("Blog job not found");
    }
    if (options?.requireActive && job.status !== "active") {
        console.log(`Blog run blocked because job is inactive jobId=${jobId}`);
        throw new Error("Only active blog jobs can run in this mode");
    }
    beginJobRun(jobId);
    let runId = null;
    let summary = null;
    try {
        runId = await createRun(jobId, options?.triggerMode ?? "manual");
        const providerConfig = await (0, aiProvider_service_1.getAIProviderRuntimeConfig)();
        const provider = providerConfig.provider;
        const startedAt = new Date().toISOString();
        summary = {
            runId,
            jobId,
            totalTopicsProcessed: 0,
            successCount: 0,
            failureCount: 0,
            contentFailureCount: 0,
            publishFailureCount: 0,
            skippedCount: 0,
            rateLimitCount: 0,
            quotaErrorCount: 0,
            textAttempts: 0,
            imagesGenerated: 0,
            imagesSkipped: 0,
            qualityWarnings: 0,
            contentFailures: 0,
            startedAt,
            completedAt: null,
        };
        let attemptedTopicCount = 0;
        await safeLogRunEvent({
            runId,
            step: "start",
            message: `Started blog automation for job "${job.name}"`,
            metadata: {
                aiProvider: provider,
            },
        });
        await safeLogRunEvent({
            runId,
            step: "ai_provider_selected",
            message: "AI provider selected for this run",
            metadata: {
                aiProvider: provider,
            },
        });
        console.log(`Blog run started jobId=${jobId} runId=${runId}`);
        const templateContent = await getTemplateContent(job.templateId);
        const shopifyBlogs = await (0, shopifyBlog_service_1.listShopifyBlogs)();
        const blogMap = new Map(shopifyBlogs.flatMap((blog) => [
            [normalizeKey(blog.title), blog],
            [normalizeKey(blog.handle), blog],
        ]));
        for (const categoryConfig of job.categories) {
            const matchedShopifyBlog = blogMap.get(normalizeKey(categoryConfig.category));
            if (!matchedShopifyBlog) {
                await safeLogRunEvent({
                    runId,
                    level: "warning",
                    step: "category_lookup",
                    categoryName: categoryConfig.category,
                    message: "No matching Shopify blog found for this category",
                });
                continue;
            }
            const pendingTopics = categoryConfig.topics
                .filter((topic) => topic.status === "pending" && topic.topic.trim())
                .slice(0, categoryConfig.blogCount);
            console.log(`Blog run topic count jobId=${jobId} category="${categoryConfig.category}" pending=${pendingTopics.length}`);
            if (pendingTopics.length === 0) {
                await safeLogRunEvent({
                    runId,
                    step: "topic_selection",
                    categoryName: categoryConfig.category,
                    message: "No pending topics",
                });
                continue;
            }
            for (const topicEntry of pendingTopics) {
                if (attemptedTopicCount >= BLOG_MAX_TOPICS_PER_RUN) {
                    summary.skippedCount += 1;
                    await safeLogRunEvent({
                        runId,
                        level: "warning",
                        step: "topic_selection",
                        categoryName: categoryConfig.category,
                        topic: topicEntry.topic,
                        message: "Topic skipped because max topics per run limit reached",
                        metadata: {
                            maxTopicsPerRun: BLOG_MAX_TOPICS_PER_RUN,
                        },
                    });
                    continue;
                }
                if (!topicEntry.id) {
                    summary.skippedCount += 1;
                    await safeLogRunEvent({
                        runId,
                        level: "warning",
                        step: "topic_selection",
                        categoryName: categoryConfig.category,
                        topic: topicEntry.topic,
                        message: "Topic is missing an id and was skipped",
                    });
                    continue;
                }
                if (await topicAlreadyGenerated(job.id, categoryConfig.category, topicEntry.topic)) {
                    summary.skippedCount += 1;
                    await safeLogRunEvent({
                        runId,
                        level: "warning",
                        step: "duplicate_check",
                        categoryName: categoryConfig.category,
                        topic: topicEntry.topic,
                        message: "Duplicate generated blog detected; topic skipped",
                    });
                    continue;
                }
                attemptedTopicCount += 1;
                summary.totalTopicsProcessed += 1;
                try {
                    await safeLogRunEvent({
                        runId,
                        step: "product_matching_started",
                        categoryName: categoryConfig.category,
                        topic: topicEntry.topic,
                        message: "Loading Shopify catalog context for product matching",
                    });
                    const catalogContext = await (0, shopifyBlog_service_1.loadShopifyCatalogContext)(categoryConfig.category, {
                        topic: topicEntry.topic,
                        productLimit: 20,
                        collectionLimit: 10,
                    });
                    await safeLogRunEvent({
                        runId,
                        step: catalogContext.collectionContextFailed
                            ? "collection_context_failed"
                            : "collection_context_loaded",
                        categoryName: categoryConfig.category,
                        topic: topicEntry.topic,
                        level: catalogContext.collectionContextFailed ? "warning" : "info",
                        message: catalogContext.collectionContextFailed
                            ? "Shopify collection context failed; continuing with available context"
                            : "Shopify collection context loaded",
                        metadata: {
                            primaryCollectionHandle: catalogContext.primaryCollection?.handle ?? null,
                            collectionCount: catalogContext.collections.length,
                            error: catalogContext.collectionContextError ?? null,
                        },
                    });
                    await safeLogRunEvent({
                        runId,
                        step: catalogContext.productContextFailed
                            ? "product_context_failed"
                            : "product_context_loaded",
                        categoryName: categoryConfig.category,
                        topic: topicEntry.topic,
                        level: catalogContext.productContextFailed ? "warning" : "info",
                        message: catalogContext.productContextFailed
                            ? "Shopify product context failed; continuing with available context"
                            : "Shopify product context loaded",
                        metadata: {
                            productCount: catalogContext.products.length,
                            error: catalogContext.productContextError ?? null,
                        },
                    });
                    await safeLogRunEvent({
                        runId,
                        step: "product_matching_completed",
                        categoryName: categoryConfig.category,
                        topic: topicEntry.topic,
                        message: "Product matching completed",
                        metadata: {
                            productCount: catalogContext.products.length,
                            collectionCount: catalogContext.collections.length,
                            collectionContextFailed: Boolean(catalogContext.collectionContextFailed),
                            productContextFailed: Boolean(catalogContext.productContextFailed),
                        },
                    });
                    if (catalogContext.collectionContextFailed &&
                        catalogContext.productContextFailed) {
                        await safeLogRunEvent({
                            runId,
                            level: "warning",
                            step: "product_matching_completed",
                            categoryName: categoryConfig.category,
                            topic: topicEntry.topic,
                            message: "Shopify catalog context was unavailable; continuing OpenAI generation without catalog context",
                            metadata: {
                                collectionContextError: catalogContext.collectionContextError ?? null,
                                productContextError: catalogContext.productContextError ?? null,
                            },
                        });
                    }
                    console.log(`${provider} content generation started jobId=${jobId} runId=${runId} topic="${topicEntry.topic}"`);
                    let generated = await generateTopicContentWithRetry({
                        provider,
                        fallbackToOpenai: providerConfig.fallbackToOpenai,
                        topic: topicEntry.topic,
                        category: categoryConfig.category,
                        templateContent,
                        contentGuidance: typeof job.settings?.contentGuidance === "string"
                            ? String(job.settings.contentGuidance)
                            : "Generated blog content should be professional and human-like.",
                        preferredSourceLinks: job.sourceLinks.map((entry) => entry.url),
                        productContextCsv: catalogContext.productsCsv,
                        collectionContextCsv: catalogContext.collectionsCsv,
                        runId: runId,
                        onRateLimit: () => {
                            summary.rateLimitCount += 1;
                        },
                        onQuotaError: () => {
                            summary.quotaErrorCount += 1;
                        },
                    });
                    summary.textAttempts += 1;
                    console.log(`${provider} content generation completed jobId=${jobId} runId=${runId} topic="${topicEntry.topic}"`);
                    await safeLogRunEvent({
                        runId,
                        step: "content_generation_success",
                        categoryName: categoryConfig.category,
                        topic: topicEntry.topic,
                        message: `${provider === "groq_replicate" ? "Groq" : "OpenAI"} content generation completed successfully`,
                        metadata: {
                            attempt: 1,
                            category: categoryConfig.category,
                            model: generated.model,
                            responseId: generated.responseId,
                            aiProvider: provider,
                        },
                    });
                    let preparedText = await prepareBlogContentText({
                        runId,
                        jobId: job.id,
                        category: categoryConfig.category,
                        topic: topicEntry.topic,
                        title: generated.content.title,
                        contentHtml: generated.content.contentHtml,
                        primaryCollection: catalogContext.primaryCollection,
                        products: catalogContext.products,
                    });
                    let qualityCheck = scoreContentQuality({
                        topic: topicEntry.topic,
                        contentHtml: preparedText.contentHtml,
                    });
                    await safeLogRunEvent({
                        runId,
                        step: "content_quality_checked",
                        categoryName: categoryConfig.category,
                        topic: topicEntry.topic,
                        message: "Blog content quality checked",
                        metadata: {
                            score: qualityCheck.score,
                            issues: qualityCheck.issues,
                            warnings: qualityCheck.warnings,
                            criticalIssues: qualityCheck.criticalIssues,
                            wordCount: qualityCheck.wordCount,
                        },
                    });
                    if (!qualityCheck.passed) {
                        await safeLogRunEvent({
                            runId,
                            level: "warning",
                            step: "content_quality_failed",
                            categoryName: categoryConfig.category,
                            topic: topicEntry.topic,
                            message: "Generated blog content did not pass quality checks",
                            metadata: {
                                score: qualityCheck.score,
                                issues: qualityCheck.issues,
                                warnings: qualityCheck.warnings,
                                criticalIssues: qualityCheck.criticalIssues,
                                wordCount: qualityCheck.wordCount,
                            },
                        });
                        if (qualityCheck.criticalIssues.length > 0 || qualityCheck.wordCount < 700) {
                            summary.imagesSkipped += 1;
                            await safeLogRunEvent({
                                runId,
                                step: "image_generation_skipped_due_to_quality_failure",
                                categoryName: categoryConfig.category,
                                topic: topicEntry.topic,
                                level: "warning",
                                message: "Image generation skipped because content quality failed before approval",
                                metadata: {
                                    score: qualityCheck.score,
                                    issues: qualityCheck.issues,
                                    criticalIssues: qualityCheck.criticalIssues,
                                },
                            });
                            await safeLogRunEvent({
                                runId,
                                step: "content_quality_retry_started",
                                categoryName: categoryConfig.category,
                                topic: topicEntry.topic,
                                message: "Retrying content generation with stronger quality prompt",
                            });
                            generated = await generateTopicContentWithRetry({
                                provider,
                                fallbackToOpenai: providerConfig.fallbackToOpenai,
                                topic: topicEntry.topic,
                                category: categoryConfig.category,
                                templateContent,
                                contentGuidance: typeof job.settings?.contentGuidance === "string"
                                    ? String(job.settings.contentGuidance)
                                    : "Generated blog content should be professional and human-like.",
                                preferredSourceLinks: job.sourceLinks.map((entry) => entry.url),
                                productContextCsv: catalogContext.productsCsv,
                                collectionContextCsv: catalogContext.collectionsCsv,
                                qualityRetry: true,
                                runId: runId,
                                onRateLimit: () => {
                                    summary.rateLimitCount += 1;
                                },
                                onQuotaError: () => {
                                    summary.quotaErrorCount += 1;
                                },
                            });
                            summary.textAttempts += 1;
                            preparedText = await prepareBlogContentText({
                                runId,
                                jobId: job.id,
                                category: categoryConfig.category,
                                topic: topicEntry.topic,
                                title: generated.content.title,
                                contentHtml: generated.content.contentHtml,
                                primaryCollection: catalogContext.primaryCollection,
                                products: catalogContext.products,
                            });
                            qualityCheck = scoreContentQuality({
                                topic: topicEntry.topic,
                                contentHtml: preparedText.contentHtml,
                            });
                            await safeLogRunEvent({
                                runId,
                                step: qualityCheck.passed
                                    ? "content_quality_retry_success"
                                    : "content_quality_retry_failed",
                                categoryName: categoryConfig.category,
                                topic: topicEntry.topic,
                                level: qualityCheck.passed ? "info" : "error",
                                message: qualityCheck.passed
                                    ? "Content quality retry succeeded"
                                    : "Content quality retry still failed",
                                metadata: {
                                    score: qualityCheck.score,
                                    issues: qualityCheck.issues,
                                    warnings: qualityCheck.warnings,
                                    criticalIssues: qualityCheck.criticalIssues,
                                    wordCount: qualityCheck.wordCount,
                                },
                            });
                            if (!qualityCheck.passed) {
                                throw new Error(`Content quality failed: ${qualityCheck.issues.join(", ")}`);
                            }
                        }
                    }
                    if (qualityCheck.warnings.length > 0) {
                        summary.qualityWarnings += 1;
                        await safeLogRunEvent({
                            runId,
                            step: "content_quality_warning",
                            categoryName: categoryConfig.category,
                            topic: topicEntry.topic,
                            level: "warning",
                            message: "Content quality passed with warnings",
                            metadata: {
                                score: qualityCheck.score,
                                warnings: qualityCheck.warnings,
                                wordCount: qualityCheck.wordCount,
                            },
                        });
                    }
                    await safeLogRunEvent({
                        runId,
                        step: "content_quality_passed",
                        categoryName: categoryConfig.category,
                        topic: topicEntry.topic,
                        message: "Content quality passed; deferring image generation until approval",
                        metadata: {
                            score: qualityCheck.score,
                            warnings: qualityCheck.warnings,
                            wordCount: qualityCheck.wordCount,
                        },
                    });
                    await safeLogRunEvent({
                        runId,
                        step: "image_generation_deferred_until_quality_pass",
                        categoryName: categoryConfig.category,
                        topic: topicEntry.topic,
                        message: "Image generation deferred until content quality approval",
                    });
                    const preparedBlog = await applyApprovedBlogImages({
                        runId,
                        provider,
                        category: categoryConfig.category,
                        topic: topicEntry.topic,
                        title: generated.content.title,
                        contentHtml: preparedText.contentHtml,
                        imagePrompt: generated.content.imagePrompt,
                        imagePromptEnabled: job.imagePromptEnabled,
                    });
                    summary.imagesGenerated += preparedBlog.imagesGenerated;
                    const blogPostId = await saveGeneratedBlogPost({
                        jobId: job.id,
                        templateId: job.templateId,
                        shopifyBlogId: matchedShopifyBlog.id,
                        category: categoryConfig.category,
                        topic: topicEntry.topic,
                        title: generated.content.title,
                        slug: generated.content.slug,
                        metaTitle: generated.content.metaTitle || generated.content.title,
                        metaDescription: generated.content.metaDescription ||
                            buildExcerpt(preparedBlog.contentHtml),
                        excerpt: generated.content.excerpt || buildExcerpt(preparedBlog.contentHtml),
                        contentHtml: preparedBlog.contentHtml,
                        tags: generated.content.tags,
                        coverImageUrl: preparedBlog.coverImageUrl,
                        openaiUsage: combineUsage(generated.usage, ...preparedBlog.usageParts),
                    });
                    console.log(`Blog DB save succeeded jobId=${jobId} runId=${runId} blogPostId=${blogPostId}`);
                    await markTopicUsed(topicEntry.id);
                    summary.successCount += 1;
                    await safeLogRunEvent({
                        runId,
                        step: "topic_processed",
                        categoryName: categoryConfig.category,
                        topic: topicEntry.topic,
                        message: "Topic processed successfully",
                        metadata: {
                            blogPostId,
                            shopifyBlogId: matchedShopifyBlog.id,
                        },
                    });
                    if (job.autoPublishEnabled === true) {
                        try {
                            await (0, exports.createShopifyArticle)(blogPostId, true);
                        }
                        catch (error) {
                            summary.publishFailureCount += 1;
                            safeConsoleError(`Shopify auto publish failed jobId=${jobId} runId=${runId} blogPostId=${blogPostId}:`, error);
                        }
                    }
                    else {
                        await logPublishEvent({
                            jobId: job.id,
                            step: "shopify_publish_skipped",
                            message: "Blog generated and saved. Auto publish is disabled.",
                            metadata: {
                                blogPostId,
                                autoPublishEnabled: false,
                            },
                        });
                    }
                }
                catch (error) {
                    summary.failureCount += 1;
                    summary.contentFailureCount += 1;
                    summary.contentFailures += 1;
                    const details = getAiErrorDetails(provider, error);
                    safeConsoleError(`Blog topic processing failed jobId=${jobId} runId=${runId} topic="${topicEntry.topic}":`, error);
                    await safeLogRunEvent({
                        runId,
                        level: "error",
                        step: "topic_failed",
                        categoryName: categoryConfig.category,
                        topic: topicEntry.topic,
                        message: "Topic processing failed",
                        metadata: {
                            error: error instanceof Error ? error.message : String(error),
                            status: details.status,
                            code: details.code,
                            type: details.type,
                            retryAfterMs: details.retryAfterMs,
                            category: details.category,
                            responseId: details.responseId,
                            model: details.model,
                            aiProvider: provider,
                            providerErrorSource: details.provider ?? provider,
                        },
                    });
                    if (provider === "groq_replicate" && details.provider === "groq") {
                        await safeLogRunEvent({
                            runId,
                            level: "error",
                            step: "groq_generation_failed",
                            categoryName: categoryConfig.category,
                            topic: topicEntry.topic,
                            message: "Groq content generation failed",
                            metadata: {
                                error: error instanceof Error ? error.message : String(error),
                                category: details.category,
                                status: details.status,
                                model: details.model,
                            },
                        });
                    }
                }
            }
        }
        summary.completedAt = new Date().toISOString();
        await safeLogRunEvent({
            runId,
            step: "completion",
            message: "Completed blog automation run",
            metadata: summary,
        });
        await safeFinalizeRun(runId, summary, "completed");
        return summary;
    }
    catch (error) {
        safeConsoleError(`Blog run failed jobId=${jobId} runId=${runId ?? "unknown"}:`, error);
        if (summary) {
            summary.completedAt = new Date().toISOString();
            await safeFinalizeRun(runId, summary, "failed");
        }
        else if (runId != null) {
            await safeFinalizeRun(runId, {
                runId,
                jobId,
                totalTopicsProcessed: 0,
                successCount: 0,
                failureCount: 0,
                contentFailureCount: 0,
                publishFailureCount: 0,
                skippedCount: 0,
                rateLimitCount: 0,
                quotaErrorCount: 0,
                textAttempts: 0,
                imagesGenerated: 0,
                imagesSkipped: 0,
                qualityWarnings: 0,
                contentFailures: 0,
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
            }, "failed");
        }
        throw error;
    }
    finally {
        endJobRun(jobId);
    }
};
exports.runBlogJob = runBlogJob;
const runAllActiveBlogJobs = async () => {
    const jobs = await (0, blogManager_service_1.listBlogJobs)();
    const activeJobs = jobs.filter((job) => job.status === "active");
    const summaries = [];
    for (const job of activeJobs) {
        summaries.push(await (0, exports.runBlogJob)(job.id, {
            triggerMode: "active_batch",
            requireActive: true,
        }));
    }
    return summaries;
};
exports.runAllActiveBlogJobs = runAllActiveBlogJobs;
const createShopifyArticle = async (blogPostId, publish = false) => {
    if (!publish) {
        return {
            blogPostId,
            status: "skipped",
            message: "Shopify posting is disabled by default",
        };
    }
    const blogPost = await (0, blogManager_service_1.getBlogPostById)(blogPostId);
    if (!blogPost) {
        throw new Error("Blog post not found");
    }
    if (!blogPost.shopifyBlogId) {
        throw new Error("Blog post is missing a Shopify blog id");
    }
    if (!blogPost.title.trim()) {
        throw new Error("Blog post title is required for Shopify publishing");
    }
    if (!(blogPost.contentHtml || blogPost.content).trim()) {
        throw new Error("Blog post content is required for Shopify publishing");
    }
    try {
        const catalogContext = await (0, shopifyBlog_service_1.loadShopifyCatalogContext)(blogPost.category, {
            topic: blogPost.topic || blogPost.title,
            productLimit: 20,
            collectionLimit: 10,
        });
        let placeholderResolvedHtml = resolveBlogPlaceholders({
            category: blogPost.category,
            contentHtml: blogPost.contentHtml || blogPost.content,
            primaryCollection: catalogContext.primaryCollection,
            products: catalogContext.products,
        });
        const relatedTargets = await loadRelatedBlogLinks({
            currentJobId: blogPost.jobId ?? null,
            category: blogPost.category,
            topic: blogPost.topic || blogPost.title,
        });
        placeholderResolvedHtml = injectNaturalInternalLinks({
            contentHtml: placeholderResolvedHtml,
            targets: [
                ...(catalogContext.primaryCollection?.handle
                    ? [
                        {
                            label: catalogContext.primaryCollection.title ||
                                `${toTitleCase(blogPost.category)} Tools`,
                            href: `/collections/${catalogContext.primaryCollection.handle}`,
                        },
                    ]
                    : []),
                ...catalogContext.products
                    .filter((product) => product.url)
                    .slice(0, 2)
                    .map((product) => ({
                    label: product.title,
                    href: String(product.url),
                })),
                ...relatedTargets,
            ],
        }).contentHtml;
        const contentWithCover = insertCoverImageIntoHtml(placeholderResolvedHtml, blogPost.coverImageUrl, buildImageAltText({
            title: blogPost.title,
            topic: blogPost.topic || blogPost.title,
            category: blogPost.category,
            focus: "cover image",
        }));
        const sanitizedContent = sanitizeBlogHtml(contentWithCover);
        const rewrittenMedia = await replaceImageSourcesWithShopifyUrls({
            title: blogPost.title,
            coverImageUrl: blogPost.coverImageUrl,
            contentHtml: sanitizedContent,
        });
        const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
        await pool.query(`
        UPDATE blog_posts
        SET cover_image_url = $2,
            content = $3,
            content_html = $3,
            updated_at = NOW()
        WHERE id = $1
      `, [blogPostId, rewrittenMedia.coverImageUrl, rewrittenMedia.contentHtml]);
        const shopifyBlogs = await (0, shopifyBlog_service_1.listShopifyBlogs)();
        const matchingBlog = shopifyBlogs.find((entry) => entry.id === blogPost.shopifyBlogId);
        const article = await (0, shopifyBlog_service_1.createArticleForShopifyBlog)({
            blogId: blogPost.shopifyBlogId,
            blogHandle: matchingBlog?.handle ?? null,
            title: blogPost.title,
            author: "ITMart24",
            tags: blogPost.tags,
            excerpt: blogPost.excerpt || "",
            contentHtml: rewrittenMedia.contentHtml,
            publish: true,
        });
        await pool.query(`
        UPDATE blog_posts
        SET shopify_article_id = $2,
            shopify_article_handle = $3,
            shopify_article_url = $4,
            status = 'published',
            published_at = NOW(),
            publish_error = NULL,
            updated_at = NOW()
        WHERE id = $1
      `, [blogPostId, article.articleId, article.handle, article.url]);
        await logPublishEvent({
            jobId: blogPost.jobId,
            step: "shopify_publish_success",
            message: "Blog post published to Shopify successfully",
            metadata: {
                blogPostId,
                shopifyBlogId: blogPost.shopifyBlogId,
                shopifyArticleId: article.articleId,
                shopifyArticleHandle: article.handle,
                shopifyArticleUrl: article.url,
            },
        });
        const updatedBlogPost = await (0, blogManager_service_1.getBlogPostById)(blogPostId);
        return {
            blogPost: updatedBlogPost,
            status: "published",
            articleId: article.articleId,
            articleHandle: article.handle,
            articleUrl: article.url,
            publishedAt: article.publishedAt,
        };
    }
    catch (error) {
        const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
        const status = error &&
            typeof error === "object" &&
            "response" in error &&
            typeof error.response?.status === "number"
            ? error.response?.status ?? null
            : null;
        const responseData = error &&
            typeof error === "object" &&
            "response" in error &&
            error.response?.data
            ? error.response?.data
            : null;
        await pool.query(`
        UPDATE blog_posts
        SET status = 'publish_failed',
            error_message = $2,
            publish_error = $2,
            updated_at = NOW()
        WHERE id = $1
      `, [blogPostId, error instanceof Error ? error.message : String(error)]);
        await logPublishEvent({
            jobId: blogPost.jobId,
            level: "error",
            step: "shopify_publish_failed",
            message: "Shopify publishing failed",
            metadata: {
                blogPostId,
                shopifyBlogId: blogPost.shopifyBlogId,
                title: blogPost.title,
                error: error instanceof Error ? error.message : String(error),
                status,
                responseData,
            },
        });
        console.error("Shopify publish failure details:", {
            blogPostId,
            shopifyBlogId: blogPost.shopifyBlogId,
            title: blogPost.title,
            status,
            responseData,
            message: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
};
exports.createShopifyArticle = createShopifyArticle;
