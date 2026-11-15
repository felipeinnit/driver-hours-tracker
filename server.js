import "dotenv/config";
import express from "express";
import webPush from "web-push";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.resolve(process.env.DATA_DIR || "./data");
const subscriptionsFile = path.join(dataDirectory, "subscriptions.json");
const port = Number(process.env.PORT || 8080);
const vapidSubject = process.env.VAPID_SUBJECT;
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
  throw new Error(
    "Set VAPID_SUBJECT, VAPID_PUBLIC_KEY, and VAPID_PRIVATE_KEY before starting the server.",
  );
}

webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const subscriptions = new Map();
const app = express();
let saveQueue = Promise.resolve();
const staticFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/app.js", "app.js"],
  ["/style.css", "style.css"],
  ["/manifest.json", "manifest.json"],
  ["/sw.js", "sw.js"],
  ["/icon-192.png", "icon-192.png"],
  ["/icon-512.png", "icon-512.png"],
]);
let isSending = false;
const apiRequests = new Map();
const maxStoredSubscriptions = 10;
const maxRequestsPerMinute = 60;

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
app.use("/api", (request, response, next) => {
  const now = Date.now();
  if (apiRequests.size > 1000) {
    for (const [ip, entry] of apiRequests) {
      if (now >= entry.expiresAt) apiRequests.delete(ip);
    }
  }
  const entry = apiRequests.get(request.ip);
  if (!entry || now >= entry.expiresAt) {
    apiRequests.set(request.ip, { count: 1, expiresAt: now + 60000 });
    next();
    return;
  }
  if (entry.count >= maxRequestsPerMinute) {
    sendJsonError(response, 429, "Too many requests. Try again shortly.");
    return;
  }
  entry.count += 1;
  next();
});

function isAllowedPushHost(hostname) {
  return (
    hostname === "fcm.googleapis.com" ||
    hostname.endsWith(".push.services.mozilla.com") ||
    hostname.endsWith(".push.apple.com") ||
    hostname.endsWith(".notify.windows.com")
  );
}

function readSubscription(value) {
  if (
    !value ||
    typeof value.endpoint !== "string" ||
    typeof value.keys?.p256dh !== "string" ||
    typeof value.keys?.auth !== "string"
  ) {
    throw new Error("A valid browser push subscription is required.");
  }

  let endpoint;
  try {
    endpoint = new URL(value.endpoint);
  } catch {
    throw new Error("The subscription endpoint is invalid.");
  }

  if (endpoint.protocol !== "https:" || !isAllowedPushHost(endpoint.hostname)) {
    throw new Error("The subscription endpoint is not a supported push service.");
  }

  return {
    endpoint: endpoint.href,
    expirationTime: value.expirationTime ?? null,
    keys: {
      p256dh: value.keys.p256dh,
      auth: value.keys.auth,
    },
  };
}

async function saveSubscriptions() {
  const write = saveQueue.then(async () => {
    await mkdir(dataDirectory, { recursive: true });
    const temporaryFile = `${subscriptionsFile}.tmp`;
    await writeFile(
      temporaryFile,
      JSON.stringify([...subscriptions.values()]),
      { mode: 0o600 },
    );
    await rename(temporaryFile, subscriptionsFile);
  });
  saveQueue = write.catch(() => {});
  await write;
}

async function loadSubscriptions() {
  let contents;
  try {
    contents = await readFile(subscriptionsFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  const records = JSON.parse(contents);
  if (!Array.isArray(records)) {
    throw new Error("The saved push subscriptions file is invalid.");
  }

  for (const record of records) {
    const subscription = readSubscription(record.subscription);
    subscriptions.set(subscription.endpoint, {
      subscription,
      testEnabled: record.testEnabled === true,
    });
  }
}

async function sendNotification(record) {
  const payload = JSON.stringify({
    title: "Driver Hours Tracker test",
    body: `Background test sent at ${new Date().toLocaleTimeString()}`,
    tag: "driver-hours-background-test",
  });

  try {
    await webPush.sendNotification(record.subscription, payload, {
      TTL: 15,
    });
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      subscriptions.delete(record.subscription.endpoint);
      await saveSubscriptions();
    }
    throw error;
  }
}

function sendJsonError(response, status, message) {
  response.status(status).json({ error: message });
}

app.get("/api/vapid-public-key", (_request, response) => {
  response.json({ publicKey: vapidPublicKey });
});

app.post("/api/test/status", (request, response) => {
  let subscription;
  try {
    subscription = readSubscription(request.body);
  } catch (error) {
    sendJsonError(response, 400, error.message);
    return;
  }

  response.json({
    active: subscriptions.get(subscription.endpoint)?.testEnabled === true,
  });
});

app.post("/api/test/start", async (request, response) => {
  let subscription;
  try {
    subscription = readSubscription(request.body);
  } catch (error) {
    sendJsonError(response, 400, error.message);
    return;
  }

  const existing = subscriptions.get(subscription.endpoint);
  if (existing?.testEnabled) {
    response.json({ active: true });
    return;
  }
  if (!existing && subscriptions.size >= maxStoredSubscriptions) {
    sendJsonError(response, 429, "This push server has reached its subscription limit.");
    return;
  }
  const activeTests = [...subscriptions.values()].filter(
    (record) => record.testEnabled,
  ).length;
  if (activeTests >= maxStoredSubscriptions) {
    sendJsonError(response, 429, "This push server has reached its active test limit.");
    return;
  }

  const record = { subscription, testEnabled: true };
  subscriptions.set(subscription.endpoint, record);
  await saveSubscriptions();
  try {
    await sendNotification(record);
  } catch (error) {
    record.testEnabled = false;
    await saveSubscriptions();
    sendJsonError(response, 502, `Could not send the first push: ${error.message}`);
    return;
  }

  response.json({ active: true });
});

app.post("/api/test/stop", async (request, response) => {
  let subscription;
  try {
    subscription = readSubscription(request.body);
  } catch (error) {
    sendJsonError(response, 400, error.message);
    return;
  }

  const record = subscriptions.get(subscription.endpoint);
  if (record) {
    record.testEnabled = false;
    await saveSubscriptions();
  }

  response.json({ active: false });
});

for (const [route, filename] of staticFiles) {
  app.get(route, (_request, response, next) => {
    response.sendFile(path.join(root, filename), (error) => {
      if (error) next(error);
    });
  });
}

app.get("/healthz", (_request, response) => {
  response.json({ ok: true });
});

app.use((_request, response) => {
  response.status(404).json({ error: "Not found." });
});

app.use((error, _request, response, next) => {
  console.error("Request failed:", error.message);
  if (response.headersSent) {
    next(error);
    return;
  }
  sendJsonError(response, 500, "The server could not complete the request.");
});

await loadSubscriptions();

setInterval(async () => {
  if (isSending) return;
  isSending = true;
  try {
    for (const record of subscriptions.values()) {
      if (!record.testEnabled) continue;
      try {
        await sendNotification(record);
      } catch (error) {
        if (error.statusCode !== 404 && error.statusCode !== 410) {
          console.error("Background push failed:", error.message);
        }
      }
    }
  } finally {
    isSending = false;
  }
}, 15000);

app.listen(port, "0.0.0.0", () => {
  console.log(`Driver Hours Tracker push server listening on port ${port}.`);
});
