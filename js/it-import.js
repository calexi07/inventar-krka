import { supabase } from "./supabase-client.js";
import { el, showToast, friendlyError } from "./ui-utils.js";
import {
  extensionOf,
  groupByEmployeeFolder,
  matchEmployee,
  matchRegion,
  mimeFor,
  titleCaseName,
} from "./it-import-match.js";

const BUCKET = "it-photos";
const CONCURRENCY = 3;
const MAX_DIMENSION = 2560;
const JPEG_QUALITY = 0.85;

const NEW = "__new__";
const SKIP = "__skip__";

const folderInput = document.getElementById("folder-input");
const zipInput = document.getElementById("zip-input");
const sourceStatus = document.getElementById("source-status");
const review = document.getElementById("review");
const rowsEl = document.getElementById("rows");
const chipsEl = document.getElementById("summary-chips");
const startBtn = document.getElementById("start-btn");
const resetBtn = document.getElementById("reset-btn");
const compressCheckbox = document.getElementById("compress-checkbox");
const progressWrap = document.getElementById("progress-wrap");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const errorsWrap = document.getElementById("errors-wrap");
const errorsList = document.getElementById("errors-list");

let regions = [];
let employees = [];
let entries = []; // { path, getBlob }
let rows = []; // one per employee folder
let running = false;

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

async function loadReferenceData() {
  const [{ data: regionRows, error: regionError }, { data: employeeRows, error: employeeError }] = await Promise.all([
    supabase.from("regions").select("id, name, slug, sort_order").order("sort_order", { ascending: true }),
    supabase.from("it_employees").select("id, full_name, region_id").order("full_name", { ascending: true }),
  ]);
  if (regionError) throw regionError;
  if (employeeError) throw employeeError;
  regions = regionRows || [];
  employees = employeeRows || [];
}

const regionById = (id) => regions.find((r) => r.id === id) || null;
const employeeById = (id) => employees.find((e) => e.id === id) || null;

// ---------------------------------------------------------------------------
// Reading the chosen folder / ZIP files
// ---------------------------------------------------------------------------

function entriesFromFolder(fileList) {
  return [...fileList].map((file) => ({
    path: file.webkitRelativePath || file.name,
    getBlob: async () => file,
  }));
}

async function entriesFromZip(file) {
  const zip = await JSZip.loadAsync(file);
  const out = [];
  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    out.push({
      path: relativePath,
      // Extracted only when its turn comes, so the whole archive is never
      // unpacked in memory at once.
      getBlob: async () => new Blob([await entry.async("arraybuffer")], { type: mimeFor(relativePath) }),
    });
  });
  return out;
}

async function addEntries(newEntries, label) {
  if (running) return;
  sourceStatus.textContent = "Se citește " + label + "…";
  try {
    if (regions.length === 0) await loadReferenceData();
  } catch (err) {
    sourceStatus.textContent = "Nu am putut încărca regiunile și angajații. " + friendlyError(err);
    return;
  }

  const known = new Set(entries.map((e) => e.path));
  for (const entry of newEntries) if (!known.has(entry.path)) entries.push(entry);

  buildRows();
  render();
}

