require("dotenv/config");

const crypto = require("crypto");
const fs = require("fs/promises");
const http = require("http");
const path = require("path");
const { Prisma, PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 4173);
const ROOT = __dirname;
const UPLOAD_DIR = path.join(ROOT, "uploads");
const SESSION_COOKIE = "inkline_session";
const JSON_LIMIT = 8 * 1024 * 1024;
const UPLOAD_LIMIT = 5 * 1024 * 1024;
const APP_URL = String(process.env.APP_URL ?? "").trim().replace(/\/+$/, "");
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER ?? (process.env.RESEND_API_KEY ? "resend" : "dev");
const EMAIL_FROM = process.env.EMAIL_FROM ?? "Inkline <onboarding@resend.dev>";
const STORAGE_PROVIDER = String(process.env.STORAGE_PROVIDER ?? "local").trim().toLowerCase();
const SUPABASE_URL = String(process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const SUPABASE_STORAGE_BUCKET = String(process.env.SUPABASE_STORAGE_BUCKET ?? "inkline-uploads").trim();
const SUPABASE_STORAGE_PATH_PREFIX = String(process.env.SUPABASE_STORAGE_PATH_PREFIX ?? "story-covers").trim();
const SUPABASE_PUBLIC_URL = String(process.env.SUPABASE_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
const ADMIN_EMAILS = new Set(
  String(process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

function positiveIntegerEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

const RATE_LIMITS = {
  auth: {
    name: "auth",
    max: positiveIntegerEnv("AUTH_RATE_LIMIT_MAX", 30),
    windowMs: positiveIntegerEnv("AUTH_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
    message: "Too many auth attempts. Please wait before trying again."
  },
  upload: {
    name: "upload",
    max: positiveIntegerEnv("UPLOAD_RATE_LIMIT_MAX", 20),
    windowMs: positiveIntegerEnv("UPLOAD_RATE_LIMIT_WINDOW_MS", 60 * 60 * 1000),
    message: "Too many uploads. Please wait before uploading another image."
  },
  response: {
    name: "response",
    max: positiveIntegerEnv("RESPONSE_RATE_LIMIT_MAX", 12),
    windowMs: positiveIntegerEnv("RESPONSE_RATE_LIMIT_WINDOW_MS", 5 * 60 * 1000),
    message: "Too many responses. Please wait before commenting again."
  }
};

const RATE_LIMITED_AUTH_PATHS = new Set([
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/request-verification",
  "/api/auth/verify-email",
  "/api/auth/request-reset",
  "/api/auth/reset-password"
]);

if (!["local", "supabase"].includes(STORAGE_PROVIDER)) {
  throw new Error("STORAGE_PROVIDER must be either local or supabase.");
}

const seedStories = [
  {
    id: "starter-design-systems",
    title: "The quiet work behind a design system that actually ships",
    excerpt: "A practical look at tokens, habits, and the small agreements that keep interfaces consistent.",
    authorId: null,
    authorName: "Maya Chen",
    authorBio: "Product designer writing about systems, habits, and the craft behind durable interfaces.",
    topic: "Design",
    image: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80",
    bodyHtml:
      "<p>A design system is not just a sticker sheet or a component library. It is a shared memory for product decisions. The visible parts matter, but the invisible rituals matter more.</p><p>Teams usually discover this when the buttons are perfect and the experience still feels scattered. The missing piece is often agreement. Which choices should be flexible, and which should be boring on purpose?</p><p>Start with the workflows people repeat every day. Name the decisions, remove the tedious ones, and write down the exceptions. That is how a system earns trust without becoming a museum.</p>",
    minutes: 7,
    createdAt: "2026-05-03T04:00:00.000Z",
    updatedAt: "2026-05-03T04:00:00.000Z"
  },
  {
    id: "starter-debugging",
    title: "Debugging is easier when you write down what you know",
    excerpt: "The fastest engineers are often the ones who slow down for two minutes before changing code.",
    authorId: null,
    authorName: "Noah Patel",
    authorBio: "Software engineer interested in clear code, debugging rituals, and learning in public.",
    topic: "Code",
    image: "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=900&q=80",
    bodyHtml:
      "<p>Good debugging starts before the first fix. Write the symptom, the expected behavior, and the smallest reproduction you can describe. The act of naming the problem removes a surprising amount of fog.</p><p>Then change one thing at a time. This sounds slow, but it protects the signal. When the behavior changes, you know which move mattered.</p><blockquote>A bug is not an insult from the codebase. It is a sentence with one missing clause.</blockquote><p>Your job is to find the clause.</p>",
    minutes: 5,
    createdAt: "2026-05-02T04:00:00.000Z",
    updatedAt: "2026-05-02T04:00:00.000Z"
  },
  {
    id: "starter-attention",
    title: "What long walks taught me about attention",
    excerpt: "A small essay about making room for better thoughts in a noisy week.",
    authorId: null,
    authorName: "Elena Torres",
    authorBio: "Essayist exploring attention, routine, and the quieter parts of a creative life.",
    topic: "Life",
    image: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
    bodyHtml:
      "<p>The first ten minutes of a walk are usually just static. Errands, old conversations, half-finished messages. Then the mind starts to loosen its grip.</p><p>Attention is not only something you spend. It is something you recover. A quiet route, a regular pace, and no urgent input can make the day feel less crowded.</p><p>I come back with fewer grand answers than I expect, but more usable ones. That is enough.</p>",
    minutes: 4,
    createdAt: "2026-04-30T04:00:00.000Z",
    updatedAt: "2026-04-30T04:00:00.000Z"
  },
  {
    id: "starter-writing",
    title: "A first draft is a place to collect courage",
    excerpt: "Notes on writing before you feel ready, especially when the blank page is louder than usual.",
    authorId: null,
    authorName: "Samira Hale",
    authorBio: "Editor and writing coach focused on early drafts, revision, and creative confidence.",
    topic: "Writing",
    image: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=80",
    bodyHtml:
      "<p>The first draft does not need to be persuasive. It needs to exist. Once the idea is visible, you can argue with it, sharpen it, or forgive it.</p><h2>Let the draft be early</h2><p>Most stuck writing is secretly a quality problem arriving too early. Drafting and editing use different muscles. Let the first one be messy enough to finish.</p><p>A page with a rough paragraph has already done something kind for the next version.</p>",
    minutes: 6,
    createdAt: "2026-04-27T04:00:00.000Z",
    updatedAt: "2026-04-27T04:00:00.000Z"
  }
];

let prisma;
const rateLimitBuckets = new Map();

function getDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Add a Postgres connection string to .env before starting Inkline.");
  }

  return process.env.DATABASE_URL;
}

function getPrisma() {
  if (!prisma) {
    const adapter = new PrismaPg({
      connectionString: getDatabaseUrl()
    });
    prisma = new PrismaClient({ adapter });
  }

  return prisma;
}

function toIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function toDate(value, fallback = new Date()) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function serializeUser(user) {
  return {
    ...user,
    role: ADMIN_EMAILS.has(String(user.email ?? "").toLowerCase()) ? "admin" : user.role ?? "user",
    emailVerified: Boolean(user.emailVerified),
    createdAt: toIso(user.createdAt),
    emailVerificationExpiresAt: toIso(user.emailVerificationExpiresAt),
    resetTokenExpiresAt: toIso(user.resetTokenExpiresAt)
  };
}

function serializeStory(story) {
  return {
    ...story,
    status: story.status ?? "published",
    slug: story.slug || slugify(story.title),
    createdAt: toIso(story.createdAt),
    updatedAt: toIso(story.updatedAt),
    searchText: story.searchText || buildSearchText(story)
  };
}

function serializeResponse(response) {
  return {
    ...response,
    status: response.status ?? "visible",
    createdAt: toIso(response.createdAt),
    moderatedAt: toIso(response.moderatedAt)
  };
}

function serializeCreatedAt(record) {
  return {
    ...record,
    createdAt: toIso(record.createdAt)
  };
}

function serializeSystemEvent(event) {
  return {
    id: event.id,
    type: event.type,
    severity: event.severity,
    message: event.message,
    context: event.context ?? null,
    dateLabel: dateLabel(event.createdAt),
    createdAt: toIso(event.createdAt)
  };
}

async function seedStarterStories(client = getPrisma()) {
  const storyCount = await client.story.count();
  if (storyCount > 0) return false;

  await client.story.createMany({
    data: seedStories.map((story) => ({
      ...story,
      status: "published",
      slug: slugify(story.title),
      searchText: buildSearchText(story),
      createdAt: toDate(story.createdAt),
      updatedAt: toDate(story.updatedAt)
    }))
  });

  return true;
}

async function ensureDb() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await seedStarterStories();
}

async function writeDb(db) {
  const client = getPrisma();
  const users = db.users ?? [];
  const stories = (db.stories ?? []).map((story) => ({
    status: "published",
    slug: slugify(story.title),
    searchText: buildSearchText(story),
    ...story
  }));
  const userIds = new Set(users.map((user) => user.id));
  const storyIds = new Set(stories.map((story) => story.id));
  const now = new Date();

  await client.$transaction(async (tx) => {
    await tx.bookmark.deleteMany({});
    await tx.clap.deleteMany({});
    await tx.response.deleteMany({});
    await tx.upload.deleteMany({});
    await tx.session.deleteMany({});
    await tx.story.deleteMany({});
    await tx.user.deleteMany({});
    await tx.devEmail.deleteMany({});
    await tx.systemEvent.deleteMany({});

    if (users.length > 0) {
      await tx.user.createMany({
        data: users.map((user, index) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          bio: user.bio,
          emailVerified: Boolean(user.emailVerified),
          role: ADMIN_EMAILS.has(String(user.email ?? "").toLowerCase()) ? "admin" : user.role ?? (index === 0 ? "admin" : "user"),
          salt: user.salt,
          passwordHash: user.passwordHash,
          createdAt: toDate(user.createdAt, now),
          emailVerificationHash: user.emailVerificationHash ?? null,
          emailVerificationExpiresAt: user.emailVerificationExpiresAt ? toDate(user.emailVerificationExpiresAt, now) : null,
          resetTokenHash: user.resetTokenHash ?? null,
          resetTokenExpiresAt: user.resetTokenExpiresAt ? toDate(user.resetTokenExpiresAt, now) : null
        }))
      });
    }

    if (stories.length > 0) {
      await tx.story.createMany({
        data: stories.map((story) => ({
          id: story.id,
          status: story.status ?? "published",
          slug: story.slug || slugify(story.title),
          title: story.title,
          excerpt: story.excerpt,
          authorId: story.authorId && userIds.has(story.authorId) ? story.authorId : null,
          authorName: story.authorName,
          authorBio: story.authorBio,
          topic: story.topic,
          image: story.image,
          bodyHtml: story.bodyHtml,
          minutes: story.minutes,
          searchText: story.searchText || buildSearchText(story),
          createdAt: toDate(story.createdAt, now),
          updatedAt: toDate(story.updatedAt, now)
        }))
      });
    }

    const sessions = (db.sessions ?? []).filter((session) => userIds.has(session.userId));
    if (sessions.length > 0) {
      await tx.session.createMany({
        data: sessions.map((session) => ({
          id: session.id,
          userId: session.userId,
          createdAt: toDate(session.createdAt, now)
        }))
      });
    }

    const bookmarks = (db.bookmarks ?? []).filter((bookmark) => userIds.has(bookmark.userId) && storyIds.has(bookmark.storyId));
    if (bookmarks.length > 0) {
      await tx.bookmark.createMany({
        data: bookmarks.map((bookmark) => ({
          userId: bookmark.userId,
          storyId: bookmark.storyId,
          createdAt: toDate(bookmark.createdAt, now)
        })),
        skipDuplicates: true
      });
    }

    const claps = Object.entries(db.claps ?? {})
      .filter(([storyId, count]) => storyIds.has(storyId) && Number(count) > 0)
      .map(([storyId, count]) => ({ storyId, count: Number(count) }));
    if (claps.length > 0) {
      await tx.clap.createMany({ data: claps });
    }

    const responses = (db.responses ?? []).filter((response) => storyIds.has(response.storyId));
    if (responses.length > 0) {
      await tx.response.createMany({
        data: responses.map((response) => ({
          id: response.id,
          storyId: response.storyId,
          userId: response.userId && userIds.has(response.userId) ? response.userId : null,
          name: response.name,
          text: response.text,
          status: response.status ?? "visible",
          createdAt: toDate(response.createdAt, now),
          moderatedAt: response.moderatedAt ? toDate(response.moderatedAt, now) : null,
          moderatedBy: response.moderatedBy && userIds.has(response.moderatedBy) ? response.moderatedBy : null
        }))
      });
    }

    const uploads = db.uploads ?? [];
    if (uploads.length > 0) {
      await tx.upload.createMany({
        data: uploads.map((upload) => ({
          id: upload.id,
          url: upload.url,
          fileName: upload.fileName,
          originalName: upload.originalName ?? null,
          mimeType: upload.mimeType,
          size: upload.size,
          userId: upload.userId && userIds.has(upload.userId) ? upload.userId : null,
          createdAt: toDate(upload.createdAt, now)
        }))
      });
    }

    const devEmails = (db.devEmails ?? []).slice(0, 20);
    if (devEmails.length > 0) {
      await tx.devEmail.createMany({
        data: devEmails.map((email) => ({
          id: email.id,
          createdAt: toDate(email.createdAt, now),
          type: email.type,
          to: email.to,
          subject: email.subject,
          link: email.link,
          delivery: email.delivery
        }))
      });
    }
  });
}

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...(res.rateLimitHeaders ?? {}),
    ...headers
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message, headers = {}) {
  sendJson(res, status, { error: message }, headers);
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > JSON_LIMIT) {
      throw new HttpError(413, "Request body is too large.");
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}

const imageExtensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif"
};

function parseDataUrl(dataUrl) {
  const match = String(dataUrl ?? "").match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new HttpError(400, "Upload a JPEG, PNG, WebP, or GIF image.");
  }

  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0 || buffer.length > UPLOAD_LIMIT) {
    throw new HttpError(413, "Image must be smaller than 5 MB.");
  }

  return {
    mimeType,
    buffer,
    ext: imageExtensions[mimeType]
  };
}

function encodeStoragePath(value) {
  return String(value)
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

function normalizeStoragePrefix(value) {
  return String(value ?? "")
    .split("/")
    .map((part) => slugify(part))
    .filter(Boolean)
    .join("/");
}

function supabaseStorageConfig() {
  const missing = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_STORAGE_BUCKET) missing.push("SUPABASE_STORAGE_BUCKET");

  if (missing.length > 0) {
    throw new HttpError(500, `Supabase Storage is missing ${missing.join(", ")}.`);
  }

  return {
    url: SUPABASE_URL,
    key: SUPABASE_SERVICE_ROLE_KEY,
    bucket: SUPABASE_STORAGE_BUCKET,
    prefix: normalizeStoragePrefix(SUPABASE_STORAGE_PATH_PREFIX) || "story-covers",
    publicUrl: SUPABASE_PUBLIC_URL
  };
}

async function saveLocalImageUpload(parsed, fileName) {
  const filePath = path.join(UPLOAD_DIR, fileName);
  const publicPath = `/uploads/${fileName}`;

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(filePath, parsed.buffer);

  return {
    url: publicPath,
    fileName
  };
}

