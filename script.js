// ===== Глобальные объекты =====
let pets = JSON.parse(localStorage.getItem("pets")) || [];
let events = JSON.parse(localStorage.getItem("events")) || [];
let currentMonthView = new Date().getMonth();
let currentYearView = new Date().getFullYear();
let weightChartInstance = null;
let heightChartInstance = null;
let editingPetPhoto = "";

const BODY_TYPES = {
    "Собака": ["Лёгкое", "Среднее", "Крупное", "Коротколапое"],
    "Кошка": ["Лёгкое", "Среднее", "Крупное", "Коротколапое"]
};

const BODY_TYPE_HINTS = {
    "Собака": {
        "Лёгкое": "Мелкие изящные породы: той-терьер, чихуахуа, итальянская борзая",
        "Среднее": "Классические породы: бигль, кокер-спаниель, шелти",
        "Крупное": "Массивные породы: лабрадор, хаски, немецкая овчарка",
        "Коротколапое": "Удлинённое тело на коротких лапах: такса, корги, бассет"
    },
    "Кошка": {
        "Лёгкое": "Изящные породы: сиамская, ориентальная, абиссинская",
        "Среднее": "Стандартные: британская, русская голубая",
        "Крупное": "Массивные: мейн-кун, норвежская лесная, рэгдолл",
        "Коротколапое": "Коротколапые породы: манчкин, наполеон"
    }
};

const DEFAULT_HEIGHTS = {
    "Собака": { "Лёгкое": 28, "Среднее": 45, "Крупное": 65, "Коротколапое": 23 },
    "Кошка": { "Лёгкое": 25, "Среднее": 28, "Крупное": 35, "Коротколапое": 20 }
};

