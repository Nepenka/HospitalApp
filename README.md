# HospitalApp — README

---

## 1. Краткое описание приложения

HospitalApp — мобильное приложение для врачей, которое помогает быстро оценить степень тяжести аллергической реакции у пациента. Врач отмечает наблюдаемые симптомы в виде квиза; приложение агрегирует выбранные симптомы по системам органов, вычисляет субградации (Л — лёгкая, У — умеренная, Т — тяжёлая) для каждой системы и на их основе — финальную степень тяжести (0–5) согласно клиническому ключу. Также учитываются витальные параметры (АД, срАД, возраст, SpO₂, GCS и т.д.) — при критических значениях они корректируют результат.

---

## 2. Архитектура проекта (MVVM-C)

Проект реализован по паттерну **MVVM-C** (Model-View-ViewModel + Coordinator). Это даёт чёткое разделение ответственности, удобство тестирования и масштабируемость.

Компоненты:

* **Coordinators** — маршрутизация и навигация (AppCoordinator, MainCoordinator).
* **ViewModels** — логика представлений (SymptomsViewModel, VitalsViewModel, ResultViewModel).
* **Views / ViewControllers** — UI (SymptomsViewController, VitalsViewController, ResultViewController).
* **Models** — доменные модели (Symptom, SystemType, Subgrade, SeverityLevel, Vitals, Examination).
* **Services** — бизнес-логика и правила (SeverityEngine).
* **Repositories** — сохранение/извлечение осмотров (ExaminationRepository).
* **Resources** — локализации, статичные данные (список симптомов и т.п.).

Структура в проекте (соответствует дереву в Xcode):

```
Application/
  AppDelegate, SceneDelegate
Coordinators/
  AppCoordinator.swift
  MainCoordinator.swift
Models/
  Symptom.swift
  SystemType.swift
  Subgrade.swift
  SeverityLevel.swift
  Vitals.swift
Modules/
  Symptoms/
    SymptomsViewController.swift
  Vitals/
    VitalsViewController.swift
  Result/
    ResultViewController.swift
Repositories/
  ExaminationRepository.swift
Services/
  SeverityEngine.swift
ViewModels/
  SymptomsViewModel.swift
  VitalsViewModel.swift
  ResultViewModel.swift
Resources/
```

---

## 3. Принцип работы (data flow / пользовательский сценарий)

1. Врач открывает приложение → выбирает «Новая оценка».
2. Врач отмечает наблюдаемые симптомы (tap = выбран → подсвечено). Симптомы имеют метаданные: `system: SystemType` и `defaultSubgradeHint` (Л/У/Т).
3. Опционально врач вводит витальные параметры (сист. / диаст. АД, возраст, SpO₂, ЧСС и т.д.).
4. **SeverityEngine.computeSubgrades(selectedSymptoms:)** агрегирует выбранные симптомы по системам и выводит для каждой системы итоговую субградацию (.none / .light / .moderate / .severe). Эти субградации показываются врачу (UX: badging рядом с названием системы).
5. Врач нажимает «Рассчитать». **SeverityEngine.computeFinalSeverity(perSystem:vitals:)** применяет правила из клинической таблицы (приоритеты, комбинации) и override-правила по витальным параметрам. Возвращается `SeverityResult` с числовой степенью тяжести, per-system субградациями и пояснением (explanation).
6. Результат отображается на экране результата; врач может сохранить/экспортировать осмотр.

---

## 4. Главный алгоритм (SeverityEngine) — концепт и конфигурация

В проекте реализован `SeverityEngine` с конфигом, позволяющим тонко настраивать правила.

Конфигурация (по умолчанию):

```swift
struct SeverityEngineConfig {
    var lightToModerateThreshold: Int = 2 // сколько лёгких повышает до У
    var meanArterialPressureCriticalThreshold: Double = 65.0 // критический срАД для взрослых
}
```

Ключевые методы:

* `computeSubgrades(selectedSymptoms: [Symptom]) -> [SystemType: Subgrade]`
  Группирует симптомы по `SystemType`, считает количество Л/У/Т внутри системы и применяет правило:

  * если есть ≥1 Т → итог = Т
  * иначе если есть ≥1 У → итог = У
  * иначе если есть ≥1 Л:

    * если `lightCount >= config.lightToModerateThreshold` → итог = У
    * else → итог = Л
  * иначе → .none

* `computeFinalSeverity(perSystem: [SystemType: Subgrade], vitals: Vitals?) -> SeverityResult`

  1. Применяет override от витальных параметров (гипотензия → повышает CV до Т; срАД < порога → также повышает CV до Т).
  2. Применяет таблицу приоритетов:

     * Т в любой критической системе (cardiovascular, neurological, respiratory) → степень **5**
     * У в критической системе → степень **4**
     * Л в критической системе → степень **3**
     * Комбинация лёгких в не-критических (skin + gastrointestinal + mucous) ≥ 2 систем → степень **2**
     * Одиночное лёгкое в не-критической системе → степень **1**
     * Иначе → степень **0** (нет реакции)
  3. Формирует `explanation` с перечислением субградаций, применённых правил и коррекций по витальным.

> В ReadMe ниже приведён упрощённый пример реализации метода (в коде проекта находится полноценно реализованный класс `SeverityEngine.swift`).

---

## 5. Формат результата

```swift
struct SeverityResult {
    let severityGrade: Int    // 0..5
    let perSystemSubgrades: [SystemType: Subgrade]
    let explanation: String   // человекочитаемое описание логики вычисления
}
```
