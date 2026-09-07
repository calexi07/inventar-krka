import { supabase } from "./supabase-client.js";
import { el, showToast, friendlyError } from "./ui-utils.js";

const params = new URLSearchParams(location.search);
const regionSlug = params.get("region");

const list = document.getElementById("vehicles-list");
const titleEl = document.getElementById("region-title");
const crumbEl = document.getElementById("crumb-region");
const addBtn = document.getElementById("add-vehicle-btn");
const progressEl = document.getElementById("verified-progress");

let currentRegion = null;

async function loadRegionAndVehicles() {
  if (!regionSlug) {
    list.innerHTML = "";
    list.appendChild(el("div", { class: "empty-state col-span-full", text: "Nicio regiune specificată." }));
    return;
  }

  const { data: region, error: regionError } = await supabase
    .from("regions")
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
  document.title = `Auto — ${region.name}`;

  const { data: vehicles, error } = await supabase
    .from("auto_vehicles")
    .select("id, vehicle_number, verified")
    .eq("region_id", region.id)
    .order("vehicle_number", { ascending: true });

  if (error) {
    list.innerHTML = "";
    progressEl.textContent = "";
    list.appendChild(el("div", { class: "empty-state col-span-full", text: friendlyError(error) }));
    return;
  }

  list.innerHTML = "";

  if (!vehicles || vehicles.length === 0) {
    progressEl.textContent = "";
    list.appendChild(
      el("div", { class: "empty-state col-span-full" }, [
        el("p", { class: "font-medium mb-1", text: "Nicio mașină încă" }),
        el("p", { class: "text-sm", text: "Adaugă prima mașină din această regiune." }),
      ])
    );
    return;
  }

  const verifiedCount = vehicles.filter((v) => v.verified).length;
  progressEl.textContent = `${verifiedCount}/${vehicles.length} verificate`;

  for (const vehicle of vehicles) {
    list.appendChild(
      el(
        "a",
        {
          href: `vehicle.html?id=${encodeURIComponent(vehicle.id)}&region=${encodeURIComponent(regionSlug)}`,
          class: "folder-card flex items-center justify-between !py-3",
        },
        [
          el("span", { class: "flex items-center gap-2" }, [
            el("span", {
              class: vehicle.verified
                ? "inline-block w-2 h-2 rounded-full bg-emerald-600"
                : "inline-block w-2 h-2 rounded-full bg-[var(--line)]",
              "aria-hidden": "true",
            }),
            el("span", { class: "font-medium", text: vehicle.vehicle_number }),
          ]),
          el("span", { class: "text-[var(--ink-soft)] text-sm", text: "→" }),
        ]
      )
    );
  }
}

addBtn.addEventListener("click", async () => {
  if (!currentRegion) return;
  const number = prompt("Numărul mașinii (ex: B-123-ABC):");
  if (!number || !number.trim()) return;

  const { error } = await supabase
    .from("auto_vehicles")
    .insert({ region_id: currentRegion.id, vehicle_number: number.trim() });

  if (error) {
    showToast(friendlyError(error), { error: true });
    return;
  }
  showToast(`"${number.trim()}" a fost adăugată.`);
  loadRegionAndVehicles();
});

loadRegionAndVehicles();
