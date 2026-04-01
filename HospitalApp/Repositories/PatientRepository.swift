import Foundation
import CoreData

protocol PatientRepositoryProtocol {
    func savePatient(_ patient: Patient)
}

class PatientRepository: PatientRepositoryProtocol {
    private let context: NSManagedObjectContext
    
    init(context: NSManagedObjectContext = CoreDataStack.shared.context) {
        self.context = context
    }
    
    func savePatient(_ patient: Patient) {
        let entity = PatientEntity(context: context)
        entity.id = patient.id
        entity.firstName = patient.firstName
        entity.lastName = patient.lastName
        entity.middleName = patient.middleName
        entity.createdAt = patient.createdAt
        CoreDataStack.shared.saveContext()
    }
}