// ===== Тема =====
function applyTheme() {
    const theme = localStorage.getItem("theme") || "light";
    document.documentElement.setAttribute("data-theme", theme);
    const icon = document.getElementById("themeIcon");
    const label = document.getElementById("themeLabel");
    if (icon && label) {
        if (theme === "dark") {
            icon.textContent = "☀️";
            label.textContent = "Светлая тема";
        } else {
            icon.textContent = "🌙";
            label.textContent = "Тёмная тема";
        }
    }
}
function toggleTheme() {
    const current = localStorage.getItem("theme") || "light";
    localStorage.setItem("theme", current === "light" ? "dark" : "light");
    applyTheme();
}

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
function pluralize(n, forms) {
    const abs = Math.abs(n) % 100;
    const n1 = abs % 10;
    if (abs > 10 && abs < 20) return forms[2];
    if (n1 > 1 && n1 < 5) return forms[1];
    if (n1 === 1) return forms[0];
    return forms[2];
}
function getAgeString(birthDate) {
    if (!birthDate) return "—";
    const birth = parseDate(birthDate);
    const now = new Date();
    const diffTime = now - birth;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return "0 дней";
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
function getSortedHeights(pet) {
    const list = Array.isArray(pet.heights) ? [...pet.heights] : [];
    return list.sort((a, b) => a.date.localeCompare(b.date));
}
function getSortedEvents() {
    return [...events].sort((a, b) => b.date.localeCompare(a.date));
}

function isGrowing(pet) {
    if (!pet.birthDate) return false;
    const birth = parseDate(pet.birthDate);
    const now = new Date();
    const diffDays = Math.floor((now - birth) / (1000 * 60 * 60 * 24));
    return diffDays < 365;
}

function toggleSpeciesFields() {
    const species = document.getElementById("petSpecies");
    const bodyType = document.getElementById("petBodyType");
    const hint = document.getElementById("bodyTypeHint");
    const speciesHint = document.getElementById("speciesHint");
    if (!species || !bodyType) return;
    const value = species.value;
    bodyType.innerHTML = '<option value="">Тип телосложения</option>';
    
    if (speciesHint) {
        if (!value) speciesHint.textContent = "";
        else if (value === "Собака" || value === "Кошка") speciesHint.textContent = "";
        else speciesHint.textContent = "⚠️ Для этого вида расчёт идеального веса пока не реализован. Информация появится в следующих версиях.";
    }
    
    if (!BODY_TYPES[value]) {
        if (hint) hint.textContent = "";
        return;
    }
    BODY_TYPES[value].forEach(type => {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = type;
        bodyType.appendChild(option);
    });
    bodyType.onchange = () => {
        if (hint && BODY_TYPE_HINTS[value] && BODY_TYPE_HINTS[value][bodyType.value]) {
            hint.textContent = "💡 " + BODY_TYPE_HINTS[value][bodyType.value];
        } else if (hint) {
            hint.textContent = "";
        }
        updateHeightHint();
    };
}

function updateHeightHint() {
    const hint = document.getElementById("heightHint");
    const species = document.getElementById("petSpecies")?.value;
    const bodyType = document.getElementById("petBodyType")?.value;
    const heightInput = document.getElementById("petHeight");
    if (!hint) return;
    if (species && bodyType && DEFAULT_HEIGHTS[species] && DEFAULT_HEIGHTS[species][bodyType]) {
        const avg = DEFAULT_HEIGHTS[species][bodyType];
        hint.textContent = `💡 Если не знаете точный рост — нажмите «Не знаю», будет использовано среднее значение для этого типа: ~${avg} см`;
    } else {
        hint.textContent = "";
    }
}

function askHeightLater() {
    const species = document.getElementById("petSpecies")?.value;
    const bodyType = document.getElementById("petBodyType")?.value;
    const heightInput = document.getElementById("petHeight");
    if (!species || !bodyType) {
        alert("Сначала выберите вид и тип телосложения.");
        return;
    }
    if (!DEFAULT_HEIGHTS[species] || !DEFAULT_HEIGHTS[species][bodyType]) {
        alert("Среднее значение для этого типа не задано.");
        return;
    }
    heightInput.value = DEFAULT_HEIGHTS[species][bodyType];
    heightInput.dataset.auto = "true";
    const hint = document.getElementById("heightHint");
    if (hint) hint.textContent = `✅ Установлен средний рост для типа «${bodyType}»: ${DEFAULT_HEIGHTS[species][bodyType]} см`;
}

// ===== Примерный возраст =====
function openApproxAgeModal() {
    const m = document.getElementById("approxAgeModal");
    if (m) m.style.display = "flex";
}
function closeApproxAgeModal() {
    const m = document.getElementById("approxAgeModal");
    if (m) m.style.display = "none";
}
function approxAge(kind) {
    closeApproxAgeModal();
    const birthInput = document.getElementById("petBirthDate");
    const hint = document.getElementById("birthHint");
    const today = new Date();
    const year = today.getFullYear();
    
    if (kind === 'day') {
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        birthInput.value = `${year}-${m}-${d}`;
        if (hint) hint.textContent = "📅 Установлена примерная дата (сегодняшний день и месяц). Год можно уточнить позже.";
    } else if (kind === 'month') {
        const m = String(today.getMonth() + 1).padStart(2, '0');
        birthInput.value = `${year}-${m}-01`;
        if (hint) hint.textContent = "📅 Установлен первый день месяца. Точный день неизвестен.";
    } else if (kind === 'season') {
        openSeasonModal();
    } else if (kind === 'unknown') {
        birthInput.value = `${year}-03-01`;
        if (hint) hint.textContent = "🌸 Установлена весна (март) — питомцы часто рождаются в это время года.";
    }
}
function openSeasonModal() {
    const m = document.getElementById("seasonModal");
    if (m) m.style.display = "flex";
}
function closeSeasonModal() {
    const m = document.getElementById("seasonModal");
    if (m) m.style.display = "none";
}
function setSeason(month, name) {
    const birthInput = document.getElementById("petBirthDate");
    const hint = document.getElementById("birthHint");
    const year = new Date().getFullYear();
    birthInput.value = `${year}-${String(month).padStart(2, '0')}-01`;
    closeSeasonModal();
    if (hint) hint.textContent = `${name === 'Весна' ? '🌸' : name === 'Лето' ? '☀️' : name === 'Осень' ? '🍂' : '❄️'} Установлен первый месяц ${name.toLowerCase()}и.`;
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
    events.forEach((e) => {
        if (e.date >= today) {
            const daysLeft = Math.ceil((new Date(e.date + "T00:00:00") - new Date(today + "T00:00:00")) / (1000 * 60 * 60 * 24));
            result.push({ ...e, daysLeft, isAuto: false });
        }
    });
    pets.forEach((pet, petIdx) => {
        const info = getNextBirthdayInfo(pet);
        if (info && info.daysLeft >= 0 && info.daysLeft <= 365) {
            result.push({
                date: info.date, type: "birthday",
                title: `🎂 ДР ${pet.name}`, daysLeft: info.daysLeft,
                isAuto: true, petId: petIdx, id: `bday-${petIdx}`
            });
        }
    });
    return result.sort((a, b) => a.date.localeCompare(b.date));
}

// ===== РАСЧЁТ ИДЕАЛЬНОГО ВЕСА =====
function calculateIdealWeight(pet) {
    if (pet.species !== "Собака" && pet.species !== "Кошка") {
        return { notSupported: true };
    }
    if (isGrowing(pet)) return { isPuppyKitten: true };
    if (!pet.bodyType) return null;
    
    let min = 0, max = 0;
    const height = pet.height || (DEFAULT_HEIGHTS[pet.species]?.[pet.bodyType] || 0);
    
    if (pet.species === "Собака") {
        if (pet.bodyType === "Лёгкое") { min = height * 0.15; max = height * 0.35; }
        if (pet.bodyType === "Среднее") { min = height * 0.20; max = height * 0.35; }
        if (pet.bodyType === "Крупное") { min = height * 0.25; max = height * 0.50; }
        if (pet.bodyType === "Коротколапое") { min = height * 0.30; max = height * 0.55; }
    }
    if (pet.species === "Кошка") {
        // Формула для кошек на основе роста и типа телосложения
        if (pet.bodyType === "Лёгкое") { min = height * 0.12; max = height * 0.18; }
        if (pet.bodyType === "Среднее") { min = height * 0.14; max = height * 0.21; }
        if (pet.bodyType === "Крупное") { min = height * 0.16; max = height * 0.25; }
        if (pet.bodyType === "Коротколапое") { min = height * 0.18; max = height * 0.28; }
    }
    return { min: Number(min.toFixed(1)), max: Number(max.toFixed(1)), isPuppyKitten: false };
}

function calculateIdealHeight(pet) {
    if (pet.species !== "Собака" && pet.species !== "Кошка") return null;
    if (!isGrowing(pet)) return null;
    if (!pet.bodyType) return null;
    const adult = DEFAULT_HEIGHTS[pet.species]?.[pet.bodyType] || 0;
    if (!adult) return null;
    return { min: Number((adult * 0.8).toFixed(1)), max: Number(adult.toFixed(1)) };
}

function getWeightStatus(pet, currentWeight) {
    const ideal = calculateIdealWeight(pet);
    if (!currentWeight) return null;
    if (ideal && ideal.notSupported) {
        return { className: "weight-unknown", text: "⚠️ Расчёт идеального веса для этого вида пока не реализован." };
    }
    if (ideal && ideal.isPuppyKitten) {
        return { className: "weight-normal", text: "🐾 Питомец растёт! Вес оценивается индивидуально у ветеринара." };
    }
    if (!ideal) return null;
    if (currentWeight < ideal.min) return { className: "weight-low", text: `Недобор веса. Норма для взрослого: ${ideal.min}–${ideal.max} кг` };
    if (currentWeight > ideal.max) return { className: "weight-high", text: `Избыточный вес. Норма для взрослого: ${ideal.min}–${ideal.max} кг` };
    return { className: "weight-normal", text: `Вес в норме. Идеальный диапазон: ${ideal.min}–${ideal.max} кг` };
}

// ===== PETS =====
function getPetLabel(pet) {
    const species = pet.species || "";
    const gender = pet.gender || "";
    const growing = isGrowing(pet);
    
    if (species === "Кошка") {
        if (growing) return gender === "Самка" ? "кошка (котёнок)" : "кот (котёнок)";
        return gender === "Самка" ? "кошка" : "кот";
    }
    if (species === "Собака") {
        if (growing) return "щенок";
        return "собака";
    }
    return species.toLowerCase();
}

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
        const latestWeight = Array.isArray(pet.weights) && pet.weights.length ? pet.weights[pet.weights.length - 1] : null;
        const weightStatus = latestWeight ? getWeightStatus(pet, latestWeight.value) : null;
        const petLabel = getPetLabel(pet);
        
        if (compact) {
            return `
            <article class="pet-card pet-card-compact" onclick="openProfile(${index})">
                <img class="pet-photo" src="${pet.photo || defaultAvatar(pet.name)}" alt="${escapeHtml(pet.name)}">
                <div class="pet-body">
                    <h3 class="pet-name">${escapeHtml(pet.name)}</h3>
                    <div class="pet-meta">
                        <div>${escapeHtml(petLabel)}, ${getAgeString(pet.birthDate)}</div>
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
                    <div>Тип: ${escapeHtml(petLabel)}</div>
                    <div>Возраст: ${getAgeString(pet.birthDate)}</div>
                    <div>Содержание: ${escapeHtml(pet.housing || "—")}</div>
                    <div>${latestWeight ? `Последний вес: ${Number(latestWeight.value).toFixed(1)} кг` : "Вес пока не добавлен"}</div>
                </div>
                ${weightStatus ? `<div class="weight-status ${weightStatus.className}">${weightStatus.text}</div>` : ""}
                ${idealWeight && !idealWeight.notSupported ? `
                <table class="weight-table">
                    <tr><th>Параметр</th><th>Значение</th></tr>
                    ${idealWeight.isPuppyKitten
                        ? `<tr><td colspan="2" style="text-align:center; color:#22c55e; font-weight:600;">🐾 Питомец растёт! Вес оценивается индивидуально у ветеринара.</td></tr>`
                        : `<tr><td>Идеальный вес</td><td>${idealWeight.min} – ${idealWeight.max} кг</td></tr>`}
                    <tr><td>Рост</td><td>${pet.height || "—"} см</td></tr>
                    <tr><td>BCS</td><td>${pet.bcs || "—"}</td></tr>
                </table>` : ""}
                ${idealWeight && idealWeight.notSupported ? `<div class="weight-status weight-unknown">⚠️ Для этого вида расчёт идеального веса появится в следующих версиях.</div>` : ""}
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
    <article class="pet-card pet-card-compact pet-card-add" onclick="openAddPetPage()">
        <div class="pet-card-add-inner">
            <div class="pet-card-add-icon">+</div>
            <div class="pet-card-add-text">Добавить питомца</div>
        </div>
    </article>`;
}

function openAddPetPage(index = null) {
    if (index === null) {
        window.location.href = "add-pet.html";
    } else {
        localStorage.setItem("editPetIndex", String(index));
        window.location.href = "add-pet.html?edit=1";
    }
}

function editPet(index) { openAddPetPage(index); }
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

function cancelAddPet() {
    window.history.back();
}

// ===== АНКЕТА (add-pet.html) =====
function loadPetForm() {
    const urlParams = new URLSearchParams(window.location.search);
    const isEdit = urlParams.get('edit') === '1';
    const editIndex = localStorage.getItem("editPetIndex");
    
    if (isEdit && editIndex !== null) {
        const pet = pets[Number(editIndex)];
        if (!pet) return;
        
        document.getElementById("addPetTitle").textContent = "Редактировать питомца";
        document.getElementById("petIndex").value = editIndex;
        document.getElementById("petName").value = pet.name || "";
        document.getElementById("petSpecies").value = pet.species || "";
        document.getElementById("petGender").value = pet.gender || "";
        document.getElementById("petBirthDate").value = pet.birthDate || "";
        document.getElementById("petHousing").value = pet.housing || "";
        document.getElementById("petNotes").value = pet.notes || "";
        
        toggleSpeciesFields();
        setTimeout(() => {
            document.getElementById("petBodyType").value = pet.bodyType || "";
            document.getElementById("petHeight").value = pet.height || "";
            document.getElementById("petBCS").value = pet.bcs || "";
            updateHeightHint();
        }, 0);
        
        editingPetPhoto = pet.photo || "";
        document.getElementById("petPhotoPreview").src = pet.photo || defaultAvatar(pet.name);
    } else {
        editingPetPhoto = "";
        document.getElementById("petPhotoPreview").src = defaultAvatar("Питомец");
    }
}

async function savePet() {
    const petIndex = document.getElementById("petIndex"),
        petName = document.getElementById("petName"),
        petSpecies = document.getElementById("petSpecies"),
        petGender = document.getElementById("petGender"),
        petBirthDate = document.getElementById("petBirthDate"),
        petHousing = document.getElementById("petHousing"),
        petPhoto = document.getElementById("petPhoto"),
        petNotes = document.getElementById("petNotes");
    const bodyType = document.getElementById("petBodyType")?.value || "";
    const height = parseFloat(document.getElementById("petHeight")?.value) || 0;
    const bcs = Number(document.getElementById("petBCS")?.value) || 0;
    const name = petName.value.trim();
    const species = petSpecies.value, gender = petGender.value;
    const birthDate = petBirthDate.value, housing = petHousing.value;
    const notes = petNotes ? petNotes.value.trim() : "";
    
    if (!name || !species) {
        alert("Заполни имя и вид животного."); return;
    }
    if (birthDate && birthDate > todayISO()) { alert("Дата рождения не может быть в будущем."); return; }
    
    let photo = editingPetPhoto || defaultAvatar(name);
    if (petPhoto.files && petPhoto.files[0]) photo = await fileToDataUrl(petPhoto.files[0]);
    
    const data = { name, species, gender, birthDate, housing, photo, bodyType, height, bcs, notes };
    const index = petIndex.value === "" ? null : Number(petIndex.value);
    if (index === null) pets.push({ id: Date.now(), ...data, weights: [], heights: [] });
    else { const ex = pets[index]; pets[index] = { ...ex, ...data, weights: ex.weights || [], heights: ex.heights || [] }; }
    saveState(); editingPetPhoto = "";
    localStorage.removeItem("editPetIndex");
    window.location.href = "pets.html";
}

// ===== ПРОФИЛЬ И ВЕС =====
function openProfile(index) {
    localStorage.setItem("currentPet", String(index));
    window.location.href = "profile.html";
}

function renderProfile() {
    const container = document.getElementById("profileCard");
    if (!container) return;
    const index = currentPetIndex();
    const pet = index !== null ? petByIndex(index) : null;
    if (pet && !Array.isArray(pet.weights)) pet.weights = [];
    if (pet && !Array.isArray(pet.heights)) pet.heights = [];
    if (!pet) {
        container.innerHTML = `<section class="panel"><div class="empty-state">Питомец не выбран.</div></section>`;
        return;
    }
    const sortedWeights = getSortedWeights(pet);
    const latestWeight = sortedWeights.length ? sortedWeights[sortedWeights.length - 1] : null;
    const idealWeight = calculateIdealWeight(pet);
    const weightStatus = latestWeight ? getWeightStatus(pet, latestWeight.value) : null;
    const petLabel = getPetLabel(pet);
    const growing = isGrowing(pet);
    
    container.innerHTML = `
    <section class="pet-summary">
        <div class="summary-card summary-photo-card">
            <img src="${pet.photo || defaultAvatar(pet.name)}" alt="${escapeHtml(pet.name)}">
        </div>
        <div class="summary-card summary-info">
            <h2>${escapeHtml(pet.name)}</h2>
            <div class="summary-meta">
                <div><b>Вид:</b> ${escapeHtml(pet.species || "—")}</div>
                <div><b>Тип:</b> ${escapeHtml(petLabel)}</div>
                <div><b>Возраст:</b> ${getAgeString(pet.birthDate)}</div>
                <div><b>Дата рождения:</b> ${pet.birthDate ? formatDate(pet.birthDate) : "—"}</div>
                <div><b>Содержание:</b> ${escapeHtml(pet.housing || "—")}</div>
                <div><b>Телосложение:</b> ${escapeHtml(pet.bodyType || "—")}</div>
                <div><b>Рост:</b> ${pet.height || "—"} см</div>
                <div><b><span class="tooltip" data-tip="Body Condition Score — система оценки упитанности от 1 до 9. Норма = 5.">BCS</span>:</b> ${pet.bcs || "—"}</div>
                <div><b>Последний вес:</b> ${latestWeight ? `${Number(latestWeight.value).toFixed(1)} кг` : "ещё нет"}</div>
            </div>
            ${weightStatus ? `<div class="weight-status ${weightStatus.className}">${weightStatus.text}</div>` : ""}
            ${idealWeight && !idealWeight.notSupported ? `
            <table class="weight-table">
                <tr><th>Параметр</th><th>Значение</th></tr>
                ${idealWeight.isPuppyKitten
                    ? `<tr><td colspan="2" style="text-align:center; color:#22c55e; font-weight:600;">🐾 Питомец растёт! Вес оценивается индивидуально у ветеринара.</td></tr>`
                    : `<tr><td>Идеальный вес</td><td>${idealWeight.min} – ${idealWeight.max} кг</td></tr>`}
                <tr><td>Рост</td><td>${pet.height || "—"} см</td></tr>
                <tr><td>BCS</td><td>${pet.bcs || "—"}</td></tr>
            </table>` : ""}
            ${idealWeight && idealWeight.notSupported ? `<div class="weight-status weight-unknown">⚠️ Для этого вида расчёт идеального веса появится в следующих версиях.</div>` : ""}
            <div style="margin-top:16px; padding:14px; background:#f8fafc; border-radius:14px; border:1px solid #e2e8f0;">
                <h4 style="margin:0 0 8px 0; font-size:16px;"><span class="tooltip" data-tip="Здесь можно указать аллергии, особенности поведения, любимые лакомства или любые другие важные заметки о питомце">Дополнительные сведения</span></h4>
                <p style="margin:0; color:var(--text); white-space:pre-wrap; font-size:14px; line-height:1.5;">${pet.notes || "Нет дополнительных сведений"}</p>
            </div>
            <div class="pet-actions" style="margin-top:16px;">
                <button class="btn" onclick="editCurrentPet()">Редактировать</button>
                <button class="btn btn-danger" onclick="deleteCurrentPet()">Удалить</button>
            </div>
        </div>
    </section>`;
    
    const heightChartSection = document.getElementById("heightChartSection");
    const heightHistorySection = document.getElementById("heightHistorySection");
    if (heightChartSection) heightChartSection.style.display = growing ? "block" : "none";
    if (heightHistorySection) heightHistorySection.style.display = growing ? "block" : "none";
    
    renderWeightList();
    renderHeightList();
    drawWeightChart();
    drawHeightChart();
}

function editCurrentPet() { const i = currentPetIndex(); if (i !== null) openAddPetPage(i); }
function deleteCurrentPet() { const i = currentPetIndex(); if (i !== null) deletePet(i); }

// ===== ВЕС =====
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

// ===== РОСТ =====
function openHeightModal(index = null) {
    const modal = document.getElementById("heightModal"); if (!modal) return;
    const title = document.getElementById("heightModalTitle"),
        heightIndex = document.getElementById("heightIndex"),
        heightDate = document.getElementById("heightDate"),
        heightValue = document.getElementById("heightValue");
    const petIndex = currentPetIndex();
    if (petIndex === null || !pets[petIndex]) { alert("Сначала открой профиль питомца."); return; }
    if (index === null) {
        heightIndex.value = ""; heightDate.value = todayISO(); heightValue.value = "";
        title.textContent = "Добавить рост";
    } else {
        const r = pets[petIndex].heights[index];
        heightIndex.value = String(index); heightDate.value = r.date; heightValue.value = r.value;
        title.textContent = "Редактировать рост";
    }
    modal.style.display = "flex";
}
function closeHeightModal() {
    const m = document.getElementById("heightModal");
    if (m) m.style.display = "none";
}
function saveHeight() {
    const petIndex = currentPetIndex();
    if (petIndex === null || !pets[petIndex]) return;
    const heightIndex = document.getElementById("heightIndex"),
        heightDate = document.getElementById("heightDate"),
        heightValue = document.getElementById("heightValue");
    const date = heightDate.value, value = parseFloat(heightValue.value);
    if (!date) { alert("Выбери дату."); return; }
    if (isNaN(value) || value <= 0) { alert("Рост должен быть числом больше 0."); return; }
    const pet = pets[petIndex];
    pet.heights = Array.isArray(pet.heights) ? pet.heights : [];
    const record = { id: Date.now() + Math.random(), date, value: Number(value.toFixed(1)) };
    const index = heightIndex.value === "" ? null : Number(heightIndex.value);
    if (index === null) pet.heights.push(record);
    else pet.heights[index] = { ...pet.heights[index], date, value: Number(value.toFixed(1)) };
    saveState(); closeHeightModal();
    renderProfile(); renderPets();
}
function editHeight(index) { openHeightModal(index); }
function deleteHeight(index) {
    const petIndex = currentPetIndex();
    if (petIndex === null || !pets[petIndex]) return;
    if (!confirm("Удалить запись роста?")) return;
    pets[petIndex].heights.splice(index, 1);
    saveState(); renderHeightList(); drawHeightChart(); renderProfile(); renderPets();
}
function renderHeightList() {
    const list = document.getElementById("heightList"); if (!list) return;
    const petIndex = currentPetIndex();
    if (petIndex === null || !pets[petIndex]) { list.innerHTML = ""; return; }
    const pet = pets[petIndex], heights = Array.isArray(pet.heights) ? pet.heights : [];
    if (!heights.length) { list.innerHTML = `<li class="empty-state">История роста пока пустая.</li>`; return; }
    list.innerHTML = heights.map((h, idx) => `
        <li class="record-item">
            <div>
                <div><b>${formatDate(h.date)}</b></div>
                <div class="small">${Number(h.value).toFixed(1)} см</div>
            </div>
            <div class="record-actions">
                <button class="btn btn-light" onclick="editHeight(${idx})">Редактировать</button>
                <button class="btn btn-danger" onclick="deleteHeight(${idx})">Удалить</button>
            </div>
        </li>`).join("");
}

// ===== ГРАФИКИ =====
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
    const labels = weights.map(w => formatDate(w.date));
    const data = weights.map(w => Number(w.value));
    const ideal = calculateIdealWeight(pet);
    
    const datasets = [{
        label: "Вес (кг)", data, borderWidth: 2, tension: 0.35, fill: false,
        borderColor: "#4f8cff", backgroundColor: "#4f8cff"
    }];
    
    if (ideal && !ideal.isPuppyKitten && !ideal.notSupported) {
        datasets.push({
            label: `Норма (${ideal.min}–${ideal.max} кг)`,
            data: labels.map(() => ideal.max),
            borderColor: "#22c55e",
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            fill: '+1',
            backgroundColor: 'rgba(34, 197, 94, 0.15)'
        });
        datasets.push({
            label: "Мин. нормы",
            data: labels.map(() => ideal.min),
            borderColor: "#22c55e",
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            fill: false
        });
    }
    
    if (weightChartInstance) weightChartInstance.destroy();
    weightChartInstance = new Chart(canvas, {
        type: "line",
        data: { labels, datasets },
        options: { responsive: true, plugins: { legend: { display: true } }, scales: { y: { beginAtZero: false } } }
    });
}

