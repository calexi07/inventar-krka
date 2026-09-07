import { supabase } from "./supabase-client.js";
import { el, showToast, friendlyError } from "./ui-utils.js";

const params = new URLSearchParams(location.search);
const vehicleId = params.get("id");
const regionSlug = params.get("region");

const titleEl = document.getElementById("vehicle-title");
const crumbRegion = document.getElementById("crumb-region");
const crumbVehicle = document.getElementById("crumb-vehicle");
const grid = document.getElementById("photos-grid");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const cameraInput = document.getElementById("camera-input");
const verifiedCheckbox = document.getElementById("verified-checkbox");
const notesField = document.getElementById("notes-field");
const saveNotesBtn = document.getElementById("save-notes-btn");
const notesStatus = document.getElementById("notes-status");
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxClose = document.getElementById("lightbox-close");

const SIGNED_URL_TTL = 60 * 60; // 1 hour

let vehicle = null;

async function init() {
  if (!vehicleId) {
    titleEl.textContent = "Mașină negăsită";
    return;
  }

  const { data: veh, error } = await supabase
    .from("auto_vehicles")
    .select("id, vehicle_number, region_id, verified, notes, regions(name, slug)")
    .eq("id", vehicleId)
    .single();

  if (error || !veh) {
    titleEl.textContent = "Mașină negăsită";
    grid.innerHTML = "";
    grid.appendChild(el("div", { class: "empty-state col-span-full", text: "Această mașină nu există." }));
    return;
  }

  vehicle = veh;
  titleEl.textContent = veh.vehicle_number;
  crumbVehicle.textContent = veh.vehicle_number;
  document.title = `Auto — ${veh.vehicle_number}`;

  const slug = veh.regions?.slug || regionSlug;
  crumbRegion.textContent = veh.regions?.name || "Regiune";
  crumbRegion.href = `region.html?region=${encodeURIComponent(slug)}`;

  verifiedCheckbox.checked = !!veh.verified;
  notesField.value = veh.notes || "";

  await loadPhotos();
}

async function toggleVerified() {
  const nextValue = verifiedCheckbox.checked;
  const { error } = await supabase
    .from("auto_vehicles")
    .update({ verified: nextValue, verified_at: nextValue ? new Date().toISOString() : null })
    .eq("id", vehicleId);

  if (error) {
    verifiedCheckbox.checked = !nextValue;
    showToast(friendlyError(error), { error: true });
    return;
  }

  vehicle.verified = nextValue;
  showToast(nextValue ? "Marcat ca verificat." : "Marcat ca neverificat.");
}

async function saveNotes() {
  saveNotesBtn.disabled = true;
  notesStatus.textContent = "Se salvează…";

  const { error } = await supabase
    .from("auto_vehicles")
    .update({ notes: notesField.value })
    .eq("id", vehicleId);

  saveNotesBtn.disabled = false;

  if (error) {
    notesStatus.textContent = "";
    showToast(friendlyError(error), { error: true });
    return;
  }

  notesStatus.textContent = "Salvat.";
  setTimeout(() => { notesStatus.textContent = ""; }, 2000);
}

