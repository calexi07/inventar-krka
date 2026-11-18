// Pure helpers for the bulk import screen (no DOM, no Supabase) so they can
// be reasoned about and tested on their own.

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "gif"]);

const MIME_BY_EXT = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  gif: "image/gif",
};

// District codes as written on the inventory sheets -> region slug in the app.
const REGION_ALIASES = {
  "ct-cl": "constanta-calarasi",
  "ct": "constanta-calarasi",
  "gl": "galati",
  "bc": "bacau",
  "is-sv": "iasi",
  "is": "iasi",
};

export function extensionOf(fileName) {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

export function isImageName(fileName) {
  return IMAGE_EXT.has(extensionOf(fileName));
}

export function mimeFor(fileName) {
  return MIME_BY_EXT[extensionOf(fileName)] || "application/octet-stream";
}

function stripDiacritics(text) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** "Chiforeanu-Luca Raluca Georgiana" -> ["CHIFOREANU","GEORGIANA","LUCA","RALUCA"] */
export function nameTokens(name) {
  return stripDiacritics(String(name))
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .sort();
}

export function nameKey(name) {
  return nameTokens(name).join(" ");
}

/** "MITRUTOIU ANDREI-BOGDAN" -> "Mitrutoiu Andrei-Bogdan" */
export function titleCaseName(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

function slugish(text) {
  return stripDiacritics(String(text))
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Finds the region a folder name refers to (by name, slug or sheet code). */
export function matchRegion(folderName, regions) {
  if (!folderName) return null;
  const key = slugish(folderName);
  if (!key) return null;
  const target = REGION_ALIASES[key] || key;
  return regions.find((r) => r.slug === target || slugish(r.name) === target) || null;
}

/**
 * Splits a relative path into { regionFolder, employeeFolder, fileName }.
 * The employee folder is the one that directly contains the photo; the
 * folder above it (if any) is treated as a possible region folder.
 */
export function splitPath(relativePath) {
  const parts = String(relativePath).split("/").filter(Boolean);
  const fileName = parts.pop() || "";
  const employeeFolder = parts.pop() || "";
  const regionFolder = parts.pop() || "";
  return { regionFolder, employeeFolder, fileName };
}

export function shouldSkipPath(relativePath) {
  const parts = String(relativePath).split("/");
  if (parts.some((p) => p === "__MACOSX" || p.startsWith("."))) return true;
  return !isImageName(parts[parts.length - 1] || "");
}

/**
 * Groups entries ({ path, ... }) by employee folder.
 * Returns [{ folderName, regionFolder, entries: [...] }] sorted by folder name.
 * Photos that sit directly in the root (no employee folder) are ignored.
 */
export function groupByEmployeeFolder(entries) {
  const groups = new Map();
  for (const entry of entries) {
    if (shouldSkipPath(entry.path)) continue;
    const { regionFolder, employeeFolder, fileName } = splitPath(entry.path);
    if (!employeeFolder) continue;
    const key = nameKey(employeeFolder);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { folderName: employeeFolder, regionFolder, entries: [] });
    const group = groups.get(key);
    if (!group.regionFolder && regionFolder) group.regionFolder = regionFolder;
    group.entries.push({ ...entry, fileName });
  }
  return [...groups.values()].sort((a, b) => a.folderName.localeCompare(b.folderName));
}

/**
 * Matches a folder name against the employee list.
 * - "exact": same set of name parts, in any order, ignoring case/diacritics/hyphens
 * - "partial": every part of the shorter name appears in the longer one (min. 2 parts)
 * - "none": nothing close enough
 * When several employees fit, `candidates` lists all of them and the caller
 * must let the user choose.
 */
export function matchEmployee(folderName, employees) {
  const tokens = nameTokens(folderName);
  const key = tokens.join(" ");
  const exact = employees.filter((e) => nameKey(e.full_name) === key);
  if (exact.length > 0) return { kind: "exact", candidates: exact };

  const partial = employees.filter((e) => {
    const other = nameTokens(e.full_name);
    const [small, big] = tokens.length <= other.length ? [tokens, other] : [other, tokens];
    if (small.length < 2) return false;
    const bigSet = new Set(big);
    return small.every((t) => bigSet.has(t));
  });
  if (partial.length > 0) return { kind: "partial", candidates: partial };

  return { kind: "none", candidates: [] };
}
