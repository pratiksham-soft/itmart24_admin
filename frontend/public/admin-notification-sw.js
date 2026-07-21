self.addEventListener("push", (event) => {
  const payload = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  })();

  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : "ITMart24 Admin";
  const body =
    typeof payload.body === "string" && payload.body.trim()
      ? payload.body.trim()
      : "New admin activity was recorded.";
  const targetUrl =
    typeof payload.targetUrl === "string" && payload.targetUrl.startsWith("/")
      ? payload.targetUrl
      : "/notifications";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: "itmart24-admin-notification",
      renotify: true,
      data: {
        targetUrl,
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  const targetUrl =
    typeof event.notification?.data?.targetUrl === "string" &&
    event.notification.data.targetUrl.startsWith("/")
      ? event.notification.data.targetUrl
      : "/notifications";

  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    }).then((clients) => {
      const matchingClient = clients.find((client) =>
        "focus" in client
      );

      if (matchingClient) {
        return matchingClient.focus().then(() => {
          if ("navigate" in matchingClient) {
            return matchingClient.navigate(targetUrl);
          }

          return undefined;
        });
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
