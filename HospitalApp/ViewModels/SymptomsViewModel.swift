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
    
    private var cancellables = Set<AnyCancellable>()
    
    init() {
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
        
        $symptoms
            .sink { [weak self] _ in
                self?.updateSymptomsBySystem()
            }
            .store(in: &cancellables)
    }
    
    private func updateSymptomsBySystem() {
        symptomsBySystem = Dictionary(grouping: symptoms) { $0.system }
    }
    
    func toggleSymptom(_ symptom: Symptom) {
        if let index = symptoms.firstIndex(where: { $0.id == symptom.id }) {
            symptoms[index].isSelected.toggle()
        }
    }
    
    func getSelectedSymptoms() -> [Symptom] {
        return symptoms.filter { $0.isSelected }
    }
    
    func getSystems() -> [SystemType] {
        return SystemType.allCases
    }
}

