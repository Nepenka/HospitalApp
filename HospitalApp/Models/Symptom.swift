//
//  Symptom.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import Foundation

struct Symptom: Identifiable, Codable, Hashable {
    let id: UUID
    let name: String
    let system: SystemType
    let defaultSubgradeHint: Subgrade
    /// Переопределённая субградация (например, выбранный вариант "генерализованный" и т.п.)
    var overrideSubgrade: Subgrade?
    var isSelected: Bool
    
    init(
        id: UUID = UUID(),
        name: String,
        system: SystemType,
        defaultSubgradeHint: Subgrade,
        overrideSubgrade: Subgrade? = nil,
        isSelected: Bool = false
    ) {
        self.id = id
        self.name = name
        self.system = system
        self.defaultSubgradeHint = defaultSubgradeHint
        self.overrideSubgrade = overrideSubgrade
        self.isSelected = isSelected
    }
    
    /// Фактическая субградация, используемая в расчётах
    var effectiveSubgrade: Subgrade {
        return overrideSubgrade ?? defaultSubgradeHint
    }
}

// Предустановленные симптомы по Приложению 3
extension Symptom {
    static func defaultSymptoms() -> [Symptom] {
        return [
            // Кожа - Лёгкие
            Symptom(name: "Крапивница", system: .skin, defaultSubgradeHint: .light),
            Symptom(name: "Эритема", system: .skin, defaultSubgradeHint: .light),
            Symptom(name: "Зуд", system: .skin, defaultSubgradeHint: .light),
            Symptom(name: "Дискомфорт кожи", system: .skin, defaultSubgradeHint: .light),
            Symptom(name: "Генерализованное чувство покалывания", system: .skin, defaultSubgradeHint: .light),
            Symptom(name: "Экскориации", system: .skin, defaultSubgradeHint: .light),
            // Кожа - Умеренные
            Symptom(name: "Ангионевротический отек", system: .skin, defaultSubgradeHint: .moderate),
            
            // Реакции слизистых/АНО - Лёгкие
            Symptom(name: "Конъюнктивит", system: .mucous, defaultSubgradeHint: .light),
            Symptom(name: "Хемоз", system: .mucous, defaultSubgradeHint: .light),
            Symptom(name: "Внезапный зуд глаз", system: .mucous, defaultSubgradeHint: .light),
            Symptom(name: "Отек век", system: .mucous, defaultSubgradeHint: .light),
            Symptom(name: "Повторяющееся высовывание языка", system: .mucous, defaultSubgradeHint: .light),
            Symptom(name: "Дискомфорт/зуд/першение/боль/«ком» в горле", system: .mucous, defaultSubgradeHint: .light),
            Symptom(name: "ОАС (зуд, покалывание, металлический привкус во рту)", system: .mucous, defaultSubgradeHint: .light),
            Symptom(name: "Нарушение глотания", system: .mucous, defaultSubgradeHint: .light),
            Symptom(name: "Повторяющееся потирание губ, ушей, глаз", system: .mucous, defaultSubgradeHint: .light),
            Symptom(name: "Заложенность носа", system: .mucous, defaultSubgradeHint: .light),
            Symptom(name: "Внезапный зуд носа", system: .mucous, defaultSubgradeHint: .light),
            Symptom(name: "Ринорея", system: .mucous, defaultSubgradeHint: .light),
            Symptom(name: "Чихание", system: .mucous, defaultSubgradeHint: .light),
            // Реакции слизистых/АНО - Умеренные
            Symptom(name: "Отек губ", system: .mucous, defaultSubgradeHint: .moderate),
            Symptom(name: "Появление или усиление слюнотечения", system: .mucous, defaultSubgradeHint: .moderate),
            // Реакции слизистых/АНО - Тяжёлые
            Symptom(name: "Отек языка", system: .mucous, defaultSubgradeHint: .severe),
            
            // ЖКТ - Лёгкие
            Symptom(name: "Дискомфорт кожи", system: .gastrointestinal, defaultSubgradeHint: .light),
            Symptom(name: "Тошнота", system: .gastrointestinal, defaultSubgradeHint: .light),
            Symptom(name: "Отхаркивание", system: .gastrointestinal, defaultSubgradeHint: .light),
            Symptom(name: "Икота, выгибание спины", system: .gastrointestinal, defaultSubgradeHint: .light),
            // ЖКТ - Умеренные
            Symptom(name: "Рвота", system: .gastrointestinal, defaultSubgradeHint: .moderate),
            Symptom(name: "Диарея", system: .gastrointestinal, defaultSubgradeHint: .moderate),
            Symptom(name: "Боль в животе", system: .gastrointestinal, defaultSubgradeHint: .moderate),
            Symptom(name: "Рвота и диарея по 2 эпизода каждые", system: .gastrointestinal, defaultSubgradeHint: .moderate),

            
            //Легкие:
            Symptom(name: "Тахикардия", system: .cardiovascular, defaultSubgradeHint: .light),
            Symptom(name: "Бледность", system: .cardiovascular, defaultSubgradeHint: .light),
            Symptom(name: "Нечеткость зрения", system: .cardiovascular, defaultSubgradeHint: .light),
            Symptom(name: "Слабость, вялость", system: .cardiovascular, defaultSubgradeHint: .light),
            Symptom(name: "Головокружение", system: .cardiovascular, defaultSubgradeHint: .light),
            Symptom(name: "Предобморочное состояние", system: .cardiovascular, defaultSubgradeHint: .light),

            // Кардиоваскулярная - Умеренные
            Symptom(name: "Брадикардия", system: .cardiovascular, defaultSubgradeHint: .moderate),
            Symptom(name: "Гипотензия", system: .cardiovascular, defaultSubgradeHint: .moderate),
            Symptom(name: "Мраморность", system: .cardiovascular, defaultSubgradeHint: .moderate),
            Symptom(name: "Цианоз", system: .cardiovascular, defaultSubgradeHint: .moderate),
            Symptom(name: "СПБ > 3 сек", system: .cardiovascular, defaultSubgradeHint: .moderate),
            // Кардиоваскулярная - Тяжёлые
            Symptom(name: "Коллапс", system: .cardiovascular, defaultSubgradeHint: .severe),
            Symptom(name: "Остановка сердца", system: .cardiovascular, defaultSubgradeHint: .severe),
            Symptom(name: "Анафилактический шок", system: .cardiovascular, defaultSubgradeHint: .severe),
            Symptom(name: "Выраженная брадикардия", system: .cardiovascular, defaultSubgradeHint: .severe),



            
            // Неврологическая - Лёгкие
            Symptom(name: "Спутанность сознания", system: .neurological, defaultSubgradeHint: .light),
            Symptom(name: "Чувство тревоги, страх смерти", system: .neurological, defaultSubgradeHint: .light),
            Symptom(name: "Сонливость/летаргия", system: .neurological, defaultSubgradeHint: .light),
            Symptom(name: "Возбуждение, раздражительность, безутешность", system: .neurological, defaultSubgradeHint: .light),
            Symptom(name: "Чувство тревоги, страх смерти", system: .neurological, defaultSubgradeHint: .light),
            
            // Неврологическая - Умеренные
            Symptom(name: "Потеря интереса к игре, общению, снижение активности у младенца", system: .neurological, defaultSubgradeHint: .moderate),

            // Неврологическая - Тяжёлые
            Symptom(name: "Судороги", system: .neurological, defaultSubgradeHint: .severe),
            Symptom(name: "Снижение мышечного тонуса, «обмякание»", system: .neurological, defaultSubgradeHint: .severe),
            Symptom(name: "Обморок", system: .neurological, defaultSubgradeHint: .severe),
            Symptom(name: "Недержание мочи", system: .neurological, defaultSubgradeHint: .severe),
            Symptom(name: "Недержание кала", system: .neurological, defaultSubgradeHint: .severe),


            
            // Респираторная - Лёгкие
            Symptom(name: "Чувство затруднения вдоха", system: .respiratory, defaultSubgradeHint: .light),
            Symptom(name: "Чувство стеснения в груди", system: .respiratory, defaultSubgradeHint: .light),
            Symptom(name: "Першение в горле или дискомфорт", system: .respiratory, defaultSubgradeHint: .light),
            Symptom(name: "Дисфония, хриплый крик", system: .respiratory, defaultSubgradeHint: .light),
            Symptom(name: "Лающий кашель", system: .respiratory, defaultSubgradeHint: .light),
            Symptom(name: "Одышка", system: .respiratory, defaultSubgradeHint: .light),


            

            // Респираторная - Умеренные
            Symptom(name: "Свистящее дыхание", system: .respiratory, defaultSubgradeHint: .moderate),
            Symptom(name: "Кряхтение/хрюканье", system: .respiratory, defaultSubgradeHint: .moderate),
            Symptom(name: "Работа вспомогательной мускулатуры", system: .respiratory, defaultSubgradeHint: .moderate),
            Symptom(name: "Раздувание крыльев носа", system: .respiratory, defaultSubgradeHint: .moderate),
            Symptom(name: "Сатурация менее 92% при дыхании комнатным воздухом", system: .respiratory, defaultSubgradeHint: .moderate),
            // Респираторная - Тяжёлые
            Symptom(name: "ДН", system: .respiratory, defaultSubgradeHint: .severe),
            
        ]
    }
}
