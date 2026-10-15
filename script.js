// ===== Глобальные объекты =====
let pets = JSON.parse(localStorage.getItem("pets")) || [];
let events = JSON.parse(localStorage.getItem("events")) || [];
let currentMonthView = new Date().getMonth();
let currentYearView = new Date().getFullYear();
let weightChartInstance = null;
let editingPetPhoto = "";

const BODY_TYPES = {
    "Собака": ["Лёгкое", "Среднее", "Крупное"],
    "Кошка": ["Лёгкое", "Среднее", "Крупное"]
};

// ===== Вспомогательные функции =====
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
        .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
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

// НОВОЕ: Правильное склонение слов (1 месяц, 2 месяца, 5 месяцев)
function pluralize(n, forms) {
    const abs = Math.abs(n) % 100;
    const n1 = abs % 10;
    if (abs > 10 && abs < 20) return forms[2];
    if (n1 > 1 && n1 < 5) return forms[1];
    if (n1 === 1) return forms[0];
    return forms[2];
}

// НОВОЕ: Умный расчёт возраста для котят и щенков
function getAgeString(birthDate) {
    if (!birthDate) return "—";
    const birth = parseDate(birthDate);
    const now = new Date();
    const diffTime = now - birth;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 7) return "менее недели";
    if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        return `${weeks} ${pluralize(weeks, ['неделя', 'недели', 'недель'])}`;
    }
    const diffMonths = Math.floor(diffDays / 30.44);
    if (diffMonths < 12) {
        return `${diffMonths} ${pluralize(diffMonths, ['месяц', 'месяца', 'месяцев'])}`;
    }
    const diffYears = Math.floor(diffMonths / 12);
    return `${diffYears} ${pluralize(diffYears, ['год', 'года', 'лет'])}`;
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
function toggleSpeciesFields() {
    const species = document.getElementById("petSpecies");
    const bodyType = document.getElementById("petBodyType");
    if (!species || !bodyType) return;
    const value = species.value;
    bodyType.innerHTML = '<option value="">Тип телосложения</option>';
    if (!BODY_TYPES[value]) return;
    BODY_TYPES[value].forEach(type => {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = type;
        bodyType.appendChild(option);
    });
}
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
    events.forEach((e, idx) => {
        if (e.date >= today) {
            const daysLeft = Math.ceil((new Date(e.date + "T00:00:00") - new Date(today + "T00:00:00")) / (1000 * 60 * 60 * 24));
            result.push({ ...e, index: idx, daysLeft, isAuto: false });
        }
    });
    pets.forEach(pet => {
        const info = getNextBirthdayInfo(pet);
        if (info && info.daysLeft >= 0 && info.daysLeft <= 365) {
            result.push({
                date: info.date, type: "birthday",
                title: `🎂 ДР ${pet.name}`, daysLeft: info.daysLeft,
                isAuto: true, petId: pets.indexOf(pet)
            });
        }
    });
    return result.sort((a, b) => a.date.localeCompare(b.date));
}

