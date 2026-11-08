// Builds the device engine (src/device/engine.ts) for "This device only" shops: every API
// route, service and migration, bundled to run in a Web Worker on Postgres in the browser.
// Output: public/device/ (engine.js and PGlite's wasm and data files). Run by `npm run build`.
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public/device");
const apiDir = join(root, "src/app/api/v1");
const migrationsDir = join(root, "prisma/migrations");

// Routes that only make sense with a server (sign-in, Google, Telegram, cloud print, the
// online shop, e-mail) are left out: the device answers them "not available".
const SKIP = [/^auth\/(?!me$)/, /^device-move/, /^telegram/, /^print-jobs/, /^online-shop/, /^community/, /^account-deletion/, /^reports\/gsheet/];

function routeFilesNamed(dir, fileName) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) found.push(...routeFilesNamed(p, fileName));
    else if (name === fileName) found.push(p);
  }
  return found;
}

function routeFiles(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) found.push(...routeFiles(p));
    else if (name === "route.ts") found.push(p);
  }
  return found;
}

const routes = routeFiles(apiDir)
  .map((file) => ({ file, path: "v1/" + relative(apiDir, dirname(file)).replace(/\\/g, "/") }))
  .map((r) => ({ ...r, path: r.path.replace(/\/$/, "") }))
  .filter((r) => !SKIP.some((re) => re.test(r.path.slice(3))));

const migrations = readdirSync(migrationsDir)
  .filter((d) => existsSync(join(migrationsDir, d, "migration.sql")))
  .sort()
  .map((name) => ({ name, sql: readFileSync(join(migrationsDir, name, "migration.sql"), "utf8") }));

// CommonJS, so any name imported from it resolves (to undefined unless defined here).
const EMPTY = "class EventEmitter { on() { return this; } once() { return this; } off() { return this; } emit() { return false; } removeListener() { return this; } }\n" +
  "module.exports = { EventEmitter, AsyncLocalStorage: class { run(_s, f, ...a) { return f(...a); } getStore() { return undefined; } }, createRequire: () => () => ({}) };";

const virtual = {
  name: "device-virtual",
  setup(b) {
    b.onResolve({ filter: /^device:/ }, (args) => ({ path: args.path, namespace: "device" }));
    b.onLoad({ filter: /.*/, namespace: "device" }, (args) => {
      if (args.path === "device:routes") {
        const lines = routes.map((r, i) => `import * as r${i} from ${JSON.stringify(r.file.replace(/\\/g, "/"))};`);
        lines.push(`export const routes = [${routes.map((r, i) => `{ path: ${JSON.stringify(r.path)}, mod: r${i} }`).join(",")}];`);
        return { contents: lines.join("\n"), resolveDir: root, loader: "js" };
      }
      if (args.path === "device:migrations") {
        return { contents: `export const migrations = ${JSON.stringify(migrations)};`, loader: "js" };
      }
    });
    // The device's own versions of a few server modules.
    const swap = {
      "@/lib/prisma": "src/device/prisma.ts",
      "next/headers": "src/device/shims/next-headers.ts",
      crypto: "src/device/shims/crypto.ts",
      "node:crypto": "src/device/shims/crypto.ts",
      // Prisma's WebAssembly build (no file system), its query compiler fetched beside engine.js.
      "@prisma/client": "src/generated/device-prisma/wasm.js",
    };
    b.onResolve({ filter: /^(@\/lib\/prisma|next\/headers|crypto|node:crypto|@prisma\/client)$/ }, (args) => ({ path: join(root, swap[args.path]) }));
    // src/lib files import the server's client as "./prisma".
    b.onResolve({ filter: /^\.\/prisma$/ }, (args) =>
      resolve(args.resolveDir) === join(root, "src/lib") ? { path: join(root, swap["@/lib/prisma"]) } : undefined);
    b.onResolve({ filter: /^#wasm-compiler-loader$/ }, () => ({ path: "compiler", namespace: "device" }));
    b.onLoad({ filter: /^compiler$/, namespace: "device" }, () => ({
      contents: `export default (async () => {
        const res = await fetch(new URL("./query_compiler.wasm", import.meta.url));
        return { default: await WebAssembly.compile(await res.arrayBuffer()) };
      })();`,
      loader: "js",
    }));
    b.onResolve({ filter: /^@\// }, (args) => {
      const base = join(root, "src", args.path.slice(2));
      for (const ext of [".ts", ".tsx", "/index.ts", ".js", ".json"]) if (existsSync(base + ext)) return { path: base + ext };
      return { path: base };
    });
    // Server-only Node modules that the device never reaches.
    b.onResolve({ filter: /^(node:)?(fs|path|zlib|async_hooks|os|net|tls|child_process|stream|http|https|util|url|module|events)$/ }, (args) => ({ path: args.path, namespace: "empty" }));
    b.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: EMPTY, loader: "js" }));
  },
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const result = await build({
  entryPoints: [join(root, "src/device/engine.ts")],
  outfile: join(out, "engine.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: process.env.DEVICE_DEBUG !== "1",
  sourcemap: false,
  legalComments: "none",
  plugins: [virtual],
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.DEFAULT_TIMEZONE": '"Asia/Yangon"',
    "process.env.APP_EDITION": '"DEVICE"',
    __dirname: '"/device"',
    __filename: '"/device/engine.js"',
  },
  banner: { js: "globalThis.process ??= { env: {}, pid: 1, platform: \"browser\", version: \"v20.0.0\", versions: {}, cwd: () => \"/\", nextTick: (f, ...a) => queueMicrotask(() => f(...a)) };" },
  loader: { ".wasm": "file", ".data": "file" },
  assetNames: "[name]",
  metafile: true,
  logLevel: "warning",
});

// PGlite loads its wasm and data next to the script.
const pgliteDist = join(root, "node_modules/@electric-sql/pglite/dist");
for (const f of ["pglite.wasm", "pglite.data", "initdb.wasm"]) cpSync(join(pgliteDist, f), join(out, f));
cpSync(join(root, "src/generated/device-prisma/query_compiler_bg.wasm"), join(out, "query_compiler.wasm"));

// The screens a device shop keeps (an id in the address becomes __device__), and the engine's
// version, so a device fetches a new engine when the app is updated.
const appDir = join(root, "src/app/(app)");
const screens = routeFilesNamed(appDir, "page.tsx")
  .map((file) => "/" + relative(appDir, dirname(file)).replace(/\\/g, "/").replace(/\[[^\]]+\]/g, "__device__"))
  .map((p) => (p === "/" ? p : p.replace(/\/$/, "")))
  .sort();
const hashOf = (file) => createHash("sha256").update(readFileSync(join(out, file))).digest("hex").slice(0, 12);
// Each build is a new version (its screens change even when the engine does not); the large
// files carry their own hash, so a device fetches them again only when they change.
const version = `${hashOf("engine.js")}-${Date.now().toString(36)}`;
const files = ["pglite.wasm", "pglite.data", "initdb.wasm", "query_compiler.wasm"].map((name) => ({ name, hash: hashOf(name) }));
writeFileSync(join(out, "manifest.json"), JSON.stringify({ version, screens, files }));

const size = (f) => (statSync(join(out, f)).size / 1024 / 1024).toFixed(1) + " MB";
console.log(`device engine: ${routes.length} routes, ${migrations.length} migrations, engine.js ${size("engine.js")}, pglite ${size("pglite.wasm")} + ${size("pglite.data")}`);
void result;
