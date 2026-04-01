import Foundation

struct Patient: Codable, Equatable {
    let id: UUID
    let firstName: String
    let lastName: String
    let middleName: String
    let createdAt: Date
    
    init(
        id: UUID = UUID(),
        firstName: String,
        lastName: String,
        middleName: String,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.firstName = firstName
        self.lastName = lastName
        self.middleName = middleName
        self.createdAt = createdAt
    }
    
    var fullName: String {
        "\(lastName) \(firstName) \(middleName)"
    }
}
