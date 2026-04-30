import axios from "axios";
import { getAIProviderRuntimeConfig } from "./aiProvider.service";
import { parseBlogJson } from "./openaiBlog.service";

type GenerateBlogContentParams = {
  topic: string;
  category: string;
  templateContent: string;
  contentGuidance: string;
  preferredSourceLinks: string[];
  productContextCsv?: string;
  collectionContextCsv?: string;
  strictJsonOnly?: boolean;
  qualityRetry?: boolean;
};

type GeneratedBlogContent = ReturnType<typeof parseBlogJson>;

type GenerateBlogContentResult = {
  content: GeneratedBlogContent;
  usage: Record<string, unknown>;
  responseId: string | null;
  model: string;
};

type GenerateImageResult = {
  imageUrl: string | null;
  usage: Record<string, unknown>;
  revisedPrompt: string | null;
};

export class GroqReplicateError extends Error {
  provider: "groq" | "replicate";
  category: string;
  status: number | null;
  code: string | null;
  type: string | null;
  retryAfterMs: number | null;
  responseId: string | null;
  model: string;

  constructor(params: {
    message: string;
    provider: "groq" | "replicate";
    category: string;
    status?: number | null;
    code?: string | null;
    type?: string | null;
    retryAfterMs?: number | null;
    responseId?: string | null;
    model?: string;
  }) {
    super(params.message);
    this.name = "GroqReplicateError";
    this.provider = params.provider;
    this.category = params.category;
    this.status = params.status ?? null;
    this.code = params.code ?? null;
    this.type = params.type ?? null;
    this.retryAfterMs = params.retryAfterMs ?? null;
    this.responseId = params.responseId ?? null;
    this.model = params.model ?? "unknown";
  }
}

const GROQ_TEXT_MODEL = process.env.GROQ_BLOG_TEXT_MODEL || "llama3-70b-8192";
const REPLICATE_IMAGE_VERSION =
  process.env.REPLICATE_IMAGE_VERSION ||
  "black-forest-labs/flux-schnell";
const REPLICATE_POLL_INTERVAL_MS = Math.max(
  1000,
  Number(process.env.REPLICATE_POLL_INTERVAL_MS ?? 3000)
);
const REPLICATE_POLL_TIMEOUT_MS = Math.max(
  10000,
  Number(process.env.REPLICATE_POLL_TIMEOUT_MS ?? 180000)
);

const normalizeTextBlock = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const getRetryAfterMs = (value: unknown) => {
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

  return null;
};

const ensureGroqApiKey = async () => {
  const runtimeConfig = await getAIProviderRuntimeConfig();
  const apiKey = String(runtimeConfig.groqApiKey ?? "").trim();
  if (!apiKey) {
    throw new GroqReplicateError({
      message: "Missing GROQ_API_KEY environment variable",
      provider: "groq",
      category: "configuration",
      model: GROQ_TEXT_MODEL,
    });
  }

  return apiKey;
};

const ensureReplicateApiToken = async () => {
  const runtimeConfig = await getAIProviderRuntimeConfig();
  const apiToken = String(runtimeConfig.replicateApiToken ?? "").trim();
  if (!apiToken) {
    throw new GroqReplicateError({
      message: "Missing REPLICATE_API_TOKEN environment variable",
      provider: "replicate",
      category: "configuration",
      model: REPLICATE_IMAGE_VERSION,
    });
  }

  return apiToken;
};