async function saveSupabaseImageUpload(parsed, user, fileName) {
  const config = supabaseStorageConfig();
  const objectPath = `${config.prefix}/${user.id}/${fileName}`;
  const encodedBucket = encodeURIComponent(config.bucket);
  const encodedPath = encodeStoragePath(objectPath);
  const uploadUrl = `${config.url}/storage/v1/object/${encodedBucket}/${encodedPath}`;
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.key}`,
      apikey: config.key,
      "Cache-Control": "31536000",
      "Content-Type": parsed.mimeType,
      "x-upsert": "false"
    },
    body: parsed.buffer
  });

  if (!response.ok) {
    const text = await response.text();
    throw new HttpError(502, `Could not save image to Supabase Storage. ${text.slice(0, 160)}`.trim());
  }

  const publicBaseUrl = config.publicUrl || `${config.url}/storage/v1/object/public/${encodedBucket}`;
  return {
    url: `${publicBaseUrl}/${encodedPath}`,
    fileName: objectPath
  };
}

async function deleteLocalImageUpload(upload) {
  if (!upload.url.startsWith("/uploads/")) return;
  const filePath = path.join(UPLOAD_DIR, path.basename(upload.url));
  await fs.rm(filePath, { force: true });
}

async function deleteSupabaseImageUpload(upload) {
  const config = supabaseStorageConfig();
  const encodedBucket = encodeURIComponent(config.bucket);
  const encodedPath = encodeStoragePath(upload.fileName);
  const deleteUrl = `${config.url}/storage/v1/object/${encodedBucket}/${encodedPath}`;
  const response = await fetch(deleteUrl, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${config.key}`,
      apikey: config.key
    }
  });

  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`Supabase Storage returned ${response.status}: ${text.slice(0, 160)}`);
  }
}

async function deleteStoredImageIfOwned(url) {
  const upload = await getPrisma().upload.findUnique({
    where: { url }
  });

  if (!upload) return;

  try {
    if (STORAGE_PROVIDER === "supabase") {
      await deleteSupabaseImageUpload(upload);
    } else {
      await deleteLocalImageUpload(upload);
    }

    await getPrisma().upload.delete({
      where: { id: upload.id }
    });
  } catch (error) {
    await recordSystemEvent({
      type: "storage_cleanup_failed",
      severity: "warning",
      message: `Could not clean up stored image ${upload.fileName}.`,
      context: {
        provider: STORAGE_PROVIDER,
        uploadId: upload.id,
        fileName: upload.fileName,
        url: upload.url,
        error: safeErrorMessage(error)
      }
    });
    console.warn(`Could not clean up stored image ${upload.fileName}:`, error);
  }
}

async function saveImageUploadPrisma(body, user) {
  const parsed = parseDataUrl(body.dataUrl);
  const id = crypto.randomUUID();
  const fileName = `${id}.${parsed.ext}`;
  const savedImage =
    STORAGE_PROVIDER === "supabase"
      ? await saveSupabaseImageUpload(parsed, user, fileName)
      : await saveLocalImageUpload(parsed, fileName);

  await getPrisma().upload.create({
    data: {
      id,
      url: savedImage.url,
      fileName: savedImage.fileName,
      originalName: normalizeText(body.fileName, 160),
      mimeType: parsed.mimeType,
      size: parsed.buffer.length,
      userId: user.id,
      createdAt: new Date()
    }
  });

  return savedImage.url;
}

class HttpError extends Error {
  constructor(status, message, headers = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

function getClientIp(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] ?? "")
    .split(",")[0]
    .trim();

  return forwardedFor || req.socket?.remoteAddress || "unknown";
}

function pruneRateLimitBuckets(now) {
  if (rateLimitBuckets.size < 5000) return;

  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}

function applyRateLimit(req, res, limiter, subject = null) {
  const now = Date.now();
  pruneRateLimitBuckets(now);

  const identity = subject ? `user:${subject}` : `ip:${getClientIp(req)}`;
  const key = `${limiter.name}:${identity}`;
  let bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = {
      count: 0,
      resetAt: now + limiter.windowMs
    };
  }

  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  const remaining = Math.max(0, limiter.max - bucket.count);
  const headers = {
    "X-RateLimit-Limit": String(limiter.max),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1000))
  };
  res.rateLimitHeaders = headers;

  if (bucket.count > limiter.max) {
    throw new HttpError(429, limiter.message, {
      ...headers,
      "Retry-After": String(retryAfter)
    });
  }
}

function shouldRateLimitAuth(req, url) {
  return req.method === "POST" && RATE_LIMITED_AUTH_PATHS.has(url.pathname);
}

function normalizeText(value, maxLength) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function safeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error ?? "Unknown error.");
}

function diagnosticContext(context = {}) {
  try {
    return JSON.parse(
      JSON.stringify(context, (key, value) => {
        if (value instanceof Error) return safeErrorMessage(value);
        if (typeof value === "string") return value.slice(0, 1000);
        return value;
      })
    );
  } catch {
    return { note: "Diagnostic context could not be serialized." };
  }
}

async function recordSystemEvent({ type, severity = "warning", message, context = {} }) {
  try {
    const client = getPrisma();
    await client.systemEvent.create({
      data: {
        id: crypto.randomUUID(),
        type: normalizeText(type, 80),
        severity: normalizeText(severity, 20),
        message: normalizeText(message, 240),
        context: diagnosticContext(context),
        createdAt: new Date()
      }
    });

    const extraEvents = await client.systemEvent.findMany({
      orderBy: { createdAt: "desc" },
      skip: 100,
      select: { id: true }
    });
    if (extraEvents.length > 0) {
      await client.systemEvent.deleteMany({
        where: { id: { in: extraEvents.map((event) => event.id) } }
      });
    }
  } catch (error) {
    console.warn("Could not record system diagnostic event:", error);
  }
}

function slugify(value) {
  const slug = normalizeText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "story";
}

