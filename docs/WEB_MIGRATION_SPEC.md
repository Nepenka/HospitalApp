# АнаФикс: ТЗ на перенос iOS-приложения в Web

**Статус документа:** implementation-ready specification; медицинские правила ОАР и возрастные пороги подтверждены источниками, оставшиеся продуктовые пробелы закрыты временными заглушками  
**Источники истины:** ветка `development`, commit `d9c107038e38454dbea5bb568f75296d1163e300`; `1_2_Инструкция_диагностика_АФ_07_09_25.doc`; `Правки_и_дополнения_к_мобильному_приложению.docx`; более поздний документ заказчика `аф ПРАВКИ Рубан 30.06.2026.docx`  
**Дата анализа:** 2026-09-29  
**Язык интерфейса:** русский  
**Классификация утверждений:** `CONFIRMED IN CODE`, `CONFIRMED BY CLIENT`, `INFERRED`, `UNKNOWN / NEEDS CLARIFICATION`

> Важное ограничение. Документ фиксирует фактическое поведение исходного кода и отдельно — требования из предоставленных документов. При конфликте целевое Web-поведение определяется правками заказчика от 30.06.2026 как наиболее поздними. Временные решения явно помечены `TEMPORARY PLACEHOLDER` и должны быть заменены после согласования; они не считаются подтверждённой медицинской логикой.

## 1. Product Overview

`CONFIRMED IN CODE` «АнаФикс» — приложение поддержки врача при оценке острой аллергической реакции (ОАР) и признаков анафилаксии. Пользователь вводит данные пациента, отмечает симптомы, вводит витальные показатели, получает:

- итоговую степень ОАР от 0 до 5;
- субградации по шести системам органов;
- объяснение применённых правил;
- результаты трёх вариантов диагностики анафилаксии;
- рассчитанное клиническое заключение (на первом этапе — только для чтения);
- локально сохраняемую историю осмотров.

`CONFIRMED BY CLIENT` Основной пользователь — врач. Нормы витальных показателей должны помогать быстро ориентироваться, особенно взрослым врачам при оценке детей. `INFERRED` Приложение является clinical decision support, а не автономной диагностической системой. Любой результат должен явно обозначаться как помощь в принятии решения и требовать подтверждения врачом.

`UNKNOWN` Медицинская организация, страна эксплуатации, нормативный статус, зарегистрированное назначение продукта и наличие формального владельца клинических алгоритмов в репозитории не указаны.

## 2. Existing iOS Application

### 2.1 Состав проекта

`CONFIRMED`

- UIKit, программная вёрстка без storyboard для рабочих экранов.
- Combine для реактивных привязок ViewModel → View.
- Coordinator для навигации.
- Core Data для локального хранения.
- Codable/JSON payload для сохранения полного осмотра.
- Внешние пакеты и SDK отсутствуют.
- Сеть, API, Firebase, аналитика, push-уведомления, Keychain и авторизация отсутствуют.
- Локализация отсутствует; строки встроены в код на русском языке.
- Принудительная светлая тема.
- Минимальная iOS target-конфигурация в target: 18.6; в project-конфигурации присутствует 26.0 — несогласованность сборочных настроек.
- XCTest-файлы существуют, но в `project.pbxproj` не обнаружен отдельный test target. Запуск тестов на Windows невозможен; наличие файлов тестов использовано как источник ожидаемого поведения.

### 2.2 Фактическая архитектура

`CONFIRMED` Смешанная UIKit + MVVM + Coordinator + Repository архитектура:

```text
SceneDelegate
  → AppCoordinator
    → MainCoordinator
      → UIViewController
        ↔ ViewModel
          → Domain models / SeverityEngine / ClinicalConclusionEngine
          → Repository
            → CoreDataStack
              → Core Data SQLite store
```

Ответственность компонентов:

| Компонент | Ответственность | Source |
|---|---|---|
| `MainCoordinator` | маршрут нового осмотра, история, редактирование, сброс | `HospitalApp/Coordinators/MainCoordinator.swift` |
| `PatientStartViewModel` | валидация ФИО/диагноза, разбор ФИО, сохранение пациента | `HospitalApp/Modules/ViewModels/PatientStartViewModel.swift` |
| `SymptomsViewModel` | каталог, выбор, override субградации, группировка | `HospitalApp/Modules/ViewModels/SymptomsViewModel.swift` |
| `VitalsViewModel` | хранение показателей, derived state | `HospitalApp/Modules/ViewModels/VitalsViewModel.swift` |
| `SeverityEngine` | субградации и итоговая степень | `HospitalApp/Services/SeverityEngine.swift` |
| `ClinicalConclusionEngine` | три варианта анафилаксии и текст заключения | `HospitalApp/Services/ClinicalConclusionEngine.swift` |
| `ExaminationRepository` | CRUD осмотров | `HospitalApp/Repositories/ExaminationRepository.swift` |
| `PatientRepository` | запись пациентов без чтения/обновления | `HospitalApp/Repositories/PatientRepository.swift` |

## 3. User Roles

### 3.1 Existing

`CONFIRMED` Роли и авторизация отсутствуют. Любой пользователь устройства имеет полный доступ к созданию, просмотру, редактированию, экспорту и удалению записей.

### 3.2 Required for production Web

`INFERRED`

- `Clinician`: создание, просмотр, изменение и экспорт доступных ему осмотров.
- `Administrator`: управление пользователями, политиками хранения и аудитом; не должен автоматически получать клинический доступ без отдельного разрешения.

`UNKNOWN / NEEDS CLARIFICATION` Нужны ли разделение по организациям, общий доступ внутри отделения, read-only роль и идентификатор врача в осмотре.

## 4. Complete User Flow

### 4.1 Основной сценарий

```text
Старт
  → Данные пациента: ФИО + вероятный аллерген
  → выбрать минимум 1 симптом по одной или нескольким системам
  → при сложном симптоме выбрать вариант субградации
  → ввести возраст и все обязательные витальные показатели
  → увидеть вычисленные срАД / гипотензию / тахикардию / одышку
  → рассчитать степень ОАР и три диагностических критерия
  → проверить/отредактировать диагноз
  → сохранить осмотр
  → возврат к пустому стартовому экрану
```

### 4.2 История

```text
Старт → История осмотров
  → поиск по ФИО или дате
  → контекстное действие:
      Поделиться | Редактировать | Удалить
```

### 4.3 Редактирование

```text
История → Редактировать
  → Симптомы с восстановленным выбором
  → Витальные данные с восстановленными значениями
  → Пересчитанный результат
  → Сохранить
  → старый осмотр удаляется, создаётся новый UUID и новая дата
```

`CONFIRMED` Редактирование фактически заменяет запись и меняет `id`/`date`. `NEEDS REVIEW`: в Web рекомендуется сохранять исходный ID и `createdAt`, записывая `updatedAt` и audit event.

### 4.4 Навигационные состояния

- Back возвращает на предыдущий экран с текущим in-memory состоянием UIKit-контроллера.
- Новый осмотр сбрасывает пациента и стартовую форму.
- Прямые URL, refresh и потеря вкладки в iOS отсутствуют; Web обязан обработать их явно.
- Незавершённый пациент сохраняется в Core Data уже при нажатии «Начать осмотр», даже если осмотр не будет завершён.

