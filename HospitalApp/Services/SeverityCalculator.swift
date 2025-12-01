//
//  SeverityCalculator.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import Foundation

class SeverityCalculator {
    
    /// Рассчитывает степень тяжести аллергической реакции по алгоритму Приложения 4
    static func calculateSeverity(selectedSymptoms: [Symptom], vitals: Vitals) -> SeverityResult {
        let affectedSystems = Set(selectedSymptoms.map { $0.system })
        let affectedSystemsArray = Array(affectedSystems)
        
        // Группируем симптомы по системам
        let symptomsBySystem = Dictionary(grouping: selectedSymptoms) { $0.system }
        
        // Проверяем наличие критических симптомов
        let hasRespiratoryDistress = hasCriticalRespiratorySymptoms(symptoms: selectedSymptoms, vitals: vitals)
        let hasCardiovascularFailure = hasCriticalCardiovascularSymptoms(symptoms: selectedSymptoms, vitals: vitals)
        let hasNeurologicalFailure = hasCriticalNeurologicalSymptoms(symptoms: selectedSymptoms, vitals: vitals)
        let hasMucousObstruction = hasCriticalMucousSymptoms(symptoms: selectedSymptoms)
        
        // Алгоритм определения степени тяжести по Приложению 4
        
        // Степень 5: Крайне тяжелая
        if hasRespiratoryDistress && hasCardiovascularFailure {
            return SeverityResult(
                level: .level5,
                affectedSystems: affectedSystemsArray,
                explanation: "Крайне тяжелая степень: сочетание критических респираторных и кардиоваскулярных нарушений"
            )
        }
        
        if hasNeurologicalFailure && (hasRespiratoryDistress || hasCardiovascularFailure) {
            return SeverityResult(
                level: .level5,
                affectedSystems: affectedSystemsArray,
                explanation: "Крайне тяжелая степень: неврологические нарушения в сочетании с респираторными или кардиоваскулярными"
            )
        }
        
        // Степень 4: Очень тяжелая
        if hasRespiratoryDistress {
            return SeverityResult(
                level: .level4,
                affectedSystems: affectedSystemsArray,
                explanation: "Очень тяжелая степень: критическая респираторная недостаточность (SpO2 < 90% или стридор/цианоз)"
            )
        }
        
        if hasCardiovascularFailure {
            return SeverityResult(
                level: .level4,
                affectedSystems: affectedSystemsArray,
                explanation: "Очень тяжелая степень: критическая кардиоваскулярная недостаточность (гипотензия, коллапс)"
            )
        }
        
        if hasMucousObstruction {
            return SeverityResult(
                level: .level4,
                affectedSystems: affectedSystemsArray,
                explanation: "Очень тяжелая степень: критическая обструкция дыхательных путей (отек гортани/языка)"
            )
        }
        
        // Степень 3: Тяжелая
        if affectedSystems.contains(.respiratory) && (vitals.spO2 ?? 100) < 95 {
            return SeverityResult(
                level: .level3,
                affectedSystems: affectedSystemsArray,
                explanation: "Тяжелая степень: респираторные симптомы с умеренной гипоксемией (SpO2 90-94%)"
            )
        }
        
        if affectedSystems.contains(.cardiovascular) && vitals.isHypotension {
            return SeverityResult(
                level: .level3,
                affectedSystems: affectedSystemsArray,
                explanation: "Тяжелая степень: кардиоваскулярные симптомы с гипотензией"
            )
        }
        
        if affectedSystems.contains(.neurological) {
            return SeverityResult(
                level: .level3,
                affectedSystems: affectedSystemsArray,
                explanation: "Тяжелая степень: неврологические симптомы (головокружение, спутанность сознания)"
            )
        }
        
        if affectedSystems.count >= 3 {
            return SeverityResult(
                level: .level3,
                affectedSystems: affectedSystemsArray,
                explanation: "Тяжелая степень: поражение трех и более систем органов"
            )
        }
        
        // Степень 2: Средняя
        if affectedSystems.contains(.respiratory) || affectedSystems.contains(.cardiovascular) {
            return SeverityResult(
                level: .level2,
                affectedSystems: affectedSystemsArray,
                explanation: "Средняя степень: поражение респираторной или кардиоваскулярной системы"
            )
        }
        
        if affectedSystems.count >= 2 {
            return SeverityResult(
                level: .level2,
                affectedSystems: affectedSystemsArray,
                explanation: "Средняя степень: поражение двух систем органов"
            )
        }
        
        // Степень 1: Легкая
        return SeverityResult(
            level: .level1,
            affectedSystems: affectedSystemsArray,
            explanation: "Легкая степень: изолированное поражение кожи или слизистых оболочек"
        )
    }
    
    // MARK: - Private Helpers
    
    private static func hasCriticalRespiratorySymptoms(symptoms: [Symptom], vitals: Vitals) -> Bool {
        let criticalSymptoms = symptoms.filter { symptom in
            symptom.system == .respiratory && (
                symptom.name.contains("Стридор") ||
                symptom.name.contains("Цианоз") ||
                symptom.name.contains("Затрудненное дыхание")
            )
        }
        
        let lowSpO2 = (vitals.spO2 ?? 100) < 90
        
        return !criticalSymptoms.isEmpty || lowSpO2
    }
    
    private static func hasCriticalCardiovascularSymptoms(symptoms: [Symptom], vitals: Vitals) -> Bool {
        let criticalSymptoms = symptoms.filter { symptom in
            symptom.system == .cardiovascular && (
                symptom.name.contains("Коллапс") ||
                symptom.name.contains("Гипотензия")
            )
        }
        
        return !criticalSymptoms.isEmpty || vitals.isHypotension
    }
    
    private static func hasCriticalNeurologicalSymptoms(symptoms: [Symptom], vitals: Vitals) -> Bool {
        let criticalSymptoms = symptoms.filter { symptom in
            symptom.system == .neurological && (
                symptom.name.contains("Потеря сознания") ||
                symptom.name.contains("Судороги")
            )
        }
        
        let lowGCS = (vitals.gcs ?? 15) < 13
        
        return !criticalSymptoms.isEmpty || lowGCS
    }
    
    private static func hasCriticalMucousSymptoms(symptoms: [Symptom]) -> Bool {
        return symptoms.contains { symptom in
            symptom.system == .mucous && (
                symptom.name.contains("Отек гортани") ||
                symptom.name.contains("Отек языка")
            )
        }
    }
}

