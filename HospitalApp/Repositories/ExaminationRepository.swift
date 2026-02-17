//
//  ExaminationRepository.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import Foundation
import CoreData

protocol ExaminationRepositoryProtocol {
    func saveExamination(_ examination: Examination)
    func getAllExaminations() -> [Examination]
    func deleteExamination(id: UUID)
}

class ExaminationRepository: ExaminationRepositoryProtocol {
    private let context: NSManagedObjectContext
    
    init(context: NSManagedObjectContext = CoreDataStack.shared.context) {
        self.context = context
    }
    
    func saveExamination(_ examination: Examination) {
        let entity = ExaminationEntity(context: context)
        entity.id = examination.id
        entity.date = examination.date
        entity.severityGrade = Int16(examination.severityResult.severityGrade)
        
        if let sys = examination.vitals.systolicBP {
            entity.systolicBP = Int16(sys)
        }
        
        if let data = try? JSONEncoder().encode(examination) {
            entity.payload = data
        }
        
        CoreDataStack.shared.saveContext()
    }
    
    func getAllExaminations() -> [Examination] {
        let request: NSFetchRequest<ExaminationEntity> = ExaminationEntity.fetchRequest()
        request.sortDescriptors = [NSSortDescriptor(key: "date", ascending: false)]
        
        guard let entities = try? context.fetch(request) else {
            return []
        }
        
        var result: [Examination] = []
        let decoder = JSONDecoder()
        
        for entity in entities {
            if let data = entity.payload,
               let examination = try? decoder.decode(Examination.self, from: data) {
                result.append(examination)
            }
        }
        
        return result
    }
    
    func deleteExamination(id: UUID) {
        let request: NSFetchRequest<ExaminationEntity> = ExaminationEntity.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@", id as CVarArg)
        
        if let entities = try? context.fetch(request) {
            for entity in entities {
                context.delete(entity)
            }
            CoreDataStack.shared.saveContext()
        }
    }
}
