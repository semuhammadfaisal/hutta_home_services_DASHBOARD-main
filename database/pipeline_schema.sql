-- Pipeline Stages Table
CREATE TABLE IF NOT EXISTS pipeline_stages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Pipeline Records Table
CREATE TABLE IF NOT EXISTS pipeline_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stage_id INT NOT NULL,
    project_name VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (stage_id) REFERENCES pipeline_stages(id) ON DELETE CASCADE
);

-- Pipeline Movement Logs Table
CREATE TABLE IF NOT EXISTS pipeline_movements (
    id INT PRIMARY KEY AUTO_INCREMENT,
    record_id INT NOT NULL,
    project_name VARCHAR(255) NOT NULL,
    from_stage_id INT,
    from_stage_name VARCHAR(255),
    to_stage_id INT NOT NULL,
    to_stage_name VARCHAR(255) NOT NULL,
    moved_by VARCHAR(100) DEFAULT 'Admin',
    moved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (record_id) REFERENCES pipeline_records(id) ON DELETE CASCADE,
    FOREIGN KEY (from_stage_id) REFERENCES pipeline_stages(id) ON DELETE SET NULL,
    FOREIGN KEY (to_stage_id) REFERENCES pipeline_stages(id) ON DELETE CASCADE
);

-- Insert Default Stages
INSERT INTO pipeline_stages (name, position) VALUES
('Work Order Received', 1),
('Bidding', 2),
('Bid Submitted to Client', 3),
('Approved – Ready to Schedule', 4),
('In Progress', 5),
('Awaiting Documentation', 6),
('Ready to Invoice', 7),
('Invoice Sent', 8),
('Paid', 9),
('Closed', 10);

-- Insert Sample Records
INSERT INTO pipeline_records (stage_id, project_name, customer_name, priority, description) VALUES
(1, 'Kitchen Renovation', 'John Smith', 'high', 'Complete kitchen remodel'),
(1, 'Bathroom Repair', 'Sarah Johnson', 'medium', 'Fix plumbing issues'),
(2, 'Roof Replacement', 'Mike Davis', 'high', 'Replace old roof'),
(5, 'Electrical Upgrade', 'Emily Brown', 'medium', 'Upgrade electrical panel'),
(5, 'HVAC Installation', 'David Wilson', 'low', 'Install new HVAC system');
