let pets = JSON.parse(localStorage.getItem("pets")) || [];
let events = JSON.parse(localStorage.getItem("events")) || [];
let currentMonthView = new Date().getMonth();
let currentYearView = new Date().getFullYear();
let weightChartInstance = null;
let editingPetPhoto = "";

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

function todayISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
}

function saveState() {
    localStorage.setItem("pets", JSON.stringify(pets));
    localStorage.setItem("events", JSON.stringify(events));
}

function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function defaultAvatar(name = "🐾") {
    const letter = (name && name.trim()[0]) ? name.trim()[0].toUpperCase() : "🐾";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="100%" height="100%" rx="24" fill="#eaf2ff"/><circle cx="400" cy="210" r="110" fill="#c9dbff"/><text x="50%" y="56%" text-anchor="middle" font-family="Arial" font-size="90" fill="#3559a5">${letter}</text></svg>`;
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

function parseDate(iso) { return new Date(iso + "T00:00:00"); }
function formatDate(iso) { return parseDate(iso).toLocaleDateString("ru-RU"); }

function calculateAgeYears(birthDate) {
    if (!birthDate) return 0;
    const birth = parseDate(birthDate), now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
    return Math.max(0, age);
}

function petByIndex(index) { return pets[index]; }
function currentPetIndex() {
    const v = localStorage.getItem("currentPet");
    return v === null ? null : Number(v);
}

function eventTypeLabel(type) {
    const labels = { vaccine: "Вакцина", birthday: "День рождения", vet: "Ветеринар", walk: "Прогулка", medicine: "Лекарства", other: "Другое" };
    return labels[type] || "Событие";
}

function getSortedWeights(pet) {
    const list = Array.isArray(pet.weights) ? [...pet.weights] : [];
    return list.sort((a, b) => a.date.localeCompare(b.date));
}
function getSortedEvents() { return [...events].sort((a, b) => a.date.localeCompare(b.date)); }

// ===== ДНИ РОЖДЕНИЯ ПИТОМЦЕВ =====

function getNextBirthdayInfo(pet) {
    if (!pet.birthDate) return null;
    const today = new Date(todayISO() + "T00:00:00");
    const birth = new Date(pet.birthDate + "T00:00:00");
    let next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
    if (next < today) next.setFullYear(today.getFullYear() + 1);
    const diffDays = Math.ceil((next - today) / (1000 * 60 * 60 * 24));
    return { date: next.toISOString().slice(0, 10), daysLeft: diffDays, petName: pet.name };
}

function getMergedUpcoming() {
    const today = todayISO(), result = [];
    // Ручные события
    events.forEach((e, idx) => {
        if (e.date >= today) {
            const daysLeft = Math.ceil((new Date(e.date + "T00:00:00") - new Date(today + "T00:00:00")) / (1000 * 60 * 60 * 24));
            result.push({ ...e, index: idx, daysLeft, isAuto: false });
        }
    });
    // Авто-ДР питомцев
    pets.forEach(pet => {
        const info = getNextBirthdayInfo(pet);
        if (info && info.daysLeft >= 0 && info.daysLeft <= 365) {
            result.push({ date: info.date, type: "birthday", title: `🎂 ДР ${pet.name}`, daysLeft: info.daysLeft, isAuto: true, petName: pet.name });
        }
    });
    return result.sort((a, b) => a.date.localeCompare(b.date));
}

// ===== ПИТОМЦЫ =====

function renderPets() {
    const grid = document.getElementById("petsGrid");
    if (!grid) return;
    if (!pets.length) { grid.innerHTML = `<div class="empty-state">Питомцев пока нет. Добавь первого.</div>`; return; }
    grid.innerHTML = pets.map((pet, index) => {
        const latestWeight = Array.isArray(pet.weights) && pet.weights.length ? pet.weights[pet.weights.length - 1] : null;
        return `<article class="pet-card" onclick="openProfile(${index})"><img class="pet-photo" src="${pet.photo || defaultAvatar(pet.name)}" alt="${escapeHtml(pet.name)}"><div class="pet-body"><h3 class="pet-name">${escapeHtml(pet.name)}</h3><div class="pet-meta"><div>Вид: ${escapeHtml(pet.species || "—")}</div><div>Пол: ${escapeHtml(pet.gender || "—")}</div><div>Возраст: ${calculateAgeYears(pet.birthDate)} лет</div><div>Содержание: ${escapeHtml(pet.housing || "—")}</div><div>${latestWeight ? `Последний вес: ${Number(latestWeight.value).toFixed(1)} кг` : "Вес пока не добавлен"}</div></div><div class="pet-actions"><button class="btn" onclick="event.stopPropagation(); editPet(${index})">Редактировать</button><button class="btn btn-danger" onclick="event.stopPropagation(); deletePet(${index})">Удалить</button></div></div></article>`;
    }).join("");
}

function openPetModal(index = null) {
    const modal = document.getElementById("petModal"); if (!modal) return;
    const title = document.getElementById("petModalTitle"), petIndex = document.getElementById("petIndex"), petName = document.getElementById("petName"), petSpecies = document.getElementById("petSpecies"), petGender = document.getElementById("petGender"), petBirthDate = document.getElementById("petBirthDate"), petHousing = document.getElementById("petHousing"), petPhotoPreview = document.getElementById("petPhotoPreview"), petPhoto = document.getElementById("petPhoto");
    petPhoto.value = "";
    if (index === null) {
        editingPetPhoto = ""; petIndex.value = ""; petName.value = ""; petSpecies.value = ""; petGender.value = ""; petBirthDate.value = ""; petHousing.value = "";
        petPhotoPreview.src = defaultAvatar("Питомец"); title.textContent = "Добавить питомца";
    } else {
        const pet = pets[index]; editingPetPhoto = pet.photo || "";
        petIndex.value = String(index); petName.value = pet.name || ""; petSpecies.value = pet.species || ""; petGender.value = pet.gender || ""; petBirthDate.value = pet.birthDate || ""; petHousing.value = pet.housing || "";
        petPhotoPreview.src = pet.photo || defaultAvatar(pet.name); title.textContent = "Редактировать питомца";
    }
    modal.style.display = "flex";
}
function closePetModal() { const m = document.getElementById("petModal"); if (m) m.style.display = "none"; }

async function savePet() {
    const petIndex = document.getElementById("petIndex"), petName = document.getElementById("petName"), petSpecies = document.getElementById("petSpecies"), petGender = document.getElementById("petGender"), petBirthDate = document.getElementById("petBirthDate"), petHousing = document.getElementById("petHousing"), petPhoto = document.getElementById("petPhoto");
    const name = petName.value.trim(), species = petSpecies.value.trim(), gender = petGender.value, birthDate = petBirthDate.value, housing = petHousing.value;
    if (!name || !species || !gender || !birthDate || !housing) { alert("Заполни все поля питомца."); return; }
    if (birthDate > todayISO()) { alert("Дата рождения не может быть в будущем."); return; }
    let photo = editingPetPhoto || defaultAvatar(name);
    if (petPhoto.files && petPhoto.files[0]) photo = await fileToDataUrl(petPhoto.files[0]);
    const data = { name, species, gender, birthDate, housing, photo, weights: [] };
    const index = petIndex.value === "" ? null : Number(petIndex.value);
    if (index === null) pets.push({ id: Date.now(), ...data });
    else { const ex = pets[index]; pets[index] = { ...ex, ...data, weights: ex.weights || [] }; }
    saveState(); closePetModal(); editingPetPhoto = "";
    renderPets(); renderProfile(); renderUpcomingEvents();
}
function editPet(index) { openPetModal(index); }
function deletePet(index) {
    const pet = pets[index]; if (!confirm(`Удалить питомца "${pet.name}"?`)) return;
    pets.splice(index, 1); saveState(); renderPets(); renderUpcomingEvents();
    const cur = currentPetIndex();
    if (cur === index) { localStorage.removeItem("currentPet"); window.location.href = "pets.html"; }
    else if (cur !== null && cur > index) localStorage.setItem("currentPet", String(cur - 1));
    renderProfile();
}

// ===== ПРОФИЛЬ =====

function openProfile(index) { localStorage.setItem("currentPet", String(index)); window.location.href = "profile.html"; }

function renderProfile() {
    const container = document.getElementById("profileCard"); if (!container) return;
    const index = currentPetIndex(), pet = index !== null ? petByIndex(index) : null;
    if (!pet) { container.innerHTML = `<section class="panel"><div class="empty-state">Питомец не выбран. Открой страницу "Питомцы" и нажми на карточку.</div></section>`; return; }
    const sortedWeights = getSortedWeights(pet), latestWeight = sortedWeights.length ? sortedWeights[sortedWeights.length - 1] : null;
    container.innerHTML = `<section class="pet-summary"><div class="summary-card"><img src="${pet.photo || defaultAvatar(pet.name)}" alt="${escapeHtml(pet.name)}"></div><div class="summary-card summary-info"><h2>${escapeHtml(pet.name)}</h2><div class="summary-meta"><div><b>Вид:</b> ${escapeHtml(pet.species || "—")}</div><div><b>Пол:</b> ${escapeHtml(pet.gender || "—")}</div><div><b>Возраст:</b> ${calculateAgeYears(pet.birthDate)} лет</div><div><b>Дата рождения:</b> ${pet.birthDate ? formatDate(pet.birthDate) : "—"}</div><div><b>Содержание:</b> ${escapeHtml(pet.housing || "—")}</div><div><b>Последний вес:</b> ${latestWeight ? `${Number(latestWeight.value).toFixed(1)} кг (${formatDate(latestWeight.date)})` : "ещё нет"}</div></div><div class="pet-actions"><button class="btn" onclick="editCurrentPet()">Редактировать</button><button class="btn btn-danger" onclick="deleteCurrentPet()">Удалить</button></div></div></section>`;
    renderWeightList(); drawWeightChart();
}
function editCurrentPet() { const i = currentPetIndex(); if (i !== null) openPetModal(i); }
function deleteCurrentPet() { const i = currentPetIndex(); if (i !== null) deletePet(i); }

// ===== ВЕС =====

function openWeightModal(index = null) {
    const modal = document.getElementById("weightModal"); if (!modal) return;
    const title = document.getElementById("weightModalTitle"), weightIndex = document.getElementById("weightIndex"), weightDate = document.getElementById("weightDate"), weightValue = document.getElementById("weightValue");
    const petIndex = currentPetIndex(); if (petIndex === null || !pets[petIndex]) { alert("Сначала открой профиль питомца."); return; }
    if (index === null) { weightIndex.value = ""; weightDate.value = todayISO(); weightValue.value = ""; title.textContent = "Добавить вес"; }
    else { const r = pets[petIndex].weights[index]; weightIndex.value = String(index); weightDate.value = r.date; weightValue.value = r.value; title.textContent = "Редактировать вес"; }
    modal.style.display = "flex";
}
function closeWeightModal() { const m = document.getElementById("weightModal"); if (m) m.style.display = "none"; }

function saveWeight() {
    const petIndex = currentPetIndex(); if (petIndex === null || !pets[petIndex]) return;
    const weightIndex = document.getElementById("weightIndex"), weightDate = document.getElementById("weightDate"), weightValue = document.getElementById("weightValue");
    const date = weightDate.value, value = parseFloat(weightValue.value);
    if (!date) { alert("Выбери дату."); return; }
    if (isNaN(value) || value <= 0) { alert("Вес должен быть числом больше 0."); return; }
    const pet = pets[petIndex]; pet.weights = Array.isArray(pet.weights) ? pet.weights : [];
    const record = { id: Date.now() + Math.random(), date, value: Number(value.toFixed(1)) };
    const index = weightIndex.value === "" ? null : Number(weightIndex.value);
    if (index === null) pet.weights.push(record); else pet.weights[index] = { ...pet.weights[index], date, value: Number(value.toFixed(1)) };
    saveState(); closeWeightModal(); renderProfile(); renderPets();
}
function editWeight(index) { openWeightModal(index); }
function deleteWeight(index) {
    const petIndex = currentPetIndex(); if (petIndex === null || !pets[petIndex]) return;
    if (!confirm("Удалить запись веса?")) return;
    pets[petIndex].weights.splice(index, 1); saveState(); renderWeightList(); drawWeightChart(); renderProfile(); renderPets();
}

function renderWeightList() {
    const list = document.getElementById("weightList"); if (!list) return;
    const petIndex = currentPetIndex(); if (petIndex === null || !pets[petIndex]) { list.innerHTML = ""; return; }
    const pet = pets[petIndex], weights = Array.isArray(pet.weights) ? pet.weights : [];
    if (!weights.length) { list.innerHTML = `<li class="empty-state">История веса пока пустая.</li>`; return; }
    list.innerHTML = weights.map((w, idx) => `<li class="record-item"><div><div><b>${formatDate(w.date)}</b></div><div class="small">${Number(w.value).toFixed(1)} кг</div></div><div class="record-actions"><button class="btn btn-light" onclick="editWeight(${idx})">Редактировать</button><button class="btn btn-danger" onclick="deleteWeight(${idx})">Удалить</button></div></li>`).join("");
}

function drawWeightChart() {
    const canvas = document.getElementById("weightChart"); if (!canvas || typeof Chart === "undefined") return;
    const petIndex = currentPetIndex(); if (petIndex === null || !pets[petIndex]) return;
    const pet = pets[petIndex], weights = getSortedWeights(pet);
    if (!weights.length) { if (weightChartInstance) { weightChartInstance.destroy(); weightChartInstance = null; } return; }
    const labels = weights.map(w => formatDate(w.date)), data = weights.map(w => Number(w.value));
    if (weightChartInstance) weightChartInstance.destroy();
    weightChartInstance = new Chart(canvas, { type: "line", data: { labels, datasets: [{ label: "Вес (кг)", data, borderWidth: 2, tension: 0.35, fill: false }] }, options: { responsive: true, plugins: { legend: { display: true } }, scales: { y: { beginAtZero: false } } } });
}

// ===== СОБЫТИЯ / КАЛЕНДАРЬ =====

function openEventModal(date = todayISO(), index = null) {
    const modal = document.getElementById("eventModal"); if (!modal) return;
    const title = document.getElementById("eventModalTitle"), eventIndex = document.getElementById("eventIndex"), eventDate = document.getElementById("eventDate"), eventType = document.getElementById("eventType"), eventTitle = document.getElementById("eventTitle");
    if (index === null) { eventIndex.value = ""; eventDate.value = date; eventType.value = "vaccine"; eventTitle.value = ""; title.textContent = "Добавить событие"; }
    else { const item = events[index]; eventIndex.value = String(index); eventDate.value = item.date; eventType.value = item.type; eventTitle.value = item.title; title.textContent = "Редактировать событие"; }
    modal.style.display = "flex";
}
function closeEventModal() { const m = document.getElementById("eventModal"); if (m) m.style.display = "none"; }

function saveEvent() {
    const eventIndex = document.getElementById("eventIndex"), eventDate = document.getElementById("eventDate"), eventType = document.getElementById("eventType"), eventTitle = document.getElementById("eventTitle");
    const date = eventDate.value, type = eventType.value, title = eventTitle.value.trim();
    if (!date) { alert("Выбери дату."); return; }
    if (!title) { alert("Напиши описание события."); return; }
    const item = { id: Date.now() + Math.random(), date, type, title };
    const index = eventIndex.value === "" ? null : Number(eventIndex.value);
    if (index === null) events.push(item); else events[index] = { ...events[index], date, type, title };
    saveState(); closeEventModal(); renderCalendar(); renderEventList(); renderUpcomingEvents();
}
function editEvent(index) { openEventModal(events[index].date, index); }
function deleteEvent(index) { if (!confirm("Удалить событие?")) return; events.splice(index, 1); saveState(); renderCalendar(); renderEventList(); renderUpcomingEvents(); }

function renderUpcomingEvents() {
    const container = document.getElementById("upcomingEvents"); if (!container) return;
    const upcoming = getMergedUpcoming().slice(0, 5);
    if (!upcoming.length) { container.innerHTML = `<div class="empty-state">Пока нет ближайших событий.</div>`; return; }
    container.innerHTML = upcoming.map(ev => `<div class="event-card"><div class="event-main"><div class="event-title">${escapeHtml(eventTypeLabel(ev.type))}</div><div class="small">${formatDate(ev.date)} — ${escapeHtml(ev.title)}<span style="color:#22c55e;font-weight:600;margin-left:6px;">(через ${ev.daysLeft} дн.)</span></div></div>${!ev.isAuto ? `<div class="record-actions"><button class="btn btn-light" onclick="editEvent(${ev.index})">✏️</button><button class="btn btn-danger" onclick="deleteEvent(${ev.index})">🗑️</button></div>` : ''}</div>`).join("");
}

function renderCalendar() {
    const title = document.getElementById("calendarMonthTitle"), grid = document.getElementById("calendarGrid");
    if (!title || !grid) return;
    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    title.textContent = `${monthNames[currentMonthView]} ${currentYearView}`; grid.innerHTML = "";
    const firstDay = new Date(currentYearView, currentMonthView, 1).getDay(), mondayIndex = (firstDay + 6) % 7, daysInMonth = new Date(currentYearView, currentMonthView + 1, 0).getDate();
    for (let i = 0; i < mondayIndex; i++) { const e = document.createElement("div"); e.className = "calendar-day empty"; grid.appendChild(e); }
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${currentYearView}-${String(currentMonthView + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`, cell = document.createElement("div"); cell.className = "calendar-day";
        const dn = document.createElement("div"); dn.className = "day-number"; dn.textContent = String(day); cell.appendChild(dn);
        const dayEvents = events.filter(e => e.date === dateStr);
        dayEvents.slice(0, 2).forEach(ev => { const p = document.createElement("div"); p.className = `event-pill ${ev.type}`; p.textContent = ev.title; cell.appendChild(p); });
        const dayBirthdays = pets.filter(pet => { const info = getNextBirthdayInfo(pet); return info && info.date === dateStr; });
        dayBirthdays.forEach(pet => { const info = getNextBirthdayInfo(pet); const p = document.createElement("div"); p.className = "event-pill birthday"; p.textContent = `🎂 ${pet.name} (${info.daysLeft} дн.)`; cell.appendChild(p); });
        const total = dayEvents.length + dayBirthdays.length; if (total > 2) { const m = document.createElement("div"); m.className = "small"; m.textContent = `+${total - 2} ещё`; cell.appendChild(m); }
        cell.onclick = () => openEventModal(dateStr); grid.appendChild(cell);
    }
}
function prevMonth() { currentMonthView--; if (currentMonthView < 0) { currentMonthView = 11; currentYearView--; } renderCalendar(); }
function nextMonth() { currentMonthView++; if (currentMonthView > 11) { currentMonthView = 0; currentYearView++; } renderCalendar(); }

