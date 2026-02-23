//
//  SymptomsViewController.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import UIKit
import Combine

class SymptomsViewController: UIViewController {
    private let viewModel: SymptomsViewModel
    private let coordinator: MainCoordinator
    private var cancellables = Set<AnyCancellable>()
    
    private let tableView: UITableView = {
        let tableView = UITableView(frame: .zero, style: .grouped)
        tableView.translatesAutoresizingMaskIntoConstraints = false
        tableView.register(SymptomCell.self, forCellReuseIdentifier: "SymptomCell")
        return tableView
    }()
    
    private let continueButton: UIButton = {
        let button = UIButton(type: .system)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.setTitle("Продолжить", for: .normal)
        button.backgroundColor = .systemBlue
        button.setTitleColor(.white, for: .normal)
        button.layer.cornerRadius = 12
        button.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
        return button
    }()
    
    private let selectedCountLabel: UILabel = {
        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.textAlignment = .center
        label.font = .systemFont(ofSize: 16, weight: .medium)
        label.textColor = .systemGray
        return label
    }()
    
    init(viewModel: SymptomsViewModel, coordinator: MainCoordinator) {
        self.viewModel = viewModel
        self.coordinator = coordinator
        super.init(nibName: nil, bundle: nil)
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        setupBindings()
    }
    
    private func setupUI() {
        // Принудительно устанавливаем светлую тему
        overrideUserInterfaceStyle = .light
        view.backgroundColor = .systemBackground
        title = "Симптомы"
        
        let historyItem = UIBarButtonItem(title: "История", style: .plain, target: self, action: #selector(historyButtonTapped))
        navigationItem.rightBarButtonItem = historyItem
        
        view.addSubview(tableView)
        view.addSubview(continueButton)
        view.addSubview(selectedCountLabel)
        
        tableView.delegate = self
        tableView.dataSource = self
        
        continueButton.addTarget(self, action: #selector(continueTapped), for: .touchUpInside)
        
        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: selectedCountLabel.topAnchor, constant: -8),
            
            selectedCountLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            selectedCountLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            selectedCountLabel.bottomAnchor.constraint(equalTo: continueButton.topAnchor, constant: -8),
            selectedCountLabel.heightAnchor.constraint(equalToConstant: 24),
            
            continueButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            continueButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            continueButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
            continueButton.heightAnchor.constraint(equalToConstant: 50)
        ])
    }
    
    private func setupBindings() {
        viewModel.$selectedSymptomsCount
            .map { "Выбрано симптомов: \($0)" }
            .assign(to: \.text, on: selectedCountLabel)
            .store(in: &cancellables)
        
        // Обновляем заголовки секций при изменении субградаций
        viewModel.$perSystemSubgrades
            .sink { [weak self] _ in
                guard let self = self else { return }
                // Обновляем все заголовки секций
                DispatchQueue.main.async {
                    for section in 0..<self.viewModel.getSystems().count {
                        self.tableView.reloadSections(IndexSet(integer: section), with: .none)
                    }
                }
            }
            .store(in: &cancellables)
    }
    
    func reset() {
        viewModel.reset()
        tableView.reloadData()
    }
    
    @objc private func continueTapped() {
        let selectedSymptoms = viewModel.getSelectedSymptoms()
        guard !selectedSymptoms.isEmpty else {
            showAlert(message: "Пожалуйста, выберите хотя бы один симптом")
            return
        }
        coordinator.showVitalsInput(selectedSymptoms: selectedSymptoms)
    }
    
    @objc private func historyButtonTapped() {
        coordinator.showExaminationHistory()
    }
    
    private func showAlert(message: String) {
        let alert = UIAlertController(title: "Внимание", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
}

extension SymptomsViewController: UITableViewDataSource, UITableViewDelegate {
    func numberOfSections(in tableView: UITableView) -> Int {
        return viewModel.getSystems().count
    }
    
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        let system = viewModel.getSystems()[section]
        return viewModel.symptomsBySystem[system]?.count ?? 0
    }
    
    func tableView(_ tableView: UITableView, viewForHeaderInSection section: Int) -> UIView? {
        let system = viewModel.getSystems()[section]
        let subgrade = viewModel.getSubgrade(for: system)
        
        let containerView = UIView()
        containerView.backgroundColor = .systemGroupedBackground
        
        let stackView = UIStackView()
        stackView.translatesAutoresizingMaskIntoConstraints = false
        stackView.axis = .horizontal
        stackView.spacing = 8
        stackView.alignment = .center
        
        let titleLabel = UILabel()
        titleLabel.text = system.displayName
        titleLabel.font = .systemFont(ofSize: 17, weight: .semibold)
        
        let badgeLabel = UILabel()
        if subgrade != .none {
            badgeLabel.text = subgrade.shortName
            badgeLabel.font = .systemFont(ofSize: 14, weight: .bold)
            badgeLabel.textColor = .white
            badgeLabel.textAlignment = .center
            badgeLabel.backgroundColor = colorForSubgrade(subgrade)
            badgeLabel.layer.cornerRadius = 10
            badgeLabel.clipsToBounds = true
            
            badgeLabel.widthAnchor.constraint(equalToConstant: 30).isActive = true
            badgeLabel.heightAnchor.constraint(equalToConstant: 20).isActive = true
        }
        
        stackView.addArrangedSubview(titleLabel)
        if subgrade != .none {
            stackView.addArrangedSubview(badgeLabel)
        }
        
        containerView.addSubview(stackView)
        
        NSLayoutConstraint.activate([
            stackView.leadingAnchor.constraint(equalTo: containerView.leadingAnchor, constant: 16),
            stackView.trailingAnchor.constraint(lessThanOrEqualTo: containerView.trailingAnchor, constant: -16),
            stackView.topAnchor.constraint(equalTo: containerView.topAnchor, constant: 8),
            stackView.bottomAnchor.constraint(equalTo: containerView.bottomAnchor, constant: -4)
        ])
        
        return containerView
    }
    
    func tableView(_ tableView: UITableView, heightForHeaderInSection section: Int) -> CGFloat {
        return 36
    }
    
    private func colorForSubgrade(_ subgrade: Subgrade) -> UIColor {
        switch subgrade {
        case .none:
            return .clear
        case .light:
            return .systemGreen
        case .moderate:
            return .systemOrange
        case .severe:
            return .systemRed
        }
    }
    
    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "SymptomCell", for: indexPath) as! SymptomCell
        let system = viewModel.getSystems()[indexPath.section]
        // Получаем симптом напрямую из symptomsBySystem, который уже обновлен
        if let symptomsInSystem = viewModel.symptomsBySystem[system],
           indexPath.row < symptomsInSystem.count {
            let symptom = symptomsInSystem[indexPath.row]
            cell.configure(with: symptom)
        }
        return cell
    }
    
    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        let system = viewModel.getSystems()[indexPath.section]
        
        // Получаем симптом из текущего состояния
        guard let symptomsInSystem = viewModel.symptomsBySystem[system],
              indexPath.row < symptomsInSystem.count else { return }
        
        let symptom = symptomsInSystem[indexPath.row]
        
        // Если симптом относится к группе с дополнительными вариантами (dropdown),
        // показываем список вариантов. Иначе просто переключаем.
        if let options = dropdownOptions(for: symptom) {
            presentOptions(for: symptom, options: options, indexPath: indexPath)
        } else {
            // Переключаем симптом (это синхронно обновит symptomsBySystem и perSystemSubgrades)
            viewModel.toggleSymptom(symptom)
            
            // Обновляем ячейку через reloadRows для гарантированного обновления
            tableView.reloadRows(at: [indexPath], with: .fade)
            
            // Обновляем заголовок секции после небольшой задержки, чтобы убедиться что данные обновлены
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.tableView.reloadSections(IndexSet(integer: indexPath.section), with: .none)
            }
        }
    }
}