function buildRows() {
  const previous = new Map(rows.map((r) => [r.folderName, r]));
  rows = groupByEmployeeFolder(entries).map((group) => {
    const old = previous.get(group.folderName);
    const match = matchEmployee(group.folderName, employees);
    const folderRegion = matchRegion(group.regionFolder, regions);

    // If the archive says which region the folder belongs to, prefer the
    // employee from that region when the same name exists in several.
    let candidates = match.candidates;
    if (candidates.length > 1 && folderRegion) {
      const sameRegion = candidates.filter((c) => c.region_id === folderRegion.id);
      if (sameRegion.length === 1) candidates = sameRegion;
    }

    let choice = "";
    if (candidates.length === 1) choice = candidates[0].id;
    else if (candidates.length === 0) choice = NEW;

    return {
      folderName: group.folderName,
      regionFolder: group.regionFolder,
      entries: group.entries,
      matchKind: match.kind,
      candidates,
      choice: old?.choice ?? choice,
      newName: old?.newName ?? titleCaseName(group.folderName),
      newRegionId: old?.newRegionId ?? (folderRegion ? folderRegion.id : ""),
      done: 0,
      skipped: 0,
      failed: 0,
      state: "pending", // pending | working | done | error
    };
  });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function rowProblem(row) {
  if (row.choice === SKIP) return null;
  if (row.choice === "") return "Alege angajatul";
  if (row.choice === NEW) {
    if (!row.newName.trim()) return "Scrie numele";
    if (!row.newRegionId) return "Alege regiunea";
  }
  return null;
}

function badgeFor(row) {
  if (row.choice === SKIP) return { text: "Sărit", hue: 230 };
  if (row.choice === NEW) return { text: "Angajat nou", hue: 45 };
  if (row.choice === "") return { text: "De ales", hue: 350 };
  if (row.matchKind === "exact" && row.candidates.some((c) => c.id === row.choice)) return { text: "Potrivit", hue: 160 };
  return { text: "De verificat", hue: 18 };
}

function employeeSelect(row) {
  const select = el("select", { class: "field-input !py-1.5 text-sm", "aria-label": `Destinație pentru ${row.folderName}` });
  select.appendChild(el("option", { value: "", text: "— alege —" }));

  if (row.candidates.length > 0) {
    const group = el("optgroup", { label: "Potriviri" });
    for (const emp of row.candidates) {
      group.appendChild(el("option", { value: emp.id, text: `${emp.full_name} (${regionById(emp.region_id)?.name || "?"})` }));
    }
    select.appendChild(group);
  }

  select.appendChild(el("option", { value: NEW, text: "+ Angajat nou" }));
  select.appendChild(el("option", { value: SKIP, text: "Sari peste acest folder" }));

  for (const region of regions) {
    const inRegion = employees.filter((e) => e.region_id === region.id && !row.candidates.some((c) => c.id === e.id));
    if (inRegion.length === 0) continue;
    const group = el("optgroup", { label: region.name });
    for (const emp of inRegion) group.appendChild(el("option", { value: emp.id, text: emp.full_name }));
    select.appendChild(group);
  }

  select.value = row.choice;
  select.disabled = running;
  select.addEventListener("change", () => {
    row.choice = select.value;
    render();
  });
  return select;
}

function newEmployeeFields(row) {
  const nameInput = el("input", { class: "field-input !py-1.5 text-sm", type: "text", value: row.newName, "aria-label": "Numele angajatului nou" });
  nameInput.disabled = running;
  nameInput.addEventListener("input", () => {
    row.newName = nameInput.value;
    renderSummary();
  });

  const regionSelect = el("select", { class: "field-input !py-1.5 text-sm", "aria-label": "Regiunea angajatului nou" });
  regionSelect.appendChild(el("option", { value: "", text: "— regiune —" }));
  for (const region of regions) regionSelect.appendChild(el("option", { value: region.id, text: region.name }));
  regionSelect.value = row.newRegionId;
  regionSelect.disabled = running;
  regionSelect.addEventListener("change", () => {
    row.newRegionId = regionSelect.value;
    render();
  });

  return el("div", { class: "grid sm:grid-cols-2 gap-2 mt-2" }, [nameInput, regionSelect]);
}

function statusText(row) {
  const total = row.entries.length;
  if (row.state === "pending") return `${total} ${total === 1 ? "poză" : "poze"}`;
  const parts = [`${row.done}/${total} încărcate`];
  if (row.skipped) parts.push(`${row.skipped} existau deja`);
  if (row.failed) parts.push(`${row.failed} cu eroare`);
  return parts.join(" · ");
}

function renderRow(row) {
  const badge = badgeFor(row);
  const problem = rowProblem(row);
  const chip = el("span", { class: "chip", text: badge.text });
  chip.style.setProperty("--h", badge.hue);

  const left = el("div", { class: "min-w-0" }, [
    el("p", { class: "font-medium truncate", text: row.folderName }),
    el("p", { class: "text-xs text-[var(--ink-soft)] mt-0.5" }, [
      row.regionFolder ? `${row.regionFolder} · ` : "",
      statusText(row),
      problem ? el("span", { class: "text-[var(--danger)] font-semibold", text: ` · ${problem}` }) : null,
    ]),
  ]);

  const right = el("div", { class: "w-full sm:w-80 shrink-0" }, [
    employeeSelect(row),
    row.choice === NEW ? newEmployeeFields(row) : null,
  ]);

  return el(
    "div",
    {
      class: "flex flex-col sm:flex-row sm:items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3",
    },
    [el("div", { class: "flex items-start gap-3 flex-1 min-w-0" }, [chip, left]), right]
  );
}

function renderSummary() {
  const active = rows.filter((r) => r.choice !== SKIP);
  const photoCount = active.reduce((sum, r) => sum + r.entries.length, 0);
  const newCount = rows.filter((r) => r.choice === NEW).length;
  const problemCount = rows.filter((r) => rowProblem(r)).length;

  chipsEl.innerHTML = "";
  chipsEl.appendChild(el("span", { class: "chip", text: `${active.length} foldere` }));
  chipsEl.appendChild(el("span", { class: "chip", text: `${photoCount} poze` }));
  if (newCount) chipsEl.appendChild(el("span", { class: "chip", text: `${newCount} angajați noi` }));
  if (problemCount) {
    const chip = el("span", { class: "chip", text: `${problemCount} de completat` });
    chip.style.setProperty("--h", 350);
    chipsEl.appendChild(chip);
  }

  startBtn.disabled = running || photoCount === 0 || problemCount > 0;
  resetBtn.disabled = running;
  compressCheckbox.disabled = running;
}

function render() {
  if (rows.length === 0) {
    review.classList.add("hidden");
    sourceStatus.textContent = entries.length
      ? "Nu am găsit foldere cu poze. Fiecare angajat trebuie să aibă folderul lui."
      : "";
    return;
  }
  sourceStatus.textContent = "";
  review.classList.remove("hidden");
  rowsEl.innerHTML = "";
  for (const row of rows) rowsEl.appendChild(renderRow(row));
  renderSummary();
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

async function compressImage(blob) {
  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const out = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    // Keep the original if the browser could not encode it or it got bigger.
    return out && out.size < blob.size ? out : null;
  } catch {
    return null;
  }
}

async function ensureEmployee(row) {
  if (row.choice !== NEW) return employeeById(row.choice);

  const fullName = row.newName.trim();
  const { data, error } = await supabase
    .from("it_employees")
    .insert({ region_id: row.newRegionId, full_name: fullName })
    .select("id, full_name, region_id")
    .single();

  let employee = data;
  if (error) {
    if (error.code !== "23505") throw error;
    // Already exists in that region (e.g. created by an earlier run) — reuse it.
    const { data: existing, error: lookupError } = await supabase
      .from("it_employees")
      .select("id, full_name, region_id")
      .eq("region_id", row.newRegionId)
      .eq("full_name", fullName)
      .single();
    if (lookupError) throw lookupError;
    employee = existing;
  }

  if (!employeeById(employee.id)) employees.push(employee);
  row.choice = employee.id;
  row.candidates = [employee];
  row.matchKind = "exact";
  return employee;
}

async function existingFileNames(employeeId) {
  const { data, error } = await supabase.from("it_employee_photos").select("file_name").eq("employee_id", employeeId);
  if (error) throw error;
  return new Set((data || []).map((p) => p.file_name));
}

async function uploadOne(entry, employee, regionSlug, compress) {
  let blob = await entry.getBlob();
  let fileName = entry.fileName;
  let ext = extensionOf(fileName) || "jpg";
  let contentType = blob.type || mimeFor(fileName);

  if (compress) {
    const smaller = await compressImage(blob);
    if (smaller) {
      blob = smaller;
      contentType = "image/jpeg";
      ext = "jpg";
    }
  }

  const path = `${regionSlug}/${employee.id}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
    cacheControl: "3600",
    upsert: false,
    contentType,
  });
  if (uploadError) throw uploadError;

  const { error: dbError } = await supabase.from("it_employee_photos").insert({
    employee_id: employee.id,
    storage_path: path,
    file_name: fileName,
  });
  if (dbError) {
    // Don't leave a file in storage that no row points to.
    await supabase.storage.from(BUCKET).remove([path]);
    throw dbError;
  }
}

function setProgress(done, total) {
  progressBar.style.width = total ? `${Math.round((done / total) * 100)}%` : "0%";
  progressText.textContent = `${done} din ${total} poze procesate`;
}

async function runImport() {
  if (running) return;
  running = true;
  errorsWrap.classList.add("hidden");
  errorsList.innerHTML = "";
  progressWrap.classList.remove("hidden");

  const compress = compressCheckbox.checked;
  const active = rows.filter((r) => r.choice !== SKIP);
  const total = active.reduce((sum, r) => sum + r.entries.length, 0);
  const failures = [];
  let processed = 0;
  let uploaded = 0;
  let alreadyThere = 0;

  for (const row of active) {
    row.done = 0;
    row.skipped = 0;
    row.failed = 0;
    row.state = "pending";
  }
  setProgress(0, total);
  render();

  try {
    for (const row of active) {
      row.state = "working";
      render();

      let employee;
      let existing;
      try {
        employee = await ensureEmployee(row);
        if (!employee) throw new Error("Angajatul ales nu mai există.");
        existing = await existingFileNames(employee.id);
      } catch (err) {
        row.state = "error";
        row.failed = row.entries.length;
        processed += row.entries.length;
        failures.push(`${row.folderName}: ${friendlyError(err)}`);
        setProgress(processed, total);
        render();
        continue;
      }

      const regionSlug = regionById(employee.region_id)?.slug || "fara-regiune";
      const queue = [];
      for (const entry of row.entries) {
        if (existing.has(entry.fileName)) {
          row.skipped++;
          alreadyThere++;
          processed++;
        } else {
          existing.add(entry.fileName);
          queue.push(entry);
        }
      }
      setProgress(processed, total);

      const worker = async () => {
        while (queue.length > 0) {
          const entry = queue.shift();
          try {
            await uploadOne(entry, employee, regionSlug, compress);
            row.done++;
            uploaded++;
          } catch (err) {
            row.failed++;
            failures.push(`${row.folderName} / ${entry.fileName}: ${friendlyError(err)}`);
          }
          processed++;
          setProgress(processed, total);
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));

      row.state = row.failed ? "error" : "done";
      render();
    }
  } finally {
    running = false;
    render();
  }

  if (failures.length > 0) {
    errorsWrap.classList.remove("hidden");
    for (const message of failures) errorsList.appendChild(el("li", { text: message }));
  }

  const summary = [`${uploaded} ${uploaded === 1 ? "poză încărcată" : "poze încărcate"}`];
  if (alreadyThere) summary.push(`${alreadyThere} existau deja`);
  if (failures.length) summary.push(`${failures.length} cu eroare`);
  progressText.textContent = summary.join(" · ");
  showToast(summary.join(" · "), { error: failures.length > 0 });
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

folderInput.addEventListener("change", async () => {
  if (folderInput.files.length === 0) return;
  await addEntries(entriesFromFolder(folderInput.files), "folderul");
  folderInput.value = "";
});

zipInput.addEventListener("change", async () => {
  const files = [...zipInput.files];
  if (files.length === 0) return;
  for (const file of files) {
    sourceStatus.textContent = `Se citește ${file.name}…`;
    try {
      await addEntries(await entriesFromZip(file), file.name);
    } catch (err) {
      console.error(err);
      showToast(`Nu am putut citi "${file.name}".`, { error: true });
    }
  }
  zipInput.value = "";
});

resetBtn.addEventListener("click", () => {
  if (running) return;
  entries = [];
  rows = [];
  progressWrap.classList.add("hidden");
  errorsWrap.classList.add("hidden");
  render();
});

startBtn.addEventListener("click", runImport);

window.addEventListener("beforeunload", (e) => {
  if (running) e.preventDefault();
});
