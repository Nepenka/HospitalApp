//
//  Vitals.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import Foundation

struct Vitals: Codable {
    var age: Int?
    var systolicBP: Int? // Систолическое АД
    var diastolicBP: Int? // Диастолическое АД
    var spO2: Int? // SpO2 (%)
    var heartRate: Int? // ЧСС (уд/мин)
    var respiratoryRate: Int? // ЧД (в мин)
    var gcs: Int? // GCS (3-15)
    
    // Вычисляемые свойства
    var meanArterialPressure: Double? {
        guard let sys = systolicBP, let dia = diastolicBP else { return nil }
        // срАД = (2 × ДАД + САД) / 3
        return (2.0 * Double(dia) + Double(sys)) / 3.0
    }
    
    var isHypotension: Bool {
        guard let age = age, let sys = systolicBP else { return false }
        
        // Гипотензия определяется по возрасту:
        // < 1 года: САД < 70 мм рт.ст.
        // 1-10 лет: САД < 70 + (2 × возраст в годах)
        // > 10 лет: САД < 90 мм рт.ст.
        if age < 1 {
            return sys < 70
        } else if age <= 10 {
            return sys < (70 + 2 * age)
        } else {
            return sys < 90
        }
    }
    
    var isValid: Bool {
        return age != nil && systolicBP != nil && diastolicBP != nil && 
               spO2 != nil && heartRate != nil && respiratoryRate != nil && gcs != nil
    }
}

