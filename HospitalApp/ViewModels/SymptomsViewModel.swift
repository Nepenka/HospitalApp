//
//  SymptomsViewModel.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import Foundation
import Combine

class SymptomsViewModel {
    @Published var symptoms: [Symptom] = []
    @Published var symptomsBySystem: [SystemType: [Symptom]] = [:]
    @Published var selectedSymptomsCount: Int = 0
    @Published var perSystemSubgrades: [SystemType: Subgrade] = [:]
    
    private var cancellables = Set<AnyCancellable>()
    private let severityEngine: SeverityEngine
    
    init(severityEngine: SeverityEngine = SeverityEngine()) {
        self.severityEngine = severityEngine
        loadSymptoms()
        setupBindings()
    }
    
    private func loadSymptoms() {
        symptoms = Symptom.defaultSymptoms()
        updateSymptomsBySystem()
    }
    
    private func setupBindings() {
        $symptoms
            .map { symptoms in
                symptoms.filter { $0.isSelected }.count
            }
            .assign(to: &$selectedSymptomsCount)
        
        // Обновляем symptomsBySystem при изменении symptoms
        // (updateSubgrades вызывается синхронно в toggleSymptom, так что не нужно здесь)
        $symptoms
            .sink { [weak self] _ in
                self?.updateSymptomsBySystem()
            }
            .store(in: &cancellables)
        
        // Также обновляем субградации при изменении symptoms (на случай если симптомы изменяются не через toggleSymptom)
        $symptoms
            .sink { [weak self] _ in
                self?.updateSubgrades()
            }
            .store(in: &cancellables)
    }
    
    private func updateSymptomsBySystem() {
        symptomsBySystem = Dictionary(grouping: symptoms) { $0.system }
    }
    
    private func updateSubgrades() {
        let selected = getSelectedSymptoms()
        perSystemSubgrades = severityEngine.computeSubgrades(selectedSymptoms: selected)
    }
    
    func toggleSymptom(_ symptom: Symptom) {
        if let index = symptoms.firstIndex(where: { $0.id == symptom.id }) {
            symptoms[index].isSelected.toggle()
            // Синхронно обновляем symptomsBySystem для немедленного доступа
            updateSymptomsBySystem()
            // Синхронно обновляем субградации
            updateSubgrades()
        }
    }
    
    func getSelectedSymptoms() -> [Symptom] {
        return symptoms.filter { $0.isSelected }
    }
    
    func getSystems() -> [SystemType] {
        return SystemType.allCases
    }
    
    func getSubgrade(for system: SystemType) -> Subgrade {
        return perSystemSubgrades[system] ?? .none
    }
}