function drawHeightChart() {
    const canvas = document.getElementById("heightChart");
    if (!canvas || typeof Chart === "undefined") return;
    const petIndex = currentPetIndex();
    if (petIndex === null || !pets[petIndex]) return;
    const pet = pets[petIndex];
    if (!isGrowing(pet)) return;
    const heights = getSortedHeights(pet);
    if (!heights.length) {
        if (heightChartInstance) { heightChartInstance.destroy(); heightChartInstance = null; }
        return;
    }
    const labels = heights.map(h => formatDate(h.date));
    const data = heights.map(h => Number(h.value));
    const idealH = calculateIdealHeight(pet);
    
    const datasets = [{
        label: "Рост (см)", data, borderWidth: 2, tension: 0.35, fill: false,
        borderColor: "#8b5cf6", backgroundColor: "#8b5cf6"
    }];
    
    if (idealH) {
        datasets.push({
            label: `Норма (${idealH.min}–${idealH.max} см)`,
            data: labels.map(() => idealH.max),
            borderColor: "#22c55e",
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            fill: '+1',
            backgroundColor: 'rgba(34, 197, 94, 0.15)'
        });
        datasets.push({
            label: "Мин. нормы",
            data: labels.map(() => idealH.min),
            borderColor: "#22c55e",
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            fill: false
        });
    }
    
    if (heightChartInstance) heightChartInstance.destroy();
    heightChartInstance = new Chart(canvas, {
        type: "line",
        data: { labels, datasets },
        options: { responsive: true, plugins: { legend: { display: true } }, scales: { y: { beginAtZero: false } } }
    });
}

