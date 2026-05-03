"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateBlogImage = exports.generateBlogContent = exports.classifyOpenAIError = exports.parseBlogJson = exports.extractOpenAIText = exports.OpenAiBlogError = void 0;
const axios_1 = __importDefault(require("axios"));
class OpenAiBlogError extends Error {
    constructor(params) {
        super(params.message);
        this.name = "OpenAiBlogError";
        this.category = params.category;
        this.status = params.status ?? null;
        this.code = params.code ?? null;
        this.type = params.type ?? null;
        this.retryAfterMs = params.retryAfterMs ?? null;
        this.responseId = params.responseId ?? null;
        this.model = params.model;
    }
}
exports.OpenAiBlogError = OpenAiBlogError;
const OPENAI_TEXT_MODEL = process.env.OPENAI_BLOG_TEXT_MODEL || "gpt-4o-mini";
const OPENAI_IMAGE_MODEL = process.env.OPENAI_BLOG_IMAGE_MODEL || "gpt-image-1";
const OPENAI_BLOG_DEBUG = ["1", "true", "yes", "on"].includes(String(process.env.OPENAI_BLOG_DEBUG ?? "").trim().toLowerCase());
const ensureOpenAiApiKey = () => {
    const apiKey = String(process.env.OPENAI_API_KEY ?? "").trim();
    if (!apiKey) {
        throw new Error("Missing OPENAI_API_KEY environment variable");
    }
    return apiKey;
};
const getOpenAiClient = () => axios_1.default.create({
    baseURL: "https://api.openai.com/v1",
    headers: {
        Authorization: `Bearer ${ensureOpenAiApiKey()}`,
        "Content-Type": "application/json",
    },
    timeout: 120000,
});
const createSlug = (value) => value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
const buildPrompt = (params) => {
    const preferredSources = params.preferredSourceLinks.length > 0
        ? params.preferredSourceLinks.join(", ")
        : "none";
    const productCsv = typeof params.productContextCsv === "string" &&
        params.productContextCsv.trim()
        ? params.productContextCsv.trim()
        : "none";
    const collectionCsv = typeof params.collectionContextCsv === "string" &&
        params.collectionContextCsv.trim()
        ? params.collectionContextCsv.trim()
        : "none";
    const strictTail = params.strictJsonOnly
        ? "\nStrict reminder: Return only valid JSON matching the schema. No markdown. No explanation."
        : "";
    const qualityRetryTail = params.qualityRetry
        ? "\nThe previous output was too short or generic. Rewrite with more depth, practical examples, stronger sections, real comparison context, and at least 1200 words. Return only valid JSON."
        : "";
    return [
        "Create one blog post.",
        "",
        `Topic: ${params.topic}`,
        `Category: ${params.category}`,
        `Preferred source URLs: ${preferredSources}`,
        `Template notes: ${params.templateContent || "None."}`,
        `Content guidance: ${params.contentGuidance || "Generated blog content should be professional and human-like."}`,
        `Product CSV: ${productCsv}`,
        `Collection CSV: ${collectionCsv}`,
        "",
        "Rules:",
        "- Output ONLY valid JSON.",
        "- No markdown fences.",
        "- No explanation.",
        "- Use clean HTML in content_html.",
        "- Tone: professional, human-like, practical.",
        "- Keep claims fact-safe.",
        "- CTA must be ITMart24-aware: encourage comparing tools and visiting official websites, not forced buying.",
        "- Do not invent products, collections, pricing, or vendor claims.",
        "- Only use product or collection context that was provided.",
        "- Use provided Shopify product and collection context for relevant tool mentions.",
        "- Pick products by exact, keyword, or broader relevance.",
        "- If exact matches are weak, use popular available tools but label them carefully.",
        "- Insert internal links naturally inside content.",
        "- Do not leave placeholders visible in the final writing intent.",
        "- Target at least 1200 words unless the topic is genuinely narrow.",
        "- Avoid repetitive filler and unsupported superlatives.",
        `- Include placeholders: [Internal Link: ${params.category}]`,
        `- Include placeholders: [Dynamic Comparison Table: category="${params.category}"]`,
        "",
        "JSON schema:",
        "{",
        '  "title": "50-60 char SEO title with primary keyword",',
        '  "slug": "lowercase-hyphen-slug",',
        '  "meta_title": "50-60 char meta title with ITMart24",',
        '  "meta_description": "140-160 char meta description",',
        '  "excerpt": "short 1-2 sentence summary",',
        `  "content_html": "<h1>...</h1><p>40-60 word intro...</p><div class='summary-box'>...</div><h2>...</h2><h3>...</h3><p>...</p><h2>Top Tools Comparison</h2><p>[Dynamic Comparison Table: category=\\"${params.category}\\"]</p><h2>Pros and Cons</h2><h2>Practical Guide</h2><h2>FAQs</h2><h2>Key Takeaways</h2><p>CTA with [Internal Link: ${params.category}]</p>",`,
        '  "tags": ["tag1","tag2","tag3","tag4","tag5"],',
        '  "image_prompt": "Modern SaaS-style cover image prompt, no text in image"',
        "}",
        strictTail,
        qualityRetryTail,
    ]
        .join("\n")
        .trim();
};
const getRetryAfterMs = (value) => {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return Math.ceil(value * 1000);
    }
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    const seconds = Number(trimmed);
    if (Number.isFinite(seconds) && seconds > 0) {
        return Math.ceil(seconds * 1000);
    }
    const dateValue = Date.parse(trimmed);
    if (Number.isFinite(dateValue)) {
        const delta = dateValue - Date.now();
        return delta > 0 ? delta : null;
    }
    return null;
};
const normalizeTextBlock = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
const extractTextFromChoiceContent = (value) => {
    if (!Array.isArray(value)) {
        return null;
    }
    const parts = value
        .map((entry) => {
        if (!entry || typeof entry !== "object") {
            return null;
        }
        const record = entry;
        return (normalizeTextBlock(record.text) ??
            normalizeTextBlock(record.content) ??
            normalizeTextBlock(record.text &&
                typeof record.text === "object" &&
                "value" in record.text
                ? record.text.value
                : null));
    })
        .filter(Boolean);
    return parts.length > 0 ? parts.join("\n").trim() : null;
};
const extractOpenAIText = (data) => {
    if (!data || typeof data !== "object") {
        return null;
    }
    const record = data;
    const outputText = normalizeTextBlock(record.output_text);
    if (outputText) {
        return outputText;
    }
    const parts = [];
    if (Array.isArray(record.output)) {
        for (const item of record.output) {
            if (!item || typeof item !== "object") {
                continue;
            }
            const itemRecord = item;
            if (!Array.isArray(itemRecord.content)) {
                continue;
            }
            for (const block of itemRecord.content) {
                if (!block || typeof block !== "object") {
                    continue;
                }
                const blockRecord = block;
                const textValue = normalizeTextBlock(blockRecord.text) ??
                    normalizeTextBlock(blockRecord.text &&
                        typeof blockRecord.text === "object" &&
                        "value" in blockRecord.text
                        ? blockRecord.text.value
                        : null) ??
                    normalizeTextBlock(blockRecord.content);
                if (textValue) {
                    parts.push(textValue);
                }
            }
        }
    }
    if (parts.length > 0) {
        return parts.join("\n").trim();
    }
    const choiceContent = record.choices &&
        Array.isArray(record.choices) &&
        record.choices[0] &&
        typeof record.choices[0] === "object"
        ? record.choices[0].message?.content
        : null;
    const choiceText = normalizeTextBlock(choiceContent) ?? extractTextFromChoiceContent(choiceContent);
    if (choiceText) {
        return choiceText;
    }
    const content = normalizeTextBlock(record.content);
    if (content) {
        return content;
    }
    return null;
};
exports.extractOpenAIText = extractOpenAIText;
const stripMarkdownFences = (value) => value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
const parseJsonCandidate = (value) => {
    const trimmed = stripMarkdownFences(value);
    try {
        return JSON.parse(trimmed);
    }
    catch (_error) {
        const firstBrace = trimmed.indexOf("{");
        const lastBrace = trimmed.lastIndexOf("}");
        if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
            throw new Error("OpenAI response JSON could not be parsed");
        }
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }
};
const ensureTags = (value) => {
    if (Array.isArray(value)) {
        return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
    }
    if (typeof value === "string") {
        return value
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean);
    }
    return [];
};
const parseBlogJson = (rawText) => {
    let parsed;
    try {
        parsed = parseJsonCandidate(rawText);
    }
    catch (_error) {
        throw new OpenAiBlogError({
            message: "OpenAI response JSON could not be parsed",
            category: "parsing",
            model: OPENAI_TEXT_MODEL,
        });
    }
    if (!parsed || typeof parsed !== "object") {
        throw new OpenAiBlogError({
            message: "OpenAI response JSON could not be parsed",
            category: "parsing",
            model: OPENAI_TEXT_MODEL,
        });
    }
    const record = parsed;
    const title = String(record.title ?? "").trim();
    const slug = String(record.slug ?? "").trim();
    const metaTitle = String(record.meta_title ?? "").trim();
    const metaDescription = String(record.meta_description ?? "").trim();
    const excerpt = String(record.excerpt ?? "").trim();
    const contentHtml = String(record.content_html ?? "").trim();
    const imagePrompt = String(record.image_prompt ?? "").trim();
    const tags = ensureTags(record.tags);
    const missingFields = [
        !title ? "title" : null,
        !slug ? "slug" : null,
        !metaTitle ? "meta_title" : null,
        !metaDescription ? "meta_description" : null,
        !excerpt ? "excerpt" : null,
        !contentHtml ? "content_html" : null,
        !imagePrompt ? "image_prompt" : null,
        tags.length === 0 ? "tags" : null,
    ].filter(Boolean);
    if (missingFields.length > 0) {
        throw new OpenAiBlogError({
            message: `OpenAI response is missing required blog fields: ${missingFields.join(", ")}`,
            category: "validation",
            model: OPENAI_TEXT_MODEL,
        });
    }
    return {
        title,
        slug: createSlug(slug),
        metaTitle,
        metaDescription,
        excerpt,
        contentHtml,
        imagePrompt,
        tags,
    };
};
exports.parseBlogJson = parseBlogJson;
const classifyOpenAIError = (error) => {
    if (error instanceof OpenAiBlogError) {
        return {
            category: error.category,
            status: error.status,
            code: error.code,
            type: error.type,
            message: error.message,
            retryAfterMs: error.retryAfterMs,
            responseId: error.responseId,
            model: error.model,
        };
    }
    if (!axios_1.default.isAxiosError(error)) {
        const message = error instanceof Error ? error.message : String(error);
        const lowered = message.toLowerCase();
        const category = lowered.includes("timeout") ||
            lowered.includes("econnreset") ||
            lowered.includes("etimedout") ||
            lowered.includes("enotfound") ||
            lowered.includes("network")
            ? "network"
            : "unknown";
        return {
            category,
            status: null,
            code: null,
            type: null,
            message,
            retryAfterMs: null,
            responseId: null,
            model: OPENAI_TEXT_MODEL,
        };
    }
    const data = error.response?.data && typeof error.response.data === "object"
        ? error.response.data
        : {};
    const nestedError = data.error && typeof data.error === "object"
        ? data.error
        : {};
    const status = error.response?.status ?? null;
    const code = typeof nestedError.code === "string"
        ? nestedError.code
        : typeof data.code === "string"
            ? data.code
            : error.code ?? null;
    const type = typeof nestedError.type === "string"
        ? nestedError.type
        : typeof data.type === "string"
            ? data.type
            : null;
    const message = typeof nestedError.message === "string"
        ? nestedError.message
        : typeof data.message === "string"
            ? data.message
            : error.message;
    const retryAfterMs = getRetryAfterMs(error.response?.headers?.["retry-after"]);
    const lowered = `${code ?? ""} ${type ?? ""} ${message}`.toLowerCase();
    let category = "unknown";
    if (status === 429 ||
        lowered.includes("rate_limit") ||
        type === "rate_limit_error") {
        category = "rate_limit";
    }
    else if (lowered.includes("insufficient_quota") ||
        lowered.includes("quota") ||
        lowered.includes("billing")) {
        category = "quota";
    }
    else if ([500, 502, 503, 504].includes(status ?? 0)) {
        category = "server";
    }
    else if (error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT" ||
        error.code === "ENOTFOUND" ||
        error.code === "ECONNABORTED" ||
        lowered.includes("timeout") ||
        lowered.includes("network")) {
        category = "network";
    }
    return {
        category,
        status,
        code: typeof code === "string" ? code : null,
        type,
        message,
        retryAfterMs,
        responseId: typeof data.id === "string" ? data.id : null,
        model: typeof data.model === "string" && data.model ? data.model : OPENAI_TEXT_MODEL,
    };
};
exports.classifyOpenAIError = classifyOpenAIError;
const logOpenAiParseFailure = (data) => {
    const record = data && typeof data === "object" ? data : {};
    const output = Array.isArray(record.output) ? record.output : [];
    const outputSummary = output.map((entry) => {
        if (!entry || typeof entry !== "object") {
            return "unknown";
        }
        const item = entry;
        return {
            type: typeof item.type === "string" ? item.type : "unknown",
            keys: Object.keys(item),
            contentTypes: Array.isArray(item.content)
                ? item.content.map((block) => block && typeof block === "object"
                    ? String(block.type ?? "unknown")
                    : "unknown")
                : [],
        };
    });
    console.error("OpenAI response text extraction failed:", {
        responseId: typeof record.id === "string" ? record.id : null,
        status: typeof record.status === "string" ? record.status : null,
        model: typeof record.model === "string" ? record.model : OPENAI_TEXT_MODEL,
        outputSummary,
        topLevelKeys: Object.keys(record),
        debugTextPreview: OPENAI_BLOG_DEBUG ? (0, exports.extractOpenAIText)(record) : undefined,
    });
};
const generateBlogContent = async (params) => {
    try {
        const response = await getOpenAiClient().post("/responses", {
            model: OPENAI_TEXT_MODEL,
            input: [
                {
                    role: "system",
                    content: "You are a professional SEO content writer for ITMart24, a digital product marketplace where users discover, compare, and visit official vendor websites. Write human-like, practical, SEO-friendly content. Avoid fluff, repetition, unsupported claims, and aggressive sales language. Return only valid JSON.",
                },
                {
                    role: "user",
                    content: buildPrompt(params),
                },
            ],
            temperature: 0.6,
            max_output_tokens: 3500,
        });
        const outputText = (0, exports.extractOpenAIText)(response.data);
        if (!outputText) {
            logOpenAiParseFailure(response.data);
            throw new OpenAiBlogError({
                message: "OpenAI response did not include usable text output",
                category: "parsing",
                responseId: typeof response.data?.id === "string" ? response.data.id : null,
                model: typeof response.data?.model === "string" && response.data.model
                    ? response.data.model
                    : OPENAI_TEXT_MODEL,
            });
        }
        const content = (0, exports.parseBlogJson)(outputText);
        return {
            content,
            usage: response.data?.usage && typeof response.data.usage === "object"
                ? response.data.usage
                : {},
            responseId: typeof response.data?.id === "string" ? response.data.id : null,
            model: typeof response.data?.model === "string" && response.data.model
                ? response.data.model
                : OPENAI_TEXT_MODEL,
        };
    }
    catch (error) {
        if (error instanceof OpenAiBlogError) {
            throw error;
        }
        const classified = (0, exports.classifyOpenAIError)(error);
        throw new OpenAiBlogError({
            message: classified.message,
            category: classified.category,
            status: classified.status,
            code: classified.code,
            type: classified.type,
            retryAfterMs: classified.retryAfterMs,
            responseId: classified.responseId,
            model: classified.model,
        });
    }
};
exports.generateBlogContent = generateBlogContent;
const generateBlogImage = async (prompt) => {
    const response = await getOpenAiClient().post("/images/generations", {
        model: OPENAI_IMAGE_MODEL,
        prompt,
        size: "1536x1024",
        quality: "high",
    });
    const firstImage = Array.isArray(response.data?.data) ? response.data.data[0] : null;
    if (!firstImage || typeof firstImage !== "object") {
        throw new Error("OpenAI image response did not include image data");
    }
    const imageRecord = firstImage;
    const imageUrl = typeof imageRecord.url === "string" && imageRecord.url
        ? imageRecord.url
        : typeof imageRecord.b64_json === "string" && imageRecord.b64_json
            ? `data:image/png;base64,${imageRecord.b64_json}`
            : null;
    if (!imageUrl) {
        throw new Error("OpenAI image response did not include a usable image URL");
    }
    return {
        imageUrl,
        usage: response.data?.usage && typeof response.data.usage === "object"
            ? response.data.usage
            : {},
        revisedPrompt: typeof imageRecord.revised_prompt === "string"
            ? imageRecord.revised_prompt
            : null,
    };
};
exports.generateBlogImage = generateBlogImage;
