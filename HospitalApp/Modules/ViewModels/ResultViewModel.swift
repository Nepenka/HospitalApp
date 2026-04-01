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
    @Published var patient: Patient?
    @Published var diagnosis: String = ""
    @Published var perSystemSubgrades: [SystemType: Subgrade] = [:]
    
    private let repository: ExaminationRepositoryProtocol
    private let severityEngine: SeverityEngine
    
    init(repository: ExaminationRepositoryProtocol = ExaminationRepository(),
         severityEngine: SeverityEngine = SeverityEngine()) {
        self.repository = repository
        self.severityEngine = severityEngine
    }
    
    func calculateSeverity(selectedSymptoms: [Symptom], vitals: Vitals, patient: Patient) {
        self.selectedSymptoms = selectedSymptoms
        self.vitals = vitals
        self.patient = patient
        
        // Сначала вычисляем субградации
        perSystemSubgrades = severityEngine.computeSubgrades(selectedSymptoms: selectedSymptoms)
        
        // Затем вычисляем финальную степень тяжести
        severityResult = severityEngine.computeFinalSeverity(
            perSystem: perSystemSubgrades,
            vitals: vitals
        )
    }
    
    func saveExamination() {
        guard let result = severityResult, let patient = patient else { return }
        
        let cleanDiagnosis = diagnosis.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanDiagnosis.isEmpty else { return }
        
        let examination = Examination(
            patient: patient,
            diagnosis: cleanDiagnosis,
            selectedSymptoms: selectedSymptoms,
            vitals: vitals,
            severityResult: result
        )
        
        repository.saveExamination(examination)
    }
}
