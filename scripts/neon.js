const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const envFile = path.resolve(ROOT, process.env.NEON_ENV_FILE || ".env.neon");
const command = process.argv[2];

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const equalsIndex = trimmed.indexOf("=");
  if (equalsIndex === -1) return null;

  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

function loadEnv() {
  if (!fs.existsSync(envFile)) {
    throw new Error(`Missing ${path.relative(ROOT, envFile)}. Create it from .env.neon.example first.`);
  }

  const entries = fs
    .readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .map(parseEnvLine)
    .filter(Boolean);

  return Object.fromEntries(entries);
}

function redactUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.username = parsed.username ? "USER" : "";
    parsed.password = parsed.password ? "PASSWORD" : "";
    return parsed.toString();
  } catch {
    return "(invalid url)";
  }
}

function validateNeonEnv(env) {
  const missingKeys = ["DATABASE_URL", "DIRECT_URL"].filter((key) => !env[key]);
  if (missingKeys.length > 0) {
    throw new Error(`Missing ${missingKeys.join(" and ")} in ${path.relative(ROOT, envFile)}.`);
  }

  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    let parsed;
    try {
      parsed = new URL(env[key]);
    } catch {
      throw new Error(`${key} is not a valid Postgres URL.`);
    }

    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
      throw new Error(`${key} must start with postgresql://.`);
    }
    if (!parsed.hostname.includes("neon.tech")) {
      console.warn(`${key} does not look like a Neon hostname: ${redactUrl(env[key])}`);
    }
    if (!parsed.searchParams.has("sslmode")) {
      console.warn(`${key} does not include sslmode=require.`);
    }
  }

  if (!new URL(env.DATABASE_URL).hostname.includes("-pooler.")) {
    console.warn("DATABASE_URL does not look pooled. Neon recommends the pooled URL for app runtime.");
  }
  if (new URL(env.DIRECT_URL).hostname.includes("-pooler.")) {
    console.warn("DIRECT_URL looks pooled. Prisma migrations should use Neon's direct URL.");
  }
}

function run(label, executable, args, env) {
  console.log(`\n${label}`);
  const result = spawnSync(executable, args, {
    cwd: ROOT,
    env,
    stdio: "inherit"
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status);
}

function usage() {
  console.log(`Usage:
  npm run neon:status
  npm run neon:migrate
  npm run neon:import-json
  npm run start:neon

Set NEON_ENV_FILE=.env.somewhere to use a different env file.`);
}

try {
  const neonEnv = loadEnv();
  validateNeonEnv(neonEnv);
  const env = { ...process.env, ...neonEnv };

  if (command === "status") {
    run("Checking Neon migration status...", "npx", ["prisma", "migrate", "status"], env);
  } else if (command === "migrate") {
    run("Generating Prisma client...", "npx", ["prisma", "generate"], env);
    run("Applying migrations to Neon...", "npx", ["prisma", "migrate", "deploy"], env);
  } else if (command === "import-json") {
    run("Importing data/db.json into Neon...", process.execPath, ["server.js", "--import-json"], env);
  } else if (command === "start") {
    run("Starting Inkline with Neon...", process.execPath, ["server.js"], env);
  } else {
    usage();
    process.exit(command ? 1 : 0);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