// MARK: - SymptomCell

class SymptomCell: UITableViewCell {
    private let nameLabel: UILabel = {
        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.font = .systemFont(ofSize: 16)
        return label
    }()
    
    private let checkmarkView: UIView = {
        let view = UIView()
        view.translatesAutoresizingMaskIntoConstraints = false
        view.layer.cornerRadius = 12
        view.layer.borderWidth = 2
        view.layer.borderColor = UIColor.systemGray4.cgColor
        view.backgroundColor = .systemBackground
        return view
    }()
    
    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        setupUI()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    private func setupUI() {
        contentView.addSubview(nameLabel)
        contentView.addSubview(checkmarkView)
        
        NSLayoutConstraint.activate([
            nameLabel.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
            nameLabel.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
            nameLabel.trailingAnchor.constraint(equalTo: checkmarkView.leadingAnchor, constant: -16),
            
            checkmarkView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),
            checkmarkView.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
            checkmarkView.widthAnchor.constraint(equalToConstant: 24),
            checkmarkView.heightAnchor.constraint(equalToConstant: 24)
        ])
    }
    
    func configure(with symptom: Symptom) {
        nameLabel.text = symptom.name
        checkmarkView.backgroundColor = symptom.isSelected ? .systemGreen : .systemBackground
        checkmarkView.layer.borderColor = symptom.isSelected ? UIColor.systemGreen.cgColor : UIColor.systemGray4.cgColor
    }
}