## 5. Screens & Navigation

| Screen | Purpose | Inputs / UI | Validation | Actions / Navigation | State / Dependencies | Source |
|---|---|---|---|---|---|---|
| Данные пациента | Начало осмотра | Текущий iOS: ФИО + предварительный диагноз. Web target: ФИО + вероятный/известный аллерген; «Начать осмотр», «История осмотров» | ФИО обязателен; модель обязательности аллергена требует решения | start → symptoms; history → history | `PatientStartViewModel`, `PatientRepository` | код + правки заказчика п. 1-2 |
| Симптомы | Выбор клинических проявлений | 6 секций, checkbox-like строки, badge Л/У/Т, счётчик, «Продолжить» | минимум 1 выбранный симптом | option sheet для сложных симптомов; continue → vitals | Все названия показываются полностью без усечения; строки переносятся по словам | код + правки заказчика п. 3-7 |
| Витальные данные | Ввод возраста/показателей | years/months, age-appropriate baseline SBP, SBP, DBP, SpO2, HR, RR, GCS; live derived labels и серые подсказки нормы по возрасту | нулевые/пропущенные и диапазонные значения требуют явной проверки | sticky calculate action → result | Для ребёнка поле baseline adult SBP скрыто автоматически; действие перехода всегда видно | код + правки заказчика п. 8-9 |
| Результат | Объяснимый результат и сохранение | степень, системные субградации без дублирования, финальное заключение, 3 criterion cards, вероятный аллерген, полный иерархический список симптомов | расчёт и финальное заключение должны быть сформированы | save → root; new → root | Не показывать отдельное поле предварительного диагноза | код + правки заказчика п. 10-17 |
| История осмотров | Поиск и управление | search, список карточек | нет | open full examination/share/edit/delete | Детали показывают все симптомы, сгруппированные по требуемой иерархии | код + правки заказчика п. 13 и 16 |

### 5.1 Web routes

| iOS Screen | Web route | Component | Route guard |
|---|---|---|---|
| Login (новый security requirement) | `/login` | `LoginPage` | только anonymous |
| Данные пациента | `/examinations/new/patient` | `PatientStep` | authenticated |
| Симптомы | `/examinations/new/symptoms` | `SymptomsStep` | есть валидный patient draft |
| Витальные данные | `/examinations/new/vitals` | `VitalsStep` | выбран ≥1 symptom |
| Результат | `/examinations/new/result` | `ResultStep` | draft валиден и расчёт выполнен |
| История | `/examinations` | `ExaminationListPage` | authenticated |
| Просмотр осмотра (новый явный экран) | `/examinations/:id` | `ExaminationDetailsPage` | record access |
| Редактирование | `/examinations/:id/edit/symptoms` и последующие wizard routes | reuse wizard | record access |

При refresh незавершённого wizard серверный draft не создаётся автоматически. Допустимые варианты: восстановить session-only draft с предупреждением или перенаправить на последний валидный шаг. PHI не хранить в `localStorage`.

## 6. Features

| Feature | Existing implementation | Business requirement | Web implementation | Priority |
|---|---|---|---|---|
| Новый осмотр | navigation stack | пошаговый ввод | responsive wizard с progress indicator | P0 |
| Пациент и аллерген | отдельная Core Data patient; аллерген сейчас вводится позже | идентификация пациента и данные контакта | patient record + allergen/contact model + snapshot | P0 |
| Каталог симптомов | hard-coded Swift array | одинаковый стабильный каталог | versioned TypeScript catalog | P0 |
| Варианты симптома | action sheet + override | точная субградация | accessible radio dialog/inline disclosure | P0 |
| Live vitals | Combine | немедленная обратная связь | pure selectors, debounced только при необходимости | P0 |
| Степень ОАР | `SeverityEngine` | детерминированный объяснимый расчёт | pure domain module + exhaustive tests | P0 |
| Анафилаксия | `ClinicalConclusionEngine` | три независимых checks | pure domain module + versioning | P0 |
| История | Core Data local | поиск/CRUD и просмотр полного осмотра | authenticated API + PostgreSQL + details route | P0 |
| Поиск | in-memory ФИО/дата | найти запись | server query, normalized search | P0 |
| Редактирование | delete + recreate | изменить осмотр | transactional update + audit | P0 |
| Удаление | без confirm | удалить запись | confirm dialog + soft delete policy | P0 |
| Share | iOS share sheet, plain text | передать сводку | print/copy/download with PHI warning and audit | P1 |
| Offline | не заявлен, локальное приложение работает offline | неизвестно | не добавлять до определения security model | P2 / REVIEW |

## 7. Business Rules

### 7.1 Patient and probable allergen

- `CONFIRMED IN CODE` ФИО и предварительный диагноз обязательны и trim-ятся.
- `CONFIRMED BY CLIENT` В Web поле «Предварительный диагноз» удаляется и заменяется на «Вероятный аллерген». Значение аллергена должно участвовать во 2-м и 3-м критериях NIAID/FAAN 2005.
- `TEMPORARY PLACEHOLDER / NR-06` До утверждения отдельной модели контакта используется одно необязательное текстовое поле «Вероятный аллерген»: непустое значение означает `allergenContact = yes`, пустое — `unknown`. Интерфейс не делает вывода «контакта не было». Это решение должно быть заменено tri-state-полем после согласования.
- `CONFIRMED IN CODE` ФИО разбивается по пробелам: token 0 = фамилия, 1 = имя, 2 = отчество; отсутствующие имя/отчество заменяются `-`; tokens после третьего игнорируются.
- `NEEDS REVIEW` Это не поддерживает составные фамилии/имена. В Web предпочтительны три отдельных поля, но изменение требует продуктового решения и миграции.
- `CONFIRMED` Patient сохраняется до завершения осмотра; orphan records возможны.

### 7.2 Symptom selection

- Минимум один симптом обязателен для перехода.
- Обычный symptom toggle сохраняет default subgrade.
- Сложный symptom открывает варианты. Выбор варианта выставляет `isSelected=true` и `overrideSubgrade`; «Снять выбор» сбрасывает override.
- Итоговая subgrade симптома: `overrideSubgrade ?? defaultSubgradeHint`.
- Восстановление редактируемого осмотра сопоставляет симптомы по `(name, system)`, а не по UUID.
- `CONFIRMED BY CLIENT` Все длинные названия должны переноситься и отображаться полностью. Горизонтальное усечение и многоточие запрещены.
- `CONFIRMED BY CLIENT` Повторная позиция «Чувство тревоги, страх смерти» удаляется.
- `CONFIRMED BY CLIENT` «Ангионевротический отек» переименовывается в «АНО вне слизистых».
- `CONFIRMED BY CLIENT` В respiratory catalog добавляются отдельные симптомы: «Появление кашля» (Л), «Кашель персистирующий» (У), «Стридор без ПРД» (У), «Стридор с ПРД» (Т).
- `CONFIRMED BY CLIENT` Позиция «Отек языка» расширяется до «Отек языка, мягкого неба, язычка».

### 7.3 System subgrade aggregation

Приоритет внутри каждой системы:

