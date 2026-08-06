import { getAdminEventStreamUrl } from "./adminApi";

const VISITOR_ANALYTICS_CHANGED_EVENT = "visitor-analytics:changed";

let visitorAnalyticsStream: EventSource | null = null;
let visitorAnalyticsStreamStarted = false;

export const emitVisitorAnalyticsChanged = () => {
  window.dispatchEvent(new CustomEvent(VISITOR_ANALYTICS_CHANGED_EVENT));
};

export const subscribeToVisitorAnalyticsChanged = (callback: () => void) => {
  const handler = () => callback();
  window.addEventListener(VISITOR_ANALYTICS_CHANGED_EVENT, handler);

  return () => {
    window.removeEventListener(VISITOR_ANALYTICS_CHANGED_EVENT, handler);
  };
};

export const ensureVisitorAnalyticsStream = () => {
  if (visitorAnalyticsStreamStarted) {
    return;
  }

  visitorAnalyticsStreamStarted = true;

  try {
    visitorAnalyticsStream = new EventSource(
      getAdminEventStreamUrl("/api/admin/visitors/stream")
    );

    const emitUpdate = () => emitVisitorAnalyticsChanged();
    visitorAnalyticsStream.addEventListener("visitors-updated", emitUpdate);
    visitorAnalyticsStream.addEventListener("visitors-heartbeat", emitUpdate);
    visitorAnalyticsStream.onerror = () => {
      emitVisitorAnalyticsChanged();
    };
  } catch (error) {
    console.error("Failed to start visitors analytics stream", error);
  }
};