// ===== PETS =====
function renderPets() {
    const grid = document.getElementById("petsGrid");
    if (!grid) return;
    const compact = grid.dataset.compact === "true";

    if (!pets.length && !compact) {
        grid.innerHTML = `<div class="empty-state">Питомцев пока нет. Добавь первого.</div>`;
        return;
    }
    if (!pets.length && compact) {
        grid.innerHTML = renderAddPetCard();
        return;
    }

    let html = pets.map((pet, index) => {
        const latestWeight = Array.isArray(pet.weights) && pet.weights.length
            ? pet.weights[pet.weights.length - 1] : null;
        const weightStatus = latestWeight ? getWeightStatus(pet, latestWeight.value) : null;

        if (compact) {
            return `
            <article class="pet-card pet-card-compact" onclick="openProfile(${index})">
                <img class="pet-photo" src="${pet.photo || defaultAvatar(pet.name)}" alt="${escapeHtml(pet.name)}">
                <div class="pet-body">
                    <h3 class="pet-name">${escapeHtml(pet.name)}</h3>
                    <div class="pet-meta">
                        <div>${escapeHtml(pet.species || "—")}, ${getAgeString(pet.birthDate)}</div>
                        <div>${latestWeight ? `Вес: ${Number(latestWeight.value).toFixed(1)} кг` : "Вес не добавлен"}</div>
                    </div>
                    ${weightStatus ? `<div class="weight-status ${weightStatus.className}">${weightStatus.text}</div>` : ""}
                </div>
            </article>`;
        }

        const idealWeight = calculateIdealWeight(pet);
        return `
        <article class="pet-card" onclick="openProfile(${index})">
            <img class="pet-photo" src="${pet.photo || defaultAvatar(pet.name)}" alt="${escapeHtml(pet.name)}">
            <div class="pet-body">
                <h3 class="pet-name">${escapeHtml(pet.name)}</h3>
                <div class="pet-meta">
                    <div>Вид: ${escapeHtml(pet.species || "—")}</div>
                    <div>Пол: ${escapeHtml(pet.gender || "—")}</div>
                    <div>Возраст: ${getAgeString(pet.birthDate)}</div>
                    <div>Содержание: ${escapeHtml(pet.housing || "—")}</div>
                    <div>${latestWeight ? `Последний вес: ${Number(latestWeight.value).toFixed(1)} кг` : "Вес пока не добавлен"}</div>
                </div>
                ${weightStatus ? `<div class="weight-status ${weightStatus.className}">${weightStatus.text}</div>` : ""}
                ${idealWeight ? `
                <table class="weight-table">
                    <tr><th>Параметр</th><th>Значение</th></tr>
                    ${idealWeight.isPuppyKitten 
                        ? `<tr><td colspan="2" style="text-align:center; color:#22c55e; font-weight:600;">🐾 Питомец растёт! Вес оценивается индивидуально у ветеринара.</td></tr>` 
                        : `<tr><td>Идеальный вес</td><td>${idealWeight.min} – ${idealWeight.max} кг</td></tr>`}
                    <tr><td>Рост</td><td>${pet.height || "—"} см</td></tr>
                    <tr><td>BCS</td><td>${pet.bcs || "—"}</td></tr>
                </table>` : ""}
                <div class="pet-actions">
                    <button class="btn" onclick="event.stopPropagation(); editPet(${index})">Редактировать</button>
                    <button class="btn btn-danger" onclick="event.stopPropagation(); deletePet(${index})">Удалить</button>
                </div>
            </div>
        </article>`;
    }).join("");

    if (compact) html += renderAddPetCard();
    grid.innerHTML = html;
}

function renderAddPetCard() {
    return `
    <article class="pet-card pet-card-compact pet-card-add" onclick="openPetModal()">
        <div class="pet-card-add-inner">
            <div class="pet-card-add-icon">+</div>
            <div class="pet-card-add-text">Добавить питомца</div>
        </div>
    </article>`;
}

function openPetModal(index = null) {
    const modal = document.getElementById("petModal"); if (!modal) return;
    const title = document.getElementById("petModalTitle"),
          petIndex = document.getElementById("petIndex"),
          petName = document.getElementById("petName"),
          petSpecies = document.getElementById("petSpecies"),
          petGender = document.getElementById("petGender"),
          petBirthDate = document.getElementById("petBirthDate"),
          petHousing = document.getElementById("petHousing"),
          petPhotoPreview = document.getElementById("petPhotoPreview"),
          petPhoto = document.getElementById("petPhoto");
    petPhoto.value = "";
    if (index === null) {
        editingPetPhoto = "";
        petIndex.value = ""; petName.value = ""; petSpecies.value = "";
        petGender.value = ""; petBirthDate.value = ""; petHousing.value = "";
        petPhotoPreview.src = defaultAvatar("Питомец");
        title.textContent = "Добавить питомца";
    } else {
        const pet = pets[index];
        editingPetPhoto = pet.photo || "";
        petIndex.value = String(index);
        petName.value = pet.name || "";
        petSpecies.value = pet.species || "";
        petGender.value = pet.gender || "";
        petBirthDate.value = pet.birthDate || "";
        petHousing.value = pet.housing || "";
        setTimeout(() => {
            toggleSpeciesFields();
            document.getElementById("petBodyType").value = pet.bodyType || "";
            document.getElementById("petHeight").value = pet.height || "";
            document.getElementById("petBCS").value = pet.bcs || "";
        }, 0);
        petPhotoPreview.src = pet.photo || defaultAvatar(pet.name);
        title.textContent = "Редактировать питомца";
    }
    modal.style.display = "flex";
}
function closePetModal() {
    const m = document.getElementById("petModal");
    if (m) m.style.display = "none";
}
async function savePet() {
    const petIndex = document.getElementById("petIndex"),
          petName = document.getElementById("petName"),
          petSpecies = document.getElementById("petSpecies"),
          petGender = document.getElementById("petGender"),
          petBirthDate = document.getElementById("petBirthDate"),
          petHousing = document.getElementById("petHousing"),
          petPhoto = document.getElementById("petPhoto");
    const bodyType = document.getElementById("petBodyType")?.value || "";
    const height = parseFloat(document.getElementById("petHeight")?.value) || 0;
    const bcs = Number(document.getElementById("petBCS")?.value) || 0;
    const name = petName.value.trim();
    const species = petSpecies.value, gender = petGender.value;
    const birthDate = petBirthDate.value, housing = petHousing.value;

    if (!name || !species || !gender || !birthDate || !housing || !bodyType) {
        alert("Заполни все поля питомца."); return;
    }
    if (birthDate > todayISO()) { alert("Дата рождения не может быть в будущем."); return; }

    let photo = editingPetPhoto || defaultAvatar(name);
    if (petPhoto.files && petPhoto.files[0]) photo = await fileToDataUrl(petPhoto.files[0]);

    const data = { name, species, gender, birthDate, housing, photo, bodyType, height, bcs };
    const index = petIndex.value === "" ? null : Number(petIndex.value);
    if (index === null) pets.push({ id: Date.now(), ...data, weights: [] });
    else { const ex = pets[index]; pets[index] = { ...ex, ...data, weights: ex.weights || [] }; }

    saveState(); closePetModal(); editingPetPhoto = "";
    renderPets(); renderProfile(); renderUpcomingEvents();
}
function editPet(index) { openPetModal(index); }
function deletePet(index) {
    const pet = pets[index];
    if (!confirm(`Удалить питомца "${pet.name}"?`)) return;
    pets.splice(index, 1); saveState();
    renderPets(); renderUpcomingEvents();
    const cur = currentPetIndex();
    if (cur === index) { localStorage.removeItem("currentPet"); window.location.href = "pets.html"; }
    else if (cur !== null && cur > index) localStorage.setItem("currentPet", String(cur - 1));
    renderProfile();
}

