//
//  ResultViewModel.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import Foundation
import Combine

class ResultViewModel {
    @Published var severityResult: SeverityResult?
    @Published var selectedSymptoms: [Symptom] = []
    @Published var vitals: Vitals = Vitals()
    @Published var perSystemSubgrades: [SystemType: Subgrade] = [:]
    
    private let repository: ExaminationRepositoryProtocol
    private let severityEngine: SeverityEngine
    
    init(repository: ExaminationRepositoryProtocol = ExaminationRepository(), 
         severityEngine: SeverityEngine = SeverityEngine()) {
        self.repository = repository
        self.severityEngine = severityEngine
    }
    
    func calculateSeverity(selectedSymptoms: [Symptom], vitals: Vitals) {
        self.selectedSymptoms = selectedSymptoms
        self.vitals = vitals
        
        // Сначала вычисляем субградации
        perSystemSubgrades = severityEngine.computeSubgrades(selectedSymptoms: selectedSymptoms)
        
        // Затем вычисляем финальную степень тяжести
        severityResult = severityEngine.computeFinalSeverity(
            perSystem: perSystemSubgrades,
            vitals: vitals
        )
    }
    
    func saveExamination() {
        guard let result = severityResult else { return }
        
        let examination = Examination(
            selectedSymptoms: selectedSymptoms,
            vitals: vitals,
            severityResult: result
        )
        
        repository.saveExamination(examination)
    }
}