1. любой `Т` → `Т`;
2. иначе любой `У` → `У`;
3. иначе ≥1 `Л` → `Л`;
4. исключение: для `Кожа`, `Реакции слизистых/АНО`, `ЖКТ` два и более `Л` повышают систему до `У`;
5. нет симптомов → `Нет`.

### 7.4 Save

- Диагноз обязателен.
- На новом осмотре поле диагноза уже содержит предварительный диагноз, поэтому рассчитанный `conclusionText` не подставляется.
- Автоподстановка `conclusionText` происходит только если diagnosis пуст.
- При edit старая запись удаляется, затем создаётся новая; атомарности нет.
- `TEMPORARY PLACEHOLDER / NR-12` В Web рассчитанное финальное заключение сохраняется как неизменяемый снимок и показывается только для чтения. Свободное редактирование заключения не реализуется до отдельного решения; врач подтверждает результат отдельным действием.

## 8. Algorithms & Formulas

### Algorithm A: Patient age normalization

**Purpose:** построить возраст для порогов.  
**Input:** `ageYears?`, `ageMonths?`.  
**Output:** `{years, months}` или nil.  
**Rules:** если years ≥0, months приводятся к диапазону 0...11 (`nil` → 0); иначе разрешён months 0...11 с years=0.  
**Edge:** `Vitals.isValid` может пропустить months >11, хотя `PatientAge` вернёт nil — подтверждённое расхождение.  
**Source:** `Models/Vitals.swift: PatientAge.init`, `Vitals.isValid`.  
**Web requirement:** принимать `years >= 0`, `months = 0...11`, ничего не округлять и не ограничивать молча. Возраст старше 130 лет допускается только после явного подтверждения предупреждения как временная защита от опечатки.

### Algorithm B: Mean arterial pressure

```text
MAP = (1/3 × SBP) + (2/3 × DBP)
```

Возвращает nil, если отсутствует SBP или DBP. UI отображает одно десятичное значение.  
**Source:** `Models/Vitals.swift: meanArterialPressure`.

### Algorithm C: Hypotension

**Adult (age ≥18):** trigger, если `MAP < 65` OR `SBP < 90` OR (`baselineSBP > 0` AND `SBP < baselineSBP × 0.7`). Ровно 65/90/70% не trigger. Impact: cardiovascular `У`.

**Child:**

| Age | SBP threshold | Trigger | Impact |
|---|---:|---|---|
| <1 year | 70 | SBP <70 | cardiovascular `Т` |
| 1...10 years | `70 + 2 × years` | SBP below threshold | cardiovascular `Т` |
| 11...17 years | 90 | SBP <90 | cardiovascular `Т` |

Если SBP отсутствует: no trigger, no impact.  
**Source:** `Models/Vitals.swift: hypotensionRule`.

### Algorithm D: Tachycardia

| Age | HR threshold | Trigger | Impact |
|---|---:|---|---|
| <3 months | 150 | HR > threshold | cardiovascular `Л` |
| 3..<6 months | 130 | `>` | cardiovascular `Л` |
| 6..<12 months | 120 | `>` | cardiovascular `Л` |
| 1...10 years | 130 | `>` | cardiovascular `Л` |
| 11...17 years | 100 | `>` | cardiovascular `Л` |
| ≥18 years | 100 | `>` | cardiovascular `Л` |

Если HR отсутствует: no trigger.  
**Source:** `Models/Vitals.swift: tachycardiaRule`.

### Algorithm E: Dyspnea by respiratory rate

| Age | RR threshold | Trigger | Impact |
|---|---:|---|---|
| <3 months | 60 | RR > threshold | respiratory `Л` |
| 3..<12 months | 50 | `>` | respiratory `Л` |
| 1...5 years | 40 | `>` | respiratory `Л` |
| 6...10 years | 35 | `>` | respiratory `Л` |
| 11...17 years | 30 | `>` | respiratory `Л` |
| ≥18 years | 20 | `>` | respiratory `Л` |

**Source:** `Models/Vitals.swift: dyspneaRule`.

### Algorithm E.1: SpO2 impact

`CONFIRMED BY CLIENT DOCUMENT`: при `SpO2 < 92%` автоматически добавить respiratory `У`, что соответствует минимум ОАР 4. Ровно 92% не является trigger. Нормативная подсказка для любого возраста — `95%`.

Это целевая логика Web и исправление текущего iOS, где такое влияние появляется только при ручном выборе симптома «SaO2 < 92%».

### Algorithm F: GCS impact

`CONFIRMED BY CLIENT` GCS влияет на неврологическую субградацию:

- GCS = 15: автоматического impact нет;
- GCS 13...14: neurological `У`;
- GCS <13: neurological `Т`.

`CONFIRMED BY SOURCE + TECHNICAL GUARDRAIL`: нормативная подсказка — 15 баллов; допустимый ввод — целое число 3...15. Значения вне диапазона блокируются. Более поздние правки от 30.06.2026 имеют приоритет над ранним указанием «не учитывать GCS в расчёте» и сохраняют автоматическое влияние 13...14 → `У`, <13 → `Т`.

### Age-specific normative guidance

`CONFIRMED BY CLIENT DOCUMENT` После ввода возраста рядом с полями показываются серые, но контрастные подсказки. Значения ниже/выше границы срабатывают строго по указанному знаку; равенство не срабатывает.

| Age | SBP guidance / hypotension | HR guidance / tachycardia | RR guidance / dyspnea |
|---|---|---|---|
| 0..<3 months | 70 / `<70` | 150 / `>150` | 60 / `>60` |
| 3..<6 months | 70 / `<70` | 130 / `>130` | 50 / `>50` |
| 6..<12 months | 70 / `<70` | 120 / `>120` | 50 / `>50` |
| 1...5 years | `70 + 2×years` / below result | 130 / `>130` | 40 / `>40` |
| 6...10 years | `70 + 2×years` / below result | 130 / `>130` | 35 / `>35` |
| 11...17 years | 90 / `<90` | 100 / `>100` | 30 / `>30` |
| >=18 years | 90; additionally MAP `<65` or SBP drop `>30%` | 100 / `>100` | 20 / `>20` |

Для всех возрастов: SpO2 guidance `95%`, автоматический trigger `<92%`; GCS guidance `15`.

### Algorithm G: Vital impacts

Каждый triggered impact повышает subgrade соответствующей системы только если `impact.severityValue > current.severityValue`. Понижение невозможно. Каждое событие добавляется в explanation.  
**Source:** `Services/SeverityEngine.swift: computeFinalSeverity`.

### Algorithm H: Final OAR severity

Critical systems = cardiovascular, neurological, respiratory.  
Non-critical = skin, gastrointestinal, mucous.

`CONFIRMED BY CLINICAL INSTRUCTION` Итог — максимальная степень из применимых строк:

1. Любой cardiovascular, neurological или respiratory `Т` → grade 5.
2. Любой cardiovascular, neurological или respiratory `У` → grade 4.
3. Тяжёлая реакция слизистых/АНО → grade 4.
4. Любой cardiovascular, neurological или respiratory `Л` → grade 3.
5. Любой `У` в skin, gastrointestinal или mucous/АНО → grade 2.
6. Лёгкие признаки в двух и более из skin, gastrointestinal, mucous/АНО → grade 2.
7. Один лёгкий признак только в одной из этих систем → grade 1.
8. Нет применимых признаков → grade 0.

