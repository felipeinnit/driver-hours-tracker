self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const rawData = event.data?.text() || "";
  let data;
  try {
    data = rawData ? JSON.parse(rawData) : {};
  } catch {
    data = { body: rawData };
  }

  event.waitUntil(
    self.registration.showNotification(
      data.title || "Driver Hours Tracker",
      {
        body: data.body || "",
        icon: new URL("./icon-192.png", self.registration.scope).href,
        tag: data.tag || "driver-hours-alert",
        renotify: true,
      },
    ),
  );
});
