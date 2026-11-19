export function showToast(message, { error = false } = {}) {
  const el = document.createElement("div");
  el.className = "toast" + (error ? " error" : "");
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), error ? 9000 : 3200);
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function slugify(text) {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function friendlyError(err) {
  console.error(err);
  if (err?.code === "23505") return "Acest nume există deja aici.";
  if (err?.message?.includes("Failed to fetch")) return "Problemă de rețea — verifică conexiunea și încearcă din nou.";
  const detail = err?.message ? ` Detalii: ${err.message}` : "";
  return "Ceva nu a mers. Încearcă din nou." + detail;
}

const ZIP_PARALLEL_DOWNLOADS = 5;

async function fetchBlobWithRetry(url, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.blob();
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 400 * (i + 1)));
    }
  }
  throw lastError;
}

/** "poza.jpg" -> "poza (2).jpg" when the name is already used in that folder. */
function uniqueName(fileName, usedNames) {
  if (!usedNames.has(fileName)) {
    usedNames.add(fileName);
    return fileName;
  }
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : "";
  let n = 2;
  while (usedNames.has(`${base} (${n})${ext}`)) n++;
  const name = `${base} (${n})${ext}`;
  usedNames.add(name);
  return name;
}

/**
 * Downloads a set of file groups (e.g. one group per employee/vehicle) as a
 * single ZIP, with each group becoming a folder inside the archive.
 * groups: [{ folderName: string, files: [{ url, fileName }], notes?: string }]
 * - Notes are saved as "notite.txt" inside the group's folder.
 * - Files are fetched in parallel; a failed download is retried, and if it
 *   still fails it is listed in "_ERORI.txt" instead of being saved as a
 *   broken file.
 * - Two photos with the same name in one folder are both kept.
 * Returns { failed: number }.
 */
export async function downloadGroupsAsZip({ zipFileName, groups, onProgress }) {
  const zip = new JSZip();
  const tasks = [];

  for (const group of groups) {
    const notes = (group.notes || "").trim();
    if (notes) {
      // BOM + CRLF so Windows Notepad shows Romanian characters correctly
      zip.file(`${group.folderName}/notite.txt`, "\uFEFF" + notes.replace(/\r?\n/g, "\r\n"));
    }
    const usedNames = new Set(notes ? ["notite.txt"] : []);
    for (const file of group.files) {
      tasks.push({
        url: file.url,
        path: `${group.folderName}/${uniqueName(file.fileName, usedNames)}`,
      });
    }
  }

  const failed = [];
  let done = 0;
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const task = tasks[next++];
      try {
        zip.file(task.path, await fetchBlobWithRetry(task.url));
      } catch (err) {
        console.error("ZIP download failed:", task.path, err);
        failed.push(task.path);
      }
      done++;
      onProgress?.(done, tasks.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(ZIP_PARALLEL_DOWNLOADS, tasks.length) }, worker));

  if (failed.length > 0) {
    zip.file(
      "_ERORI.txt",
      "\uFEFFAceste poze nu s-au putut descărca și nu sunt în arhivă:\r\n\r\n" + failed.join("\r\n")
    );
  }

  // Photos are already compressed, so store them as-is (faster, smaller work)
  const content = await zip.generateAsync({ type: "blob", compression: "STORE" });
  const url = URL.createObjectURL(content);
  const link = document.createElement("a");
  link.href = url;
  link.download = zipFileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return { failed: failed.length };
}
