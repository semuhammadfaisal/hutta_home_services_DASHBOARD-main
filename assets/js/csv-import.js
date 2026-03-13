// CSV Import Utility
function parseCSV(text) {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];
    
    // Parse CSV properly handling quoted values
    function parseLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    }
    
    const headers = parseLine(lines[0]).map(h => h.toLowerCase());
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = parseLine(lines[i]);
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        data.push(row);
    }
    
    return data;
}

// Map CSV categories to valid vendor categories
function mapVendorCategory(category) {
    const categoryMap = {
        'general contractor': 'civil',
        'kitchen remodeling': 'carpentry',
        'roofing': 'civil',
        'plumbing': 'plumbing',
        'electrical': 'electrical',
        'flooring': 'carpentry',
        'landscaping': 'civil',
        'painting': 'painting',
        'hvac': 'hvac',
        'bathroom remodeling': 'plumbing',
        'window replacement': 'carpentry',
        'masonry': 'civil',
        'carpentry': 'carpentry',
        'foundation': 'civil',
        'smart home': 'electrical',
        'handyman': 'civil',
        'pool construction': 'civil',
        'siding': 'carpentry',
        'solar installation': 'electrical',
        'cleaning': 'cleaning'
    };
    
    const normalized = category.toLowerCase().trim();
    return categoryMap[normalized] || 'civil'; // default to civil if not found
}

// Map CSV roles to valid employee roles
function mapEmployeeRole(role) {
    const roleMap = {
        'electrician': 'electrician',
        'plumber': 'plumber',
        'carpenter': 'carpenter',
        'hvac technician': 'hvac-technician',
        'hvac tech': 'hvac-technician',
        'project manager': 'project-manager',
        'supervisor': 'supervisor',
        'general worker': 'general-worker',
        'laborer': 'general-worker',
        'foreman': 'supervisor',
        'lead': 'supervisor',
        'manager': 'project-manager',
        'technician': 'general-worker',
        'specialist': 'general-worker'
    };
    
    const normalized = role.toLowerCase().trim();
    return roleMap[normalized] || 'general-worker'; // default to general-worker if not found
}

// Map CSV status to valid employee status
function mapEmployeeStatus(status) {
    const statusMap = {
        'active': 'available',
        'available': 'available',
        'busy': 'busy',
        'working': 'busy',
        'offline': 'offline',
        'inactive': 'offline',
        'on leave': 'on-leave',
        'on-leave': 'on-leave',
        'leave': 'on-leave'
    };
    
    const normalized = status.toLowerCase().trim();
    return statusMap[normalized] || 'available'; // default to available if not found
}

async function importVendorsFromCSV() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const vendors = parseCSV(text);
            
            if (vendors.length === 0) {
                showToast('No data found in CSV file', 'error');
                return;
            }
            
            showToast(`Processing ${vendors.length} vendors...`, 'info');
            
            let successCount = 0;
            let errorCount = 0;
            const errors = [];
            
            for (const vendor of vendors) {
                try {
                    const vendorData = {
                        name: vendor.name || vendor['vendor name'],
                        email: vendor.email,
                        phone: vendor.phone || vendor['phone number'],
                        address: vendor.address,
                        category: mapVendorCategory(vendor.category),
                        rating: parseInt(vendor.rating) || 5,
                        isActive: vendor.status?.toLowerCase() === 'active' || vendor.isactive?.toLowerCase() === 'true' || true
                    };
                    
                    if (!vendorData.name || !vendorData.email) {
                        errors.push(`Row skipped: Missing name or email`);
                        errorCount++;
                        continue;
                    }
                    
                    console.log('Importing vendor:', vendorData);
                    const result = await window.APIService.createVendor(vendorData);
                    console.log('Vendor created:', result);
                    successCount++;
                } catch (error) {
                    console.error('Failed to import vendor:', vendor.name, error);
                    errors.push(`${vendor.name || 'Unknown'}: ${error.message}`);
                    errorCount++;
                }
            }
            
            if (errors.length > 0) {
                console.log('Import errors:', errors);
            }
            
            if (successCount > 0) {
                showToast(`Imported ${successCount} vendors successfully. ${errorCount} failed.`, 'success');
                if (typeof refreshVendors === 'function') {
                    await refreshVendors();
                }
            } else {
                showToast(`Failed to import vendors. ${errorCount} errors. Check console for details.`, 'error');
            }
        } catch (error) {
            console.error('CSV import error:', error);
            showToast('Failed to read CSV file: ' + error.message, 'error');
        }
    };
    
    input.click();
}

