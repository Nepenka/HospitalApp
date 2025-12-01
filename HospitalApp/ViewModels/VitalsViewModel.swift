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
    
    private var cancellables = Set<AnyCancellable>()
    
    init() {
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
    }
    
    func updateAge(_ age: Int?) {
        vitals.age = age
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
}

