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
    @Published var clinicalConclusion: ClinicalConclusionResult?
    @Published var selectedSymptoms: [Symptom] = []
    @Published var vitals: Vitals = Vitals()
    @Published var patient: Patient?
    @Published var diagnosis: String = ""
    @Published var perSystemSubgrades: [SystemType: Subgrade] = [:]
    @Published var editingExaminationId: UUID?
    @Published var hadKnownAllergenContact: Bool?
    
    private let repository: ExaminationRepositoryProtocol
    private let severityEngine: SeverityEngine
    private let clinicalConclusionEngine: ClinicalConclusionEngine
    
    init(repository: ExaminationRepositoryProtocol = ExaminationRepository(),
         severityEngine: SeverityEngine = SeverityEngine(),
         clinicalConclusionEngine: ClinicalConclusionEngine = ClinicalConclusionEngine()) {
        self.repository = repository
        self.severityEngine = severityEngine
        self.clinicalConclusionEngine = clinicalConclusionEngine
    }
    
    func calculateSeverity(
        selectedSymptoms: [Symptom],
        vitals: Vitals,
        patient: Patient,
        initialDiagnosis: String? = nil,
        editingExaminationId: UUID? = nil
    ) {
        self.selectedSymptoms = selectedSymptoms
        self.vitals = vitals
        self.patient = patient
        self.editingExaminationId = editingExaminationId
        if let initialDiagnosis {
            self.diagnosis = initialDiagnosis
        }
        
        // Сначала вычисляем субградации
        perSystemSubgrades = severityEngine.computeSubgrades(selectedSymptoms: selectedSymptoms)
        
        // Затем вычисляем финальную степень тяжести
        severityResult = severityEngine.computeFinalSeverity(
            perSystem: perSystemSubgrades,
            vitals: vitals
        )

        if severityResult != nil {
            recalculateClinicalConclusion()
        }
    }

    func updateKnownAllergenContact(_ value: Bool?) {
        hadKnownAllergenContact = value
        recalculateClinicalConclusion()
    }

    private func recalculateClinicalConclusion() {
        guard let severityResult else { return }
        let conclusion = clinicalConclusionEngine.buildConclusion(
            severityResult: severityResult,
            selectedSymptoms: selectedSymptoms,
            vitals: vitals,
            hadKnownAllergenContact: hadKnownAllergenContact
        )
        clinicalConclusion = conclusion
        if diagnosis.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            diagnosis = conclusion.conclusionText
        }
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
        
        if let editingExaminationId {
            repository.deleteExamination(id: editingExaminationId)
        }
        
        repository.saveExamination(examination)
    }
}
