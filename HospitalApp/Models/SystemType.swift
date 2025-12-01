//
//  SystemType.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import Foundation

enum SystemType: String, CaseIterable, Codable {
    case skin = "Кожа"
    case mucous = "Реакции слизистых/АНО"
    case gastrointestinal = "ЖКТ"
    case cardiovascular = "Кардиоваскулярная"
    case neurological = "Неврологическая"
    case respiratory = "Респираторная"
    
    var displayName: String {
        return rawValue
    }
}