// ===== ПРОФИЛЬ И ВЕС =====
function openProfile(index) {
    localStorage.setItem("currentPet", String(index));
    window.location.href = "profile.html";
}

// НОВОЕ: Безопасный расчёт веса (игнорирует формулы для животных младше 1 года)
function calculateIdealWeight(pet) {
    if (!pet.height || !pet.bodyType) return null;
    
    if (pet.birthDate) {
        const birth = parseDate(pet.birthDate);
        const now = new Date();
        const diffDays = Math.floor((now - birth) / (1000 * 60 * 60 * 24));
        if (diffDays < 365) {
            return { isPuppyKitten: true }; // Специальный флаг для растущих животных
        }
    }

    let min = 0, max = 0;
    if (pet.species === "Собака") {
        if (pet.bodyType === "Лёгкое") { min = pet.height * 0.15; max = pet.height * 0.35; }
        if (pet.bodyType === "Среднее") { min = pet.height * 0.15; max = pet.height * 0.3; }
        if (pet.bodyType === "Крупное") { min = pet.height * 0.15; max = pet.height * 0.5; }
    }
    if (pet.species === "Кошка") {
        min = 3; max = 6;
        if (pet.bodyType === "Крупное") { min = 5; max = 8; }
    }
    return { min: Number(min.toFixed(1)), max: Number(max.toFixed(1)), isPuppyKitten: false };
}

function getWeightStatus(pet, currentWeight) {
    const ideal = calculateIdealWeight(pet);
    if (!ideal || !currentWeight) return null;
    
    // НОВОЕ: Не пугать владельца, если питомец растёт
    if (ideal.isPuppyKitten) {
        return { 
            className: "weight-normal", 
            text: "🐾 Питомец растёт! Вес оценивается индивидуально у ветеринара." 
        };
    }
    
    if (currentWeight < ideal.min) return { className: "weight-low", text: `Недобор веса. Норма для взрослого: ${ideal.min}–${ideal.max} кг` };
    if (currentWeight > ideal.max) return { className: "weight-high", text: `Избыточный вес. Норма для взрослого: ${ideal.min}–${ideal.max} кг` };
    return { className: "weight-normal", text: `Вес в норме. Идеальный диапазон: ${ideal.min}–${ideal.max} кг` };
}

