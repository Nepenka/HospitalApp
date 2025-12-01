//
//  Subgrade.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import Foundation

enum Subgrade: String, Codable, CaseIterable {
    case none = "Нет"
    case light = "Л"
    case moderate = "У"
    case severe = "Т"
    
    var displayName: String {
        switch self {
        case .none:
            return "Нет"
        case .light:
            return "Лёгкая (Л)"
        case .moderate:
            return "Умеренная (У)"
        case .severe:
            return "Тяжёлая (Т)"
        }
    }
    
    var shortName: String {
        return rawValue
    }
    
    var severityValue: Int {
        switch self {
        case .none: return 0
        case .light: return 1
        case .moderate: return 2
        case .severe: return 3
        }
    }
}


