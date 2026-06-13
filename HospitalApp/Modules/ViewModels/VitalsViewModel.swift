//
//  VitalsViewModel.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import Foundation
import Combine

class VitalsViewModel {
    @Published var vitals: Vitals = Vitals()
    @Published var isValid: Bool = false
    @Published var meanArterialPressure: String = ""
    @Published var hypotensionStatus: String = ""
    @Published var tachycardiaStatus: String = ""
    @Published var dyspneaStatus: String = ""
    
    private var cancellables = Set<AnyCancellable>()
    
    init(initialVitals: Vitals = Vitals()) {
        vitals = initialVitals
        setupBindings()
    }
    
    private func setupBindings() {
        $vitals
            .map { $0.isValid }
            .assign(to: &$isValid)
        
        $vitals
            .map { vitals in
                if let map = vitals.meanArterialPressure {
                    return String(format: "%.1f мм рт.ст.", map)
                }
                return "—"
            }
            .assign(to: &$meanArterialPressure)
        
        $vitals
            .map { vitals in
                vitals.isHypotension ? "Да" : "Нет"
            }
            .assign(to: &$hypotensionStatus)
        
        $vitals
            .map { vitals in
                vitals.isTachycardia ? "Да" : "Нет"
            }
            .assign(to: &$tachycardiaStatus)
        
        $vitals
            .map { vitals in
                vitals.isDyspnea ? "Да" : "Нет"
            }
            .assign(to: &$dyspneaStatus)
    }
    
    func updateAge(_ age: Int?) {
        vitals.ageYears = age
    }
    
    func updateAgeMonths(_ value: Int?) {
        vitals.ageMonths = value
    }
    
    func updateBaselineSystolicBP(_ value: Int?) {
        vitals.baselineSystolicBP = value
    }
    
    func updateSystolicBP(_ value: Int?) {
        vitals.systolicBP = value
    }
    
    func updateDiastolicBP(_ value: Int?) {
        vitals.diastolicBP = value
    }
    
    func updateSpO2(_ value: Int?) {
        vitals.spO2 = value
    }
    
    func updateHeartRate(_ value: Int?) {
        vitals.heartRate = value
    }
    
    func updateRespiratoryRate(_ value: Int?) {
        vitals.respiratoryRate = value
    }
    
    func updateGCS(_ value: Int?) {
        vitals.gcs = value
    }

    func updateProbableAllergen(_ value: String?) {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        vitals.probableAllergen = (trimmed?.isEmpty == false) ? trimmed : nil
    }
}