function stripHtml(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchText(story) {
  return [
    story.title,
    story.excerpt,
    story.topic,
    story.authorName,
    story.authorBio,
    stripHtml(story.bodyHtml)
  ]
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const STORY_SEARCH_VECTOR_SQL = `
  setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("excerpt", '')), 'B') ||
  setweight(to_tsvector('english', coalesce("topic", '')), 'B') ||
  setweight(to_tsvector('english', coalesce("authorName", '')), 'C') ||
  setweight(to_tsvector('english', coalesce("authorBio", '')), 'D') ||
  setweight(to_tsvector('english', coalesce("searchText", '')), 'D')
`;

async function findPublishedStoryIdsBySearch(client, search, limit, offset) {
  const searchVector = Prisma.raw(STORY_SEARCH_VECTOR_SQL);
  const rows = await client.$queryRaw`
      SELECT "id"
      FROM "Story"
      WHERE "status" = 'published'
        AND (${searchVector}) @@ websearch_to_tsquery('english', ${search})
      ORDER BY
        ts_rank_cd((${searchVector}), websearch_to_tsquery('english', ${search})) DESC,
        "createdAt" DESC,
        "id" ASC
      LIMIT ${limit + 1}
      OFFSET ${offset}
    `;

  return rows.map((row) => row.id);
}

function estimateMinutes(html) {
  const words = stripHtml(html).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isSafeHref(href) {
  return /^(https?:|mailto:|#|\/)/i.test(href);
}

function sanitizeHtml(input) {
  const allowedTags = new Set(["p", "h2", "blockquote", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "br"]);
  const html = String(input ?? "").slice(0, 60000).replace(/<script[\s\S]*?<\/script>/gi, "");

  return html.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (match, tagName, attrs) => {
    const tag = tagName.toLowerCase();
    const closing = match.startsWith("</");

    if (!allowedTags.has(tag)) {
      return "";
    }

    if (closing) {
      return tag === "br" ? "" : `</${tag}>`;
    }

    if (tag === "br") {
      return "<br>";
    }

    if (tag === "a") {
      const hrefMatch = attrs.match(/\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = hrefMatch?.[2] ?? hrefMatch?.[3] ?? hrefMatch?.[4] ?? "";
      return isSafeHref(href) ? `<a href="${escapeAttribute(href)}" target="_blank" rel="noreferrer">` : "<a>";
    }

    return `<${tag}>`;
  });
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  const { hash } = hashPassword(password, user.salt);
  const stored = Buffer.from(user.passwordHash, "hex");
  const attempted = Buffer.from(hash, "hex");
  return stored.length === attempted.length && crypto.timingSafeEqual(stored, attempted);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createToken(hoursToLive = 1) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + hoursToLive * 60 * 60 * 1000).toISOString();
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt
  };
}

async function pushDevEmailPrisma(message) {
  const email = await getPrisma().devEmail.create({
    data: {
      id: crypto.randomUUID(),
      type: message.type,
      to: message.to,
      subject: message.subject,
      link: message.link,
      delivery: message.delivery,
      createdAt: new Date()
    }
  });

  const extraEmails = await getPrisma().devEmail.findMany({
    orderBy: { createdAt: "desc" },
    skip: 20,
    select: { id: true }
  });
  if (extraEmails.length > 0) {
    await getPrisma().devEmail.deleteMany({
      where: { id: { in: extraEmails.map((candidate) => candidate.id) } }
    });
  }

  return serializeCreatedAt(email);
}

async function sendEmailPrisma(req, message) {
  const email = {
    from: EMAIL_FROM,
    to: [message.to],
    subject: message.subject,
    text: `${message.subject}\n\n${message.link}`,
    html: `<p>${escapeAttribute(message.subject)}</p><p><a href="${escapeAttribute(message.link)}">${escapeAttribute(message.link)}</a></p>`
  };

  if (EMAIL_PROVIDER === "resend") {
    if (!process.env.RESEND_API_KEY) {
      await recordSystemEvent({
        type: "email_delivery_failed",
        severity: "error",
        message: `Could not send ${message.type} email because RESEND_API_KEY is missing.`,
        context: {
          provider: "resend",
          type: message.type,
          to: message.to
        }
      });
      return { delivered: false, provider: "resend", id: null, devEmail: null };
    }

    try {
      const response = await fetch(process.env.RESEND_API_URL ?? "https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(email)
      });

      if (response.ok) {
        const result = await response.json();
        return {
          delivered: true,
          provider: "resend",
          id: result.id ?? null,
          devEmail: null
        };
      }

      const text = await response.text();
      await recordSystemEvent({
        type: "email_delivery_failed",
        severity: "error",
        message: `Resend could not send ${message.type} email.`,
        context: {
          provider: "resend",
          type: message.type,
          to: message.to,
          status: response.status,
          response: text.slice(0, 500)
        }
      });
    } catch (error) {
      await recordSystemEvent({
        type: "email_delivery_failed",
        severity: "error",
        message: `Resend could not send ${message.type} email.`,
        context: {
          provider: "resend",
          type: message.type,
          to: message.to,
          error: safeErrorMessage(error)
        }
      });
    }

    return { delivered: false, provider: "resend", id: null, devEmail: null };
  }

  return {
    delivered: false,
    provider: "dev",
    devEmail: await pushDevEmailPrisma({
      ...message,
      delivery: EMAIL_PROVIDER === "dev" ? "dev-fallback" : "provider-fallback"
    })
  };
}

function firstHeaderValue(value) {
  const header = Array.isArray(value) ? value[0] : value;
  return String(header ?? "")
    .split(",")[0]
    .trim();
}

function appOrigin(req) {
  if (APP_URL) return APP_URL;

  const forwardedProto = firstHeaderValue(req.headers["x-forwarded-proto"]);
  const forwardedHost = firstHeaderValue(req.headers["x-forwarded-host"]);
  const protocol = forwardedProto === "https" ? "https" : "http";
  const host = forwardedHost || req.headers.host;
  return `${protocol}://${host}`;
}

function publicUser(user) {
  if (!user) return null;
  const role = user.role ?? "user";
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    bio: user.bio,
    emailVerified: Boolean(user.emailVerified),
    role,
    isAdmin: role === "admin"
  };
}

async function getUserFromRequestPrisma(req) {
  const sessionId = parseCookies(req)[SESSION_COOKIE];
  if (!sessionId) return null;

  const session = await getPrisma().session.findUnique({
    where: { id: sessionId },
    include: { user: true }
  });

  return session?.user ? serializeUser(session.user) : null;
}

async function requireUserPrisma(req) {
  const user = await getUserFromRequestPrisma(req);
  if (!user) {
    throw new HttpError(401, "Sign in first.");
  }

  return user;
}

function isAdmin(user) {
  return user?.role === "admin";
}

async function requireAdminPrisma(req) {
  const user = await requireUserPrisma(req);
  if (!isAdmin(user)) {
    throw new HttpError(403, "Admin access required.");
  }

  return user;
}

async function createSessionHeadersPrisma(user) {
  const session = await getPrisma().session.create({
    data: {
      id: crypto.randomUUID(),
      userId: user.id,
      createdAt: new Date()
    }
  });

  return {
    "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(session.id)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
  };
}

function clearSessionHeader() {
  return {
    "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
  };
}

function dateLabel(value) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function getAuthorKey(story) {
  return story.authorId ? `user-${story.authorId}` : `seed-${slugify(story.authorName)}`;
}

function publicResponse(response, user, story) {
  const isHidden = response.status === "hidden";
  const canModerate = Boolean(user && (story.authorId === user.id || isAdmin(user)));
  const canDelete = Boolean(user && (response.userId === user.id || story.authorId === user.id || isAdmin(user)));

  return {
    id: response.id,
    storyId: response.storyId,
    name: response.name,
    text: isHidden && !canModerate ? "This response was hidden by the author." : response.text,
    status: response.status,
    canDelete,
    canModerate,
    dateLabel: dateLabel(response.createdAt),
    createdAt: response.createdAt
  };
}

function storyPrismaInclude(user, options = {}) {
  return {
    clap: true,
    ...(user
      ? {
          bookmarks: {
            where: { userId: user.id },
            select: { userId: true, storyId: true, createdAt: true }
          }
        }
      : {}),
    ...(options.includeResponses
      ? {
          responses: {
            orderBy: { createdAt: "asc" }
          }
        }
      : {}),
    _count: {
      select: {
        responses: {
          where: { status: { not: "hidden" } }
        }
      }
    }
  };
}

function publicStoryFromPrisma(record, user, options = {}) {
  const story = serializeStory(record);
  const responses = (record.responses ?? []).map(serializeResponse);
  const canEdit = Boolean(user && story.authorId === user.id);
  const canAdminModerate = Boolean(user && isAdmin(user));
  const responseCount = record._count?.responses ?? responses.filter((response) => response.status !== "hidden").length;

  const base = {
    id: story.id,
    slug: story.slug,
    status: story.status ?? "published",
    title: story.title,
    excerpt: story.excerpt,
    authorKey: getAuthorKey(story),
    authorId: story.authorId,
    authorName: story.authorName,
    authorBio: story.authorBio,
    topic: story.topic,
    image: story.image,
    bodyHtml: story.bodyHtml,
    minutes: story.minutes,
    dateLabel: dateLabel(story.createdAt),
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
    claps: record.clap?.count ?? 0,
    responseCount,
    bookmarked: Boolean(user && record.bookmarks?.length),
    canEdit,
    canAdminModerate
  };

  if (options.includeResponses) {
    base.responses = responses
      .filter((response) => response.status !== "hidden" || canEdit || canAdminModerate)
      .map((response) => publicResponse(response, user, story));
  }

  return base;
}

