//
//  SeverityLevel.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import Foundation

enum SeverityLevel: Int, Codable {
    case level1 = 1
    case level2 = 2
    case level3 = 3
    case level4 = 4
    case level5 = 5
    
    var displayName: String {
        return "Степень \(rawValue)"
    }
    
    var description: String {
        switch self {
        case .level1:
            return "Легкая степень"
        case .level2:
            return "Средняя степень"
        case .level3:
            return "Тяжелая степень"
        case .level4:
            return "Очень тяжелая степень"
        case .level5:
            return "Крайне тяжелая степень"
        }
    }
}

struct SeverityResult: Codable {
    let level: SeverityLevel
    let affectedSystems: [SystemType]
    let explanation: String
}

