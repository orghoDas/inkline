const assert = require("node:assert/strict");
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs/promises");
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
const uploadedFiles = new Set();

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
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      EMAIL_PROVIDER: "dev",
      HOST: "127.0.0.1",
      PORT: String(port)
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
  constructor() {
    this.cookies = new Map();
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
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {})
    };
    const cookie = this.cookieHeader();
    if (cookie) headers.Cookie = cookie;

    const response = await fetch(`${baseUrl}${urlPath}`, {
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

test.before(async () => {
  await prepareDatabase();
  await startServer();
});

test.after(async () => {
  await stopServer();
  await cleanupUploads();
  await dropDatabase();
});

test("API supports auth, publishing, responses, uploads, and moderation", async () => {
  const guest = new ApiClient();
  const notFound = await guest.request("/api/definitely-not-a-route");
  assert.equal(notFound.response.status, 404);
  assert.equal(notFound.payload.error, "Route not found.");

  const initialFeed = await expectStatus(guest.request("/api/stories?limit=10"), 200);
  assert.ok(Array.isArray(initialFeed.stories));
  if (createdDatabaseName) {
    assert.equal(initialFeed.stories.length, 4);
  }

  const admin = new ApiClient();
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
  assert.match(upload.url, /^\/uploads\/.+\.png$/);
  trackUpload(upload.url);

  const uploadedImage = await admin.request(upload.url);
  assert.equal(uploadedImage.response.status, 200);
  assert.equal(uploadedImage.response.headers.get("content-type"), "image/png");

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
      image: upload.url,
      bodyHtml: "<p>This edited story checks update behavior.</p>",
      status: "published"
    }),
    200
  );
  assert.equal(edited.story.slug, "prisma-api-test-story-edited");

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

  const reader = new ApiClient();
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
  const deletedStory = await admin.request(`/api/stories/${encodePathPart(storyId)}`);
  assert.equal(deletedStory.response.status, 404);
});
