// Builds src/lib/supportScreens.json: what each screen of the app shows, read from the app's
// own source, for the manual's "Ask for support" chat. The chat then names only menus,
// buttons and fields that really exist, in the words the app shows (Myanmar, with English).
//
// For every page under src/app/(app) it gathers the page and the components it uses, keeps
// the UI words that have a Myanmar translation in LanguageProvider (so code identifiers drop
// out), and adds the sidebar menu with who may see each entry.
//
// Run: node scripts/gen-support-screens.mjs after changing a screen; the tests fail while
// the file is out of date (--check).

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const src = (p) => path.join(ROOT, "src", p);
const read = (f) => fs.readFileSync(f, "utf8");

// --- Myanmar words --------------------------------------------------------------------
const lp = read(src("components/LanguageProvider.tsx"));
const dictStart = lp.indexOf("const MM: Record<string, string> = {");
const dictEnd = lp.indexOf("\n};", dictStart);
const MM = new Map();
for (const line of lp.slice(dictStart, dictEnd).split("\n")) {
  const m = line.match(/^\s*"((?:[^"\\]|\\.)*)":\s*"((?:[^"\\]|\\.)*)",?\s*$/);
  if (m) MM.set(JSON.parse(`"${m[1]}"`), JSON.parse(`"${m[2]}"`));
}
const both = (en) => (MM.has(en) && MM.get(en) !== en ? `${MM.get(en)} (${en})` : en);

// --- Menu -----------------------------------------------------------------------------
const shell = read(src("components/AppShell.tsx"));
const navBody = shell.slice(shell.indexOf("const NAV: NavItem[] = ["), shell.indexOf("];", shell.indexOf("const NAV: NavItem[] = [")));
const field = (line, name) => line.match(new RegExp(`${name}: "([^"]*)"`))?.[1];
const menu = [];
for (const line of navBody.split("\n")) {
  const href = field(line, "href");
  if (!href) continue;
  menu.push({ path: href, name: both(field(line, "label")), section: field(line, "section"), under: field(line, "parent"), permission: field(line, "perm") ?? "everyone" });
}
const tabs = (name) => {
  const start = shell.indexOf(`const ${name}: NavTab[] = [`);
  return shell.slice(start, shell.indexOf("];", start)).split("\n").map((l) => field(l, "href") && { path: field(l, "href"), name: both(field(l, "label")), permission: field(l, "perm") }).filter(Boolean);
};
const walletTabs = tabs("WALLET_TABS");
const repairTabs = tabs("REPAIR_SUBS");
const createActions = [];
{
  const start = shell.indexOf("const CREATE_ACTIONS");
  for (const l of shell.slice(start, shell.indexOf("];", start)).split("\n")) {
    if (field(l, "section")) createActions.push({ on: field(l, "section"), button: both(field(l, "label")), permission: field(l, "perm") });
  }
}

// --- Screens --------------------------------------------------------------------------
// Shared pieces every screen has; their words would only repeat on every screen.
// Old addresses kept only to redirect, and pages left out of the menu: not where to send anyone.
const HIDDEN = new Set(["/daily-close", "/stock", "/suppliers", "/transfers", "/withdraw"]);
const SKIP = new Set(["AppShell", "LanguageProvider", "ui", "AuthProvider", "Toast", "Icons"]);

function resolveImport(spec, from) {
  let base;
  if (spec.startsWith("@/")) base = src(spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const f = base + ext;
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

function files(entry) {
  const seen = new Set();
  const walk = (f, depth) => {
    if (seen.has(f)) return;
    seen.add(f);
    if (depth >= 3) return;
    for (const m of read(f).matchAll(/from\s+"([^"]+)"/g)) {
      const r = resolveImport(m[1], f);
      if (!r || !/\.tsx$/.test(r) || !r.includes(`${path.sep}components${path.sep}`) && !r.includes(`${path.sep}app${path.sep}`)) continue;
      if (SKIP.has(path.basename(r).replace(/\.tsx$/, "")) || r.includes(`${path.sep}ui${path.sep}`)) continue;
      walk(r, depth + 1);
    }
  };
  walk(entry, 0);
  return [...seen];
}

function words(file) {
  const text = read(file);
  const out = [];
  for (const m of text.matchAll(/"((?:[^"\\\n]|\\.){2,160})"|'((?:[^'\\\n]|\\.){2,160})'|`([^`$\n]{2,160})`/g)) out.push(m[1] ?? m[2] ?? m[3]);
  for (const m of text.matchAll(/>\s*([^<>{}\n][^<>{}]{1,160}?)\s*</g)) out.push(m[1].trim());
  return out;
}

const appDir = src("app/(app)");
const screens = [];
const walkPages = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkPages(p);
    else if (e.name === "page.tsx") {
      const route = "/" + path.relative(appDir, path.dirname(p)).split(path.sep).join("/");
      const labels = new Set();
      for (const f of files(p)) for (const w of words(f)) if (MM.has(w) && /[A-Za-z]/.test(w)) labels.add(both(w));
      const at = route === "/" ? "/" : route.replace(/\/$/, "");
      if (!HIDDEN.has(at)) screens.push({ path: at, labels: [...labels].sort() });
    }
  }
};
walkPages(appDir);
screens.sort((a, b) => a.path.localeCompare(b.path));

const out = { menu, walletTabs, repairTabs, createActions, screens };
const target = src("lib/supportScreens.json");
const text = JSON.stringify(out, null, 1) + "\n";
if (process.argv.includes("--check")) {
  // Used by the tests: the committed file must match the app as it is now.
  const same = fs.existsSync(target) && read(target) === text;
  if (!same) console.error("src/lib/supportScreens.json is out of date: run node scripts/gen-support-screens.mjs");
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(target, text);
const size = JSON.stringify(out).length;
console.log(`support screens: ${screens.length} screens, ${screens.reduce((n, s) => n + s.labels.length, 0)} labels, ${size} chars`);
