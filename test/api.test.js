const assert = require("node:assert/strict");
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

const runId = `${Date.now()}-${process.pid}`;
const adminEmail = `api-admin-${runId}@example.com`;
const adminOriginalPassword = "admin-password-1";
const adminNewPassword = "admin-password-2";

let baseUrl;
let databaseUrl;
let createdDatabaseName;
let serverProcess;
let serverOutput = "";
let storageServer;
let storageBaseUrl;
const uploadedFiles = new Set();
const storageObjects = new Map();
const storageRequests = [];

function run(command, args, env = {}) {
  try {
    return execFileSync(command, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    throw new Error(
      [
        `${command} ${args.join(" ")} failed.`,
        error.stdout ? `stdout:\n${error.stdout}` : "",
        error.stderr ? `stderr:\n${error.stderr}` : ""
      ]
        .filter(Boolean)
        .join("\n\n")
    );
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function readRequestBuffer(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function startFakeSupabaseStorage() {
  const port = await getFreePort();
  storageBaseUrl = `http://127.0.0.1:${port}`;
  storageServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, storageBaseUrl);
      const uploadPrefix = "/storage/v1/object/inkline-test/";
      const publicPrefix = "/storage/v1/object/public/inkline-test/";

      if (req.method === "POST" && url.pathname.startsWith(uploadPrefix)) {
        assert.equal(req.headers.authorization, "Bearer test-service-key");
        assert.equal(req.headers.apikey, "test-service-key");

        const objectPath = decodeURIComponent(url.pathname.slice(uploadPrefix.length));
        const buffer = await readRequestBuffer(req);
        storageRequests.push({
          method: req.method,
          objectPath,
          contentType: req.headers["content-type"],
          size: buffer.length
        });
        storageObjects.set(objectPath, {
          buffer,
          contentType: req.headers["content-type"]
        });

        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ Key: `inkline-test/${objectPath}` }));
        return;
      }

      if (req.method === "DELETE" && url.pathname.startsWith(uploadPrefix)) {
        assert.equal(req.headers.authorization, "Bearer test-service-key");
        assert.equal(req.headers.apikey, "test-service-key");

        const objectPath = decodeURIComponent(url.pathname.slice(uploadPrefix.length));
        storageRequests.push({
          method: req.method,
          objectPath
        });
        storageObjects.delete(objectPath);

        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === "GET" && url.pathname.startsWith(publicPrefix)) {
        const objectPath = decodeURIComponent(url.pathname.slice(publicPrefix.length));
        const object = storageObjects.get(objectPath);
        if (!object) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Not found");
          return;
        }

        res.writeHead(200, {
          "Content-Type": object.contentType,
          "Cache-Control": "public, max-age=31536000, immutable"
        });
        res.end(object.buffer);
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(error.message);
    }
  });

  await new Promise((resolve, reject) => {
    storageServer.once("error", reject);
    storageServer.listen(port, "127.0.0.1", resolve);
  });
}

async function stopFakeSupabaseStorage() {
  if (!storageServer) return;
  await new Promise((resolve, reject) => {
    storageServer.close((error) => (error ? reject(error) : resolve()));
  });
  storageServer = null;
}

function makeDatabaseUrl(databaseName) {
  return `postgresql://${encodeURIComponent(os.userInfo().username)}@localhost:5432/${databaseName}`;
}

async function prepareDatabase() {
  if (process.env.TEST_DATABASE_URL) {
    databaseUrl = process.env.TEST_DATABASE_URL;
  } else {
    createdDatabaseName = `inkline_api_test_${Date.now()}_${process.pid}`;
    run("createdb", [createdDatabaseName]);
    databaseUrl = makeDatabaseUrl(createdDatabaseName);
  }

  run("npx", ["prisma", "migrate", "deploy"], {
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl
  });
}