async function loadPhotos() {
  const { data: photos, error } = await supabase
    .from("auto_vehicle_photos")
    .select("id, storage_path, file_name, uploaded_at")
    .eq("vehicle_id", vehicleId)
    .order("uploaded_at", { ascending: false });

  grid.innerHTML = "";

  if (error) {
    grid.appendChild(el("div", { class: "empty-state col-span-full", text: friendlyError(error) }));
    return;
  }

  if (!photos || photos.length === 0) {
    grid.appendChild(
      el("div", { class: "empty-state col-span-full" }, [
        el("p", { class: "font-medium mb-1", text: "Nicio poză încă" }),
        el("p", { class: "text-sm", text: "Încarcă prima poză mai sus." }),
      ])
    );
    return;
  }

  const paths = photos.map((p) => p.storage_path);
  const { data: signed, error: signError } = await supabase.storage
    .from("auto-photos")
    .createSignedUrls(paths, SIGNED_URL_TTL);

  if (signError) {
    grid.appendChild(el("div", { class: "empty-state col-span-full", text: friendlyError(signError) }));
    return;
  }

  const urlByPath = {};
  for (const s of signed || []) {
    if (s.signedUrl) urlByPath[s.path] = s.signedUrl;
  }

  for (const photo of photos) {
    const url = urlByPath[photo.storage_path];
    const tile = el("div", { class: "photo-tile group" }, [
      url
        ? el("img", {
            src: url,
            alt: photo.file_name,
            loading: "lazy",
            class: "cursor-zoom-in",
            onClick: () => openLightbox(url, photo.file_name),
          })
        : null,
      el(
        "button",
        {
          class: "btn-danger-ghost absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity",
          onClick: (e) => { e.stopPropagation(); deletePhoto(photo); },
          "aria-label": "Șterge poza",
        },
        "Șterge"
      ),
    ]);
    grid.appendChild(tile);
  }
}

function openLightbox(url, altText) {
  lightboxImg.src = url;
  lightboxImg.alt = altText || "";
  lightbox.classList.remove("hidden");
  lightbox.classList.add("flex");
}

function closeLightbox() {
  lightbox.classList.add("hidden");
  lightbox.classList.remove("flex");
  lightboxImg.src = "";
}

lightboxClose.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLightbox();
});

async function deletePhoto(photo) {
  if (!confirm("Ștergi această poză? Nu poate fi anulat.")) return;

  const { error: storageError } = await supabase.storage.from("auto-photos").remove([photo.storage_path]);
  if (storageError) {
    showToast(friendlyError(storageError), { error: true });
    return;
  }

  const { error: dbError } = await supabase.from("auto_vehicle_photos").delete().eq("id", photo.id);
  if (dbError) {
    showToast(friendlyError(dbError), { error: true });
    return;
  }

  showToast("Poza a fost ștearsă.");
  loadPhotos();
}

async function uploadFiles(files) {
  if (!vehicle || !files || files.length === 0) return;

  const imageFiles = [...files].filter((f) => f.type.startsWith("image/"));
  if (imageFiles.length === 0) {
    showToast("Te rog alege fișiere imagine.", { error: true });
    return;
  }

  showToast(`Se încarcă ${imageFiles.length} ${imageFiles.length === 1 ? "poză" : "poze"}...`);

  let successCount = 0;
  for (const file of imageFiles) {
    const ext = file.name.split(".").pop();
    const safeName = `${crypto.randomUUID()}.${ext}`;
    const path = `${vehicle.regions?.slug || regionSlug}/${vehicle.id}/${safeName}`;

    const { error: uploadError } = await supabase.storage.from("auto-photos").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (uploadError) {
      showToast(`Eroare la "${file.name}": ${friendlyError(uploadError)}`, { error: true });
      continue;
    }

    const { error: dbError } = await supabase.from("auto_vehicle_photos").insert({
      vehicle_id: vehicle.id,
      storage_path: path,
      file_name: file.name,
    });

    if (dbError) {
      showToast(`Eroare la salvarea "${file.name}": ${friendlyError(dbError)}`, { error: true });
      continue;
    }

    successCount++;
  }

  if (successCount > 0) {
    showToast(`${successCount} ${successCount === 1 ? "poză încărcată" : "poze încărcate"}.`);
    loadPhotos();
  }
  fileInput.value = "";
  cameraInput.value = "";
}

fileInput.addEventListener("change", (e) => uploadFiles(e.target.files));
cameraInput.addEventListener("change", (e) => uploadFiles(e.target.files));

verifiedCheckbox.addEventListener("change", toggleVerified);
saveNotesBtn.addEventListener("click", saveNotes);

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragging");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragging"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragging");
  uploadFiles(e.dataTransfer.files);
});

init();