// ===== КАЛЕНДАРЬ И СОБЫТИЯ =====
function updateEventPetSelect(selectedId = "") {
    const select = document.getElementById("eventPetId");
    if (!select) return;
    select.innerHTML = '<option value="">Для всех питомцев</option>';
    pets.forEach((pet, idx) => {
        const opt = document.createElement("option");
        opt.value = String(idx); opt.textContent = pet.name;
        if (String(idx) === selectedId) opt.selected = true;
        select.appendChild(opt);
    });
}

function setupRepeatUI() {
    const repeatSel = document.getElementById("eventRepeat");
    const customBlock = document.getElementById("customRepeatBlock");
    const endBlock = document.getElementById("repeatEndBlock");
    const repeatEnd = document.getElementById("repeatEnd");
    const endDate = document.getElementById("repeatEndDate");
    const endCount = document.getElementById("repeatEndCount");
    if (!repeatSel) return;
    repeatSel.onchange = () => {
        if (customBlock) customBlock.style.display = repeatSel.value === "custom" ? "block" : "none";
        if (endBlock) endBlock.style.display = repeatSel.value !== "none" ? "block" : "none";
    };
    if (repeatEnd) {
        repeatEnd.onchange = () => {
            if (endDate) endDate.style.display = repeatEnd.value === "date" ? "block" : "none";
            if (endCount) endCount.style.display = repeatEnd.value === "count" ? "block" : "none";
        };
    }
}