async function importEmployeesFromCSV() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const employees = parseCSV(text);
            
            if (employees.length === 0) {
                showToast('No data found in CSV file', 'error');
                return;
            }
            
            showToast(`Processing ${employees.length} employees...`, 'info');
            
            let successCount = 0;
            let errorCount = 0;
            const errors = [];
            
            for (const employee of employees) {
                try {
                    const employeeData = {
                        name: employee.name || employee['employee name'],
                        email: employee.email,
                        phone: employee.phone || employee['phone number'],
                        address: employee.address,
                        role: mapEmployeeRole(employee.role),
                        department: employee.department || 'General',
                        salary: parseFloat(employee.salary) || 0,
                        hireDate: employee.hiredate || employee['hire date'] || new Date().toISOString().split('T')[0],
                        status: mapEmployeeStatus(employee.status || 'available'),
                        skills: employee.skills ? employee.skills.split(';').map(s => s.trim()) : []
                    };
                    
                    console.log('Importing employee:', employeeData);
                    
                    if (!employeeData.name || !employeeData.email) {
                        errors.push(`Row skipped: Missing name or email`);
                        errorCount++;
                        continue;
                    }
                    
                    const result = await window.APIService.createEmployee(employeeData);
                    console.log('Employee created:', result);
                    successCount++;
                } catch (error) {
                    console.error('Failed to import employee:', employee.name, error);
                    errors.push(`${employee.name || 'Unknown'}: ${error.message}`);
                    errorCount++;
                }
            }
            
            if (errors.length > 0) {
                console.log('Import errors:', errors);
            }
            
            if (successCount > 0) {
                showToast(`Imported ${successCount} employees successfully. ${errorCount} failed.`, 'success');
                if (typeof refreshEmployees === 'function') {
                    await refreshEmployees();
                }
            } else {
                showToast(`Failed to import employees. ${errorCount} errors. Check console for details.`, 'error');
            }
        } catch (error) {
            console.error('CSV import error:', error);
            showToast('Failed to read CSV file: ' + error.message, 'error');
        }
    };
    
    input.click();
}

// Map CSV customer type to valid customer type
function mapCustomerType(type) {
    const typeMap = {
        'permanent': 'recurring',
        'one-time': 'one-time',
        'onetime': 'one-time',
        'recurring': 'recurring',
        'regular': 'recurring',
        'single': 'one-time'
    };
    
    const normalized = type?.toLowerCase().trim();
    return typeMap[normalized] || 'one-time';
}

// Map CSV customer status to valid status
function mapCustomerStatus(status) {
    const statusMap = {
        'active': 'active',
        'inactive': 'inactive',
        'disabled': 'inactive'
    };
    
    const normalized = status?.toLowerCase().trim();
    return statusMap[normalized] || 'active';
}

async function importCustomersFromCSV() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const customers = parseCSV(text);
            
            if (customers.length === 0) {
                showToast('No data found in CSV file', 'error');
                return;
            }
            
            showToast(`Processing ${customers.length} customers...`, 'info');
            
            let successCount = 0;
            let errorCount = 0;
            const errors = [];
            
            for (const customer of customers) {
                try {
                    const customerData = {
                        name: customer.name || customer['customer name'],
                        email: customer.email,
                        phone: customer.phone || customer['phone number'],
                        address: customer.address,
                        city: customer.city,
                        state: customer.state,
                        zip: customer.zip || customer.zipcode || customer['zip code'],
                        type: mapCustomerType(customer.type || customer['customer type']),
                        status: mapCustomerStatus(customer.status),
                        notes: customer.notes || ''
                    };
                    
                    console.log('Importing customer:', customerData);
                    
                    if (!customerData.name || !customerData.email) {
                        errors.push(`Row skipped: Missing name or email`);
                        errorCount++;
                        continue;
                    }
                    
                    const result = await window.APIService.createCustomer(customerData);
                    console.log('Customer created:', result);
                    successCount++;
                } catch (error) {
                    console.error('Failed to import customer:', customer.name, error);
                    errors.push(`${customer.name || 'Unknown'}: ${error.message}`);
                    errorCount++;
                }
            }
            
            if (errors.length > 0) {
                console.log('Import errors:', errors);
            }
            
            if (successCount > 0) {
                showToast(`Imported ${successCount} customers successfully. ${errorCount} failed.`, 'success');
                if (typeof refreshCustomers === 'function') {
                    await refreshCustomers();
                }
            } else {
                showToast(`Failed to import customers. ${errorCount} errors. Check console for details.`, 'error');
            }
        } catch (error) {
            console.error('CSV import error:', error);
            showToast('Failed to read CSV file: ' + error.message, 'error');
        }
    };
    
    input.click();
}

window.importVendorsFromCSV = importVendorsFromCSV;
window.importEmployeesFromCSV = importEmployeesFromCSV;
window.importCustomersFromCSV = importCustomersFromCSV;
