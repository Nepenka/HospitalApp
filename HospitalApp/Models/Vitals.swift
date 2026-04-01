//
//  Vitals.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import Foundation

enum AgeGroup: Equatable {
    case infant0To3Months
    case infant3To6Months
    case infant6To12Months
    case child1To5Years
    case child5To10Years
    case child1To10Years
    case child11To17Years
    case olderThan10Years
    case adult18Plus
}

struct PatientAge: Equatable {
    let years: Int
    let months: Int
    
    init?(years: Int?, months: Int?) {
        guard let years = years, years >= 0 else { return nil }
        let normalizedMonths = max(0, min(months ?? 0, 11))
        self.years = years
        self.months = normalizedMonths
    }
    
    var ageInMonths: Int {
        (years * 12) + months
    }
    
    var ageInYears: Int {
        years
    }
    
    var isAdult: Bool {
        years >= 18
    }
}

enum VitalImpactRule: String {
    case hypotension = "Гипотензия"
    case tachycardia = "Тахикардия"
    case dyspnea = "Одышка"
}

struct VitalSeverityImpact {
    let system: SystemType
    let subgrade: Subgrade
    let reason: String
}

struct VitalRuleEvaluation {
    let rule: VitalImpactRule
    let normalValue: String
    let threshold: String
    let isTriggered: Bool
    let severityImpact: VitalSeverityImpact?
}

struct VitalCriteriaSummary {
    let hypotension: VitalRuleEvaluation
    let tachycardia: VitalRuleEvaluation
    let dyspnea: VitalRuleEvaluation
    
    var impacts: [VitalSeverityImpact] {
        [hypotension.severityImpact, tachycardia.severityImpact, dyspnea.severityImpact].compactMap { $0 }
    }
}

struct VitalCriteriaCalculator {
    func evaluate(vitals: Vitals) -> VitalCriteriaSummary? {
        guard let age = vitals.patientAge else { return nil }
        
        return VitalCriteriaSummary(
            hypotension: hypotensionRule(for: vitals, age: age),
            tachycardia: tachycardiaRule(for: vitals, age: age),
            dyspnea: dyspneaRule(for: vitals, age: age)
        )
    }
    
    func hypotensionRule(for vitals: Vitals, age: PatientAge) -> VitalRuleEvaluation {
        guard let sbp = vitals.systolicBP else {
            return VitalRuleEvaluation(rule: .hypotension, normalValue: "—", threshold: "—", isTriggered: false, severityImpact: nil)
        }
        
        if age.isAdult {
            let map = vitals.meanArterialPressure
            let mapTriggered = (map ?? .greatestFiniteMagnitude) < 65.0
            let sbpTriggered = sbp < 90
            let baselineTriggered: Bool
            if let baseline = vitals.baselineSystolicBP, baseline > 0 {
                baselineTriggered = Double(sbp) < (Double(baseline) * 0.7)
            } else {
                baselineTriggered = false
            }
            let triggered = mapTriggered || sbpTriggered || baselineTriggered
            let impact = triggered ? VitalSeverityImpact(system: .cardiovascular, subgrade: .moderate, reason: "Гипотензия у взрослого") : nil
            return VitalRuleEvaluation(
                rule: .hypotension,
                normalValue: "САД >= 90, срАД >= 65",
                threshold: "срАД < 65 и/или САД < 90 и/или снижение САД > 30% от исходного",
                isTriggered: triggered,
                severityImpact: impact
            )
        }
        
        let threshold: Int
        switch age.ageInYears {
        case ..<1:
            threshold = 70
        case 1...10:
            threshold = 70 + (2 * age.ageInYears)
        default:
            threshold = 90
        }
        let triggered = sbp < threshold
        let impact = triggered ? VitalSeverityImpact(system: .cardiovascular, subgrade: .severe, reason: "Гипотензия у ребёнка") : nil
        return VitalRuleEvaluation(
            rule: .hypotension,
            normalValue: "САД >= \(threshold)",
            threshold: "САД < \(threshold)",
            isTriggered: triggered,
            severityImpact: impact
        )
    }
    
