const { execFileSync, spawn } = require("node:child_process");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { expect, test } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..");
const runId = `${Date.now()}-${process.pid}`;
const writerEmail = `e2e-writer-${runId}@example.com`;
const writerPassword = "writer-password-1";
const writerName = "Browser Test Writer";

let baseUrl;
let databaseUrl;
let createdDatabaseName;
let serverProcess;
let serverOutput = "";

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
    createdDatabaseName = `inkline_e2e_test_${Date.now()}_${process.pid}`;
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
      ADMIN_EMAILS: writerEmail,
      AUTH_RATE_LIMIT_MAX: "20",
      AUTH_RATE_LIMIT_WINDOW_MS: "60000",
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      EMAIL_PROVIDER: "dev",
      HOST: "127.0.0.1",
      PORT: String(port),
      RESPONSE_RATE_LIMIT_MAX: "20",
      RESPONSE_RATE_LIMIT_WINDOW_MS: "60000",
      STORAGE_PROVIDER: "local",
      UPLOAD_RATE_LIMIT_MAX: "20",
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
      throw new Error(`E2E server exited early.\n${serverOutput}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/session`);
      if (response.ok) return;
    } catch {
      // The server may not have bound the port yet.
    }

    await wait(100);
  }

  throw new Error(`Timed out waiting for E2E server.\n${serverOutput}`);
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

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await prepareDatabase();
  await startServer();
});

test.afterAll(async () => {
  await stopServer();
  await dropDatabase();
});

test("writer can sign up, publish, read, and edit a story", async ({ page }) => {
  const storyTitle = `Browser test story ${runId}`;
  const editedTitle = `Edited browser story ${runId}`;
  const authDialog = page.locator("#authDialog");
  const writeDialog = page.locator("#writeDialog");
  const readerDialog = page.locator("#readerDialog");

  await page.goto(baseUrl);
  await expect(page.getByRole("heading", { name: "Recommended for you" })).toBeVisible();

  await page.getByRole("button", { name: "Sign in" }).click();
  await authDialog.getByRole("button", { name: "Create account" }).click();
  await authDialog.getByLabel("Name").fill(writerName);
  await authDialog.getByLabel("Email").fill(writerEmail);
  await authDialog.getByLabel("Password").fill(writerPassword);
  await authDialog.getByLabel("Bio").fill("Testing the browser writing flow.");

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Verification link created for development");
    await dialog.accept();
  });
  await authDialog.getByRole("button", { name: "Create account" }).click();
  await expect(authDialog).toBeHidden();
  await expect(page.locator("#userName")).toHaveText(writerName);

  await page.getByRole("button", { name: "Write" }).click();
  await expect(writeDialog).toBeVisible();
  await writeDialog.getByRole("textbox", { name: "Title", exact: true }).fill(storyTitle);
  await writeDialog.getByRole("textbox", { name: "Subtitle" }).fill("A browser-tested path through publishing.");
  await writeDialog.getByRole("combobox", { name: "Topic" }).selectOption("Code");
  await writeDialog.getByRole("textbox", { name: "Story body" }).fill(
    "Browser tests make the writing flow feel real, because they click through the same screens a reader uses."
  );
  await writeDialog.getByRole("button", { name: "Publish" }).click();

  await expect(page).toHaveURL(/\/stories\/.+\/browser-test-story-/);
  await expect(readerDialog.locator("#readerTitle")).toHaveText(storyTitle);
  await expect(readerDialog.locator("#readerBody")).toContainText("Browser tests make the writing flow feel real");

  await readerDialog.getByRole("button", { name: /^Clap/ }).click();
  await expect(readerDialog.getByRole("button", { name: /^Clap/ })).toHaveText("Clap (1)");

  await readerDialog.getByRole("button", { name: "Bookmark" }).click();
  await expect(readerDialog.getByRole("button", { name: "Bookmarked" })).toBeVisible();

  await readerDialog.locator('textarea[name="text"]').fill("This response came from a browser test.");
  await readerDialog.getByRole("button", { name: "Respond" }).click();
  await expect(readerDialog.locator("#responseList")).toContainText("This response came from a browser test.");

  const publishedUrl = page.url();
  await page.reload();
  await expect(page).toHaveURL(publishedUrl);
  await expect(readerDialog.locator("#readerTitle")).toHaveText(storyTitle);

  await readerDialog.getByRole("button", { name: "Edit" }).click();
  await expect(writeDialog).toBeVisible();
  await writeDialog.getByRole("textbox", { name: "Title", exact: true }).fill(editedTitle);
  await writeDialog.getByRole("textbox", { name: "Story body" }).fill(
    "The edited version proves the owner can revise a published story from the UI."
  );
  await writeDialog.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL(/\/stories\/.+\/edited-browser-story-/);
  await expect(readerDialog.locator("#readerTitle")).toHaveText(editedTitle);
  await expect(readerDialog.locator("#readerBody")).toContainText("The edited version proves");
});
