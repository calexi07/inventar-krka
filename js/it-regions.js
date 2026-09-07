import { supabase } from "./supabase-client.js";
import { el, showToast, slugify, friendlyError } from "./ui-utils.js";

const grid = document.getElementById("regions-grid");
const addBtn = document.getElementById("add-region-btn");

async function loadRegions() {
  const { data: regions, error } = await supabase
    .from("it_regions")
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
  const { data: existing } = await supabase.from("it_regions").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const nextOrder = existing?.[0]?.sort_order ? existing[0].sort_order + 1 : 1;

  const { error } = await supabase.from("it_regions").insert({ name: name.trim(), slug, sort_order: nextOrder });
  if (error) {
    showToast(friendlyError(error), { error: true });
    return;
  }
  showToast(`Regiunea "${name.trim()}" a fost adăugată.`);
  loadRegions();
});

loadRegions();
