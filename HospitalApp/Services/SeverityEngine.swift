//
//  SeverityEngine.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import Foundation

struct SeverityEngineConfig {
    var lightToModerateThreshold: Int = 2 // Количество лёгких симптомов для повышения до У
    var meanArterialPressureCriticalThreshold: Double = 65.0 // Критический порог срАД для взрослых
}

class SeverityEngine {
    private let config: SeverityEngineConfig
    
    init(config: SeverityEngineConfig = SeverityEngineConfig()) {
        self.config = config
    }
    
    /// Вычисляет субградации для каждой системы органов на основе выбранных симптомов
    func computeSubgrades(selectedSymptoms: [Symptom]) -> [SystemType: Subgrade] {
        var result: [SystemType: Subgrade] = [:]
        
        // Инициализируем все системы как .none
        for system in SystemType.allCases {
            result[system] = Subgrade.none
        }
        
        // Группируем симптомы по системам
        let symptomsBySystem = Dictionary(grouping: selectedSymptoms) { $0.system }
        
        // Обрабатываем каждую систему
        for (system, symptoms) in symptomsBySystem {
            guard !symptoms.isEmpty else { continue }
            
            // Подсчитываем симптомы по их фактическим субградациям (с учётом override)
            var lightCount = 0
            var moderateCount = 0
            var severeCount = 0
            
            for symptom in symptoms {
                let subgrade = symptom.effectiveSubgrade
                switch subgrade {
                case .light:
                    lightCount += 1
                case .moderate:
                    moderateCount += 1
                case .severe:
                    severeCount += 1
                case .none:
                    break
                }
            }
            
            // Применяем правила агрегации
            var finalSubgrade: Subgrade = .none
            
            // Правило 1: Если есть хотя бы один Т → Т
            if severeCount > 0 {
                finalSubgrade = .severe
            }
            // Правило 2: Иначе если есть >= 1 У → У
            else if moderateCount > 0 {
                finalSubgrade = .moderate
            }
            // Правило 3: Иначе если есть >= 1 Л → Л, но если количество Л >= N → повысить до У
            else if lightCount > 0 {
                // Повышение Л+Л→У только для Кожа, Слизистые, ЖКТ
                let systemsWithLightAggregation: [SystemType] = [.skin, .mucous, .gastrointestinal]
                
                if systemsWithLightAggregation.contains(system),
                   lightCount >= config.lightToModerateThreshold {
                    finalSubgrade = .moderate
                } else {
                    finalSubgrade = .light
                }
            }
            
            result[system] = finalSubgrade
        }
        
        return result
    }
    
    /// Вычисляет финальную степень тяжести на основе субградаций систем и витальных данных
    func computeFinalSeverity(perSystem: [SystemType: Subgrade], vitals: Vitals?) -> SeverityResult {
        var subgrades = perSystem
        var explanationSteps: [String] = []
        
        // Применяем override от витальных данных
        if let vitals = vitals {
            if let summary = vitals.vitalCriteriaSummary {
                for impact in summary.impacts {
                    let current = subgrades[impact.system] ?? .none
                    if impact.subgrade.severityValue > current.severityValue {
                        subgrades[impact.system] = impact.subgrade
                        explanationSteps.append("\(impact.reason) → \(impact.system.displayName) повышена до \(impact.subgrade.shortName)")
                    } else {
                        explanationSteps.append("\(impact.reason) обнаружена, но \(impact.system.displayName) уже \(current.shortName)")
                    }
                }
                
                if let ageYears = vitals.ageYears,
                   ageYears >= 18,
                   let map = vitals.meanArterialPressure,
                   map < config.meanArterialPressureCriticalThreshold {
                    explanationSteps.append("срАД < \(config.meanArterialPressureCriticalThreshold) мм рт.ст. у взрослого")
                }
            }
        }
        
        // Применяем таблицу приоритетов для определения степени тяжести
        var severityGrade = 0
        var appliedRules: [String] = []
        
        // Критические системы: ССС, НС, дыхательная
        let criticalSystems: [SystemType] = [.cardiovascular, .neurological, .respiratory]
        let nonCriticalSystems: [SystemType] = [.skin, .gastrointestinal, .mucous]
        
        // Правило 1: Тяжёлая в любой критической системе → степень 5
        for system in criticalSystems {
            if subgrades[system] == .severe {
                severityGrade = max(severityGrade, 5)
                appliedRules.append("\(system.displayName) (Т) → степень 5")
            }
        }
        
        // Правило 2: Умеренная в критической системе → степень 4
        if severityGrade < 5 {
            for system in criticalSystems {
                if subgrades[system] == .moderate {
                    severityGrade = max(severityGrade, 4)
                    appliedRules.append("\(system.displayName) (У) → степень 4")
                }
            }
        }
        
        // Правило 3: Лёгкая в критической системе → степень 3
        if severityGrade < 4 {
            for system in criticalSystems {
                if subgrades[system] == .light {
                    severityGrade = max(severityGrade, 3)
                    appliedRules.append("\(system.displayName) (Л) → степень 3")
                }
            }
        }
        
        // Правило 4: Комбинация лёгких в не-критических системах (кожа + ЖКТ + слизистые)
        if severityGrade < 3 {
            let nonCriticalWithLight = nonCriticalSystems.filter { subgrades[$0] == .light }
            if nonCriticalWithLight.count >= 2 {
                severityGrade = max(severityGrade, 2)
                appliedRules.append("Комбинация лёгких в \(nonCriticalWithLight.map { $0.displayName }.joined(separator: ", ")) (2+ системы) → степень 2")
            }
        }
        
        // Правило 5: Одиночное лёгкое в не-критической системе → степень 1
        if severityGrade < 2 {
            let hasAnyNonCriticalLight = nonCriticalSystems.contains { subgrades[$0] == .light }
            if hasAnyNonCriticalLight {
                severityGrade = max(severityGrade, 1)
                let lightSystems = nonCriticalSystems.filter { subgrades[$0] == .light }
                appliedRules.append("Лёгкие симптомы в \(lightSystems.map { $0.displayName }.joined(separator: ", ")) → степень 1")
            }
        }
        
        // Формируем итоговое объяснение
        var explanation = "Расчёт степени тяжести:\n\n"
        
        // Добавляем субградации по системам
        let activeSystems = subgrades.filter { $0.value != .none }
        if !activeSystems.isEmpty {
            explanation += "Субградации по системам:\n"
            for (system, subgrade) in activeSystems.sorted(by: { $0.key.displayName < $1.key.displayName }) {
                explanation += "• \(system.displayName): \(subgrade.displayName)\n"
            }
            explanation += "\n"
        }
        
        // Добавляем override правила
        if !explanationSteps.isEmpty {
            explanation += "Коррекция по витальным данным:\n"
            for step in explanationSteps {
                explanation += "• \(step)\n"
            }
            explanation += "\n"
        }
        
        // Добавляем применённые правила
        if !appliedRules.isEmpty {
            explanation += "Применённые правила:\n"
            for rule in appliedRules {
                explanation += "• \(rule)\n"
            }
        }
        
        if severityGrade == 0 {
            explanation += "\nИтог: Степень 0 (нет реакции)"
        } else {
            explanation += "\nИтог: Степень \(severityGrade)"
        }
        
        return SeverityResult(
            severityGrade: severityGrade,
            perSystemSubgrades: subgrades,
            explanation: explanation
        )
    }
}