function renderProfile() {
    const container = document.getElementById("profileCard");
    if (!container) return;
    const index = currentPetIndex();
    const pet = index !== null ? petByIndex(index) : null;
    if (pet && !Array.isArray(pet.weights)) pet.weights = [];
    if (!pet) {
        container.innerHTML = `<section class="panel"><div class="empty-state">Питомец не выбран.</div></section>`;
        return;
    }
    const sortedWeights = getSortedWeights(pet);
    const latestWeight = sortedWeights.length ? sortedWeights[sortedWeights.length - 1] : null;
    const idealWeight = calculateIdealWeight(pet);
    const weightStatus = latestWeight ? getWeightStatus(pet, latestWeight.value) : null;

    container.innerHTML = `
    <section class="pet-summary">
        <div class="summary-card summary-photo-card">
            <img src="${pet.photo || defaultAvatar(pet.name)}" alt="${escapeHtml(pet.name)}">
        </div>
        <div class="summary-card summary-info">
            <h2>${escapeHtml(pet.name)}</h2>
            <div class="summary-meta">
                <div><b>Вид:</b> ${escapeHtml(pet.species || "—")}</div>
                <div><b>Пол:</b> ${escapeHtml(pet.gender || "—")}</div>
                <div><b>Возраст:</b> ${getAgeString(pet.birthDate)}</div>
                <div><b>Дата рождения:</b> ${pet.birthDate ? formatDate(pet.birthDate) : "—"}</div>
                <div><b>Содержание:</b> ${escapeHtml(pet.housing || "—")}</div>
                <div><b>Телосложение:</b> ${escapeHtml(pet.bodyType || "—")}</div>
                <div><b>Рост:</b> ${pet.height || "—"} см</div>
                <div><b>BCS:</b> ${pet.bcs || "—"}</div>
                <div><b>Последний вес:</b> ${latestWeight ? `${Number(latestWeight.value).toFixed(1)} кг` : "ещё нет"}</div>
            </div>
            ${weightStatus ? `<div class="weight-status ${weightStatus.className}">${weightStatus.text}</div>` : ""}
            ${idealWeight ? `
            <table class="weight-table">
                <tr><th>Параметр</th><th>Значение</th></tr>
                ${idealWeight.isPuppyKitten 
                    ? `<tr><td colspan="2" style="text-align:center; color:#22c55e; font-weight:600;">🐾 Питомец растёт! Вес оценивается индивидуально у ветеринара.</td></tr>` 
                    : `<tr><td>Идеальный вес</td><td>${idealWeight.min} – ${idealWeight.max} кг</td></tr>`}
                <tr><td>Рост</td><td>${pet.height || "—"} см</td></tr>
                <tr><td>BCS</td><td>${pet.bcs || "—"}</td></tr>
            </table>` : ""}
            <div class="pet-actions">
                <button class="btn" onclick="editCurrentPet()">Редактировать</button>
                <button class="btn btn-danger" onclick="deleteCurrentPet()">Удалить</button>
            </div>
        </div>
    </section>`;
    renderWeightList();
    drawWeightChart();
}
function editCurrentPet() { const i = currentPetIndex(); if (i !== null) openPetModal(i); }
function deleteCurrentPet() { const i = currentPetIndex(); if (i !== null) deletePet(i); }