function openEventModal(date = todayISO(), index = null) {
    const modal = document.getElementById("eventModal"); if (!modal) return;
    const title = document.getElementById("eventModalTitle"),
        eventIndex = document.getElementById("eventIndex"),
        eventDate = document.getElementById("eventDate"),
        eventType = document.getElementById("eventType"),
        eventTitle = document.getElementById("eventTitle"),
        eventRepeat = document.getElementById("eventRepeat"),
        repeatEvery = document.getElementById("repeatEvery"),
        repeatUnit = document.getElementById("repeatUnit"),
        repeatEnd = document.getElementById("repeatEnd"),
        repeatEndDate = document.getElementById("repeatEndDate"),
        repeatEndCount = document.getElementById("repeatEndCount");
    if (index === null) {
        eventIndex.value = ""; eventDate.value = date;
        eventType.value = "vaccine"; eventTitle.value = "";
        if (eventRepeat) eventRepeat.value = "none";
        if (repeatEvery) repeatEvery.value = 1;
        if (repeatUnit) repeatUnit.value = "days";
        if (repeatEnd) repeatEnd.value = "never";
        if (repeatEndDate) repeatEndDate.value = "";
        if (repeatEndCount) repeatEndCount.value = 5;
        updateEventPetSelect("");
        title.textContent = "Добавить событие";
    } else {
        const item = events[index];
        eventIndex.value = String(index); eventDate.value = item.date;
        eventType.value = item.type; eventTitle.value = item.title === "Событие" ? "" : item.title;
        updateEventPetSelect(item.petId !== undefined ? String(item.petId) : "");
        if (eventRepeat) eventRepeat.value = item.repeat || "none";
        if (repeatEvery) repeatEvery.value = item.repeatEvery || 1;
        if (repeatUnit) repeatUnit.value = item.repeatUnit || "days";
        if (repeatEnd) repeatEnd.value = item.repeatEnd || "never";
        if (repeatEndDate) repeatEndDate.value = item.repeatEndDate || "";
        if (repeatEndCount) repeatEndCount.value = item.repeatEndCount || 5;
        title.textContent = "Редактировать событие";
    }
    setupRepeatUI();
    if (eventRepeat) eventRepeat.dispatchEvent(new Event('change'));
    if (repeatEnd) repeatEnd.dispatchEvent(new Event('change'));
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
        eventPetId = document.getElementById("eventPetId"),
        eventRepeat = document.getElementById("eventRepeat"),
        repeatEvery = document.getElementById("repeatEvery"),
        repeatUnit = document.getElementById("repeatUnit"),
        repeatEnd = document.getElementById("repeatEnd"),
        repeatEndDate = document.getElementById("repeatEndDate"),
        repeatEndCount = document.getElementById("repeatEndCount");
    const date = eventDate.value, type = eventType.value;
    const title = eventTitle.value.trim() || "Событие";
    const petId = eventPetId ? (eventPetId.value === "" ? null : Number(eventPetId.value)) : null;
    if (!date) { alert("Выбери дату."); return; }
    const item = {
        id: Date.now() + Math.random(), date, type, title, petId,
        repeat: eventRepeat?.value || "none",
        repeatEvery: Number(repeatEvery?.value) || 1,
        repeatUnit: repeatUnit?.value || "days",
        repeatEnd: repeatEnd?.value || "never",
        repeatEndDate: repeatEndDate?.value || "",
        repeatEndCount: Number(repeatEndCount?.value) || 5
    };
    const index = eventIndex.value === "" ? null : Number(eventIndex.value);
    if (index === null) events.push(item);
    else events[index] = { ...events[index], ...item };
    saveState(); closeEventModal();
    renderCalendar(); renderEventList(); renderUpcomingEvents();
}

