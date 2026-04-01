import XCTest
@testable import HospitalApp

final class VitalCriteriaCalculatorTests: XCTestCase {
    private let calculator = VitalCriteriaCalculator()
    
    func testAge2MonthsThresholds() {
        let vitals = makeVitals(years: 0, months: 2, sbp: 69, dbp: 45, hr: 151, rr: 61)
        let summary = calculator.evaluate(vitals: vitals)
        
        XCTAssertEqual(summary?.hypotension.isTriggered, true)
        XCTAssertEqual(summary?.tachycardia.isTriggered, true)
        XCTAssertEqual(summary?.dyspnea.isTriggered, true)
    }
    
    func testAge3MonthsBoundary() {
        let vitals = makeVitals(years: 0, months: 3, sbp: 70, dbp: 45, hr: 131, rr: 51)
        let summary = calculator.evaluate(vitals: vitals)
        
        XCTAssertEqual(summary?.tachycardia.isTriggered, true)
        XCTAssertEqual(summary?.dyspnea.isTriggered, true)
    }
    
    func testAge6MonthsBoundary() {
        let vitals = makeVitals(years: 0, months: 6, sbp: 70, dbp: 45, hr: 121, rr: 51)
        let summary = calculator.evaluate(vitals: vitals)
        
        XCTAssertEqual(summary?.tachycardia.isTriggered, true)
        XCTAssertEqual(summary?.dyspnea.isTriggered, true)
    }
    
    func testAge11MonthsBoundary() {
        let vitals = makeVitals(years: 0, months: 11, sbp: 69, dbp: 45, hr: 121, rr: 51)
        let summary = calculator.evaluate(vitals: vitals)
        
        XCTAssertEqual(summary?.hypotension.isTriggered, true)
        XCTAssertEqual(summary?.tachycardia.isTriggered, true)
        XCTAssertEqual(summary?.dyspnea.isTriggered, true)
    }
    
    func testAge12MonthsBoundary() {
        let vitals = makeVitals(years: 1, months: 0, sbp: 71, dbp: 45, hr: 131, rr: 41)
        let summary = calculator.evaluate(vitals: vitals)
        
        XCTAssertEqual(summary?.hypotension.isTriggered, true) // порог 72
        XCTAssertEqual(summary?.tachycardia.isTriggered, true)
        XCTAssertEqual(summary?.dyspnea.isTriggered, true)
    }
    
    func testAge10YearsBoundary() {
        let vitals = makeVitals(years: 10, months: 0, sbp: 89, dbp: 60, hr: 131, rr: 36)
        let summary = calculator.evaluate(vitals: vitals)
        
        XCTAssertEqual(summary?.hypotension.isTriggered, true) // порог 90
        XCTAssertEqual(summary?.tachycardia.isTriggered, true)
        XCTAssertEqual(summary?.dyspnea.isTriggered, true)
    }
    
    func testAge11YearsBoundary() {
        let vitals = makeVitals(years: 11, months: 0, sbp: 89, dbp: 60, hr: 101, rr: 31)
        let summary = calculator.evaluate(vitals: vitals)
        
        XCTAssertEqual(summary?.hypotension.isTriggered, true)
        XCTAssertEqual(summary?.tachycardia.isTriggered, true)
        XCTAssertEqual(summary?.dyspnea.isTriggered, true)
    }
    
    func testAge17YearsBoundary() {
        let vitals = makeVitals(years: 17, months: 0, sbp: 89, dbp: 60, hr: 101, rr: 31)
        let summary = calculator.evaluate(vitals: vitals)
        
        XCTAssertEqual(summary?.hypotension.isTriggered, true)
        XCTAssertEqual(summary?.tachycardia.isTriggered, true)
        XCTAssertEqual(summary?.dyspnea.isTriggered, true)
    }
    
    func testAge18YearsBoundary() {
        let vitals = makeVitals(years: 18, months: 0, sbp: 89, dbp: 60, hr: 101, rr: 21, baselineSBP: 130)
        let summary = calculator.evaluate(vitals: vitals)
        
        XCTAssertEqual(summary?.hypotension.isTriggered, true)
        XCTAssertEqual(summary?.tachycardia.isTriggered, true)
        XCTAssertEqual(summary?.dyspnea.isTriggered, true)
        XCTAssertEqual(summary?.hypotension.severityImpact?.subgrade, .moderate)
    }
    
    func testAdultHypotensionByMapOnly() {
        let vitals = makeVitals(years: 18, months: 0, sbp: 90, dbp: 50, hr: 90, rr: 18)
        let summary = calculator.evaluate(vitals: vitals)
        
        XCTAssertEqual(summary?.hypotension.isTriggered, true)
    }
    
    private func makeVitals(
        years: Int,
        months: Int,
        sbp: Int,
        dbp: Int,
        hr: Int,
        rr: Int,
        baselineSBP: Int? = nil
    ) -> Vitals {
        Vitals(
            ageYears: years,
            ageMonths: months,
            baselineSystolicBP: baselineSBP,
            systolicBP: sbp,
            diastolicBP: dbp,
            spO2: 98,
            heartRate: hr,
            respiratoryRate: rr,
            gcs: 15
        )
    }
}