function renderEventList() {
    const container = document.getElementById("eventList"); if (!container) return;
    const sorted = getSortedEvents();
    if (!sorted.length) { container.innerHTML = `<div class="empty-state">Событий пока нет.</div>`; return; }
    container.innerHTML = sorted.map((ev, idx) => `<div class="event-card"><div class="event-main"><div class="event-title">${escapeHtml(eventTypeLabel(ev.type))}</div><div class="small">${formatDate(ev.date)} — ${escapeHtml(ev.title)}</div></div><div class="record-actions"><button class="btn btn-light" onclick="editEvent(${idx})">Редактировать</button><button class="btn btn-danger" onclick="deleteEvent(${idx})">Удалить</button></div></div>`).join("");
}

// ===== ИНИЦИАЛИЗАЦИЯ =====

function setDefaultDateInputs() {
    const wd = document.getElementById("weightDate"), ed = document.getElementById("eventDate");
    if (wd && !wd.value) wd.value = todayISO(); if (ed && !ed.value) ed.value = todayISO();
}

document.addEventListener("DOMContentLoaded", () => {
    const petPhoto = document.getElementById("petPhoto"), petPhotoPreview = document.getElementById("petPhotoPreview");
    if (petPhoto && petPhotoPreview) petPhoto.addEventListener("change", async () => { const f = petPhoto.files && petPhoto.files[0]; if (f) petPhotoPreview.src = await fileToDataUrl(f); });
    renderPets(); renderProfile(); renderWeightList(); renderUpcomingEvents(); renderCalendar(); renderEventList(); drawWeightChart(); setDefaultDateInputs();
});

// ===== ЭКСПОРТ ФУНКЦИЙ В GLOBAL SCOPE =====
window.openPetModal = openPetModal; window.closePetModal = closePetModal; window.savePet = savePet; window.editPet = editPet; window.deletePet = deletePet;
window.openProfile = openProfile; window.editCurrentPet = editCurrentPet; window.deleteCurrentPet = deleteCurrentPet;
window.openWeightModal = openWeightModal; window.closeWeightModal = closeWeightModal; window.saveWeight = saveWeight; window.editWeight = editWeight; window.deleteWeight = deleteWeight;
window.openEventModal = openEventModal; window.closeEventModal = closeEventModal; window.saveEvent = saveEvent; window.editEvent = editEvent; window.deleteEvent = deleteEvent;
window.prevMonth = prevMonth; window.nextMonth = nextMonth;