function openWeightModal(index = null) {
    const modal = document.getElementById("weightModal"); if (!modal) return;
    const title = document.getElementById("weightModalTitle"),
          weightIndex = document.getElementById("weightIndex"),
          weightDate = document.getElementById("weightDate"),
          weightValue = document.getElementById("weightValue");
    const petIndex = currentPetIndex();
    if (petIndex === null || !pets[petIndex]) { alert("Сначала открой профиль питомца."); return; }
    if (index === null) {
        weightIndex.value = ""; weightDate.value = todayISO(); weightValue.value = "";
        title.textContent = "Добавить вес";
    } else {
        const r = pets[petIndex].weights[index];
        weightIndex.value = String(index); weightDate.value = r.date; weightValue.value = r.value;
        title.textContent = "Редактировать вес";
    }
    modal.style.display = "flex";
}
function closeWeightModal() {
    const m = document.getElementById("weightModal");
    if (m) m.style.display = "none";
}
function saveWeight() {
    const petIndex = currentPetIndex();
    if (petIndex === null || !pets[petIndex]) return;
    const weightIndex = document.getElementById("weightIndex"),
          weightDate = document.getElementById("weightDate"),
          weightValue = document.getElementById("weightValue");
    const date = weightDate.value, value = parseFloat(weightValue.value);
    if (!date) { alert("Выбери дату."); return; }
    if (isNaN(value) || value <= 0) { alert("Вес должен быть числом больше 0."); return; }
    const pet = pets[petIndex];
    pet.weights = Array.isArray(pet.weights) ? pet.weights : [];
    const record = { id: Date.now() + Math.random(), date, value: Number(value.toFixed(1)) };
    const index = weightIndex.value === "" ? null : Number(weightIndex.value);
    if (index === null) pet.weights.push(record);
    else pet.weights[index] = { ...pet.weights[index], date, value: Number(value.toFixed(1)) };
    saveState(); closeWeightModal();
    renderProfile(); renderPets();
}
function editWeight(index) { openWeightModal(index); }
function deleteWeight(index) {
    const petIndex = currentPetIndex();
    if (petIndex === null || !pets[petIndex]) return;
    if (!confirm("Удалить запись веса?")) return;
    pets[petIndex].weights.splice(index, 1);
    saveState(); renderWeightList(); drawWeightChart(); renderProfile(); renderPets();
}
function renderWeightList() {
    const list = document.getElementById("weightList"); if (!list) return;
    const petIndex = currentPetIndex();
    if (petIndex === null || !pets[petIndex]) { list.innerHTML = ""; return; }
    const pet = pets[petIndex], weights = Array.isArray(pet.weights) ? pet.weights : [];
    if (!weights.length) { list.innerHTML = `<li class="empty-state">История веса пока пустая.</li>`; return; }
    list.innerHTML = weights.map((w, idx) => `
        <li class="record-item">
            <div>
                <div><b>${formatDate(w.date)}</b></div>
                <div class="small">${Number(w.value).toFixed(1)} кг</div>
            </div>
            <div class="record-actions">
                <button class="btn btn-light" onclick="editWeight(${idx})">Редактировать</button>
                <button class="btn btn-danger" onclick="deleteWeight(${idx})">Удалить</button>
            </div>
        </li>`).join("");
}
function drawWeightChart() {
    const canvas = document.getElementById("weightChart");
    if (!canvas || typeof Chart === "undefined") return;
    const petIndex = currentPetIndex();
    if (petIndex === null || !pets[petIndex]) return;
    const pet = pets[petIndex], weights = getSortedWeights(pet);
    if (!weights.length) {
        if (weightChartInstance) { weightChartInstance.destroy(); weightChartInstance = null; }
        return;
    }
    const labels = weights.map(w => formatDate(w.date)), data = weights.map(w => Number(w.value));
    if (weightChartInstance) weightChartInstance.destroy();
    weightChartInstance = new Chart(canvas, {
        type: "line",
        data: { labels, datasets: [{ label: "Вес (кг)", data, borderWidth: 2, tension: 0.35, fill: false }] },
        options: { responsive: true, plugins: { legend: { display: true } }, scales: { y: { beginAtZero: false } } }
    });
}

