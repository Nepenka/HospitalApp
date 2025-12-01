//
//  ExaminationRepository.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import Foundation

protocol ExaminationRepositoryProtocol {
    func saveExamination(_ examination: Examination)
    func getAllExaminations() -> [Examination]
    func deleteExamination(id: UUID)
}

class ExaminationRepository: ExaminationRepositoryProtocol {
    private let userDefaults = UserDefaults.standard
    private let examinationsKey = "saved_examinations"
    
    func saveExamination(_ examination: Examination) {
        var examinations = getAllExaminations()
        examinations.append(examination)
        
        if let encoded = try? JSONEncoder().encode(examinations) {
            userDefaults.set(encoded, forKey: examinationsKey)
        }
    }
    
    func getAllExaminations() -> [Examination] {
        guard let data = userDefaults.data(forKey: examinationsKey),
              let examinations = try? JSONDecoder().decode([Examination].self, from: data) else {
            return []
        }
        return examinations
    }
    
    func deleteExamination(id: UUID) {
        var examinations = getAllExaminations()
        examinations.removeAll { $0.id == id }
        
        if let encoded = try? JSONEncoder().encode(examinations) {
            userDefaults.set(encoded, forKey: examinationsKey)
        }
    }
}