Два и более лёгких признака внутри одной non-critical системы предварительно агрегируются в `У` по разделу 7.3 и поэтому также дают grade 2. При признаках нескольких систем выбирается наиболее тяжёлый результат. Тяжёлая subgrade для skin/GI отсутствует в утверждённом каталоге; неожиданный исторический payload с таким сочетанием считается ошибкой данных и не маппится догадкой.

`FIX FROM LEGACY`: текущая iOS-реализация игнорирует non-critical `У`, поэтому может ошибочно вернуть grade 0. Web обязан реализовать таблицу выше; regression case skin `У` + mucous `У` → grade 2.

### Algorithm I: Primary anaphylaxis variant

Confirmed, если хотя бы одно:

- grade ≥4;
- grade =3 и active system count ≥2;
- isolated hypotension: `vitals.isHypotension`, cardiovascular active и других active systems нет;
- есть respiratory symptom/system и respiratory subgrade `У` или `Т`.

**Source:** `ClinicalConclusionEngine.evaluatePrimaryVariant`.

### Algorithm J: NIAID/FAAN 2005 variant

`TEMPORARY PLACEHOLDER / NR-03`: на старте осмотра хранить tri-state `acuteOnset = yes | no | unknown`, по умолчанию `unknown`. Критерий 1 может быть подтверждён только при `yes`; при `unknown` возвращать `notEnoughData`, а не автоматически считать острое начало истинным. Дата/время и допустимое клиническое окно будут добавлены после согласования.

Derived booleans:

- `hasSkin`: keyword match по skin/mucous list;
- `hasResp`: keyword match по respiratory list;
- `hasCV`: hypotension OR urinary incontinence;
- `hasModerateGI`: GI symptom with effective subgrade `У` or `Т`.

Criteria:

1. `hasSkin AND (hasResp OR hasCV)`.
2. `allergenContact == true AND count(hasSkin, hasResp, vitals.isHypotension, hasModerateGI) >=2`.
3. `allergenContact == true AND NIAID hypotension`.

If none confirmed and allergenContact nil and criterion 1 false → `Недостаточно данных`; else `Не подтверждена`.

`CONFIRMED BY CLIENT` Критерий 1 включает «острое начало»; Web должен получить структурированный признак/время начала, а не считать его автоматически истинным. Документ заказчика подтверждает, что критерий 2 считает именно снижение АД, а не все cardiovascular symptoms; текущее исключение urinary incontinence из category count сохраняется.  
**Source:** `ClinicalConclusionEngine.evaluateNIAIDVariant`.

### Algorithm K: WAO 2020 variant

1. `hasSkin AND (hasResp OR hasCV OR hasModerateGI)`.
2. `allergenContact == true AND (WAO hypotension OR hasResp)`.

If none confirmed and allergenContact nil → `Недостаточно данных`; else `Не подтверждена`.

WAO hypotension: baseline drop >30%; else age ≤10 threshold `70 + 2×years`; age >10 threshold 90.

