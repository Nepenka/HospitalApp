//
//  VitalsViewController.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import UIKit
import Combine

class VitalsViewController: UIViewController {
    private let viewModel: VitalsViewModel
    private let selectedSymptoms: [Symptom]
    private let coordinator: MainCoordinator
    private let initialDiagnosis: String?
    private let editingExaminationId: UUID?
    private var cancellables = Set<AnyCancellable>()
    
    private let scrollView: UIScrollView = {
        let scrollView = UIScrollView()
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.keyboardDismissMode = .interactive
        return scrollView
    }()
    
    private let contentView: UIStackView = {
        let stackView = UIStackView()
        stackView.translatesAutoresizingMaskIntoConstraints = false
        stackView.axis = .vertical
        stackView.spacing = 20
        stackView.layoutMargins = UIEdgeInsets(top: 20, left: 16, bottom: 20, right: 16)
        stackView.isLayoutMarginsRelativeArrangement = true
        return stackView
    }()
    
    private let continueButton: UIButton = {
        let button = UIButton(type: .system)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.setTitle("Дальше", for: .normal)
        button.backgroundColor = .systemBlue
        button.setTitleColor(.white, for: .normal)
        button.layer.cornerRadius = 12
        button.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
        return button
    }()
    
    private var inputFields: [UITextField] = []
    private var fieldKeyMap: [UITextField: String] = [:]
    private var ageMonthsRow: UIView?
    private var ageYearsTextField: UITextField?
    private var ageMonthsTextField: UITextField?
    
    init(
        viewModel: VitalsViewModel,
        selectedSymptoms: [Symptom],
        coordinator: MainCoordinator,
        initialDiagnosis: String? = nil,
        editingExaminationId: UUID? = nil
    ) {
        self.viewModel = viewModel
        self.selectedSymptoms = selectedSymptoms
        self.coordinator = coordinator
        self.initialDiagnosis = initialDiagnosis
        self.editingExaminationId = editingExaminationId
        super.init(nibName: nil, bundle: nil)
        title = "Витальные данные"
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        setupBindings()
        setupKeyboardDismiss()
    }
    
