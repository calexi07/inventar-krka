import { supabase } from "./supabase-client.js";
import { el, showToast, friendlyError } from "./ui-utils.js";

const params = new URLSearchParams(location.search);
const regionSlug = params.get("region");

const list = document.getElementById("employees-list");
const titleEl = document.getElementById("region-title");
const crumbEl = document.getElementById("crumb-region");
const addBtn = document.getElementById("add-employee-btn");
const progressEl = document.getElementById("verified-progress");

let currentRegion = null;

async function loadRegionAndEmployees() {
  if (!regionSlug) {
    list.innerHTML = "";
    list.appendChild(el("div", { class: "empty-state col-span-full", text: "Nicio regiune specificată." }));
    return;
  }

  const { data: region, error: regionError } = await supabase
    .from("it_regions")
    .select("id, name, slug")
    .eq("slug", regionSlug)
    .single();

  if (regionError || !region) {
    titleEl.textContent = "Regiune negăsită";
    list.innerHTML = "";
    list.appendChild(el("div", { class: "empty-state col-span-full", text: "Această regiune nu există." }));
    return;
  }

  currentRegion = region;
  titleEl.textContent = region.name;
  crumbEl.textContent = region.name;
  document.title = `IT — ${region.name}`;

  const { data: employees, error } = await supabase
    .from("it_employees")
    .select("id, full_name, verified")
    .eq("region_id", region.id)
    .order("full_name", { ascending: true });

  if (error) {
    list.innerHTML = "";
    progressEl.textContent = "";
    list.appendChild(el("div", { class: "empty-state col-span-full", text: friendlyError(error) }));
    return;
  }

  list.innerHTML = "";

  if (!employees || employees.length === 0) {
    progressEl.textContent = "";
    list.appendChild(
      el("div", { class: "empty-state col-span-full" }, [
        el("p", { class: "font-medium mb-1", text: "Niciun angajat încă" }),
        el("p", { class: "text-sm", text: "Adaugă primul angajat din această regiune." }),
      ])
    );
    return;
  }

  const verifiedCount = employees.filter((e) => e.verified).length;
  progressEl.textContent = `${verifiedCount}/${employees.length} verificați`;

  for (const emp of employees) {
    list.appendChild(
      el(
        "a",
        {
          href: `employee.html?id=${encodeURIComponent(emp.id)}&region=${encodeURIComponent(regionSlug)}`,
          class: "folder-card flex items-center justify-between !py-3",
        },
        [
          el("span", { class: "flex items-center gap-2" }, [
            el("span", {
              class: emp.verified
                ? "inline-block w-2 h-2 rounded-full bg-emerald-600"
                : "inline-block w-2 h-2 rounded-full bg-[var(--line)]",
              "aria-hidden": "true",
            }),
            el("span", { class: "font-medium", text: emp.full_name }),
          ]),
          el("span", { class: "text-[var(--ink-soft)] text-sm", text: "→" }),
        ]
      )
    );
  }
}

addBtn.addEventListener("click", async () => {
  if (!currentRegion) return;
  const name = prompt("Numele angajatului:");
  if (!name || !name.trim()) return;

  const { error } = await supabase
    .from("it_employees")
    .insert({ region_id: currentRegion.id, full_name: name.trim() });

  if (error) {
    showToast(friendlyError(error), { error: true });
    return;
  }
  showToast(`"${name.trim()}" a fost adăugat.`);
  loadRegionAndEmployees();
});

loadRegionAndEmployees();
