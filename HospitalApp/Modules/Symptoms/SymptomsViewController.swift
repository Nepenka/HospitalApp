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
        view.backgroundColor = .systemBackground
        title = "Симптомы"
        
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
        
        viewModel.$symptoms
            .sink { [weak self] _ in
                self?.tableView.reloadData()
            }
            .store(in: &cancellables)
    }
    
    @objc private func continueTapped() {
        let selectedSymptoms = viewModel.getSelectedSymptoms()
        guard !selectedSymptoms.isEmpty else {
            showAlert(message: "Пожалуйста, выберите хотя бы один симптом")
            return
        }
        coordinator.showVitalsInput(selectedSymptoms: selectedSymptoms)
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
    
    func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        return viewModel.getSystems()[section].displayName
    }
    
    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "SymptomCell", for: indexPath) as! SymptomCell
        let system = viewModel.getSystems()[indexPath.section]
        if let symptom = viewModel.symptomsBySystem[system]?[indexPath.row] {
            cell.configure(with: symptom)
        }
        return cell
    }
    
    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        let system = viewModel.getSystems()[indexPath.section]
        if let symptom = viewModel.symptomsBySystem[system]?[indexPath.row] {
            viewModel.toggleSymptom(symptom)
            if let cell = tableView.cellForRow(at: indexPath) as? SymptomCell {
                cell.configure(with: symptom)
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