    private func setupUI() {
        // Принудительно устанавливаем светлую тему
        overrideUserInterfaceStyle = .light
        view.backgroundColor = .systemBackground
        navigationItem.largeTitleDisplayMode = .never
        
        view.addSubview(scrollView)
        scrollView.addSubview(contentView)
        view.addSubview(continueButton)
        
        // Создаем поля ввода
        let fields: [(title: String, key: String, placeholder: String)] = [
            ("Возраст (лет)", "ageYears", "Сколько лет: "),
            ("Возраст (месяцев, если <1 года)", "ageMonths", "Сколько месяцев(0..11)"),
            ("Исходное систолическое АД (для взрослых, опц.)", "baselineSystolicBP", "Исходное САД"),
            ("Систолическое АД (мм рт.ст.)", "systolicBP", "Систолическое АД (мм рт.ст.): "),
            ("Диастолическое АД (мм рт.ст.)", "diastolicBP", "Диастолическое АД (мм рт.ст.): "),
            ("SpO2 (%)", "spO2", "SpO2 (%): "),
            ("ЧСС (уд/мин)", "heartRate", "ЧСС (уд/мин): "),
            ("ЧД (в мин)", "respiratoryRate", "ЧД (в мин): "),
            ("GCS (3-15)", "gcs", "GCS (3-15): ")
        ]
        
        for fieldInfo in fields {
            let (container, textField) = createInputField(title: fieldInfo.title, key: fieldInfo.key, placeholder: fieldInfo.placeholder)
            inputFields.append(textField)
            contentView.addArrangedSubview(container)
            applyInitialValue(for: textField, key: fieldInfo.key)
            
            if fieldInfo.key == "ageYears" {
                ageYearsTextField = textField
            }
            if fieldInfo.key == "ageMonths" {
                ageMonthsRow = container
                ageMonthsTextField = textField
            }
        }
        
        updateMonthsRowVisibility(animated: false)
        
        // Добавляем информационные метки
        let mapLabel = createInfoLabel(text: "срАД: —")
        mapLabel.tag = 100
        contentView.addArrangedSubview(mapLabel)
        
        let hypotensionLabel = createInfoLabel(text: "Гипотензия: —")
        hypotensionLabel.tag = 101
        contentView.addArrangedSubview(hypotensionLabel)
        
        let tachycardiaLabel = createInfoLabel(text: "Тахикардия: —")
        tachycardiaLabel.tag = 102
        contentView.addArrangedSubview(tachycardiaLabel)
        
        let dyspneaLabel = createInfoLabel(text: "Одышка: —")
        dyspneaLabel.tag = 103
        contentView.addArrangedSubview(dyspneaLabel)
        
        continueButton.addTarget(self, action: #selector(calculateTapped), for: .touchUpInside)
        
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: continueButton.topAnchor, constant: -16),
            
            contentView.topAnchor.constraint(equalTo: scrollView.topAnchor),
            contentView.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor),
            contentView.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor),
            contentView.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor),
            contentView.widthAnchor.constraint(equalTo: scrollView.widthAnchor),
            
            continueButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            continueButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            continueButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
            continueButton.heightAnchor.constraint(equalToConstant: 50)
        ])
    }
    
    private func createInputField(title: String, key: String, placeholder: String) -> (UIView, UITextField) {
        let container = UIView()
        container.translatesAutoresizingMaskIntoConstraints = false
        
        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.text = title
        label.font = .systemFont(ofSize: 16, weight: .medium)
        
        let textField = UITextField()
        textField.translatesAutoresizingMaskIntoConstraints = false
        textField.borderStyle = .roundedRect
        textField.keyboardType = .numberPad
        textField.placeholder = placeholder
        textField.addTarget(self, action: #selector(textFieldChanged(_:)), for: .editingChanged)
        
        fieldKeyMap[textField] = key
        
        container.addSubview(label)
        container.addSubview(textField)
        
        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: container.topAnchor),
            label.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            label.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            
            textField.topAnchor.constraint(equalTo: label.bottomAnchor, constant: 8),
            textField.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            textField.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            textField.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            textField.heightAnchor.constraint(equalToConstant: 44)
        ])
        
        return (container, textField)
    }
    
    /// У детей младше 1 года возраст задаётся как годы = 0 и месяцы 0…11. При возрасте ≥ 1 года месяцы не используются.
    private func updateMonthsRowVisibility(animated: Bool) {
        guard let monthsRow = ageMonthsRow else { return }
        
        let years = viewModel.vitals.ageYears
        let hideMonths = years.map { $0 >= 1 } ?? false
        
        if hideMonths {
            viewModel.updateAgeMonths(nil)
            ageMonthsTextField?.text = ""
            ageMonthsTextField?.isEnabled = false
        } else {
            ageMonthsTextField?.isEnabled = true
        }
        
        let updates = {
            monthsRow.alpha = hideMonths ? 0 : 1
            monthsRow.isHidden = hideMonths
        }
        
        if animated {
            UIView.animate(withDuration: 0.25, animations: updates)
        } else {
            updates()
        }
    }
    
    private func createInfoLabel(text: String) -> UILabel {
        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.text = text
        label.font = .systemFont(ofSize: 16, weight: .semibold)
        label.textColor = .systemBlue
        label.textAlignment = .center
        return label
    }
    
    private func setupBindings() {
        viewModel.$meanArterialPressure
            .sink { [weak self] value in
                if let label = self?.view.viewWithTag(100) as? UILabel {
                    label.text = "срАД: \(value)"
                }
            }
            .store(in: &cancellables)
        
        viewModel.$hypotensionStatus
            .sink { [weak self] value in
                if let label = self?.view.viewWithTag(101) as? UILabel {
                    label.text = "Гипотензия: \(value)"
                    label.textColor = value == "Да" ? .systemRed : .systemBlue
                }
            }
            .store(in: &cancellables)
        
        viewModel.$tachycardiaStatus
            .sink { [weak self] value in
                if let label = self?.view.viewWithTag(102) as? UILabel {
                    label.text = "Тахикардия: \(value)"
                    label.textColor = value == "Да" ? .systemRed : .systemBlue
                }
            }
            .store(in: &cancellables)
        
        viewModel.$dyspneaStatus
            .sink { [weak self] value in
                if let label = self?.view.viewWithTag(103) as? UILabel {
                    label.text = "Одышка: \(value)"
                    label.textColor = value == "Да" ? .systemRed : .systemBlue
                }
            }
            .store(in: &cancellables)
        
        viewModel.$isValid
            .sink { [weak self] isValid in
                self?.continueButton.isEnabled = isValid
                self?.continueButton.alpha = isValid ? 1.0 : 0.5
            }
            .store(in: &cancellables)
    }
    
    @objc private func textFieldChanged(_ textField: UITextField) {
        guard let key = fieldKeyMap[textField] else { return }
        let value = Int(textField.text ?? "")
        
        switch key {
        case "ageYears":
            viewModel.updateAge(value)
            updateMonthsRowVisibility(animated: true)
        case "ageMonths":
            viewModel.updateAgeMonths(value)
        case "baselineSystolicBP":
            viewModel.updateBaselineSystolicBP(value)
        case "systolicBP":
            viewModel.updateSystolicBP(value)
        case "diastolicBP":
            viewModel.updateDiastolicBP(value)
        case "spO2":
            viewModel.updateSpO2(value)
        case "heartRate":
            viewModel.updateHeartRate(value)
        case "respiratoryRate":
            viewModel.updateRespiratoryRate(value)
        case "gcs":
            viewModel.updateGCS(value)
        default:
            break
        }
    }
    
    @objc private func calculateTapped() {
        guard viewModel.isValid else {
            showAlert(message: "Пожалуйста, заполните все поля")
            return
        }
        coordinator.showResult(
            selectedSymptoms: selectedSymptoms,
            vitals: viewModel.vitals,
            initialDiagnosis: initialDiagnosis,
            editingExaminationId: editingExaminationId
        )
    }
    
    private func setupKeyboardDismiss() {
        let swipeDown = UISwipeGestureRecognizer(target: self, action: #selector(dismissKeyboard))
        swipeDown.direction = .down
        view.addGestureRecognizer(swipeDown)
        
        let tapGesture = UITapGestureRecognizer(target: self, action: #selector(dismissKeyboard))
        tapGesture.cancelsTouchesInView = false
        view.addGestureRecognizer(tapGesture)
    }
    
    private func applyInitialValue(for field: UITextField, key: String) {
        switch key {
        case "ageYears":
            field.text = viewModel.vitals.ageYears.map(String.init)
        case "ageMonths":
            field.text = viewModel.vitals.ageMonths.map(String.init)
        case "baselineSystolicBP":
            field.text = viewModel.vitals.baselineSystolicBP.map(String.init)
        case "systolicBP":
            field.text = viewModel.vitals.systolicBP.map(String.init)
        case "diastolicBP":
            field.text = viewModel.vitals.diastolicBP.map(String.init)
        case "spO2":
            field.text = viewModel.vitals.spO2.map(String.init)
        case "heartRate":
            field.text = viewModel.vitals.heartRate.map(String.init)
        case "respiratoryRate":
            field.text = viewModel.vitals.respiratoryRate.map(String.init)
        case "gcs":
            field.text = viewModel.vitals.gcs.map(String.init)
        default:
            break
        }
    }
    
    @objc private func dismissKeyboard() {
        view.endEditing(true)
    }
    
    private func showAlert(message: String) {
        let alert = UIAlertController(title: "Внимание", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
}