`CONFIRMED BY CLIENT` Расчёт WAO 2020 обязателен. Стридор добавляется как два достижимых структурированных симптома, а отёк языка расширяется до мягкого нёба/язычка. Keyword matching должен быть заменён стабильными symptom codes.  
**Source:** `ClinicalConclusionEngine.evaluateWAOVariant`, `AnaphylaxisSymptomCatalog.swift`.  
**External source:** [World Allergy Organization Anaphylaxis Guidance 2020](https://www.worldallergyorganizationjournal.org/article/S1939-4551%2820%2930375-6/fulltext).

### Algorithm L: Urticaria/angioedema label

Только grade 1...2 и skin/mucous keyword present:

1. urticaria keyword → `крапивница`;
2. иначе matched angioedema names → `ангиоотёк: ...`;
3. иначе `кожно-слизистые проявления: ...`.

### Algorithm M: Final conclusion text

- Если любой из трёх anaphylaxis checks confirmed: `ОАР N степени тяжести (...)`.
- grade 3 label = `анафилаксия лёгкой степени`.
- grade 4 = `анафилаксия среднетяжелой степени`.
- grade 5 = `тяжёлая анафилаксия / анафилактический шок`.
- другие grades при confirmed → `анафилаксия` без severity adjective.
- Если anaphylaxis не confirmed, но urticaria/angioedema text есть, он включается в скобки.
- Иначе только `ОАР N степени тяжести`.
- `CONFIRMED BY CLIENT` Аббревиатура всегда отображается как «АНО», не «ано».
- `CONFIRMED BY CLIENT` После степени тяжести перечисляются симптомы/системы в мужском роде и строгом порядке: cardiovascular → neurological → respiratory → skin → mucous/АНО → gastrointestinal.
- `CONFIRMED BY CLIENT` На result screen не должно быть повторного блока тех же субградаций; объяснение остаётся доступным без визуального дублирования основного summary.

## 9. Data Models

### 9.1 Existing domain model

| Entity | Fields |
|---|---|
| Patient | `id: UUID`, `firstName`, `lastName`, `middleName`, `createdAt`; calculated `fullName` |
| Symptom | `id: UUID`, `name`, `system`, `defaultSubgradeHint`, `overrideSubgrade?`, `isSelected`; calculated `effectiveSubgrade` |
| Vitals | optional integers: age years/months, baseline SBP, SBP, DBP, SpO2, HR, RR, GCS; `probableAllergen?`; calculated MAP and flags |
| SeverityResult | `severityGrade`, `[SystemType: Subgrade]`, `explanation` |
| Examination | `id`, `date`, `patient`, `diagnosis`, selected symptoms, vitals, severity result |
| ClinicalConclusionResult | three checks, optional urticaria/angioedema text, conclusion and details text |

Enums:

- `SystemType`: skin, mucous, gastrointestinal, cardiovascular, neurological, respiratory.
- `Subgrade`: none=0, light=1, moderate=2, severe=3.
- `SeverityLevel`: 1...5; grade 0 не представлен enum.
- `DiagnosisStatus`: confirmed, notConfirmed, notEnoughData.

### 9.2 Existing persistence schema

`PatientEntity`: optional id, firstName, lastName, middleName, createdAt.  
`ExaminationEntity`: optional id/date/diagnosis/patient identifiers, Int16 severity/SBP, binary JSON payload.  
Нет Core Data relationships. История читается только из decodable `payload`; денормализованные поля используются только для записи/сортировки Core Data.

### 9.3 Proposed production Web schema

```text
users
  id uuid PK
  external_subject text UNIQUE
  display_name text
  role enum
  created_at timestamptz

patients
  id uuid PK
  organization_id uuid
  first_name text
  last_name text
  middle_name text nullable
  created_at timestamptz
  created_by uuid

examinations
  id uuid PK
  organization_id uuid
  patient_id uuid FK
  final_diagnosis text
  probable_allergen text nullable
  allergen_contact enum nullable
  acute_onset boolean nullable
  onset_at timestamptz nullable
  examined_at timestamptz
  created_at timestamptz
  updated_at timestamptz
  created_by uuid
  updated_by uuid
  algorithm_version text
  severity_grade smallint CHECK 0..5
  selected_symptoms jsonb
  vitals jsonb
  severity_result jsonb
  clinical_conclusion jsonb
  deleted_at timestamptz nullable
  row_version integer

audit_events
  id uuid PK
  organization_id uuid
  actor_id uuid
  examination_id uuid nullable
  action enum
  occurred_at timestamptz
  metadata jsonb (без лишнего PHI)
```

JSON snapshots сохраняются намеренно: пересчёт будущей версией алгоритма не должен менять исторический результат. Каталог и `algorithm_version` должны быть версионированы.

## 10. Validation Rules

### 10.1 Existing exact rules

| Field | Existing required | Existing validation |
|---|---:|---|
| fullName | yes | trim non-empty |
| preliminary diagnosis | yes in current iOS; removed in Web target | trim non-empty |
| selected symptoms | yes | count ≥1 |
| age | yes | years ≥0 OR months ≥0; additional incomplete rule described above |
| baseline SBP | no | Int parse only; >0 used for baseline formula |
| SBP, DBP, SpO2, HR, RR, GCS | yes | non-nil Int only; no range validation |
| probable allergen | no in current iOS | trimmed; empty → nil; Web target moves it to start screen |
| final diagnosis | yes | trim non-empty |

### 10.2 Web validation requirements

- Zod schema at UI boundary and server boundary.
- Numeric fields accept only whole numbers and show field-level errors.
- Do not silently clamp months or any vital input.
- Do not allow transition past an empty or zero vital value unless zero is clinically valid and explicitly approved. Client feedback explicitly says RR=0 must not pass as an ordinary value.
- Confirmed clinical thresholds and normative hints are defined in Algorithms C–F and are not input maxima.
- Hard guards: months `0...11`, SpO2 `1...100`, GCS `3...15`; SBP, DBP, HR and RR are positive whole numbers. Zero is rejected for every required vital field.
- `TEMPORARY PLACEHOLDER`: no undocumented upper hard limit is imposed on SBP, DBP, HR or RR. Obviously unusual values produce a non-blocking warning and require clinician confirmation; exact warning bands remain configuration, not medical classification.
- Diagnosis and allergen must have server-defined length limits.
- Server ignores client-calculated result and recalculates using the same versioned domain package before persistence.
- After age is entered, show the age-specific normal/threshold guidance next to the applicable vitals in muted but WCAG-compliant text.
- Hide adult baseline SBP for pediatric age; show it automatically for adult age.

## 11. Persistence

### Existing

- Device-local Core Data.
- No encryption policy visible in code.
- No backup/export/import policy.
- No audit trail.
- No conflict handling.
- Delete is hard delete without confirmation.

### Web recommendation

`Frontend-only` is enough only for a non-clinical demo using fictional data. IndexedDB supports structured transactional offline data but remains browser-origin storage and can be evicted or lost under browser policies; it does not provide organization-level authorization or audit ([MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)).

`Frontend + Backend + Database` is required for production use with identifiable patient data. Persistence must be server-owned, encrypted in transit and at rest by deployment controls, access-controlled, backed up, auditable, and governed by an approved retention policy.

## 12. Existing iOS Architecture

The business logic is already partly separated from UIKit and can be ported semantically:

| Platform-independent | iOS-specific |
|---|---|
| models/enums | UIViewController / UIKit controls |
| SeverityEngine | UINavigationController / Coordinator push-pop |
| VitalCriteriaCalculator | Combine bindings |
| ClinicalConclusionEngine | Core Data implementation |
| validation semantics | UIActivityViewController share sheet |
| search semantics | app/scene lifecycle and iOS light-mode forcing |

## 13. External Integrations

`CONFIRMED` Нет API endpoints, Firebase, authentication, analytics, cloud storage, maps, uploads, notifications, encryption API, cookies or external URLs.

`REQUIRED FOR WEB PRODUCTION` Identity provider / OIDC, managed PostgreSQL, error monitoring with PHI redaction, centralized audit logging and secure hosting. Конкретные vendors не выбирать до уточнения организации и юрисдикции.

## 14. iOS → Web Mapping

| iOS mechanism | Web replacement |
|---|---|
| UINavigationController | router + guarded wizard routes |
| Coordinator | route orchestration functions + wizard state machine |
| UIViewController | route/page component |
| Combine `@Published` | React state + form subscriptions + pure selectors |
| UIAlertController action sheet | accessible dialog/radio group |
| Core Data | PostgreSQL via server repository |
| Codable payload | versioned JSONB snapshot + runtime schema validation |
| UIActivityViewController | print/copy/download action with audit and PHI warning |
| iOS context menu | visible row action menu, keyboard accessible |
| swipe/tap keyboard dismissal | native browser form behavior |
| forced light mode | intentional accessible light theme; optional dark only after QA |
| clipped single-line labels | wrapping labels with no loss of clinical wording |
| bottom-only Continue button | sticky action bar visible during long forms |

## 15. Recommended Technology Stack

### Primary production stack

- **TypeScript strict mode** — shared domain types and explicit optionality; TypeScript documents `strict` as stronger type checking ([TypeScript strict](https://www.typescriptlang.org/tsconfig/strict)).
- **Next.js 16 Active LTS + React 19** — full-stack routing, server rendering where useful, API/server actions and one deployable application. Resolve and pin the latest security-patched release at implementation time; as of analysis, Next.js 16.3.6 is the patched Active LTS and another security release is announced for 2026-09-30 ([Next.js security news](https://nextjs.org/blog)).
- **Zod 4** — identical runtime schemas on client/server; official docs require TypeScript strict and describe Zod 4 as stable ([Zod](https://zod.dev/)).
- **React Hook Form** — performant form state and accessible field errors.
- **PostgreSQL** — durable relational core plus JSONB snapshots; current supported server release chosen by hosting provider.
- **Drizzle ORM** — typed schema and migrations with transparent SQL.
- **OIDC/OAuth 2.0 integration** — organization identity; no custom password storage unless required.
- **Vitest** for domain/unit tests; **Testing Library** for component behavior; **Playwright** for E2E.
- **CSS Modules + design tokens** or Tailwind only if the team already standardizes on it. Avoid a large component library; use accessible headless primitives for dialogs/menus.

Why not Vite-only: Vite is an excellent frontend tool and v8.3 is current supported as of analysis ([Vite releases](https://vite.dev/releases)), but production requirements here include authenticated server persistence, authorization, audit, and server-side recalculation. A frontend-only build is acceptable only as a demo.

## 16. Web Architecture

```text
Browser UI
  → route/page + form schema
  → application use-cases
  → shared pure domain package
      symptom catalog
      vital criteria
      severity engine
      clinical conclusion engine
  → server API/use-cases
      authz
      server validation
      server recalculation
      repository
  → PostgreSQL + audit log
```

Suggested structure:

```text
src/
  app/
    login/
    examinations/
      new/[step]/
      [id]/
      [id]/edit/[step]/
    api/
  components/
    clinical/
    forms/
    ui/
  domain/
    patient/
    symptoms/
    vitals/
    severity/
    conclusion/
    algorithm-version.ts
  application/
    examinations/
  server/
    auth/
    db/
    repositories/
    audit/
  schemas/
  test/
```

Hard rule: domain modules are pure and must not import React, Next.js, database or browser APIs.

## 17. Routes & Components

Core components:

- `ClinicalWizardLayout`: compact progress, patient identity context, safe back navigation.
- `PatientForm`: explicit labels, validation summary, probable allergen/contact inputs instead of preliminary diagnosis.
- `SymptomsBySystem`: semantic headings, search only if requested later, selected count.
- `SymptomChoice`: checkbox or button with selected state; never rely on color alone.
- `SymptomVariantDialog`: radio group, cancel and remove selection.
- `VitalsForm`: age mode, numeric inputs, age-specific normal hints, conditional baseline SBP, live criteria summary, sticky action.
- `SeveritySummary`: grade, active systems, non-duplicated explanation and ordered symptoms.
- `DiagnosisCheckCard`: title, status text/icon, reason.
- `ExaminationTable`: search, empty/loading/error states, visible actions.
- `ExaminationDetails`: complete persisted examination with every symptom grouped in the required hierarchy.
- `DeleteExaminationDialog`: explicit patient/date context and destructive confirmation.

## 18. State Management

- Server state: route loaders/server components + explicit mutations; no global client cache unless profiling justifies it.
- Form state: React Hook Form.
- Wizard state: reducer/state machine scoped to wizard; all transitions validate prerequisites.
- Domain derived state: pure functions, never duplicated in components.
- No PHI in URL query strings, browser logs, analytics, localStorage or error payloads.
- Refresh: session draft may be stored server-side only after an explicit action or product decision. Until then, show a confirmation before abandoning a dirty form.

## 19. Backend & Database

### Required API behavior

| Operation | Requirement |
|---|---|
| `POST /api/examinations/calculate` | validate inputs, execute versioned domain logic, return result without persistence |
| `POST /api/examinations` | authorize, validate, recalculate, persist atomic snapshot + audit |
| `GET /api/examinations` | authorize, paginate, search by name/date, default newest first |
| `GET /api/examinations/:id` | authorize record scope |
| `PUT /api/examinations/:id` | optimistic concurrency, recalculate, preserve created metadata, audit |
| `DELETE /api/examinations/:id` | confirmation in UI, policy-driven soft/hard delete, audit |

Never trust grade/conclusion submitted by the client. Return stable machine-readable error codes plus localized messages.

## 20. Security

- Threat model before production.
- Target OWASP ASVS 5.0 Level 2 for authenticated application handling sensitive health data; OWASP describes ASVS as a basis for testing technical security controls ([OWASP ASVS](https://owasp.org/projects/asvs?tab=main)).
- HTTPS only; secure headers/CSP; CSRF protection for cookie sessions; SameSite/HttpOnly/Secure cookies.
- Deny-by-default authorization per organization and record.
- Short idle timeout appropriate to shared clinical workstations.
- Re-authentication for security-sensitive operations if required by organization policy.
- Server-side validation and output encoding.
- Secrets only in server environment/secret store.
- PHI redaction in logs, traces, exceptions and screenshots.
- Audit view/export protected separately.
- Encrypted backups and tested restore procedure.
- Dependency and container scanning; security-patched framework versions.
- No third-party analytics on clinical routes without explicit privacy approval.
- Jurisdictional privacy/compliance requirements are `UNKNOWN`; legal review is mandatory before real patient data.

## 21. Migration Matrix

| Item | Classification | Decision |
|---|---|---|
| Patient → symptoms → vitals → result flow | KEEP | preserve behavior and order |
| Exact catalog and current algorithms | KEEP pending REVIEW | freeze with golden tests; no silent medical changes |
| UIKit layout | REPLACE | responsive accessible web UI |
| Coordinator navigation | REPLACE | guarded routes/state machine |
| Combine | REPLACE | form state and pure selectors |
| Core Data | REPLACE | PostgreSQL/repository |
| Local-only unauthenticated access | REPLACE | authentication/authorization for production |
| Share sheet | ADAPT | secure print/copy/download, audit |
| Context-only row actions | ADAPT | visible/keyboard accessible actions |
| Delete without confirm | REPLACE | confirmation + policy/audit |
| Edit by delete/recreate | REPLACE | transactional update preserving identity |
| Forced portrait | REMOVE | responsive desktop/tablet/mobile |
| Forced light UIKit style | ADAPT | accessible visual system |
| iOS lifecycle/AppDelegate/SceneDelegate | REMOVE | no business value on Web |
| Orphan Patient save | REVIEW | likely save patient atomically with examination |

## 22. Edge Cases

- whitespace-only names/diagnoses;
- one-token/two-token/four-token ФИО;
- migration of the duplicate `Чувство тревоги, страх смерти` from historical payloads after removing it from the target catalog;
- migration from legacy generic cough/stridor option switches to four explicit target symptoms;
- non-critical moderate system must produce grade 2; unexpected historical skin/GI `Т` payload must be reported as invalid data;
- no age; years=0 without months; months=0; months=11/12; negative/outsize age;
- exact thresholds and one below/above each SBP/HR/RR/MAP boundary;
- baseline SBP nil, zero, negative, exact 30% decrease;
- DBP > SBP and physiologically impossible values;
- SpO2 at 91/92/95 and outside 1...100; GCS at 12/13/14/15 and outside 3...15;
- absent allergen vs explicit “контакта не было” cannot currently be distinguished;
- text keyword variations (`ё/е`, Latin/Cyrillic, renamed symptom) altering diagnosis;
- repeated save/double click;
- edit conflict in two tabs;
- refresh/direct URL/missing draft;
- API timeout after server committed but client did not receive success;
- database unavailable or migration mismatch;
- stale algorithm version when editing old examination;
- search by locale, date and names with hyphens/apostrophes;
- empty history, deleted record, unauthorized record;
- export/print on shared workstation.

## 23. Testing Strategy

### 23.1 Unit tests

Pure tests for every domain function. Use table-driven boundary tests.

Representative golden cases from existing XCTest:

| Input | Expected |
|---|---|
| age 0y2m, SBP69, HR151, RR61 | hypotension/tachycardia/dyspnea all true |
| age 0y3m, HR131, RR51 | tachycardia/dyspnea true |
| age 0y6m, HR121, RR51 | both true |
| age 1y, SBP71, HR131, RR41 | all true; pediatric SBP threshold 72 |
| age 10y, SBP89, HR131, RR36 | all true |
| age 11y, SBP89, HR101, RR31 | all true |
| age 18y, SBP89, HR101, RR21 | all true; hypotension impact `У` |
| adult SBP90/DBP50 | MAP≈63.3, hypotension true by MAP only |
| no allergen + GI nausea | NIAID notEnoughData |
| allergen + urticaria + dyspnea | NIAID criterion 2 confirmed |
| grade4 + moderate skin/resp | primary confirmed; medium-severe conclusion label |
| urticaria + moderate vomiting | WAO criterion 1 confirmed |
| grade1 + urticaria | urticaria text and no primary confirmation |
| allergen nil + dyspnea only | WAO notEnoughData |
| allergen set + dyspnea | WAO criterion 2 confirmed |
| allergen + urticaria + light nausea | NIAID criterion 2 not confirmed by GI alone |
| GCS 15 / 14 / 13 / 12 | no impact / neurological У / neurological У / neurological Т |
| skin У + mucous У, no critical systems | target grade 2 (client-confirmed regression case) |

Add clinical-instruction matrix cases: single non-critical Л → 1; two Л in one or two non-critical systems → 2; any non-critical У → 2; mucous/АНО Т → 4; critical Л/У/Т → 3/4/5; mixed systems always choose the maximum.

Add mandatory tests:

- equal-to threshold is not triggered; ±1 is correct for every band;
- system subgrade precedence T > U > L;
- L+L escalation only for three specified systems;
- current legacy non-critical behavior captured as a regression fixture; approved target matrix tested separately;
- target catalog uniqueness and every symptom/variant reachable;
- every long symptom label renders fully without ellipsis at 320 CSS px;
- every persisted snapshot decodes against its schema version;
- keyword catalog golden tests for every default symptom.

### 23.2 Integration tests

- server ignores forged client severity and recalculates;
- create/edit/delete are atomic with audit record;
- authorization blocks cross-organization records;
- edit conflict returns 409 and preserves both users' input;
- algorithm version remains attached to record.

### 23.3 E2E

- complete new examination and save;
- search history by name and date;
- open the saved examination and verify that every selected symptom is present in the required system order;
- open/edit existing examination and preserve identity;
- cancel delete / confirm delete;
- keyboard-only symptom selection and dialog;
- refresh/direct URL guard;
- loading/error/empty states;
- responsive 360px mobile, tablet and desktop;
- accessibility scan plus manual keyboard/screen-reader review.

Target WCAG 2.2 AA. W3C recommends WCAG 2.2 for future applicability and defines testable success criteria across devices ([WCAG 2.2](https://www.w3.org/TR/WCAG22/)).

## 24. Implementation Plan

### Phase 0 — Clinical clarification and algorithm freeze

- Implement the resolved NR-01/NR-02 rules and record the temporary NR-03/NR-06/NR-12 decisions without presenting them as clinical facts.
- Assign algorithm version, clinical owner and approval record.
- Produce golden JSON fixtures from Swift behavior.
- **Done:** every known discrepancy has an explicit keep/fix decision; no unknown medical rule remains hidden.

### Phase 1 — Project foundation

- Initialize full-stack TypeScript project, strict config, formatter, CI, env schema.
- Authentication shell, database migrations, secure headers.
- Design tokens and accessible app shell.
- **Tests:** build, typecheck, minimal auth/route smoke.

### Phase 2 — Domain models and business logic

- Port enums, catalog, vital calculator, severity and conclusion as pure modules.
- Add algorithm version and all golden/boundary tests.
- **Done:** parity test suite passes without UI.

### Phase 3 — Persistence and APIs

- PostgreSQL schema, repositories, authz, audit, atomic CRUD.
- Server-side recalculation.
- **Done:** integration tests for CRUD, isolation and forged results pass.

### Phase 4 — Clinical wizard UI

- Patient, symptoms, variants, vitals, result.
- Responsive clinician-first design; keyboard and screen-reader behavior.
- **Done:** core E2E flow passes and no calculated logic lives in components.

### Phase 5 — History and sharing

- Paginated search, details, edit, delete confirmation, print/copy/download.
- **Done:** permissions and audit verified.

### Phase 6 — Hardening

- Threat model, ASVS checks, accessibility QA, performance, backup/restore, failure modes.
- Clinical UAT with boundary cases.

### Phase 7 — Deployment

- Approved environment, migrations, monitoring with PHI redaction, rollback.
- Release notes contain algorithm version and clinical approval.

## 25. Acceptance Criteria

1. Every source screen and action has a tested Web equivalent or documented migration decision.
2. Domain parity tests cover all Swift XCTest cases plus every numeric boundary.
3. No business logic is implemented inside React components.
4. Server recalculates and persists a versioned immutable result snapshot.
5. Critical algorithm behavior matches the clinically approved decisions for every `BLOCKER`.
6. Patient data is unavailable without authenticated, authorized access.
7. Create/edit/delete are atomic and auditable.
8. Direct URL, refresh, back navigation and dirty-form exit have deterministic behavior.
9. UI is usable at mobile/tablet/desktop widths and at 200% text zoom.
10. WCAG 2.2 AA automated and manual checks pass for the core flow.
11. Loading, error, empty, unauthorized and conflict states are implemented.
12. No PHI appears in URLs, analytics, application logs or unredacted error reports.
13. Build, typecheck, unit, integration and E2E suites pass in CI.
14. Deployment rollback and database restore are tested.
15. Clinical owner signs off on algorithm version and representative outputs.

## 26. Open Questions / Needs Review

| ID | Severity | Existing implementation / problem | Clarification required |
|---|---|---|---|
| NR-03 | High / placeholder set | «острое начало» требуется для NIAID criterion 1 | временно tri-state Да/Нет/Неизвестно; позднее решить, нужны ли дата/время и допустимое окно |
| NR-06 | High / placeholder set | аллерген заменяет предварительный диагноз, UX контакта не утверждён | временно: непустой текст = контакт Да, пусто = Неизвестно; позднее заменить tri-state |
| NR-08 | High | edit deletes/recreates ID/date | should history identity and original time be preserved? Recommended: yes |
| NR-09 | High | real-user roles and organization boundaries unknown | users, organizations, access and ownership model |
| NR-10 | High | deployment jurisdiction unknown | applicable health/privacy/medical-device requirements |
| NR-11 | Medium | Patient is saved before exam and never reused/read | atomic save or reusable patient registry? |
| NR-12 | Medium / placeholder set | предварительный диагноз удалён; заказчик требует финальное заключение | временно заключение рассчитывается автоматически и доступно только для чтения; возможность редактирования согласовать позже |
| NR-14 | Medium | delete has no confirmation and is hard delete | retention/deletion policy |
| NR-15 | Medium | share content is plain text with PHI | permitted export formats and auditing |
| NR-16 | Medium | only Russian strings | is multilingual support required? |
| NR-17 | High / confirmed required | Клиенты должны иметь возможность продолжать работу без сети | `CONFIRMED BY CLIENT 2026-09-30`: offline обязателен; требуется модель шифрования локальных PHI, доверенных устройств, срока хранения и синхронизации конфликтов. До её утверждения service worker кэширует только статическую оболочку, но не медицинские данные. |

### Resolved by client corrections dated 30.06.2026

- `NR-04`: кашель и стридор добавляются как отдельные достижимые симптомы; отёк языка расширяется до мягкого нёба/язычка; WAO 2020 рассчитывается.
- `NR-05`: повторная позиция «Чувство тревоги, страх смерти» удаляется.
- `NR-07`: NIAID criterion 2 использует снижение АД как отдельную категорию; urinary incontinence не добавляется в этот count.
- `NR-13`: нужен явный просмотр полного сохранённого осмотра со всеми симптомами.

### Resolved by supplied clinical documents

- `NR-01`: таблица степеней ОАР подтверждена инструкцией по диагностике АФ от 07.09.2025; точный алгоритм приведён в Algorithm H.
- `NR-02`: возрастные подсказки и пороги SBP/HR/RR, SpO2 и GCS подтверждены документом «Правки и дополнения к мобильному приложению»; отсутствующие верхние границы ввода закрыты технической заглушкой, не влияющей на клиническую классификацию.

## 27. Implementation Rules for AI Coding Agent

1. Read this entire specification before editing code.
2. Use branch `development` at the pinned source commit as the iOS reference unless the user provides a newer approved commit.
3. Treat `CONFIRMED BY CLIENT` as target behavior when it conflicts with `CONFIRMED IN CODE`; require approved resolutions for every `BLOCKER`.
4. Do not invent missing clinical requirements.
5. Do not change formulas, thresholds, priority or diagnostic mappings without an explicit recorded decision.
6. If a likely bug is found, add/update `NEEDS REVIEW`; never silently fix it.
7. Keep business logic in pure TypeScript domain modules with no React/server/database dependencies.
8. Enable TypeScript strict mode; do not use `any` for domain data.
9. Validate all untrusted data at client and server boundaries; server recalculates results.
10. Version algorithm/catalog changes and preserve historical result snapshots.
11. Add boundary tests simultaneously with each critical algorithm.
12. Use reusable UI components only when reuse is real; avoid overengineering.
13. Never put secrets in frontend code or repository; use validated environment variables.
14. Never emit PHI to logs, URLs, analytics or error-monitoring payloads.
15. Implement loading, error, empty, unauthorized and conflict states.
16. Make the UI responsive, keyboard-operable and WCAG 2.2 AA-oriented.
17. Do not rely on color alone for severity/status.
18. After each phase run typecheck, relevant tests and production build; run E2E for affected flows.
19. Do not mark the migration complete until all acceptance criteria pass and clinical blockers are resolved.

## Appendix A — Exact symptom catalog

The following catalog is `CONFIRMED IN CODE` from `Symptom.defaultSymptoms()` and is retained as the legacy migration baseline.

| System | Лёгкая | Умеренная | Тяжёлая |
|---|---|---|---|
| Кожа | Крапивница; Эритема; Зуд; Дискомфорт кожи; Генерализованное чувство покалывания; Экскориации | Ангионевротический отек | — |
| Реакции слизистых/АНО | Конъюнктивит; Хемоз; Внезапный зуд глаз; Отек век; Повторяющееся высовывание языка; Дискомфорт/зуд/першение/боль/«ком» в горле; ОАС (зуд, покалывание, металлический привкус во рту); Нарушение глотания; Повторяющееся потирание губ, ушей, глаз; Заложенность носа; Внезапный зуд носа; Ринорея; Чихание | Отек губ; Появление или усиление слюнотечения | Отек языка |
| ЖКТ | Тошнота; Отхаркивание; Младенцы - икота, выгибание спины, отхаркивание | Рвота; Диарея; Боль в животе; Рвота и диарея по 2 эпизода каждые | — |
| Кардиоваскулярная | Тахикардия; Бледность; Нечеткость зрения; Слабость, вялость; Головокружение; Предобморочное состояние | Брадикардия; Гипотензия; Мраморность; Цианоз; СПБ > 3 сек | Коллапс; Остановка сердца; Анафилактический шок; Выраженная брадикардия |
| Неврологическая | Спутанность сознания; Чувство тревоги, страх смерти; Сонливость/летаргия; Возбуждение, раздражительность, безутешность; Чувство тревоги, страх смерти (duplicate) | Потеря интереса к игре, общению, снижение активности у младенца | Судороги; Снижение мышечного тонуса, «обмякание»; Обморок; Недержание мочи; Недержание кала |
| Респираторная | Чувство затруднения вдоха; Чувство затруднения выдоха; Чувство стеснения в груди; Першение в горле или дискомфорт; Дисфония; Лающий кашель; Одышка | Свистящее дыхание; Кряхтение/хрюканье; Работа вспомогательной мускулатуры; Раздувание крыльев носа; SaO2 < 92% | ДН (дотация O2) |

## Appendix B — Exact override variants

| Symptom | Options |
|---|---|
| Зуд | Периодически (<50% ППТ)=Л; Локализованный (<50% ППТ)=Л; Постоянный=У; Генерализованный (≥50% ППТ)=У |
| Эритема | Локализованная (<50% ППТ)=Л; Генерализованная (≥50% ППТ)=У |
| Крапивница | Локализованная (<50% ППТ)=Л; Генерализованная (≥50% ППТ)=У |
| Отек языка | ориентиры сохранены=Л; сглажены=У; не видны=Т |
| Боль в животе | Эпизодичные=Л; Постоянные, сильные=У |
| Тошнота | Эпизодичная=Л; Постоянная=У |
| Рвота | 1–2 раза=Л; более 2-х=У |
| Диарея | 1–2 раза=Л; более 2-х=У |
| Одышка | Без ПРД=Л; С ПРД=У; «немое легкое»=Т |
| Стридор | Current: options unreachable. Web target: explicit «Стридор без ПРД»=У and «Стридор с ПРД»=Т |
| Кашель | Current: options unreachable. Web target: explicit «Появление кашля»=Л and «Кашель персистирующий»=У |
| Гипотензия | без вазопрессоров=У; нужны вазопрессоры=Т; любой вариант у младенца=Т |

## Appendix C — Client-approved catalog delta

Apply these changes on top of the legacy catalog:

- rename «Ангионевротический отек» → «АНО вне слизистых»;
- rename/expand «Отек языка» → «Отек языка, мягкого неба, язычка» while retaining the approved variant grading model;
- add respiratory symptoms «Появление кашля» (Л), «Кашель персистирующий» (У), «Стридор без ПРД» (У), «Стридор с ПРД» (Т);
- add derived neurological impacts GCS 13...14 (У) and GCS <13 (Т);
- remove one duplicate «Чувство тревоги, страх смерти»;
- display every label in full.

## Appendix D — Traceability index

| Requirement area | Primary sources |
|---|---|
| App startup/navigation | `Application/SceneDelegate.swift`, `Coordinators/AppCoordinator.swift`, `MainCoordinator.swift` |
| Patient validation/model | `Models/Patient.swift`, `PatientStartViewModel.swift`, `PatientRepository.swift` |
| Symptom catalog/variants | `Models/Symptom.swift`, `SymptomsViewController.swift`, `SymptomsViewModel.swift` |
| Subgrade/final grade | `Models/Subgrade.swift`, `Services/SeverityEngine.swift` |
| Vitals/thresholds | `Models/Vitals.swift`, `VitalsViewModel.swift`, `VitalCriteriaCalculatorTests.swift`, `Правки_и_дополнения_к_мобильному_приложению.docx` |
| Clinical conclusion | `ClinicalConclusion.swift`, `AnaphylaxisSymptomCatalog.swift`, `ClinicalConclusionEngine.swift`, `ClinicalConclusionEngineTests.swift` |
| Persistence/history | `Models/Examination.swift`, `ExaminationRepository.swift`, Core Data model, history module |
| UI result/save | `ResultViewController.swift`, `ResultViewModel.swift` |
| Latest client corrections | `аф ПРАВКИ Рубан 30.06.2026.docx`, paragraphs under «ПРАВКИ 30.06.2026 после тестирования» and 16 embedded annotated screenshots |
| Official OAR severity mapping | `1_2_Инструкция_диагностика_АФ_07_09_25.doc`, sections 4.1.9 and Appendix 4 |
