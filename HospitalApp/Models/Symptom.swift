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
    var isSelected: Bool
    
    init(id: UUID = UUID(), name: String, system: SystemType, defaultSubgradeHint: Subgrade, isSelected: Bool = false) {
        self.id = id
        self.name = name
        self.system = system
        self.defaultSubgradeHint = defaultSubgradeHint
        self.isSelected = isSelected
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
            // Кожа - Умеренные
            Symptom(name: "Ангионевротический отек", system: .skin, defaultSubgradeHint: .moderate),
            Symptom(name: "Отек Квинке", system: .skin, defaultSubgradeHint: .moderate),
            
            // Реакции слизистых/АНО - Лёгкие
            Symptom(name: "Конъюнктивит", system: .mucous, defaultSubgradeHint: .light),
            Symptom(name: "Ринорея", system: .mucous, defaultSubgradeHint: .light),
            Symptom(name: "Отек век", system: .mucous, defaultSubgradeHint: .light),
            // Реакции слизистых/АНО - Умеренные
            Symptom(name: "Отек губ", system: .mucous, defaultSubgradeHint: .moderate),
            // Реакции слизистых/АНО - Тяжёлые
            Symptom(name: "Отек языка", system: .mucous, defaultSubgradeHint: .severe),
            Symptom(name: "Отек гортани", system: .mucous, defaultSubgradeHint: .severe),
            
            // ЖКТ - Лёгкие
            Symptom(name: "Тошнота", system: .gastrointestinal, defaultSubgradeHint: .light),
            Symptom(name: "Метеоризм", system: .gastrointestinal, defaultSubgradeHint: .light),
            // ЖКТ - Умеренные
            Symptom(name: "Рвота", system: .gastrointestinal, defaultSubgradeHint: .moderate),
            Symptom(name: "Диарея", system: .gastrointestinal, defaultSubgradeHint: .moderate),
            Symptom(name: "Боль в животе", system: .gastrointestinal, defaultSubgradeHint: .moderate),
            
            // Кардиоваскулярная - Умеренные
            Symptom(name: "Тахикардия", system: .cardiovascular, defaultSubgradeHint: .moderate),
            Symptom(name: "Брадикардия", system: .cardiovascular, defaultSubgradeHint: .moderate),
            Symptom(name: "Аритмия", system: .cardiovascular, defaultSubgradeHint: .moderate),
            Symptom(name: "Нарушение периферического кровообращения", system: .cardiovascular, defaultSubgradeHint: .moderate),
            // Кардиоваскулярная - Тяжёлые
            Symptom(name: "Гипотензия", system: .cardiovascular, defaultSubgradeHint: .severe),
            Symptom(name: "Коллапс", system: .cardiovascular, defaultSubgradeHint: .severe),
            
            // Неврологическая - Лёгкие
            Symptom(name: "Головокружение", system: .neurological, defaultSubgradeHint: .light),
            Symptom(name: "Нарушение координации", system: .neurological, defaultSubgradeHint: .light),
            // Неврологическая - Умеренные
            Symptom(name: "Спутанность сознания", system: .neurological, defaultSubgradeHint: .moderate),
            // Неврологическая - Тяжёлые
            Symptom(name: "Судороги", system: .neurological, defaultSubgradeHint: .severe),
            Symptom(name: "Потеря сознания", system: .neurological, defaultSubgradeHint: .severe),
            
            // Респираторная - Лёгкие
            Symptom(name: "Кашель", system: .respiratory, defaultSubgradeHint: .light),
            // Респираторная - Умеренные
            Symptom(name: "Одышка", system: .respiratory, defaultSubgradeHint: .moderate),
            Symptom(name: "Свистящее дыхание", system: .respiratory, defaultSubgradeHint: .moderate),
            Symptom(name: "Затрудненное дыхание", system: .respiratory, defaultSubgradeHint: .moderate),
            // Респираторная - Тяжёлые
            Symptom(name: "Стридор", system: .respiratory, defaultSubgradeHint: .severe),
            Symptom(name: "Цианоз", system: .respiratory, defaultSubgradeHint: .severe)
        ]
    }
}

