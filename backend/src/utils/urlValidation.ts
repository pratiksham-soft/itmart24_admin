import axios from "axios";

export type UrlValidationResult = {
  valid: boolean;
  status?: number;
  warning?: string;
  error?: string;
  finalUrl?: string;
};

const REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  Referer: "https://www.google.com/",
};

const ACCEPTED_STATUS_CODES = new Set([200, 201, 204, 301, 302, 303, 307, 308]);
const REJECTED_STATUS_CODES = new Set([400, 401, 404, 410, 500, 502, 503, 504]);

const getFinalUrl = (response: any, fallbackUrl: string) =>
  String(response?.request?.res?.responseUrl || fallbackUrl);

const buildResponse = (
  status: number,
  finalUrl: string
): UrlValidationResult => {
  if (status === 403) {
    return {
      valid: true,
      status,
      warning:
        "URL returned 403. The site may block automated checks, but the URL may still work in a browser.",
      finalUrl,
    };
  }

  if (status === 429) {
    return {
      valid: true,
      status,
      warning:
        "URL returned 429 rate limit. The site may be limiting automated checks, but the URL may still be valid.",
      finalUrl,
    };
  }

  if (ACCEPTED_STATUS_CODES.has(status)) {
    return {
      valid: true,
      status,
      finalUrl,
    };
  }

  if (REJECTED_STATUS_CODES.has(status)) {
    return {
      valid: false,
      status,
      error:
        status === 404
          ? "URL not found."
          : status === 400 || status === 401
            ? "URL request was rejected."
          : status === 410
            ? "URL is no longer available."
            : "URL returned a server error.",
      finalUrl,
    };
  }

  return {
    valid: false,
    status,
    error: `URL returned HTTP ${status}.`,
    finalUrl,
  };
};

const requestUrl = async (url: string, method: "HEAD" | "GET") =>
  axios.request({
    url,
    method,
    maxRedirects: 5,
    timeout: 9000,
    validateStatus: () => true,
    headers: REQUEST_HEADERS,
  });

export const validateGenericUrl = async (rawUrl: string): Promise<UrlValidationResult> => {
  const normalizedUrl = String(rawUrl || "").trim();
  console.info("url_validation_started", { url: normalizedUrl });

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    console.warn("url_validation_failed", {
      url: normalizedUrl,
      reason: "invalid_url_format",
    });
    return {
      valid: false,
      error: "Invalid URL format.",
    };
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    console.warn("url_validation_failed", {
      url: normalizedUrl,
      reason: "invalid_url_protocol",
    });
    return {
      valid: false,
      error: "Invalid URL format.",
    };
  }

  try {
    let response = await requestUrl(parsedUrl.toString(), "HEAD");

    if (response.status === 403 || response.status === 405 || response.status === 429) {
      response = await requestUrl(parsedUrl.toString(), "GET");
    }

    const finalUrl = getFinalUrl(response, parsedUrl.toString());
    const result = buildResponse(Number(response.status), finalUrl);

    if (result.warning) {
      console.info(
        result.status === 429 ? "url_validation_warning_429" : "url_validation_warning_403",
        {
          url: normalizedUrl,
          status: result.status,
          finalUrl: result.finalUrl,
        }
      );
    } else if (result.valid) {
      console.info("url_validation_success", {
        url: normalizedUrl,
        status: result.status,
        finalUrl: result.finalUrl,
      });
    } else {
      console.warn("url_validation_failed", {
        url: normalizedUrl,
        status: result.status,
        finalUrl: result.finalUrl,
        error: result.error,
      });
    }

    return result;
  } catch (error: any) {
    try {
      const response = await requestUrl(parsedUrl.toString(), "GET");
      const finalUrl = getFinalUrl(response, parsedUrl.toString());
      const result = buildResponse(Number(response.status), finalUrl);

      if (result.warning) {
        console.info(
          result.status === 429 ? "url_validation_warning_429" : "url_validation_warning_403",
          {
          url: normalizedUrl,
          status: result.status,
          finalUrl: result.finalUrl,
          }
        );
      } else if (result.valid) {
        console.info("url_validation_success", {
          url: normalizedUrl,
          status: result.status,
          finalUrl: result.finalUrl,
        });
      } else {
        console.warn("url_validation_failed", {
          url: normalizedUrl,
          status: result.status,
          finalUrl: result.finalUrl,
          error: result.error,
        });
      }

      return result;
    } catch (fallbackError: any) {
      console.warn("url_validation_failed", {
        url: normalizedUrl,
        error: fallbackError?.message || error?.message || "url_access_failed",
      });
      return {
        valid: false,
        error: "URL could not be reached.",
      };
    }
  }
};