function publicAdminResponseFromPrisma(response) {
  const serializedResponse = serializeResponse(response);
  return {
    id: serializedResponse.id,
    storyId: serializedResponse.storyId,
    storyTitle: response.story?.title ?? "Deleted story",
    storyStatus: response.story?.status ?? "deleted",
    storyAuthor: response.story?.authorName ?? "Unknown",
    name: serializedResponse.name,
    text: serializedResponse.text,
    status: serializedResponse.status,
    dateLabel: dateLabel(serializedResponse.createdAt),
    createdAt: serializedResponse.createdAt
  };
}

function publicAdminStoryFromPrisma(story, responseCounts) {
  const totalResponses = responseCounts.get(story.id)?.total ?? 0;
  const hiddenResponses = responseCounts.get(story.id)?.hidden ?? 0;
  return {
    ...publicStoryFromPrisma(story, null),
    totalResponses,
    hiddenResponses
  };
}

function validateStoryInput(body) {
  const status = body.status === "draft" ? "draft" : "published";
  const title = normalizeText(body.title, 80) || (status === "draft" ? "Untitled draft" : "");
  const excerpt = normalizeText(body.excerpt, 180) || (status === "draft" ? "Draft in progress." : "");
  const topic = normalizeText(body.topic, 30);
  const image = String(body.image ?? "").trim().slice(0, 4 * 1024 * 1024);
  const bodyHtml = sanitizeHtml(body.bodyHtml);
  const bodyText = stripHtml(bodyHtml);

  if (image.startsWith("data:")) throw new HttpError(400, "Upload images before saving the story.");
  if (status === "published" && title.length < 3) throw new HttpError(400, "Title is too short.");
  if (status === "published" && excerpt.length < 8) throw new HttpError(400, "Subtitle is too short.");
  if (topic.length < 2) throw new HttpError(400, "Choose a topic.");
  if (status === "published" && bodyText.length < 10) throw new HttpError(400, "Story body is too short.");

  return {
    status,
    title,
    excerpt,
    topic,
    image,
    bodyHtml,
    minutes: estimateMinutes(bodyHtml)
  };
}

async function handleStoryIndexPrisma(req, res, url) {
  await ensureDb();
  const user = await getUserFromRequestPrisma(req);
  const client = getPrisma();
  const limit = Math.min(12, Math.max(1, Number(url.searchParams.get("limit") ?? 3)));
  const cursor = url.searchParams.get("cursor");
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
  const search = normalizeText(url.searchParams.get("search"), 120);
  const include = storyPrismaInclude(user);
  let page;
  let hasMore;
  let nextCursor = null;
  let nextOffset = null;

  if (search) {
    const storyIds = await findPublishedStoryIdsBySearch(client, search, limit, offset);
    const pageIds = storyIds.slice(0, limit);
    const order = new Map(pageIds.map((id, index) => [id, index]));
    const stories = pageIds.length
      ? await client.story.findMany({
          where: { id: { in: pageIds } },
          include
        })
      : [];

    page = stories.sort((first, second) => order.get(first.id) - order.get(second.id));
    hasMore = storyIds.length > limit;
    nextOffset = hasMore ? offset + pageIds.length : null;
  } else {
    const where = { status: "published" };
    const cursorDate = toDate(cursor, null);
    if (cursorDate) {
      where.createdAt = { lt: cursorDate };
    }

    const stories = await client.story.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      include
    });

    page = stories.slice(0, limit);
    hasMore = stories.length > limit;
    nextCursor = hasMore ? toIso(page[page.length - 1]?.createdAt) : null;
  }

  return sendJson(res, 200, {
    stories: page.map((story) => publicStoryFromPrisma(story, user)),
    nextCursor,
    nextOffset,
    hasMore
  });
}

async function handleMyDraftsPrisma(req, res) {
  await ensureDb();
  const signedInUser = await requireUserPrisma(req);
  const drafts = await getPrisma().story.findMany({
    where: {
      authorId: signedInUser.id,
      status: "draft"
    },
    orderBy: { updatedAt: "desc" },
    include: storyPrismaInclude(signedInUser)
  });

  return sendJson(res, 200, {
    drafts: drafts.map((story) => publicStoryFromPrisma(story, signedInUser))
  });
}

async function handleStoryDetailPrisma(req, res, storyId) {
  await ensureDb();
  const user = await getUserFromRequestPrisma(req);
  const story = await getPrisma().story.findUnique({
    where: { id: storyId },
    include: storyPrismaInclude(user, { includeResponses: true })
  });

  if (!story) {
    throw new HttpError(404, "Story not found.");
  }

  if ((story.status ?? "published") === "draft" && (!user || story.authorId !== user.id)) {
    throw new HttpError(404, "Story not found.");
  }

  return sendJson(res, 200, {
    story: publicStoryFromPrisma(story, user, { includeResponses: true })
  });
}

async function findStoryForActionPrisma(storyId, user) {
  const story = await getPrisma().story.findUnique({
    where: { id: storyId }
  });

  if (!story) {
    throw new HttpError(404, "Story not found.");
  }

  if ((story.status ?? "published") === "draft" && (!user || story.authorId !== user.id)) {
    throw new HttpError(404, "Story not found.");
  }

  return serializeStory(story);
}

async function findPublicStoryForResponsePrisma(storyId, user) {
  const story = await getPrisma().story.findUnique({
    where: { id: storyId },
    include: storyPrismaInclude(user, { includeResponses: true })
  });

  if (!story) {
    throw new HttpError(404, "Story not found.");
  }

  return publicStoryFromPrisma(story, user, { includeResponses: true });
}

async function handleCreateStoryPrisma(req, res) {
  await ensureDb();
  const signedInUser = await requireUserPrisma(req);
  const body = await readJsonBody(req);
  const storyInput = validateStoryInput(body);
  const now = new Date();
  const story = {
    id: crypto.randomUUID(),
    slug: slugify(storyInput.title),
    authorId: signedInUser.id,
    authorName: signedInUser.name,
    authorBio: signedInUser.bio,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...storyInput
  };

  const createdStory = await getPrisma().story.create({
    data: {
      ...storyInput,
      id: story.id,
      slug: story.slug,
      authorId: signedInUser.id,
      authorName: signedInUser.name,
      authorBio: signedInUser.bio,
      searchText: buildSearchText(story),
      createdAt: now,
      updatedAt: now
    },
    include: storyPrismaInclude(signedInUser, { includeResponses: true })
  });

  return sendJson(res, 201, { story: publicStoryFromPrisma(createdStory, signedInUser, { includeResponses: true }) });
}

async function handleUpdateStoryPrisma(req, res, storyId) {
  await ensureDb();
  const signedInUser = await requireUserPrisma(req);
  const story = await findStoryForActionPrisma(storyId, signedInUser);

  if (story.authorId !== signedInUser.id) throw new HttpError(403, "You can edit only your own stories.");

  const body = await readJsonBody(req);
  const storyInput = validateStoryInput(body);
  const updatedAt = new Date();
  const nextStory = {
    ...story,
    ...storyInput,
    slug: slugify(storyInput.title),
    updatedAt: updatedAt.toISOString()
  };
  const updatedStory = await getPrisma().story.update({
    where: { id: story.id },
    data: {
      ...storyInput,
      slug: nextStory.slug,
      updatedAt,
      searchText: buildSearchText(nextStory)
    },
    include: storyPrismaInclude(signedInUser, { includeResponses: true })
  });
  if (story.image && story.image !== storyInput.image) {
    await deleteStoredImageIfOwned(story.image);
  }

  return sendJson(res, 200, { story: publicStoryFromPrisma(updatedStory, signedInUser, { includeResponses: true }) });
}