async function startServer() {
  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverOutput = "";
  serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      ADMIN_EMAILS: adminEmail,
      APP_URL: "https://inkline.example.test",
      AUTH_RATE_LIMIT_MAX: "10",
      AUTH_RATE_LIMIT_WINDOW_MS: "60000",
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      EMAIL_PROVIDER: "dev",
      HOST: "127.0.0.1",
      PORT: String(port),
      RESPONSE_RATE_LIMIT_MAX: "1",
      RESPONSE_RATE_LIMIT_WINDOW_MS: "60000",
      STORAGE_PROVIDER: "supabase",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
      SUPABASE_STORAGE_BUCKET: "inkline-test",
      SUPABASE_STORAGE_PATH_PREFIX: "story-covers",
      SUPABASE_URL: storageBaseUrl,
      UPLOAD_RATE_LIMIT_MAX: "2",
      UPLOAD_RATE_LIMIT_WINDOW_MS: "60000"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  serverProcess.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  serverProcess.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Test server exited early.\n${serverOutput}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/session`);
      if (response.ok) return;
    } catch {
      // The server may not have bound the port yet.
    }

    await wait(100);
  }

  throw new Error(`Timed out waiting for test server.\n${serverOutput}`);
}

async function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return;

  const exited = new Promise((resolve) => serverProcess.once("exit", resolve));
  serverProcess.kill("SIGTERM");
  const result = await Promise.race([exited, wait(1500).then(() => "timeout")]);

  if (result === "timeout" && serverProcess.exitCode === null) {
    serverProcess.kill("SIGKILL");
    await exited;
  }
}

async function dropDatabase() {
  if (!createdDatabaseName) return;
  run("dropdb", ["--if-exists", "--force", createdDatabaseName]);
}

function trackUpload(publicUrl) {
  if (!String(publicUrl).startsWith("/uploads/")) return;
  uploadedFiles.add(path.join(UPLOAD_DIR, path.basename(publicUrl)));
}

async function cleanupUploads() {
  await Promise.all(
    [...uploadedFiles].map((filePath) =>
      fs.rm(filePath, {
        force: true
      })
    )
  );
}

function tokenFromDevEmail(devEmail, queryParam) {
  assert.ok(devEmail?.link, `Expected a dev email link for ${queryParam}.`);
  return new URL(devEmail.link).searchParams.get(queryParam);
}

function encodePathPart(value) {
  return encodeURIComponent(value);
}

class ApiClient {
  constructor(options = {}) {
    this.cookies = new Map();
    this.defaultHeaders = options.headers ?? {};
  }

  cookieHeader() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  rememberCookies(headers) {
    const setCookies =
      typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : [headers.get("set-cookie")].filter(Boolean);

    for (const header of setCookies) {
      const [nameValue] = header.split(";");
      const index = nameValue.indexOf("=");
      if (index === -1) continue;

      const name = nameValue.slice(0, index);
      const value = nameValue.slice(index + 1);
      if (value) {
        this.cookies.set(name, value);
      } else {
        this.cookies.delete(name);
      }
    }
  }

  async request(urlPath, options = {}) {
    const headers = {
      ...this.defaultHeaders,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {})
    };
    const cookie = this.cookieHeader();
    if (cookie) headers.Cookie = cookie;

    const targetUrl = /^https?:\/\//i.test(urlPath) ? urlPath : `${baseUrl}${urlPath}`;
    const response = await fetch(targetUrl, {
      ...options,
      headers
    });
    this.rememberCookies(response.headers);

    const text = await response.text();
    const isJson = response.headers.get("content-type")?.includes("application/json");
    const payload = isJson && text ? JSON.parse(text) : null;

    return {
      response,
      payload,
      text
    };
  }

  json(method, urlPath, body = {}) {
    return this.request(urlPath, {
      method,
      body: JSON.stringify(body)
    });
  }
}

async function expectStatus(requestPromise, status) {
  const result = await requestPromise;
  assert.equal(result.response.status, status, result.payload?.error ?? result.text);
  return result.payload;
}

function apiClientWithIp(ip) {
  return new ApiClient({
    headers: {
      "X-Forwarded-For": ip
    }
  });
}

function latestStorageRequest(method) {
  const matches = storageRequests.filter((request) => request.method === method);
  return matches[matches.length - 1];
}

test.before(async () => {
  await prepareDatabase();
  await startFakeSupabaseStorage();
  await startServer();
});

test.after(async () => {
  await stopServer();
  await stopFakeSupabaseStorage();
  await cleanupUploads();
  await dropDatabase();
});

test("API supports auth, publishing, responses, uploads, and moderation", async () => {
  const guest = apiClientWithIp("203.0.113.10");
  const notFound = await guest.request("/api/definitely-not-a-route");
  assert.equal(notFound.response.status, 404);
  assert.equal(notFound.payload.error, "Route not found.");

  const initialFeed = await expectStatus(guest.request("/api/stories?limit=10"), 200);
  assert.ok(Array.isArray(initialFeed.stories));
  if (createdDatabaseName) {
    assert.equal(initialFeed.stories.length, 4);
  }

  const limitedAuth = apiClientWithIp("203.0.113.20");
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const failedLogin = await limitedAuth.json("POST", "/api/auth/login", {
      email: `missing-${attempt}-${runId}@example.com`,
      password: "wrong-password"
    });
    assert.equal(failedLogin.response.status, 401);
  }
  const authLimited = await limitedAuth.json("POST", "/api/auth/login", {
    email: `missing-limited-${runId}@example.com`,
    password: "wrong-password"
  });
  assert.equal(authLimited.response.status, 429);
  assert.equal(authLimited.payload.error, "Too many auth attempts. Please wait before trying again.");
  assert.equal(authLimited.response.headers.get("x-ratelimit-limit"), "10");
  assert.ok(authLimited.response.headers.get("retry-after"));

  const admin = apiClientWithIp("203.0.113.30");
  const registered = await expectStatus(
    admin.json("POST", "/api/auth/register", {
      name: "Admin Writer",
      email: adminEmail,
      password: adminOriginalPassword,
      bio: "Learning by building a Medium clone."
    }),
    201
  );
  assert.equal(registered.user.email, adminEmail);
  assert.equal(registered.user.isAdmin, true);
  assert.equal(registered.user.emailVerified, false);
  assert.equal(registered.devEmail.type, "verify-email");
  assert.ok(registered.devEmail.link.startsWith("https://inkline.example.test/?verify="));

  const session = await expectStatus(admin.request("/api/session"), 200);
  assert.equal(session.user.email, adminEmail);

  const verificationRequest = await expectStatus(admin.json("POST", "/api/auth/request-verification"), 200);
  const verificationToken = tokenFromDevEmail(verificationRequest.devEmail, "verify");
  const verified = await expectStatus(
    admin.json("POST", "/api/auth/verify-email", {
      token: verificationToken
    }),
    200
  );
  assert.equal(verified.user.emailVerified, true);

  await expectStatus(admin.json("POST", "/api/auth/logout"), 200);
  const signedOut = await expectStatus(admin.request("/api/session"), 200);
  assert.equal(signedOut.user, null);

  await expectStatus(
    admin.json("POST", "/api/auth/login", {
      email: adminEmail,
      password: adminOriginalPassword
    }),
    200
  );

  const resetRequest = await expectStatus(
    admin.json("POST", "/api/auth/request-reset", {
      email: adminEmail
    }),
    200
  );
  const resetToken = tokenFromDevEmail(resetRequest.devEmail, "reset");
  await expectStatus(
    admin.json("POST", "/api/auth/reset-password", {
      token: resetToken,
      password: adminNewPassword
    }),
    200
  );

  const oldPasswordLogin = await admin.json("POST", "/api/auth/login", {
    email: adminEmail,
    password: adminOriginalPassword
  });
  assert.equal(oldPasswordLogin.response.status, 401);

  await expectStatus(
    admin.json("POST", "/api/auth/login", {
      email: adminEmail,
      password: adminNewPassword
    }),
    200
  );

  const upload = await expectStatus(
    admin.json("POST", "/api/uploads", {
      fileName: "cover.png",
      dataUrl: ONE_PIXEL_PNG
    }),
    201
  );
  assert.ok(upload.url.startsWith(`${storageBaseUrl}/storage/v1/object/public/inkline-test/story-covers/`));
  assert.match(upload.url, /\.png$/);
  trackUpload(upload.url);
  assert.equal(storageRequests.length, 1);
  const firstUploadedObject = storageRequests[0].objectPath;
  assert.match(firstUploadedObject, /^story-covers\/.+\/.+\.png$/);
  assert.equal(storageRequests[0].contentType, "image/png");
  assert.ok(storageRequests[0].size > 0);
  assert.equal(storageObjects.has(firstUploadedObject), true);

  const uploadedImage = await admin.request(upload.url);
  assert.equal(uploadedImage.response.status, 200);
  assert.equal(uploadedImage.response.headers.get("content-type"), "image/png");

  const replacementUpload = await expectStatus(
    admin.json("POST", "/api/uploads", {
      fileName: "replacement-cover.png",
      dataUrl: ONE_PIXEL_PNG
    }),
    201
  );
  assert.ok(replacementUpload.url.startsWith(`${storageBaseUrl}/storage/v1/object/public/inkline-test/story-covers/`));
  const replacementUploadedObject = latestStorageRequest("POST").objectPath;
  assert.notEqual(replacementUploadedObject, firstUploadedObject);
  assert.equal(storageObjects.has(replacementUploadedObject), true);

  const uploadLimited = await admin.json("POST", "/api/uploads", {
    fileName: "third-cover.png",
    dataUrl: ONE_PIXEL_PNG
  });
  assert.equal(uploadLimited.response.status, 429);
  assert.equal(uploadLimited.payload.error, "Too many uploads. Please wait before uploading another image.");
  assert.equal(uploadLimited.response.headers.get("x-ratelimit-limit"), "2");
  assert.ok(uploadLimited.response.headers.get("retry-after"));
  assert.equal(storageRequests.filter((request) => request.method === "POST").length, 2);

  const draft = await expectStatus(
    admin.json("POST", "/api/stories", {
      title: "",
      excerpt: "",
      topic: "Testing",
      image: upload.url,
      bodyHtml: "",
      status: "draft"
    }),
    201
  );
  assert.equal(draft.story.status, "draft");

  const drafts = await expectStatus(admin.request("/api/me/drafts"), 200);
  assert.ok(drafts.drafts.some((candidate) => candidate.id === draft.story.id));

  await expectStatus(admin.request(`/api/stories/${encodePathPart(draft.story.id)}`, { method: "DELETE" }), 200);

  const created = await expectStatus(
    admin.json("POST", "/api/stories", {
      title: "Prisma API test story",
      excerpt: "A durable smoke test for the learning project.",
      topic: "Testing",
      image: upload.url,
      bodyHtml: "<p>This story is created by the API test suite.</p><script>alert('nope')</script>",
      status: "published"
    }),
    201
  );
  const storyId = created.story.id;
  assert.equal(created.story.canEdit, true);
  assert.doesNotMatch(created.story.bodyHtml, /script/i);

  const edited = await expectStatus(
    admin.json("PUT", `/api/stories/${encodePathPart(storyId)}`, {
      title: "Prisma API test story edited",
      excerpt: "An edited smoke test for the learning project.",
      topic: "Testing",
      image: replacementUpload.url,
      bodyHtml: "<p>This edited story checks update behavior.</p>",
      status: "published"
    }),
    200
  );
  assert.equal(edited.story.slug, "prisma-api-test-story-edited");
  assert.equal(latestStorageRequest("DELETE").objectPath, firstUploadedObject);
  assert.equal(storageObjects.has(firstUploadedObject), false);
  assert.equal(storageObjects.has(replacementUploadedObject), true);

  const updatedProfile = await expectStatus(
    admin.json("PUT", "/api/me", {
      name: "Ada Prisma",
      email: `api-admin-updated-${runId}@example.com`,
      bio: "Teaches persistence by shipping tiny features."
    }),
    200
  );
  assert.equal(updatedProfile.user.name, "Ada Prisma");
  assert.equal(updatedProfile.user.emailVerified, false);
  assert.equal(updatedProfile.devEmail.type, "verify-email");

  const detailAfterProfile = await expectStatus(admin.request(`/api/stories/${encodePathPart(storyId)}`), 200);
  assert.equal(detailAfterProfile.story.authorName, "Ada Prisma");
  assert.equal(detailAfterProfile.story.authorBio, "Teaches persistence by shipping tiny features.");

  const search = await expectStatus(guest.request("/api/stories?search=edited&limit=5"), 200);
  assert.ok(search.stories.some((story) => story.id === storyId));

  const emptySearch = await expectStatus(guest.request("/api/stories?search=not-a-real-inkline-term&limit=5"), 200);
  assert.equal(emptySearch.stories.length, 0);

  const reader = apiClientWithIp("203.0.113.40");
  const readerEmail = `api-reader-${runId}@example.com`;
  const readerRegistered = await expectStatus(
    reader.json("POST", "/api/auth/register", {
      name: "Reader One",
      email: readerEmail,
      password: "reader-password-1",
      bio: "Leaves useful responses."
    }),
    201
  );
  assert.equal(readerRegistered.user.isAdmin, false);

  const bookmarked = await expectStatus(
    reader.json("POST", `/api/stories/${encodePathPart(storyId)}/bookmark`),
    200
  );
  assert.equal(bookmarked.story.bookmarked, true);

  const clapped = await expectStatus(reader.json("POST", `/api/stories/${encodePathPart(storyId)}/clap`), 200);
  assert.equal(clapped.story.claps, 1);

  const responded = await expectStatus(
    reader.json("POST", `/api/stories/${encodePathPart(storyId)}/responses`, {
      text: "This helped me understand the API flow."
    }),
    201
  );
  const responseId = responded.story.responses.at(-1).id;
  assert.ok(responseId);
  assert.equal(responded.story.responseCount, 1);

  const responseLimited = await reader.json("POST", `/api/stories/${encodePathPart(storyId)}/responses`, {
    text: "This second response should be rate limited."
  });
  assert.equal(responseLimited.response.status, 429);
  assert.equal(responseLimited.payload.error, "Too many responses. Please wait before commenting again.");
  assert.equal(responseLimited.response.headers.get("x-ratelimit-limit"), "1");
  assert.ok(responseLimited.response.headers.get("retry-after"));

  const hidden = await expectStatus(
    admin.json("POST", `/api/stories/${encodePathPart(storyId)}/responses/${encodePathPart(responseId)}/moderate`, {
      status: "hidden"
    }),
    200
  );
  assert.equal(hidden.story.responses.find((response) => response.id === responseId).status, "hidden");

  const moderation = await expectStatus(admin.request("/api/admin/moderation"), 200);
  assert.ok(moderation.responses.some((response) => response.id === responseId && response.status === "hidden"));
  assert.ok(moderation.stories.some((story) => story.id === storyId && story.hiddenResponses === 1));

  const visible = await expectStatus(
    admin.json("POST", `/api/admin/responses/${encodePathPart(responseId)}/moderate`, {
      status: "visible"
    }),
    200
  );
  assert.equal(visible.response.status, "visible");

  await expectStatus(admin.request(`/api/admin/responses/${encodePathPart(responseId)}`, { method: "DELETE" }), 200);
  const detailAfterResponseDelete = await expectStatus(admin.request(`/api/stories/${encodePathPart(storyId)}`), 200);
  assert.equal(detailAfterResponseDelete.story.responses.length, 0);

  await expectStatus(admin.request(`/api/admin/stories/${encodePathPart(storyId)}`, { method: "DELETE" }), 200);
  assert.equal(latestStorageRequest("DELETE").objectPath, replacementUploadedObject);
  assert.equal(storageObjects.has(replacementUploadedObject), false);
  const deletedStory = await admin.request(`/api/stories/${encodePathPart(storyId)}`);
  assert.equal(deletedStory.response.status, 404);
});
