//
//  Examination.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import Foundation

struct Examination: Codable {
    let id: UUID
    let date: Date
    let selectedSymptoms: [Symptom]
    let vitals: Vitals
    let severityResult: SeverityResult
    
    init(id: UUID = UUID(), date: Date = Date(), selectedSymptoms: [Symptom], vitals: Vitals, severityResult: SeverityResult) {
        self.id = id
        self.date = date
        self.selectedSymptoms = selectedSymptoms
        self.vitals = vitals
        self.severityResult = severityResult
    }
}