async function handleDeleteStoryPrisma(req, res, storyId) {
  await ensureDb();
  const signedInUser = await requireUserPrisma(req);
  const story = await findStoryForActionPrisma(storyId, signedInUser);

  if (story.authorId !== signedInUser.id) throw new HttpError(403, "You can delete only your own stories.");

  await getPrisma().story.delete({
    where: { id: story.id }
  });
  await deleteStoredImageIfOwned(story.image);

  return sendJson(res, 200, { ok: true });
}

async function handleClapStoryPrisma(req, res, storyId) {
  await ensureDb();
  const user = await getUserFromRequestPrisma(req);
  const story = await findStoryForActionPrisma(storyId, user);

  await getPrisma().clap.upsert({
    where: { storyId: story.id },
    create: { storyId: story.id, count: 1 },
    update: { count: { increment: 1 } }
  });

  return sendJson(res, 200, { story: await findPublicStoryForResponsePrisma(story.id, user) });
}

async function handleBookmarkStoryPrisma(req, res, storyId) {
  await ensureDb();
  const signedInUser = await requireUserPrisma(req);
  const story = await findStoryForActionPrisma(storyId, signedInUser);
  const bookmarkKey = {
    userId_storyId: {
      userId: signedInUser.id,
      storyId: story.id
    }
  };
  const existingBookmark = await getPrisma().bookmark.findUnique({
    where: bookmarkKey
  });

  if (existingBookmark) {
    await getPrisma().bookmark.delete({
      where: bookmarkKey
    });
  } else {
    await getPrisma().bookmark.create({
      data: {
        userId: signedInUser.id,
        storyId: story.id,
        createdAt: new Date()
      }
    });
  }

  return sendJson(res, 200, { story: await findPublicStoryForResponsePrisma(story.id, signedInUser) });
}

async function findResponseForActionPrisma(story, responseId) {
  const response = await getPrisma().response.findFirst({
    where: {
      id: responseId,
      storyId: story.id
    }
  });

  if (!response) {
    throw new HttpError(404, "Response not found.");
  }

  return serializeResponse(response);
}

async function handleCreateResponsePrisma(req, res, storyId) {
  await ensureDb();
  const signedInUser = await requireUserPrisma(req);
  applyRateLimit(req, res, RATE_LIMITS.response, signedInUser.id);
  const story = await findStoryForActionPrisma(storyId, signedInUser);
  const body = await readJsonBody(req);
  const text = normalizeText(body.text, 500);

  if (text.length < 2) throw new HttpError(400, "Response is too short.");

  await getPrisma().response.create({
    data: {
      id: crypto.randomUUID(),
      storyId: story.id,
      userId: signedInUser.id,
      name: signedInUser.name,
      text,
      status: "visible",
      createdAt: new Date()
    }
  });

  return sendJson(res, 201, { story: await findPublicStoryForResponsePrisma(story.id, signedInUser) });
}

async function handleDeleteResponsePrisma(req, res, storyId, responseId) {
  await ensureDb();
  const signedInUser = await requireUserPrisma(req);
  const story = await findStoryForActionPrisma(storyId, signedInUser);
  const response = await findResponseForActionPrisma(story, responseId);
  const isStoryAuthor = story.authorId === signedInUser.id;
  const isResponseAuthor = response.userId === signedInUser.id;
  const canAdminModerate = isAdmin(signedInUser);

  if (!isStoryAuthor && !isResponseAuthor && !canAdminModerate) {
    throw new HttpError(403, "You can delete only your own responses.");
  }

  await getPrisma().response.delete({
    where: { id: response.id }
  });

  return sendJson(res, 200, { story: await findPublicStoryForResponsePrisma(story.id, signedInUser) });
}

async function handleModerateResponsePrisma(req, res, storyId, responseId) {
  await ensureDb();
  const signedInUser = await requireUserPrisma(req);
  const story = await findStoryForActionPrisma(storyId, signedInUser);
  const response = await findResponseForActionPrisma(story, responseId);
  const isStoryAuthor = story.authorId === signedInUser.id;
  const canAdminModerate = isAdmin(signedInUser);

  if (!isStoryAuthor && !canAdminModerate) throw new HttpError(403, "Only the story author can moderate responses.");

  const body = await readJsonBody(req);
  await getPrisma().response.update({
    where: { id: response.id },
    data: {
      status: body.status === "hidden" ? "hidden" : "visible",
      moderatedAt: new Date(),
      moderatedBy: signedInUser.id
    }
  });

  return sendJson(res, 200, { story: await findPublicStoryForResponsePrisma(story.id, signedInUser) });
}

async function handleSessionPrisma(req, res) {
  await ensureDb();
  const user = await getUserFromRequestPrisma(req);
  return sendJson(res, 200, { user: publicUser(user) });
}

async function handleDevEmailsPrisma(req, res) {
  await ensureDb();
  const emails = await getPrisma().devEmail.findMany({
    orderBy: { createdAt: "desc" },
    take: 10
  });

  return sendJson(res, 200, { emails: emails.map(serializeCreatedAt) });
}

async function handleRegisterPrisma(req, res) {
  await ensureDb();
  const client = getPrisma();
  const body = await readJsonBody(req);
  const name = normalizeText(body.name, 50);
  const email = normalizeText(body.email, 120).toLowerCase();
  const password = String(body.password ?? "");
  const bio = normalizeText(body.bio, 180) || "Writing on Inkline.";

  if (name.length < 2) throw new HttpError(400, "Name is too short.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Use a valid email.");
  if (password.length < 8) throw new HttpError(400, "Password needs at least 8 characters.");
  if (await client.user.findUnique({ where: { email } })) throw new HttpError(409, "That email already has an account.");

  const { salt, hash } = hashPassword(password);
  const verification = createToken(24);
  const userCount = await client.user.count();
  const newUser = await client.user.create({
    data: {
      id: crypto.randomUUID(),
      name,
      email,
      bio,
      emailVerified: false,
      role: userCount === 0 || ADMIN_EMAILS.has(email) ? "admin" : "user",
      salt,
      passwordHash: hash,
      createdAt: new Date(),
      emailVerificationHash: verification.tokenHash,
      emailVerificationExpiresAt: toDate(verification.expiresAt)
    }
  });
  const emailDelivery = await sendEmailPrisma(req, {
    type: "verify-email",
    to: email,
    subject: "Verify your Inkline email",
    link: `${appOrigin(req)}/?verify=${verification.token}`
  });
  const headers = await createSessionHeadersPrisma(newUser);

  return sendJson(res, 201, { user: publicUser(serializeUser(newUser)), emailDelivery, devEmail: emailDelivery.devEmail }, headers);
}

async function handleLoginPrisma(req, res) {
  await ensureDb();
  const body = await readJsonBody(req);
  const email = normalizeText(body.email, 120).toLowerCase();
  const password = String(body.password ?? "");
  const foundUser = await getPrisma().user.findUnique({ where: { email } });

  if (!foundUser || !verifyPassword(password, foundUser)) {
    throw new HttpError(401, "Email or password is incorrect.");
  }

  const headers = await createSessionHeadersPrisma(foundUser);
  return sendJson(res, 200, { user: publicUser(serializeUser(foundUser)) }, headers);
}

async function handleRequestVerificationPrisma(req, res) {
  await ensureDb();
  const signedInUser = await requireUserPrisma(req);

  if (signedInUser.emailVerified) {
    return sendJson(res, 200, { ok: true, message: "Email is already verified." });
  }

  const verification = createToken(24);
  const updatedUser = await getPrisma().user.update({
    where: { id: signedInUser.id },
    data: {
      emailVerificationHash: verification.tokenHash,
      emailVerificationExpiresAt: toDate(verification.expiresAt)
    }
  });
  const emailDelivery = await sendEmailPrisma(req, {
    type: "verify-email",
    to: updatedUser.email,
    subject: "Verify your Inkline email",
    link: `${appOrigin(req)}/?verify=${verification.token}`
  });

  return sendJson(res, 200, { ok: true, emailDelivery, devEmail: emailDelivery.devEmail });
}

