export function showToast(message, { error = false } = {}) {
  const el = document.createElement("div");
  el.className = "toast" + (error ? " error" : "");
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
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
  if (err?.code === "23505") return "That name already exists here.";
  if (err?.message?.includes("Failed to fetch")) return "Network problem — check your connection and try again.";
  return "Something went wrong. Please try again.";
}

/**
 * Downloads a set of file groups (e.g. one group per employee/vehicle) as a
 * single ZIP, with each group becoming a folder inside the archive.
 * groups: [{ folderName: string, files: [{ url: string, fileName: string }] }]
 */
export async function downloadGroupsAsZip({ zipFileName, groups, onProgress }) {
  const zip = new JSZip();
  const total = groups.reduce((sum, g) => sum + g.files.length, 0);
  let done = 0;

  for (const group of groups) {
    const folder = zip.folder(group.folderName);
    for (const file of group.files) {
      const response = await fetch(file.url);
      const blob = await response.blob();
      folder.file(file.fileName, blob);
      done++;
      onProgress?.(done, total);
    }
  }

  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const link = document.createElement("a");
  link.href = url;
  link.download = zipFileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
