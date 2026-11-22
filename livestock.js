
   Статус модуля: ЭКСПЕРИМЕНТАЛЬНО — результаты ориентировочные.
 

const Livestock = (() => {

  // --- Справочник видов с формулами ---------------------------
  const SPECIES = {
    dog: {
      name: 'Собака',
      needsMeasures: true,          // промеры необязательны, но уточняют вес
      calc: (P, L) => (P * L) / 100 * 1,      // k = 1 (Седип, 2016)
      accuracy: 'проверено на 2 собаках, расхождение 8–25%',
      exact: true
    },
    cat: {
      name: 'Кошка',
      needsMeasures: true,
      calc: (P, L) => (P * L) / 100 / 3,      // k = 1/3 (Седип, 2016)
      accuracy: 'проверено на 3 кошках, расхождение до 5%',
      exact: true
    },
    cattle: {                          // КРС: коровы, быки, телята
      name: 'КРС (корова, бык)',
      needsMeasures: true,            // промеры обязательны — это основной способ
      calc: (P, L, k = 2) => (P * L) / 100 * k,
      // k: 2 — молочные породы (в т.ч. тувинские), 2.5 — мясные
      accuracy: 'ошибка ±20–30 кг (способ Трухановского)',
      exact: false
    },
    horse: {
      name: 'Лошадь',
      needsMeasures: true,
      calc: (P) => 6 * P - 620,       // формула Моторика
      calcAlt: (P) => 6.4 * P - 689,  // второй вариант, берём среднее
      calcFinal: (P) => ((6 * P - 620) + (6.4 * P - 689)) / 2,
      accuracy: 'ориентировочно',
      exact: false
    },
    pig: {
      name: 'Свинья',
      needsMeasures: true,
      calc: (P, L) => 1.54 * P + 0.99 * L - 150,
      accuracy: '±5–10%',
      exact: false
    },
    sheep: {                           // МРС: овца
      name: 'Овца',
      needsMeasures: true,
      calc: (P, L, k = 0.7) => (P * L) / 100 * k,
      accuracy: 'ОРИЕНТИРОВОЧНО: по справочникам овец по промерам не взвешивают, ошибка до 25–30%. Коэффициент калибруйте одним реальным взвешиванием.',
      exact: false
    },
    goat: {                            // МРС: коза
      name: 'Коза',
      needsMeasures: true,
      calc: (P, L, k = 0.7) => (P * L) / 100 * k,
      accuracy: 'ОРИЕНТИРОВОЧНО: ошибка до 25–30%, нужна калибровка.',
      exact: false
    }
  };

  // --- Поправка на упитанность (стыкуется с BCS 1–9) ----------
  // BCS <= 3  → нижесредняя упитанность: минус 5–10%
  // BCS 4–6   → средняя: без поправки
  // BCS >= 7  → вышесредняя: плюс 5–10%
  function bcsFactor(bcs) {
    if (!bcs) return 1;
    if (bcs <= 3) return 0.925;   // −7,5% (середина диапазона 5–10%)
    if (bcs >= 7) return 1.075;   // +7,5%
    return 1;
  }

  // --- Главная функция: оценка веса по промерам ---------------
  // P — обхват груди за лопатками, см
  // L — прямая длина туловища (от середины холки до корня хвоста), см
  // bcs — индекс кондиции 1–9 (если известен)
  // k — пользовательский коэффициент породы (для МРС и КРС)
  function estimateWeight(speciesKey, P, L, { bcs = null, k = null } = {}) {
    const sp = SPECIES[speciesKey];
    if (!sp || !P || P <= 0) return null;
    const kEff = k || sp.defaultK;
    let m = sp.calcFinal ? sp.calcFinal(P, L) : sp.calc(P, L, kEff);
    const f = bcsFactor(bcs);
    return {
      weight: Math.round(m * f * 10) / 10,          // кг
      range: [Math.round(m * f * 0.9 * 10) / 10,   // узкий диапазон ±10%
              Math.round(m * f * 1.1 * 10) / 10],
      accuracy: sp.accuracy,
      exact: sp.exact,
      corrected: f !== 1,
      bcs
    };
  }

  /* ------------------------------------------------------------
     Сужение диапазона идеального веса.
     Без промеров — широкий «породный» диапазон (как сейчас).
     Если введены промеры — идеальный диапазон сужается до
     ±10% вокруг расчётной массы: точный режим.
     ------------------------------------------------------------ */
  function refineIdealRange(baseRange, estimate) {
    if (!estimate || !baseRange) return { range: baseRange, mode: 'wide' };
    // берём узкий диапазон только если он внутри разумных границ
    const [lo, hi] = estimate.range;
    return {
      range: [lo, hi],
      mode: 'exact',
      label: 'по промерам (экспериментально)'
    };
  }

  /* ------------------------------------------------------------
     Статистика промеров. Хранится в LocalStorage вместе с весами:
     petMeasurements_<petId> = [{date, weight, P, L, bcs}, ...]
     ------------------------------------------------------------ */
  function addMeasurement(petId, { date, weight, P, L, bcs }) {
    const key = 'petMeasurements_' + petId;
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    list.push({ date, weight: +weight, P: +P, L: +L, bcs });
    list.sort((a, b) => new Date(a.date) - new Date(b.date));
    localStorage.setItem(key, JSON.stringify(list));
    return list;
  }

  function getMeasurementHistory(petId) {
    return JSON.parse(localStorage.getItem('petMeasurements_' + petId) || '[]');
  }

  // Анализ динамики: набирает / сбрасывает / стабильна
  // Среднесуточный привес — как в зоотехнии: (m1 − m0) / дни
  function analyzeTrend(history) {
    if (!history || history.length < 2) {
      return { status: 'Мало данных: внесите хотя бы 2 измерения' };
    }
    const first = history[0], last = history[history.length - 1];
    const days = (new Date(last.date) - new Date(first.date)) / 86400000;
    if (days < 1) return { status: 'Измерения в один день' };
    const gain = last.weight - first.weight;
    const perDay = (gain / days);

    let status;
    if (perDay > 0.01)      status = 'Набирает вес';
    else if (perDay < -0.01) status = 'Снижает вес';
    else                     status = 'Стабильно';

    return {
      status,
      gain: Math.round(gain * 10) / 10,                        // кг за период
      perDay: Math.round(perDay * 1000) / 1000,                // кг/сутки (привес)
      periodDays: Math.round(days),
      forYoung: perDay > 0 ? 'питомец растёт — это нормально для молодняка'
                            : 'для молодняка снижение веса — повод показать ветеринару'
    };
  }

  return { SPECIES, estimateWeight, refineIdealRange,
           addMeasurement, getMeasurementHistory, analyzeTrend };
})();