function editEventById(id) {
    const index = events.findIndex(e => String(e.id) === String(id));
    if (index !== -1) openEventModal(events[index].date, index);
}
function deleteEventById(id) {
    if (!confirm("Удалить событие?")) return;
    const index = events.findIndex(e => String(e.id) === String(id));
    if (index !== -1) {
        events.splice(index, 1);
        saveState();
        renderCalendar();
        renderEventList();
        renderUpcomingEvents();
    }
}

function renderRepeatLabel(ev) {
    if (!ev.repeat || ev.repeat === "none") return "";
    const unit = ev.repeatUnit || "days";
    const unitLabel = unit === "days" ? "дн." : unit === "weeks" ? "нед." : "мес.";
    let txt = `🔁 каждые ${ev.repeatEvery || 1} ${unitLabel}`;
    if (ev.repeatEnd === "date" && ev.repeatEndDate) txt += ` до ${formatDate(ev.repeatEndDate)}`;
    else if (ev.repeatEnd === "count") txt += ` (${ev.repeatEndCount || 5} раз)`;
    else txt += " (бесконечно)";
    return `<div class="small repeat-label">${txt}</div>`;
}

function renderUpcomingEvents() {
    const container = document.getElementById("upcomingEvents");
    if (!container) return;
    const upcoming = getMergedUpcoming().slice(0, 3);
    if (!upcoming.length) {
        container.innerHTML = `<div class="empty-state">Пока нет ближайших событий.</div>`;
        return;
    }
    container.innerHTML = upcoming.map(ev => {
        const petBadge = ev.petId !== undefined && pets[ev.petId]
            ? `<span style="background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:12px;font-size:12px;margin-left:6px;">${escapeHtml(pets[ev.petId].name)}</span>`
            : '';
        let actionsHtml = '';
        if (!ev.isAuto) {
            actionsHtml = `
            <div class="record-actions">
                <button class="btn btn-light" onclick="editEventById('${ev.id}')">✏️</button>
                <button class="btn btn-danger" onclick="deleteEventById('${ev.id}')">🗑️</button>
            </div>`;
        }
        return `
        <div class="event-card">
            <div class="event-main">
                <div class="event-title">${escapeHtml(eventTypeLabel(ev.type))}</div>
                <div class="small">
                    ${formatDate(ev.date)} — ${escapeHtml(ev.title)} ${petBadge}
                    <span style="color:#22c55e;font-weight:600;margin-left:6px;">(через ${ev.daysLeft} дн.)</span>
                </div>
                ${renderRepeatLabel(ev)}
            </div>
            ${actionsHtml}
        </div>`;
    }).join("");
}

