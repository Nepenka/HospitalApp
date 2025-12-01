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
    
    private let repository: ExaminationRepositoryProtocol
    
    init(repository: ExaminationRepositoryProtocol = ExaminationRepository()) {
        self.repository = repository
    }
    
    func calculateSeverity(selectedSymptoms: [Symptom], vitals: Vitals) {
        self.selectedSymptoms = selectedSymptoms
        self.vitals = vitals
        self.severityResult = SeverityCalculator.calculateSeverity(
            selectedSymptoms: selectedSymptoms,
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