async function handleVerifyEmailPrisma(req, res) {
  await ensureDb();
  const body = await readJsonBody(req);
  const tokenHash = hashToken(String(body.token ?? ""));
  const foundUser = await getPrisma().user.findFirst({
    where: {
      emailVerificationHash: tokenHash,
      emailVerificationExpiresAt: { gt: new Date() }
    }
  });

  if (!foundUser) throw new HttpError(400, "Verification link is invalid or expired.");

  const verifiedUser = await getPrisma().user.update({
    where: { id: foundUser.id },
    data: {
      emailVerified: true,
      emailVerificationHash: null,
      emailVerificationExpiresAt: null
    }
  });
  const headers = await createSessionHeadersPrisma(verifiedUser);

  return sendJson(res, 200, { user: publicUser(serializeUser(verifiedUser)) }, headers);
}

async function handleRequestResetPrisma(req, res) {
  await ensureDb();
  const body = await readJsonBody(req);
  const email = normalizeText(body.email, 120).toLowerCase();
  const foundUser = await getPrisma().user.findUnique({ where: { email } });
  let emailDelivery = null;

  if (foundUser) {
    const reset = createToken(1);
    await getPrisma().user.update({
      where: { id: foundUser.id },
      data: {
        resetTokenHash: reset.tokenHash,
        resetTokenExpiresAt: toDate(reset.expiresAt)
      }
    });
    emailDelivery = await sendEmailPrisma(req, {
      type: "password-reset",
      to: email,
      subject: "Reset your Inkline password",
      link: `${appOrigin(req)}/?reset=${reset.token}`
    });
  }

  return sendJson(res, 200, {
    ok: true,
    message: "If that account exists, a reset link has been sent.",
    emailDelivery,
    devEmail: emailDelivery?.devEmail ?? null
  });
}

async function handleResetPasswordPrisma(req, res) {
  await ensureDb();
  const body = await readJsonBody(req);
  const tokenHash = hashToken(String(body.token ?? ""));
  const password = String(body.password ?? "");
  const foundUser = await getPrisma().user.findFirst({
    where: {
      resetTokenHash: tokenHash,
      resetTokenExpiresAt: { gt: new Date() }
    }
  });

  if (!foundUser) throw new HttpError(400, "Reset link is invalid or expired.");
  if (password.length < 8) throw new HttpError(400, "Password needs at least 8 characters.");

  const { salt, hash } = hashPassword(password);
  await getPrisma().$transaction([
    getPrisma().user.update({
      where: { id: foundUser.id },
      data: {
        salt,
        passwordHash: hash,
        resetTokenHash: null,
        resetTokenExpiresAt: null
      }
    }),
    getPrisma().session.deleteMany({
      where: { userId: foundUser.id }
    })
  ]);

  return sendJson(res, 200, { ok: true });
}

async function handleLogoutPrisma(req, res) {
  await ensureDb();
  const sessionId = parseCookies(req)[SESSION_COOKIE];
  if (sessionId) {
    await getPrisma().session.deleteMany({ where: { id: sessionId } });
  }

  return sendJson(res, 200, { ok: true }, clearSessionHeader());
}

async function handleUploadPrisma(req, res) {
  await ensureDb();
  const signedInUser = await requireUserPrisma(req);
  applyRateLimit(req, res, RATE_LIMITS.upload, signedInUser.id);
  const body = await readJsonBody(req);
  const url = await saveImageUploadPrisma(body, signedInUser);

  return sendJson(res, 201, { url });
}

async function handleUpdateMePrisma(req, res) {
  await ensureDb();
  const client = getPrisma();
  const signedInUser = await requireUserPrisma(req);
  const body = await readJsonBody(req);
  const name = normalizeText(body.name, 50);
  const bio = normalizeText(body.bio, 180) || "Writing on Inkline.";
  const email = normalizeText(body.email, 120).toLowerCase();
  let verification = null;
  let emailDelivery = null;

  if (name.length < 2) throw new HttpError(400, "Name is too short.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Use a valid email.");

  const duplicateUser = await client.user.findFirst({
    where: {
      email,
      NOT: { id: signedInUser.id }
    }
  });
  if (duplicateUser) {
    throw new HttpError(409, "That email already has an account.");
  }

  const userData = {
    name,
    bio
  };
  if (email !== signedInUser.email) {
    verification = createToken(24);
    Object.assign(userData, {
      email,
      emailVerified: false,
      emailVerificationHash: verification.tokenHash,
      emailVerificationExpiresAt: toDate(verification.expiresAt)
    });
  }

  const authoredStories = await client.story.findMany({
    where: { authorId: signedInUser.id }
  });
  const [updatedUser] = await client.$transaction([
    client.user.update({
      where: { id: signedInUser.id },
      data: userData
    }),
    ...authoredStories.map((story) => {
      const nextStory = {
        ...serializeStory(story),
        authorName: name,
        authorBio: bio
      };
      return client.story.update({
        where: { id: story.id },
        data: {
          authorName: name,
          authorBio: bio,
          searchText: buildSearchText(nextStory)
        }
      });
    })
  ]);

  if (verification) {
    emailDelivery = await sendEmailPrisma(req, {
      type: "verify-email",
      to: updatedUser.email,
      subject: "Verify your new Inkline email",
      link: `${appOrigin(req)}/?verify=${verification.token}`
    });
  }

  return sendJson(res, 200, { user: publicUser(serializeUser(updatedUser)), emailDelivery, devEmail: emailDelivery?.devEmail ?? null });
}

async function handleAdminModerationPrisma(req, res) {
  await ensureDb();
  await requireAdminPrisma(req);
  const client = getPrisma();
  const [responses, stories, diagnostics] = await Promise.all([
    client.response.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { story: true }
    }),
    client.story.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: storyPrismaInclude(null)
    }),
    client.systemEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 30
    })
  ]);
  const storyIds = stories.map((story) => story.id);
  const responseRows = storyIds.length
    ? await client.response.findMany({
        where: { storyId: { in: storyIds } },
        select: { storyId: true, status: true }
      })
    : [];
  const responseCounts = new Map();

  for (const response of responseRows) {
    const counts = responseCounts.get(response.storyId) ?? { total: 0, hidden: 0 };
    counts.total += 1;
    if (response.status === "hidden") counts.hidden += 1;
    responseCounts.set(response.storyId, counts);
  }

  return sendJson(res, 200, {
    responses: responses.map(publicAdminResponseFromPrisma),
    stories: stories.map((story) => publicAdminStoryFromPrisma(story, responseCounts)),
    diagnostics: diagnostics.map(serializeSystemEvent)
  });
}

async function findAdminResponsePrisma(responseId) {
  const response = await getPrisma().response.findUnique({
    where: { id: responseId },
    include: { story: true }
  });

  if (!response) throw new HttpError(404, "Response not found.");
  return response;
}

async function handleAdminModerateResponsePrisma(req, res, responseId) {
  await ensureDb();
  const signedInAdmin = await requireAdminPrisma(req);
  const response = await findAdminResponsePrisma(responseId);
  const body = await readJsonBody(req);
  const updatedResponse = await getPrisma().response.update({
    where: { id: response.id },
    data: {
      status: body.status === "hidden" ? "hidden" : "visible",
      moderatedAt: new Date(),
      moderatedBy: signedInAdmin.id
    },
    include: { story: true }
  });

  return sendJson(res, 200, { response: publicAdminResponseFromPrisma(updatedResponse) });
}

