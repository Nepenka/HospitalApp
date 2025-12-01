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
    var isSelected: Bool
    
    init(id: UUID = UUID(), name: String, system: SystemType, isSelected: Bool = false) {
        self.id = id
        self.name = name
        self.system = system
        self.isSelected = isSelected
    }
}

// Предустановленные симптомы по Приложению 3
extension Symptom {
    static func defaultSymptoms() -> [Symptom] {
        return [
            // Кожа
            Symptom(name: "Крапивница", system: .skin),
            Symptom(name: "Ангионевротический отек", system: .skin),
            Symptom(name: "Эритема", system: .skin),
            Symptom(name: "Зуд", system: .skin),
            Symptom(name: "Отек Квинке", system: .skin),
            
            // Реакции слизистых/АНО
            Symptom(name: "Отек губ", system: .mucous),
            Symptom(name: "Отек языка", system: .mucous),
            Symptom(name: "Отек гортани", system: .mucous),
            Symptom(name: "Отек век", system: .mucous),
            Symptom(name: "Конъюнктивит", system: .mucous),
            Symptom(name: "Ринорея", system: .mucous),
            
            // ЖКТ
            Symptom(name: "Тошнота", system: .gastrointestinal),
            Symptom(name: "Рвота", system: .gastrointestinal),
            Symptom(name: "Диарея", system: .gastrointestinal),
            Symptom(name: "Боль в животе", system: .gastrointestinal),
            Symptom(name: "Метеоризм", system: .gastrointestinal),
            
            // Кардиоваскулярная
            Symptom(name: "Тахикардия", system: .cardiovascular),
            Symptom(name: "Брадикардия", system: .cardiovascular),
            Symptom(name: "Аритмия", system: .cardiovascular),
            Symptom(name: "Гипотензия", system: .cardiovascular),
            Symptom(name: "Коллапс", system: .cardiovascular),
            Symptom(name: "Нарушение периферического кровообращения", system: .cardiovascular),
            
            // Неврологическая
            Symptom(name: "Головокружение", system: .neurological),
            Symptom(name: "Спутанность сознания", system: .neurological),
            Symptom(name: "Судороги", system: .neurological),
            Symptom(name: "Потеря сознания", system: .neurological),
            Symptom(name: "Нарушение координации", system: .neurological),
            
            // Респираторная
            Symptom(name: "Одышка", system: .respiratory),
            Symptom(name: "Стридор", system: .respiratory),
            Symptom(name: "Свистящее дыхание", system: .respiratory),
            Symptom(name: "Кашель", system: .respiratory),
            Symptom(name: "Затрудненное дыхание", system: .respiratory),
            Symptom(name: "Цианоз", system: .respiratory)
        ]
    }
}