    func tachycardiaRule(for vitals: Vitals, age: PatientAge) -> VitalRuleEvaluation {
        guard let heartRate = vitals.heartRate else {
            return VitalRuleEvaluation(rule: .tachycardia, normalValue: "—", threshold: "—", isTriggered: false, severityImpact: nil)
        }
        
        let threshold: Int
        if age.isAdult {
            threshold = 100
        } else if age.ageInYears >= 1 && age.ageInYears <= 10 {
            threshold = 130
        } else if age.ageInYears > 10 {
            threshold = 100
        } else {
            let ageInMonths = age.ageInMonths
            switch ageInMonths {
            case ..<3:
                threshold = 150
            case 3..<6:
                threshold = 130
            default:
                threshold = 120
            }
        }
        
        let triggered = heartRate > threshold
        let impact = triggered ? VitalSeverityImpact(system: .cardiovascular, subgrade: .light, reason: "Тахикардия") : nil
        return VitalRuleEvaluation(
            rule: .tachycardia,
            normalValue: "ЧСС <= \(threshold)",
            threshold: "ЧСС > \(threshold)",
            isTriggered: triggered,
            severityImpact: impact
        )
    }
    
    func dyspneaRule(for vitals: Vitals, age: PatientAge) -> VitalRuleEvaluation {
        guard let respiratoryRate = vitals.respiratoryRate else {
            return VitalRuleEvaluation(rule: .dyspnea, normalValue: "—", threshold: "—", isTriggered: false, severityImpact: nil)
        }
        
        let threshold: Int
        if age.isAdult {
            threshold = 20
        } else if age.ageInYears == 0 {
            let ageInMonths = age.ageInMonths
            if ageInMonths < 3 {
                threshold = 60
            } else {
                threshold = 50
            }
        } else if age.ageInYears <= 5 {
            threshold = 40
        } else if age.ageInYears <= 10 {
            threshold = 35
        } else {
            threshold = 30
        }
        
        let triggered = respiratoryRate > threshold
        let impact = triggered ? VitalSeverityImpact(system: .respiratory, subgrade: .light, reason: "Одышка") : nil
        return VitalRuleEvaluation(
            rule: .dyspnea,
            normalValue: "ЧД <= \(threshold)",
            threshold: "ЧД > \(threshold)",
            isTriggered: triggered,
            severityImpact: impact
        )
    }
}

struct Vitals: Codable {
    var ageYears: Int?
    var ageMonths: Int? // Для детей меньше года
    var baselineSystolicBP: Int? // Исходный САД для взрослых
    var systolicBP: Int? // Систолическое АД
    var diastolicBP: Int? // Диастолическое АД
    var spO2: Int? // SpO2 (%)
    var heartRate: Int? // ЧСС (уд/мин)
    var respiratoryRate: Int? // ЧД (в мин)
    var gcs: Int? // GCS (3-15)
    
    // Вычисляемые свойства
    var meanArterialPressure: Double? {
        guard let sys = systolicBP, let dia = diastolicBP else { return nil }
        // срАД = (1/3) × SBP + (2/3) × DBP
        return (1.0/3.0) * Double(sys) + (2.0/3.0) * Double(dia)
    }
    
    var patientAge: PatientAge? {
        PatientAge(years: ageYears, months: ageMonths)
    }
    
    var ageInMonths: Int? {
        patientAge?.ageInMonths
    }
    
    var vitalCriteriaSummary: VitalCriteriaSummary? {
        VitalCriteriaCalculator().evaluate(vitals: self)
    }
    
    var isHypotension: Bool {
        vitalCriteriaSummary?.hypotension.isTriggered ?? false
    }
    
    var isTachycardia: Bool {
        vitalCriteriaSummary?.tachycardia.isTriggered ?? false
    }
    
    var isDyspnea: Bool {
        vitalCriteriaSummary?.dyspnea.isTriggered ?? false
    }
    
    var isValid: Bool {
        guard let ageYears, ageYears >= 0 else { return false }
        if ageYears == 0 && ageMonths == nil {
            return false
        }
        return systolicBP != nil && diastolicBP != nil &&
               spO2 != nil && heartRate != nil && respiratoryRate != nil && gcs != nil
    }
}