function renderCalendar() {
    const title = document.getElementById("calendarMonthTitle"), grid = document.getElementById("calendarGrid");
    if (!title || !grid) return;
    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
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
        const dayBirthdays = pets.filter(pet => {
            const info = getNextBirthdayInfo(pet);
            return info && info.date === dateStr;
        });
        const total = dayEvents.length + dayBirthdays.length;
        const maxShow = 2;
        dayEvents.slice(0, maxShow).forEach(ev => {
            const petName = ev.petId !== undefined && pets[ev.petId] ? ` (${pets[ev.petId].name})` : '';
            const p = document.createElement("div");
            p.className = `event-pill ${ev.type}`;
            p.textContent = ev.title + petName;
            cell.appendChild(p);
        });
        dayBirthdays.slice(0, Math.max(0, maxShow - dayEvents.length)).forEach(pet => {
            const info = getNextBirthdayInfo(pet);
            const p = document.createElement("div");
            p.className = "event-pill birthday";
            p.textContent = `🎂 ${pet.name}`;
            cell.appendChild(p);
        });
        if (total > maxShow) {
            const m = document.createElement("div");
            m.className = "small";
            m.textContent = `+${total - maxShow} ещё`;
            m.style.cursor = "pointer";
            m.onclick = (e) => { e.stopPropagation(); openDayModal(dateStr); };
            cell.appendChild(m);
        }
        cell.onclick = () => {
            if (total > 0) openDayModal(dateStr);
            else openEventModal(dateStr);
        };
        grid.appendChild(cell);
    }
}

