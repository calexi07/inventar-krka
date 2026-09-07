import { supabase } from "./supabase-client.js";
import { el, showToast, slugify, friendlyError, downloadGroupsAsZip } from "./ui-utils.js";

const grid = document.getElementById("regions-grid");
const addBtn = document.getElementById("add-region-btn");
const downloadAllBtn = document.getElementById("download-all-zip-btn");

async function loadRegions() {
  const { data: regions, error } = await supabase
    .from("regions")
    .select("id, name, slug, sort_order")
    .order("sort_order", { ascending: true });

  if (error) {
    grid.innerHTML = "";
    grid.appendChild(
      el("div", { class: "empty-state col-span-full" }, "Nu am putut încărca regiunile. " + friendlyError(error))
    );
    return;
  }

  const { data: employees } = await supabase
    .from("it_employees")
    .select("region_id, verified");

  const statsByRegion = {};
  for (const row of employees || []) {
    if (!statsByRegion[row.region_id]) statsByRegion[row.region_id] = { total: 0, verified: 0 };
    statsByRegion[row.region_id].total++;
    if (row.verified) statsByRegion[row.region_id].verified++;
  }

  grid.innerHTML = "";

  if (!regions || regions.length === 0) {
    grid.appendChild(
      el("div", { class: "empty-state col-span-full" }, [
        el("p", { class: "font-medium mb-1", text: "Nicio regiune încă" }),
        el("p", { class: "text-sm", text: "Adaugă prima regiune ca să începi." }),
      ])
    );
    return;
  }

  for (const region of regions) {
    const stats = statsByRegion[region.id] || { total: 0, verified: 0 };
    const card = el(
      "a",
      { href: `region.html?region=${encodeURIComponent(region.slug)}`, class: "folder-card block" },
      [
        el("div", { class: "flex items-center justify-between mb-6" }, [
          el("span", { class: "chip", text: `${stats.total} ${stats.total === 1 ? "angajat" : "angajați"}` }),
          stats.total > 0
            ? el("span", { class: "text-xs text-[var(--ink-soft)]", text: `${stats.verified}/${stats.total} ✓` })
            : null,
        ]),
        el("h2", { class: "font-display text-xl font-semibold", text: region.name }),
      ]
    );
    grid.appendChild(card);
  }
}

addBtn.addEventListener("click", async () => {
  const name = prompt("Numele regiunii (ex: Vrancea):");
  if (!name || !name.trim()) return;

  const slug = slugify(name);
  const { data: existing } = await supabase.from("regions").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const nextOrder = existing?.[0]?.sort_order ? existing[0].sort_order + 1 : 1;

  const { error } = await supabase.from("regions").insert({ name: name.trim(), slug, sort_order: nextOrder });
  if (error) {
    showToast(friendlyError(error), { error: true });
    return;
  }
  showToast(`Regiunea "${name.trim()}" a fost adăugată.`);
  loadRegions();
});

downloadAllBtn.addEventListener("click", async () => {
  downloadAllBtn.disabled = true;
  const originalText = downloadAllBtn.textContent;
  downloadAllBtn.textContent = "Se pregătește arhiva…";

  try {
    const { data: regions, error: regionsError } = await supabase
      .from("regions")
      .select("id, name")
      .order("sort_order", { ascending: true });

    if (regionsError || !regions || regions.length === 0) {
      showToast("Nu există regiuni de descărcat.", { error: true });
      return;
    }

    const groups = [];
    for (const region of regions) {
      const { data: employees } = await supabase
        .from("it_employees")
        .select("id, full_name")
        .eq("region_id", region.id);

      for (const emp of employees || []) {
        const { data: photos } = await supabase
          .from("it_employee_photos")
          .select("storage_path, file_name")
          .eq("employee_id", emp.id);

        if (!photos || photos.length === 0) continue;

        const paths = photos.map((p) => p.storage_path);
        const { data: signed } = await supabase.storage.from("it-photos").createSignedUrls(paths, 300);
        if (!signed) continue;

        const urlByPath = {};
        for (const s of signed) if (s.signedUrl) urlByPath[s.path] = s.signedUrl;

        const files = photos
          .filter((p) => urlByPath[p.storage_path])
          .map((p, i) => ({ url: urlByPath[p.storage_path], fileName: p.file_name || `poza-${i + 1}.jpg` }));

        if (files.length > 0) groups.push({ folderName: `${region.name}/${emp.full_name}`, files });
      }
    }

    if (groups.length === 0) {
      showToast("Nicio poză de descărcat.", { error: true });
      return;
    }

    await downloadGroupsAsZip({
      zipFileName: "IT.zip",
      groups,
      onProgress: (done, total) => { downloadAllBtn.textContent = `Se descarcă ${done}/${total}…`; },
    });

    showToast("Arhiva a fost descărcată.");
  } catch (err) {
    showToast(friendlyError(err), { error: true });
  } finally {
    downloadAllBtn.disabled = false;
    downloadAllBtn.textContent = originalText;
  }
});

loadRegions();