// ===== КАЛЕНДАРЬ И СОБЫТИЯ =====
function updateEventPetSelect(selectedId = "") {
    const select = document.getElementById("eventPetId");
    if (!select) return;
    select.innerHTML = '<option value="">Для всех питомцев / Общее</option>';
    pets.forEach((pet, idx) => {
        const opt = document.createElement("option");
        opt.value = String(idx); opt.textContent = pet.name;
        if (String(idx) === selectedId) opt.selected = true;
        select.appendChild(opt);
    });
}
function openEventModal(date = todayISO(), index = null) {
    const modal = document.getElementById("eventModal"); if (!modal) return;
    const title = document.getElementById("eventModalTitle"),
          eventIndex = document.getElementById("eventIndex"),
          eventDate = document.getElementById("eventDate"),
          eventType = document.getElementById("eventType"),
          eventTitle = document.getElementById("eventTitle");
    if (index === null) {
        eventIndex.value = ""; eventDate.value = date;
        eventType.value = "vaccine"; eventTitle.value = "";
        updateEventPetSelect("");
        title.textContent = "Добавить событие";
    } else {
        const item = events[index];
        eventIndex.value = String(index); eventDate.value = item.date;
        eventType.value = item.type; eventTitle.value = item.title;
        updateEventPetSelect(item.petId !== undefined ? String(item.petId) : "");
        title.textContent = "Редактировать событие";
    }
    modal.style.display = "flex";
}
function closeEventModal() {
    const m = document.getElementById("eventModal");
    if (m) m.style.display = "none";
}
function saveEvent() {
    const eventIndex = document.getElementById("eventIndex"),
          eventDate = document.getElementById("eventDate"),
          eventType = document.getElementById("eventType"),
          eventTitle = document.getElementById("eventTitle"),
          eventPetId = document.getElementById("eventPetId");
    const date = eventDate.value, type = eventType.value, title = eventTitle.value.trim();
    const petId = eventPetId ? (eventPetId.value === "" ? null : Number(eventPetId.value)) : null;
    if (!date) { alert("Выбери дату."); return; }
    if (!title) { alert("Напиши описание события."); return; }
    const item = { id: Date.now() + Math.random(), date, type, title, petId };
    const index = eventIndex.value === "" ? null : Number(eventIndex.value);
    if (index === null) events.push(item);
    else events[index] = { ...events[index], date, type, title, petId };
    saveState(); closeEventModal();
    renderCalendar(); renderEventList(); renderUpcomingEvents();
}
function editEvent(index) { openEventModal(events[index].date, index); }
function deleteEvent(index) {
    if (!confirm("Удалить событие?")) return;
    events.splice(index, 1); saveState();
    renderCalendar(); renderEventList(); renderUpcomingEvents();
}
function renderUpcomingEvents() {
    const container = document.getElementById("upcomingEvents");
    if (!container) return;
    const upcoming = getMergedUpcoming().slice(0, 5);
    if (!upcoming.length) {
        container.innerHTML = `<div class="empty-state">Пока нет ближайших событий.</div>`;
        return;
    }
    container.innerHTML = upcoming.map(ev => {
        const petBadge = ev.petId !== undefined && pets[ev.petId]
            ? `<span style="background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:12px;font-size:12px;margin-left:6px;">${escapeHtml(pets[ev.petId].name)}</span>`
            : '';
        return `
        <div class="event-card">
            <div class="event-main">
                <div class="event-title">${escapeHtml(eventTypeLabel(ev.type))}</div>
                <div class="small">
                    ${formatDate(ev.date)} — ${escapeHtml(ev.title)} ${petBadge}
                    <span style="color:#22c55e;font-weight:600;margin-left:6px;">(через ${ev.daysLeft} дн.)</span>
                </div>
            </div>
            ${!ev.isAuto ? `
            <div class="record-actions">
                <button class="btn btn-light" onclick="editEvent(${ev.index})">✏️</button>
                <button class="btn btn-danger" onclick="deleteEvent(${ev.index})">🗑️</button>
            </div>` : ''}
        </div>`;
    }).join("");
}
function renderCalendar() {
    const title = document.getElementById("calendarMonthTitle"), grid = document.getElementById("calendarGrid");
    if (!title || !grid) return;
    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
                        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    title.textContent = `${monthNames[currentMonthView]} ${currentYearView}`;
    grid.innerHTML = "";
    const firstDay = new Date(currentYearView, currentMonthView, 1).getDay(),
          mondayIndex = (firstDay + 6) % 7,
          daysInMonth = new Date(currentYearView, currentMonthView + 1, 0).getDate();
    for (let i = 0; i < mondayIndex; i++) {
        const e = document.createElement("div");
        e.className = "calendar-day empty";
        grid.appendChild(e);
    }
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${currentYearView}-${String(currentMonthView + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
              cell = document.createElement("div");
        cell.className = "calendar-day";
        const dn = document.createElement("div");
        dn.className = "day-number";
        dn.textContent = String(day);
        cell.appendChild(dn);
        const dayEvents = events.filter(e => e.date === dateStr);
        dayEvents.slice(0, 2).forEach(ev => {
            const petName = ev.petId !== undefined && pets[ev.petId] ? ` (${pets[ev.petId].name})` : '';
            const p = document.createElement("div");
            p.className = `event-pill ${ev.type}`;
            p.textContent = ev.title + petName;
            cell.appendChild(p);
        });
        const dayBirthdays = pets.filter(pet => {
            const info = getNextBirthdayInfo(pet);
            return info && info.date === dateStr;
        });
        dayBirthdays.forEach(pet => {
            const info = getNextBirthdayInfo(pet);
            const p = document.createElement("div");
            p.className = "event-pill birthday";
            p.textContent = `🎂 ${pet.name} (${info.daysLeft} дн.)`;
            cell.appendChild(p);
        });
        const total = dayEvents.length + dayBirthdays.length;
        if (total > 2) {
            const m = document.createElement("div");
            m.className = "small";
            m.textContent = `+${total - 2} ещё`;
            cell.appendChild(m);
        }
        cell.onclick = () => openEventModal(dateStr);
        grid.appendChild(cell);
    }
}
function prevMonth() {
    currentMonthView--;
    if (currentMonthView < 0) { currentMonthView = 11; currentYearView--; }
    renderCalendar();
}
function nextMonth() {
    currentMonthView++;
    if (currentMonthView > 11) { currentMonthView = 0; currentYearView++; }
    renderCalendar();
}
function renderEventList() {
    const container = document.getElementById("eventList");
    if (!container) return;
    const sorted = getSortedEvents();
    if (!sorted.length) {
        container.innerHTML = `<div class="empty-state">Событий пока нет.</div>`;
        return;
    }
    container.innerHTML = sorted.map((ev, idx) => {
        const petName = ev.petId !== undefined && pets[ev.petId]
            ? `<span style="background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:12px;font-size:12px;margin-left:8px;">${escapeHtml(pets[ev.petId].name)}</span>`
            : '';
        return `
        <div class="event-card">
            <div class="event-main">
                <div class="event-title">${escapeHtml(eventTypeLabel(ev.type))}</div>
                <div class="small">${formatDate(ev.date)} — ${escapeHtml(ev.title)} ${petName}</div>
            </div>
            <div class="record-actions">
                <button class="btn btn-light" onclick="editEvent(${idx})">Редактировать</button>
                <button class="btn btn-danger" onclick="deleteEvent(${idx})">Удалить</button>
            </div>
        </div>`;
    }).join("");
}

// ===== ЭКСПОРТ / ИМПОРТ =====
function setDefaultDateInputs() {
    const wd = document.getElementById("weightDate"), ed = document.getElementById("eventDate");
    if (wd && !wd.value) wd.value = todayISO();
    if (ed && !ed.value) ed.value = todayISO();
}

// ===== ТУР (ПОДСКАЗКИ) =====
const TOUR_STEPS = {
    "index.html": [
        { selector: "[data-tour='hero']", title: "Добро пожаловать!", text: "Это главная страница Pet Tracker. Здесь ты видишь своих питомцев и ближайшие события." },
        { selector: "[data-tour='addPetBtn']", title: "Добавить питомца", text: "Нажми сюда, чтобы добавить своего первого питомца." },
        { selector: "[data-tour='petsGrid']", title: "Список питомцев", text: "Здесь появятся все твои питомцы. Кликни на карточку, чтобы открыть профиль." },
        { selector: "[data-tour='upcoming']", title: "Ближайшие события", text: "Здесь отображаются ближайшие события: вакцины, дни рождения, визиты к ветеринару." }
    ],
    "pets.html": [
        { selector: "[data-tour='hero']", title: "Управление питомцами", text: "На этой странице ты можешь добавлять, редактировать и удалять питомцев." },
        { selector: "[data-tour='addPetBtn']", title: "Добавить питомца", text: "Нажми, чтобы завести нового питомца." },
        { selector: "[data-tour='exportBtn']", title: "Экспорт данных", text: "Скачай все данные в JSON-файл, чтобы сохранить или перенести на другое устройство." },
        { selector: "[data-tour='importBtn']", title: "Импорт данных", text: "Загрузи ранее сохранённый JSON-файл, чтобы восстановить данные." },
        { selector: "[data-tour='petsGrid']", title: "Карточки питомцев", text: "Кликни на любую карточку, чтобы открыть подробный профиль." }
    ],
    "calendar.html": [
        { selector: "[data-tour='hero']", title: "Календарь событий", text: "Здесь ты видишь все запланированные события на месяц." },
        { selector: "[data-tour='addEventBtn']", title: "Добавить событие", text: "Добавь вакцинацию, визит к ветеринару, прогулку или другое событие." },
        { selector: "[data-tour='prevMonth']", title: "Навигация", text: "Переключайся между месяцами стрелками. Дни рождения питомцев добавляются автоматически." },
        { selector: "[data-tour='calendarGrid']", title: "Сетка календаря", text: "Кликни на любой день, чтобы быстро добавить событие на эту дату." },
        { selector: "[data-tour='eventList']", title: "Все события", text: "Полный список всех событий с возможностью редактирования." }
    ],
    "profile.html": [
        { selector: "[data-tour='profileCard']", title: "Профиль питомца", text: "Здесь вся информация о питомце: фото, возраст, вес и параметры." },
        { selector: "[data-tour='measurement']", title: "Как измерять", text: "Подсказки, как правильно измерять рост, BCS и определять тип телосложения." },
        { selector: "[data-tour='weightChart']", title: "График веса", text: "Наглядный график изменения веса питомца по времени." },
        { selector: "[data-tour='weightHistory']", title: "История веса", text: "Добавляй новые записи веса и отслеживай динамику. Система подскажет, в норме ли вес." }
    ]
};

let tourState = { active: false, steps: [], index: 0 };

function getCurrentPage() {
    const path = window.location.pathname;
    return path.split("/").pop() || "index.html";
}

function startTour() {
    const page = getCurrentPage();
    const allSteps = TOUR_STEPS[page] || [];
    tourState.steps = allSteps.filter(s => document.querySelector(s.selector));
    if (!tourState.steps.length) {
        alert("Подсказки для этой страницы пока не настроены.");
        return;
    }
    tourState.index = 0;
    tourState.active = true;
    showTourStep();
}

function showTourStep() {
    clearTourHighlight();
    if (tourState.index >= tourState.steps.length) {
        endTour();
        return;
    }
    const step = tourState.steps[tourState.index];
    const target = document.querySelector(step.selector);
    if (!target) { nextTourStep(); return; }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("tour-highlight");

    let tooltip = document.getElementById("tourTooltip");
    if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.id = "tourTooltip";
        tooltip.className = "tour-tooltip";
        document.body.appendChild(tooltip);
    }

    const isLast = tourState.index === tourState.steps.length - 1;
    tooltip.innerHTML = `
        <div class="tour-tooltip-head">
            <div class="tour-tooltip-title">${escapeHtml(step.title)}</div>
            <div class="tour-tooltip-counter">${tourState.index + 1} / ${tourState.steps.length}</div>
        </div>
        <div class="tour-tooltip-text">${escapeHtml(step.text)}</div>
        <div class="tour-tooltip-actions">
            <button class="btn btn-light" onclick="skipTour()">Пропустить</button>
            <button class="btn" onclick="nextTourStep()">${isLast ? "Готово" : "Далее →"}</button>
        </div>
    `;
    tooltip.style.display = "block";
    requestAnimationFrame(() => positionTourTooltip(target, tooltip));
}