function openDayModal(dateStr) {
    const modal = document.getElementById("dayModal");
    const title = document.getElementById("dayModalTitle");
    const list = document.getElementById("dayModalList");
    if (!modal || !title || !list) return;
    title.textContent = `События на ${formatDate(dateStr)}`;
    const dayEvents = events.filter(e => e.date === dateStr);
    const dayBirthdays = pets.filter(pet => {
        const info = getNextBirthdayInfo(pet);
        return info && info.date === dateStr;
    });
    let html = "";
    dayEvents.forEach(ev => {
        const petName = ev.petId !== undefined && pets[ev.petId] ? pets[ev.petId].name : "Все питомцы";
        html += `
        <div class="event-card">
            <div class="event-main">
                <div class="event-title">${escapeHtml(eventTypeLabel(ev.type))}</div>
                <div class="small">${escapeHtml(ev.title)} • ${escapeHtml(petName)}</div>
                ${renderRepeatLabel(ev)}
            </div>
            <div class="record-actions">
                <button class="btn btn-light" onclick="closeDayModal(); editEventById('${ev.id}')">✏️</button>
                <button class="btn btn-danger" onclick="closeDayModal(); deleteEventById('${ev.id}')">🗑️</button>
            </div>
        </div>`;
    });
    dayBirthdays.forEach(pet => {
        html += `
        <div class="event-card">
            <div class="event-main">
                <div class="event-title">🎂 День рождения</div>
                <div class="small">${escapeHtml(pet.name)}</div>
            </div>
        </div>`;
    });
    if (!html) html = `<div class="empty-state">Событий нет.</div>`;
    html += `<button class="btn" onclick="closeDayModal(); openEventModal('${dateStr}')">+ Добавить событие на этот день</button>`;
    list.innerHTML = html;
    modal.style.display = "flex";
}
function closeDayModal() {
    const m = document.getElementById("dayModal");
    if (m) m.style.display = "none";
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
    container.innerHTML = sorted.map(ev => {
        const petName = ev.petId !== undefined && pets[ev.petId]
            ? `<span style="background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:12px;font-size:12px;margin-left:8px;">${escapeHtml(pets[ev.petId].name)}</span>`
            : '';
        return `
        <div class="event-card">
            <div class="event-main">
                <div class="event-title">${escapeHtml(eventTypeLabel(ev.type))}</div>
                <div class="small">${formatDate(ev.date)} — ${escapeHtml(ev.title)} ${petName}</div>
                ${renderRepeatLabel(ev)}
            </div>
            <div class="record-actions">
                <button class="btn btn-light" onclick="editEventById('${ev.id}')">Редактировать</button>
                <button class="btn btn-danger" onclick="deleteEventById('${ev.id}')">Удалить</button>
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

// ===== ТУР =====
const TOUR_STEPS = {
    "index.html": [
        { selector: "[data-tour='hero']", title: "Добро пожаловать!", text: "Это главная страница Трекера питомца. Здесь ты видишь своих питомцев и 3 ближайших события." },
        { selector: "[data-tour='petsSection']", title: "Список питомцев", text: "Здесь появятся все твои питомцы. Кликни на карточку, чтобы открыть профиль." },
        { selector: "[data-tour='upcoming']", title: "Ближайшие события", text: "Здесь отображаются 3 ближайших события." },
        { selector: "[data-tour='themeSwitcher']", title: "Тема оформления", text: "Переключайся между светлой и тёмной темой. Настройка сохраняется." }
    ],
    "pets.html": [
        { selector: "[data-tour='hero']", title: "Управление питомцами", text: "На этой странице ты можешь добавлять, редактировать и удалять питомцев." },
        { selector: "[data-tour='addPetBtn']", title: "Добавить питомца", text: "Нажми, чтобы завести нового питомца." },
        { selector: "[data-tour='exportBtn']", title: "Экспорт данных", text: "Скачай все данные в JSON-файл." },
        { selector: "[data-tour='importBtn']", title: "Импорт данных", text: "Загрузи ранее сохранённый JSON-файл." },
        { selector: "[data-tour='petsGrid']", title: "Карточки питомцев", text: "Кликни на любую карточку, чтобы открыть подробный профиль." },
        { selector: "[data-tour='themeSwitcher']", title: "Тема", text: "Переключатель светлой/тёмной темы." }
    ],
    "calendar.html": [
        { selector: "[data-tour='hero']", title: "Календарь событий", text: "Здесь ты видишь все запланированные события на месяц." },
        { selector: "[data-tour='addEventBtn']", title: "Добавить событие", text: "Добавь вакцинацию, визит к ветеринару, прогулку. Можно настроить повторение." },
        { selector: "[data-tour='prevMonth']", title: "Навигация", text: "Переключайся между месяцами стрелками." },
        { selector: "[data-tour='calendarGrid']", title: "Сетка календаря", text: "Кликни на день с событиями — откроется список. На пустой день — быстрое добавление." },
        { selector: "[data-tour='eventList']", title: "Все события", text: "Полный список всех событий." },
        { selector: "[data-tour='themeSwitcher']", title: "Тема", text: "Переключатель светлой/тёмной темы." }
    ],
    "profile.html": [
        { selector: "[data-tour='profileCard']", title: "Профиль питомца", text: "Здесь вся информация о питомце: фото, возраст, вес, BCS." },
        { selector: "[data-tour='measurement']", title: "Как измерять", text: "Подсказки, как правильно измерять рост, BCS и определять тип телосложения." },
        { selector: "[data-tour='weightChart']", title: "График веса", text: "Наглядный график изменения веса. Зелёная зона — идеальный диапазон." },
        { selector: "[data-tour='weightHistory']", title: "История веса", text: "Добавляй новые записи веса." },
        { selector: "[data-tour='themeSwitcher']", title: "Тема", text: "Переключатель светлой/тёмной темы." }
    ],
    "add-pet.html": [
        { selector: "[data-tour='hero']", title: "Анкета питомца", text: "Заполни все поля — это поможет точно рассчитать идеальный вес." },
        { selector: "[data-tour='addPetForm']", title: "Форма анкеты", text: "Выбери вид, тип телосложения, укажи рост и другие параметры." },
        { selector: "[data-tour='themeSwitcher']", title: "Тема", text: "Переключатель светлой/тёмной темы." }
    ],
    "about.html": [
        { selector: "[data-tour='hero']", title: "О программе", text: "Здесь вся информация о Трекере питомца." },
        { selector: "[data-tour='aboutNav']", title: "Навигация", text: "Быстрые ссылки на разделы страницы." },
        { selector: "[data-tour='aboutSection']", title: "О программе", text: "Краткое описание возможностей." },
        { selector: "[data-tour='bcsSection']", title: "BCS", text: "Как оценить упитанность питомца." },
        { selector: "[data-tour='heightSection']", title: "Рост", text: "Как правильно измерить рост." },
        { selector: "[data-tour='bodytypeSection']", title: "Типы телосложения", text: "Описание типов для собак и кошек с примерами пород." },
        { selector: "[data-tour='calendarSection']", title: "Календарь", text: "Описание функций календаря и повторяющихся событий." },
        { selector: "[data-tour='weightSection']", title: "Идеальный вес", text: "Формулы расчёта идеального веса." },
        { selector: "[data-tour='themeSwitcher']", title: "Тема", text: "Переключатель светлой/тёмной темы." }
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
        <div class="tour-tooltip-progress">
            <div class="tour-tooltip-progress-bar" style="width:${((tourState.index + 1) / tourState.steps.length) * 100}%"></div>
        </div>
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
    applyTheme();
    
    // Если мы на странице add-pet.html
    if (getCurrentPage() === "add-pet.html") {
        loadPetForm();
        const petPhoto = document.getElementById("petPhoto"),
            petPhotoPreview = document.getElementById("petPhotoPreview");
        if (petPhoto && petPhotoPreview) {
            petPhoto.addEventListener("change", async () => {
                const f = petPhoto.files && petPhoto.files[0];
                if (f) petPhotoPreview.src = await fileToDataUrl(f);
            });
        }
        return;
    }
    
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
    renderHeightList();
    renderUpcomingEvents();
    renderCalendar();
    renderEventList();
    drawWeightChart();
    drawHeightChart();
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

// Привязка к window
window.openPetModal = openAddPetPage; window.closePetModal = closePetModal;
window.savePet = savePet; window.editPet = editPet; window.deletePet = deletePet;
window.openProfile = openProfile;
window.editCurrentPet = editCurrentPet; window.deleteCurrentPet = deleteCurrentPet;
window.openWeightModal = openWeightModal; window.closeWeightModal = closeWeightModal;
window.saveWeight = saveWeight; window.editWeight = editWeight; window.deleteWeight = deleteWeight;
window.openHeightModal = openHeightModal; window.closeHeightModal = closeHeightModal;
window.saveHeight = saveHeight; window.editHeight = editHeight; window.deleteHeight = deleteHeight;
window.openEventModal = openEventModal; window.closeEventModal = closeEventModal;
window.saveEvent = saveEvent;
window.editEventById = editEventById; window.deleteEventById = deleteEventById;
window.openDayModal = openDayModal; window.closeDayModal = closeDayModal;
window.prevMonth = prevMonth; window.nextMonth = nextMonth;
window.exportData = exportData; window.importData = importData;
window.startTour = startTour; window.nextTourStep = nextTourStep; window.skipTour = skipTour;
window.toggleTheme = toggleTheme;
window.openApproxAgeModal = openApproxAgeModal; window.closeApproxAgeModal = closeApproxAgeModal;
window.approxAge = approxAge;
window.openSeasonModal = openSeasonModal; window.closeSeasonModal = closeSeasonModal;
window.setSeason = setSeason;
window.askHeightLater = askHeightLater;
window.openAddPetPage = openAddPetPage;
window.cancelAddPet = cancelAddPet;