async function handleAdminDeleteResponsePrisma(req, res, responseId) {
  await ensureDb();
  await requireAdminPrisma(req);
  const response = await findAdminResponsePrisma(responseId);

  await getPrisma().response.delete({
    where: { id: response.id }
  });

  return sendJson(res, 200, { ok: true });
}

async function handleAdminDeleteStoryPrisma(req, res, storyId) {
  await ensureDb();
  await requireAdminPrisma(req);
  const story = await getPrisma().story.findUnique({
    where: { id: storyId }
  });

  if (!story) throw new HttpError(404, "Story not found.");

  await getPrisma().story.delete({
    where: { id: story.id }
  });
  await deleteStoredImageIfOwned(story.image);

  return sendJson(res, 200, { ok: true });
}

async function handleApi(req, res, url) {
  if (shouldRateLimitAuth(req, url)) {
    applyRateLimit(req, res, RATE_LIMITS.auth);
  }

  if (req.method === "GET" && url.pathname === "/api/stories") {
    return handleStoryIndexPrisma(req, res, url);
  }

  if (req.method === "POST" && url.pathname === "/api/stories") {
    return handleCreateStoryPrisma(req, res);
  }

  if (req.method === "GET" && url.pathname === "/api/session") {
    return handleSessionPrisma(req, res);
  }

  if (req.method === "GET" && url.pathname === "/api/dev-emails") {
    return handleDevEmailsPrisma(req, res);
  }

  if (req.method === "POST" && url.pathname === "/api/uploads") {
    return handleUploadPrisma(req, res);
  }

  if (req.method === "PUT" && url.pathname === "/api/me") {
    return handleUpdateMePrisma(req, res);
  }

  if (req.method === "GET" && url.pathname === "/api/admin/moderation") {
    return handleAdminModerationPrisma(req, res);
  }

  const directAdminResponseRoute = url.pathname.match(/^\/api\/admin\/responses\/([^/]+)(?:\/([^/]+))?$/);
  if (directAdminResponseRoute) {
    const responseId = decodeURIComponent(directAdminResponseRoute[1]);
    const action = directAdminResponseRoute[2];

    if (req.method === "DELETE" && !action) {
      return handleAdminDeleteResponsePrisma(req, res, responseId);
    }

    if (req.method === "POST" && action === "moderate") {
      return handleAdminModerateResponsePrisma(req, res, responseId);
    }
  }

  const directAdminStoryRoute = url.pathname.match(/^\/api\/admin\/stories\/([^/]+)$/);
  if (directAdminStoryRoute && req.method === "DELETE") {
    return handleAdminDeleteStoryPrisma(req, res, decodeURIComponent(directAdminStoryRoute[1]));
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    return handleRegisterPrisma(req, res);
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    return handleLoginPrisma(req, res);
  }

  if (req.method === "POST" && url.pathname === "/api/auth/request-verification") {
    return handleRequestVerificationPrisma(req, res);
  }

  if (req.method === "POST" && url.pathname === "/api/auth/verify-email") {
    return handleVerifyEmailPrisma(req, res);
  }

  if (req.method === "POST" && url.pathname === "/api/auth/request-reset") {
    return handleRequestResetPrisma(req, res);
  }

  if (req.method === "POST" && url.pathname === "/api/auth/reset-password") {
    return handleResetPasswordPrisma(req, res);
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    return handleLogoutPrisma(req, res);
  }

  if (req.method === "GET" && url.pathname === "/api/me/drafts") {
    return handleMyDraftsPrisma(req, res);
  }

  const directResponseRoute = url.pathname.match(/^\/api\/stories\/([^/]+)\/responses\/([^/]+)(?:\/([^/]+))?$/);
  if (directResponseRoute) {
    const storyId = decodeURIComponent(directResponseRoute[1]);
    const responseId = decodeURIComponent(directResponseRoute[2]);
    const action = directResponseRoute[3];

    if (req.method === "DELETE" && !action) {
      return handleDeleteResponsePrisma(req, res, storyId, responseId);
    }

    if (req.method === "POST" && action === "moderate") {
      return handleModerateResponsePrisma(req, res, storyId, responseId);
    }
  }

  const directStoryRoute = url.pathname.match(/^\/api\/stories\/([^/]+)(?:\/([^/]+))?$/);
  if (req.method === "GET" && directStoryRoute && !directStoryRoute[2]) {
    return handleStoryDetailPrisma(req, res, decodeURIComponent(directStoryRoute[1]));
  }
  if (directStoryRoute) {
    const storyId = decodeURIComponent(directStoryRoute[1]);
    const action = directStoryRoute[2];

    if (req.method === "PUT" && !action) {
      return handleUpdateStoryPrisma(req, res, storyId);
    }

    if (req.method === "DELETE" && !action) {
      return handleDeleteStoryPrisma(req, res, storyId);
    }

    if (req.method === "POST" && action === "clap") {
      return handleClapStoryPrisma(req, res, storyId);
    }

    if (req.method === "POST" && action === "bookmark") {
      return handleBookmarkStoryPrisma(req, res, storyId);
    }

    if (req.method === "POST" && action === "responses") {
      return handleCreateResponsePrisma(req, res, storyId);
    }
  }

  throw new HttpError(404, "Route not found.");
}

async function serveStatic(req, res, url) {
  if (url.pathname.startsWith("/uploads/")) {
    const fileName = path.basename(url.pathname);
    const filePath = path.join(UPLOAD_DIR, fileName);
    const ext = path.extname(filePath).toLowerCase();
    const uploadTypes = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif"
    };

    try {
      const content = await fs.readFile(filePath);
      res.writeHead(200, {
        "Content-Type": uploadTypes[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable"
      });
      res.end(content);
      return;
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
  }

  const fileMap = new Map([
    ["/", "index.html"],
    ["/index.html", "index.html"],
    ["/app.js", "app.js"],
    ["/styles.css", "styles.css"]
  ]);
  const fileName = url.pathname.startsWith("/stories/") ? "index.html" : fileMap.get(url.pathname);

  if (!fileName) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const filePath = path.join(ROOT, fileName);
  const ext = path.extname(filePath);
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8"
  };

  const content = await fs.readFile(filePath);
  res.writeHead(200, {
    "Content-Type": contentTypes[ext] ?? "application/octet-stream"
  });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(req.method === "HEAD" ? undefined : JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(req, res, url);
  } catch (error) {
    if (error instanceof HttpError) {
      sendError(res, error.status, error.message, error.headers);
      return;
    }

    console.error(error);
    sendError(res, 500, "Server error.");
  }
});

async function importJsonDatabase() {
  const jsonPath = path.join(ROOT, "data", "db.json");
  const text = await fs.readFile(jsonPath, "utf8");
  const source = JSON.parse(text);
  const importedDb = {
    users: source.users ?? [],
    sessions: source.sessions ?? [],
    stories: source.stories?.length ? source.stories : seedStories,
    bookmarks: source.bookmarks ?? [],
    claps: source.claps ?? {},
    responses: source.responses ?? [],
    devEmails: source.devEmails ?? [],
    uploads: source.uploads ?? []
  };

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await writeDb(importedDb);
  console.log(
    `Imported ${importedDb.users.length} users, ${importedDb.stories.length} stories, and ${importedDb.responses.length} responses into Postgres.`
  );
}

async function runCli() {
  if (process.argv.includes("--import-json")) {
    await importJsonDatabase();
    return;
  }

  await ensureDb();
  console.log("Database ready. Prisma migrations are managed with `npm run migrate`.");
}

if (process.argv.includes("--seed") || process.argv.includes("--migrate") || process.argv.includes("--import-json")) {
  runCli()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (prisma) await prisma.$disconnect();
    });
} else {
  server.listen(PORT, HOST, () => {
    console.log(`Inkline running at http://${HOST}:${PORT}`);
  });
}