const buildPrompt = (params: GenerateBlogContentParams) => {
  const preferredSources =
    params.preferredSourceLinks.length > 0
      ? params.preferredSourceLinks.join(", ")
      : "none";
  const productCsv =
    typeof params.productContextCsv === "string" &&
    params.productContextCsv.trim()
      ? params.productContextCsv.trim()
      : "none";
  const collectionCsv =
    typeof params.collectionContextCsv === "string" &&
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

const classifyProviderError = (
  provider: "groq" | "replicate",
  model: string,
  error: unknown
) => {
  if (error instanceof GroqReplicateError) {
    return error;
  }

  if (!axios.isAxiosError(error)) {
    const message = error instanceof Error ? error.message : String(error);
    const lowered = message.toLowerCase();
    return new GroqReplicateError({
      message,
      provider,
      category:
        lowered.includes("timeout") ||
        lowered.includes("network") ||
        lowered.includes("econn")
          ? "network"
          : "unknown",
      model,
    });
  }

  const data =
    error.response?.data && typeof error.response.data === "object"
      ? (error.response.data as Record<string, unknown>)
      : {};
  const nestedError =
    data.error && typeof data.error === "object"
      ? (data.error as Record<string, unknown>)
      : {};
  const status = error.response?.status ?? null;
  const code =
    typeof nestedError.code === "string"
      ? nestedError.code
      : typeof data.code === "string"
      ? data.code
      : error.code ?? null;
  const type =
    typeof nestedError.type === "string"
      ? nestedError.type
      : typeof data.type === "string"
      ? data.type
      : null;
  const message =
    typeof nestedError.message === "string"
      ? nestedError.message
      : typeof data.message === "string"
      ? data.message
      : error.message;
  const lowered = `${code ?? ""} ${type ?? ""} ${message}`.toLowerCase();

  let category = "unknown";
  if (status === 429 || lowered.includes("rate")) {
    category = "rate_limit";
  } else if (lowered.includes("quota") || lowered.includes("billing")) {
    category = "quota";
  } else if ([500, 502, 503, 504].includes(status ?? 0)) {
    category = "server";
  } else if (
    error.code === "ECONNRESET" ||
    error.code === "ETIMEDOUT" ||
    error.code === "ENOTFOUND" ||
    error.code === "ECONNABORTED" ||
    lowered.includes("timeout") ||
    lowered.includes("network")
  ) {
    category = "network";
  }

  return new GroqReplicateError({
    message,
    provider,
    category,
    status,
    code: typeof code === "string" ? code : null,
    type,
    retryAfterMs: getRetryAfterMs(error.response?.headers?.["retry-after"]),
    responseId:
      normalizeTextBlock(data.id) ??
      normalizeTextBlock(data.prediction_id) ??
      null,
    model,
  });
};

const sleep = async (delayMs: number) => {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
};

export const generateGroqBlogContent = async (
  params: GenerateBlogContentParams
): Promise<GenerateBlogContentResult> => {
  try {
    const apiKey = await ensureGroqApiKey();
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: GROQ_TEXT_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a professional SEO content writer for ITMart24, a digital product marketplace where users discover, compare, and visit official vendor websites. Write human-like, practical, SEO-friendly content. Avoid fluff, repetition, unsupported claims, and aggressive sales language. Return only valid JSON.",
          },
          {
            role: "user",
            content: buildPrompt(params),
          },
        ],
        temperature: 0.6,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 120000,
      }
    );

    const rawText =
      normalizeTextBlock(
        (
          response.data?.choices?.[0] as
            | { message?: { content?: unknown } }
            | undefined
        )?.message?.content
      ) ?? "";

    if (!rawText) {
      throw new GroqReplicateError({
        message: "Groq response did not include usable text output",
        provider: "groq",
        category: "parsing",
        responseId: normalizeTextBlock(response.data?.id),
        model:
          normalizeTextBlock(response.data?.model) ?? GROQ_TEXT_MODEL,
      });
    }

    return {
      content: parseBlogJson(rawText),
      usage:
        response.data?.usage && typeof response.data.usage === "object"
          ? (response.data.usage as Record<string, unknown>)
          : {},
      responseId: normalizeTextBlock(response.data?.id),
      model: normalizeTextBlock(response.data?.model) ?? GROQ_TEXT_MODEL,
    };
  } catch (error) {
    throw classifyProviderError("groq", GROQ_TEXT_MODEL, error);
  }
};

export const generateReplicateBlogImage = async (
  prompt: string
): Promise<GenerateImageResult> => {
  try {
    const authToken = await ensureReplicateApiToken();
    const predictionResponse = await axios.post(
      "https://api.replicate.com/v1/predictions",
      {
        version: REPLICATE_IMAGE_VERSION,
        input: {
          prompt,
          width: 1536,
          height: 1024,
        },
      },
      {
        headers: {
          Authorization: `Token ${authToken}`,
          "Content-Type": "application/json",
        },
        timeout: 120000,
      }
    );

    const predictionId = normalizeTextBlock(predictionResponse.data?.id);
    if (!predictionId) {
      throw new GroqReplicateError({
        message: "Replicate prediction id was missing",
        provider: "replicate",
        category: "parsing",
        model: REPLICATE_IMAGE_VERSION,
      });
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < REPLICATE_POLL_TIMEOUT_MS) {
      const pollResponse = await axios.get(
        `https://api.replicate.com/v1/predictions/${predictionId}`,
        {
          headers: {
            Authorization: `Token ${authToken}`,
          },
          timeout: 120000,
        }
      );

      const status = normalizeTextBlock(pollResponse.data?.status);
      if (status === "succeeded") {
        const output = pollResponse.data?.output;
        const imageUrl = Array.isArray(output)
          ? normalizeTextBlock(output[0])
          : normalizeTextBlock(output);

        if (!imageUrl) {
          throw new GroqReplicateError({
            message: "Replicate prediction completed without an image URL",
            provider: "replicate",
            category: "parsing",
            responseId: predictionId,
            model: REPLICATE_IMAGE_VERSION,
          });
        }

        return {
          imageUrl,
          usage: {
            predictionId,
            status,
          },
          revisedPrompt: null,
        };
      }

      if (status === "failed" || status === "canceled") {
        throw new GroqReplicateError({
          message:
            normalizeTextBlock(pollResponse.data?.error) ??
            `Replicate prediction ${status}`,
          provider: "replicate",
          category: "server",
          responseId: predictionId,
          model: REPLICATE_IMAGE_VERSION,
        });
      }

      await sleep(REPLICATE_POLL_INTERVAL_MS);
    }

    throw new GroqReplicateError({
      message: "Replicate image generation timed out",
      provider: "replicate",
      category: "network",
      model: REPLICATE_IMAGE_VERSION,
    });
  } catch (error) {
    throw classifyProviderError("replicate", REPLICATE_IMAGE_VERSION, error);
  }
};

export const classifyGroqReplicateError = (error: unknown) => {
  const classified =
    error instanceof GroqReplicateError
      ? error
      : classifyProviderError("groq", GROQ_TEXT_MODEL, error);

  return {
    provider: classified.provider,
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