function positionTourTooltip(target, tooltip) {
    const rect = target.getBoundingClientRect();
    const tRect = tooltip.getBoundingClientRect();
    const margin = 16;
    const vw = window.innerWidth, vh = window.innerHeight;

    let top = rect.bottom + margin + window.scrollY;
    let left = rect.left + window.scrollX;

    if (left + tRect.width > vw - margin) left = vw - tRect.width - margin;
    if (left < margin) left = margin;

    if (rect.bottom + tRect.height + margin > vh) {
        top = rect.top - tRect.height - margin + window.scrollY;
    }
    if (top < window.scrollY + margin) top = window.scrollY + margin;

    tooltip.style.top = top + "px";
    tooltip.style.left = left + "px";
}

function nextTourStep() {
    tourState.index++;
    if (tourState.index >= tourState.steps.length) endTour();
    else showTourStep();
}

function skipTour() { endTour(); }

function endTour() {
    clearTourHighlight();
    tourState.active = false;
    tourState.steps = [];
    tourState.index = 0;
    const tooltip = document.getElementById("tourTooltip");
    if (tooltip) tooltip.remove();
    localStorage.setItem("tourDone", "1");
}

function clearTourHighlight() {
    document.querySelectorAll(".tour-highlight").forEach(el => el.classList.remove("tour-highlight"));
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener("DOMContentLoaded", () => {
    toggleSpeciesFields();
    const speciesSelect = document.getElementById("petSpecies");
    if (speciesSelect) speciesSelect.addEventListener("change", toggleSpeciesFields);
    const petPhoto = document.getElementById("petPhoto"),
          petPhotoPreview = document.getElementById("petPhotoPreview");
    if (petPhoto && petPhotoPreview) {
        petPhoto.addEventListener("change", async () => {
            const f = petPhoto.files && petPhoto.files[0];
            if (f) petPhotoPreview.src = await fileToDataUrl(f);
        });
    }
    renderPets();
    renderProfile();
    renderWeightList();
    renderUpcomingEvents();
    renderCalendar();
    renderEventList();
    drawWeightChart();
    setDefaultDateInputs();

    if (!localStorage.getItem("tourDone")) {
        setTimeout(startTour, 600);
    }
});

function exportData() {
    const data = { pets, events };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "pet-tracker-data.json"; a.click();
    URL.revokeObjectURL(url);
}
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            pets = data.pets || [];
            events = data.events || [];
            saveState();
            renderPets(); renderProfile(); renderUpcomingEvents();
            renderCalendar(); renderEventList();
            alert("Данные успешно импортированы");
        } catch { alert("Ошибка чтения файла"); }
    };
    reader.readAsText(file);
}

// ===== Привязка к window =====
window.openPetModal = openPetModal; window.closePetModal = closePetModal;
window.savePet = savePet; window.editPet = editPet; window.deletePet = deletePet;
window.openProfile = openProfile;
window.editCurrentPet = editCurrentPet; window.deleteCurrentPet = deleteCurrentPet;
window.openWeightModal = openWeightModal; window.closeWeightModal = closeWeightModal;
window.saveWeight = saveWeight; window.editWeight = editWeight; window.deleteWeight = deleteWeight;
window.openEventModal = openEventModal; window.closeEventModal = closeEventModal;
window.saveEvent = saveEvent; window.editEvent = editEvent; window.deleteEvent = deleteEvent;
window.prevMonth = prevMonth; window.nextMonth = nextMonth;
window.exportData = exportData; window.importData = importData;
window.startTour = startTour; window.nextTourStep = nextTourStep; window.skipTour = skipTour;