// MARK: - Dropdown options for complex symptoms

private extension SymptomsViewController {
    
    struct SymptomOption {
        let title: String
        let subgrade: Subgrade
    }
    
    /// Возвращает набор вариантов для сложных симптомов (зуд, эритема, крапивница, и т.п.)
    func dropdownOptions(for symptom: Symptom) -> [SymptomOption]? {
        switch symptom.name {
        case "Зуд":
            return [
                SymptomOption(title: "Периодически (<50% ППТ)", subgrade: .light),
                SymptomOption(title: "Локализованный (<50% ППТ)", subgrade: .light),
                SymptomOption(title: "Постоянный", subgrade: .moderate),
                SymptomOption(title: "Генерализованный (≥50% ППТ)", subgrade: .moderate)
            ]
        case "Эритема":
            return [
                SymptomOption(title: "Локализованная (<50% ППТ)", subgrade: .light),
                SymptomOption(title: "Генерализованная (≥50% ППТ)", subgrade: .moderate)
            ]
        case "Крапивница":
            return [
                SymptomOption(title: "Локализованная (<50% ППТ)", subgrade: .light),
                SymptomOption(title: "Генерализованная (≥50% ППТ)", subgrade: .moderate)
            ]
        case "Отек языка":
            return [
                SymptomOption(title: "Анатомические ориентиры сохранены", subgrade: .light),
                SymptomOption(title: "Анатомические ориентиры сглажены", subgrade: .moderate),
                SymptomOption(title: "Анатомические ориентиры не видны", subgrade: .severe)
            ]
        case "Боль в животе":
            return [
                SymptomOption(title: "Эпизодичные", subgrade: .light),
                SymptomOption(title: "Постоянные, сильные", subgrade: .moderate)
            ]
        case "Тошнота":
            return [
                SymptomOption(title: "Эпизодичная", subgrade: .light),
                SymptomOption(title: "Постоянная", subgrade: .moderate)
            ]
        case "Рвота":
            return [
                SymptomOption(title: "1–2 раза", subgrade: .light),
                SymptomOption(title: "Более 2-х раз", subgrade: .moderate)
            ]
        case "Диарея":
            return [
                SymptomOption(title: "1–2 раза", subgrade: .light),
                SymptomOption(title: "Более 2-х раз", subgrade: .moderate)
            ]
        case "Одышка":
            return [
                SymptomOption(title: "Без ПРД", subgrade: .light),
                SymptomOption(title: "С ПРД", subgrade: .moderate),
                SymptomOption(title: "С ДН, <немое легкое>", subgrade: .severe)
            ]
        case "Стридор":
            return [
                SymptomOption(title: "Без ПРД", subgrade: .moderate),
                SymptomOption(title: "С ПРД", subgrade: .severe)
            ]
        case "Кашель":
            return [
                SymptomOption(title: "Вновь появившийся", subgrade: .light),
                SymptomOption(title: "Персистирующий", subgrade: .moderate)
            ]
        case "Гипотензия":
            return [
                SymptomOption(title: "Не требуется введение вазопрессоров", subgrade: .moderate),
                SymptomOption(title: "Требуется введение вазопрессоров", subgrade: .severe),
                SymptomOption(title: "Любой вариант гипотензии у младенца", subgrade: .severe)
            ]
        default:
            return nil
        }
    }
    
    func presentOptions(for symptom: Symptom, options: [SymptomOption], indexPath: IndexPath) {
        let alert = UIAlertController(title: symptom.name, message: "Выберите вариант", preferredStyle: .actionSheet)
        
        for option in options {
            alert.addAction(UIAlertAction(title: option.title + " (\(option.subgrade.shortName))",
                                          style: .default,
                                          handler: { [weak self] _ in
                guard let self = self else { return }
                self.viewModel.setOverrideSubgrade(for: symptom, subgrade: option.subgrade)
                // Обновляем строку и заголовок секции
                self.tableView.reloadRows(at: [indexPath], with: .fade)
                self.tableView.reloadSections(IndexSet(integer: indexPath.section), with: .none)
            }))
        }
        
        // Вариант отмены выбора симптома
        alert.addAction(UIAlertAction(title: "Снять выбор", style: .destructive, handler: { [weak self] _ in
            guard let self = self else { return }
            self.viewModel.toggleSymptom(symptom)
            self.tableView.reloadRows(at: [indexPath], with: .fade)
            self.tableView.reloadSections(IndexSet(integer: indexPath.section), with: .none)
        }))
        
        alert.addAction(UIAlertAction(title: "Отмена", style: .cancel, handler: nil))
        
        present(alert, animated: true)
    }
}
