// Accounting System - Data Models and Business Logic

class AccountingSystem {
    constructor() {
        this.cashOnHand = [];
        this.accountsReceivable = [];
        this.accountsPayable = [];
        this.contractorPayouts = [];
        this.taxesOwed = [];
        this.ownerProfit = [];
        this.jobs = [];
        this.overheadMonthly = 0;
        this.loadData();
    }

    loadData() {
        this.cashOnHand = JSON.parse(localStorage.getItem('cashOnHand') || '[]');
        this.accountsReceivable = JSON.parse(localStorage.getItem('accountsReceivable') || '[]');
        this.accountsPayable = JSON.parse(localStorage.getItem('accountsPayable') || '[]');
        this.contractorPayouts = JSON.parse(localStorage.getItem('contractorPayouts') || '[]');
        this.taxesOwed = JSON.parse(localStorage.getItem('taxesOwed') || '[]');
        this.ownerProfit = JSON.parse(localStorage.getItem('ownerProfit') || '[]');
        this.jobs = JSON.parse(localStorage.getItem('accountingJobs') || '[]');
        this.overheadMonthly = parseFloat(localStorage.getItem('overheadMonthly') || '0');
    }

    saveData() {
        localStorage.setItem('cashOnHand', JSON.stringify(this.cashOnHand));
        localStorage.setItem('accountsReceivable', JSON.stringify(this.accountsReceivable));
        localStorage.setItem('accountsPayable', JSON.stringify(this.accountsPayable));
        localStorage.setItem('contractorPayouts', JSON.stringify(this.contractorPayouts));
        localStorage.setItem('taxesOwed', JSON.stringify(this.taxesOwed));
        localStorage.setItem('ownerProfit', JSON.stringify(this.ownerProfit));
        localStorage.setItem('accountingJobs', JSON.stringify(this.jobs));
        localStorage.setItem('overheadMonthly', this.overheadMonthly.toString());
    }

    // Cash Management Calculations
    getTotalCashOnHand() {
        return this.cashOnHand.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    }

    getTotalAR() {
        return this.accountsReceivable.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    }

    getTotalAP() {
        return this.accountsPayable.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    }

    getTotalContractorPayouts() {
        return this.contractorPayouts.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    }

    getTotalTaxesOwed() {
        return this.taxesOwed.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    }

    getTotalOwnerProfit() {
        return this.ownerProfit.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    }

    // Job Management
    addJob(jobData) {
        const contractorBid = parseFloat(jobData.contractorBid || 0);
        const markupPercent = parseFloat(jobData.markupPercent || 0);
        const overheadAllocation = parseFloat(jobData.overheadAllocation || 0);
        
        const grossRevenue = contractorBid * (1 + markupPercent / 100);
        const grossProfit = grossRevenue - contractorBid;
        const netProfit = grossProfit - overheadAllocation;

        const job = {
            id: Date.now().toString(),
            jobName: jobData.jobName,
            customerName: jobData.customerName,
            contractorBid: contractorBid,
            markupPercent: markupPercent,
            grossRevenue: grossRevenue,
            grossProfit: grossProfit,
            overheadAllocation: overheadAllocation,
            netProfit: netProfit,
            paymentReceivedDate: jobData.paymentReceivedDate || null,
            contractorPaidDate: jobData.contractorPaidDate || null,
            status: jobData.status || 'pending',
            createdDate: new Date().toISOString()
        };

        this.jobs.push(job);
        
        // Update AR if payment not received
        if (!job.paymentReceivedDate) {
            this.accountsReceivable.push({
                id: `ar-${job.id}`,
                jobId: job.id,
                amount: grossRevenue,
                description: `Invoice for ${job.jobName}`,
                dueDate: jobData.dueDate || null,
                createdDate: new Date().toISOString()
            });
        } else {
            this.cashOnHand.push({
                id: `cash-${job.id}`,
                jobId: job.id,
                amount: grossRevenue,
                description: `Payment received for ${job.jobName}`,
                date: job.paymentReceivedDate
            });
        }

        // Update contractor payouts if not paid
        if (!job.contractorPaidDate) {
            this.contractorPayouts.push({
                id: `cp-${job.id}`,
                jobId: job.id,
                amount: contractorBid,
                contractor: jobData.contractorName || 'TBD',
                description: `Payout for ${job.jobName}`,
                dueDate: jobData.contractorDueDate || null,
                createdDate: new Date().toISOString()
            });
        }

        this.saveData();
        return job;
    }

    updateJob(jobId, updates) {
        const jobIndex = this.jobs.findIndex(j => j.id === jobId);
        if (jobIndex === -1) return null;

        const job = this.jobs[jobIndex];
        Object.assign(job, updates);

        // Recalculate
        const contractorBid = parseFloat(job.contractorBid || 0);
        const markupPercent = parseFloat(job.markupPercent || 0);
        const overheadAllocation = parseFloat(job.overheadAllocation || 0);
        
        job.grossRevenue = contractorBid * (1 + markupPercent / 100);
        job.grossProfit = job.grossRevenue - contractorBid;
        job.netProfit = job.grossProfit - overheadAllocation;

        // Handle payment received
        if (updates.paymentReceivedDate && !job.paymentReceivedDate) {
            this.accountsReceivable = this.accountsReceivable.filter(ar => ar.jobId !== jobId);
            this.cashOnHand.push({
                id: `cash-${jobId}`,
                jobId: jobId,
                amount: job.grossRevenue,
                description: `Payment received for ${job.jobName}`,
                date: updates.paymentReceivedDate
            });
        }

        // Handle contractor paid
        if (updates.contractorPaidDate && !job.contractorPaidDate) {
            // Check payment lock
            if (!job.paymentReceivedDate && !updates.overridePayoutApproval) {
                throw new Error('Cannot pay contractor: Payment not received from customer');
            }
            
            this.contractorPayouts = this.contractorPayouts.filter(cp => cp.jobId !== jobId);
            this.cashOnHand = this.cashOnHand.map(c => {
                if (c.jobId === jobId) {
                    c.amount -= contractorBid;
                }
                return c;
            });
        }

        this.saveData();
        return job;
    }

    getJob(jobId) {
        return this.jobs.find(j => j.id === jobId);
    }

    deleteJob(jobId) {
        this.jobs = this.jobs.filter(j => j.id !== jobId);
        this.accountsReceivable = this.accountsReceivable.filter(ar => ar.jobId !== jobId);
        this.contractorPayouts = this.contractorPayouts.filter(cp => cp.jobId !== jobId);
        this.cashOnHand = this.cashOnHand.filter(c => c.jobId !== jobId);
        this.saveData();
    }

    // Cash Flow Projections
    getOutstandingInvoices() {
        return this.getTotalAR();
    }

    getPendingContractorPayouts() {
        return this.getTotalContractorPayouts();
    }

    getNetProjectedCash30Days() {
        const arDue30 = this.accountsReceivable
            .filter(ar => {
                if (!ar.dueDate) return true;
                const dueDate = new Date(ar.dueDate);
                const days30 = new Date();
                days30.setDate(days30.getDate() + 30);
                return dueDate <= days30;
            })
            .reduce((sum, ar) => sum + parseFloat(ar.amount || 0), 0);

        const cpDue30 = this.contractorPayouts
            .filter(cp => {
                if (!cp.dueDate) return true;
                const dueDate = new Date(cp.dueDate);
                const days30 = new Date();
                days30.setDate(days30.getDate() + 30);
                return dueDate <= days30;
            })
            .reduce((sum, cp) => sum + parseFloat(cp.amount || 0), 0);

        return this.getTotalCashOnHand() + arDue30 - cpDue30 - this.overheadMonthly;
    }

    getNetProjectedCash60Days() {
        const arDue60 = this.accountsReceivable
            .filter(ar => {
                if (!ar.dueDate) return true;
                const dueDate = new Date(ar.dueDate);
                const days60 = new Date();
                days60.setDate(days60.getDate() + 60);
                return dueDate <= days60;
            })
            .reduce((sum, ar) => sum + parseFloat(ar.amount || 0), 0);

        const cpDue60 = this.contractorPayouts
            .filter(cp => {
                if (!cp.dueDate) return true;
                const dueDate = new Date(cp.dueDate);
                const days60 = new Date();
                days60.setDate(days60.getDate() + 60);
                return dueDate <= days60;
            })
            .reduce((sum, cp) => sum + parseFloat(cp.amount || 0), 0);

        return this.getTotalCashOnHand() + arDue60 - cpDue60 - (this.overheadMonthly * 2);
    }

    getBreakEvenMonthlyOverhead() {
        return this.overheadMonthly;
    }

    setMonthlyOverhead(amount) {
        this.overheadMonthly = parseFloat(amount || 0);
        this.saveData();
    }

    // Automation Rules
    checkInvoiceSLA(job) {
        if (job.status !== 'completed') return null;
        
        const completedDate = new Date(job.completedDate || job.createdDate);
        const now = new Date();
        const hoursDiff = (now - completedDate) / (1000 * 60 * 60);
        
        if (hoursDiff > 24 && !job.invoiceCreated) {
            return {
                jobId: job.id,
                jobName: job.jobName,
                status: 'overdue',
                message: 'Invoice not created within 24 hours',
                hoursPast: Math.floor(hoursDiff)
            };
        }
        return null;
    }

    getInvoiceSLAAlerts() {
        return this.jobs
            .map(job => this.checkInvoiceSLA(job))
            .filter(alert => alert !== null);
    }

    getARReminderStatus(arItem) {
        if (!arItem.dueDate) return null;
        
        const dueDate = new Date(arItem.dueDate);
        const now = new Date();
        const daysPast = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
        
        if (daysPast >= 45) {
            return { status: 'final-notice', days: daysPast, message: 'Final Notice' };
        } else if (daysPast >= 30) {
            return { status: 'reminder-2', days: daysPast, message: 'Reminder 2' };
        } else if (daysPast >= 15) {
            return { status: 'reminder-1', days: daysPast, message: 'Reminder 1' };
        } else if (daysPast > 0) {
            return { status: 'overdue', days: daysPast, message: 'Overdue' };
        }
        return { status: 'current', days: 0, message: 'Current' };
    }

    getARWithReminders() {
        return this.accountsReceivable.map(ar => ({
            ...ar,
            reminderStatus: this.getARReminderStatus(ar)
        }));
    }

    generateWeeklyCashSummary() {
        const summary = {
            generatedDate: new Date().toISOString(),
            currentCash: this.getTotalCashOnHand(),
            accountsReceivable: this.getTotalAR(),
            accountsPayable: this.getTotalAP(),
            contractorPayouts: this.getTotalContractorPayouts(),
            taxesOwed: this.getTotalTaxesOwed(),
            netPosition: 0,
            weeklyChange: 0,
            alerts: []
        };
        
        summary.netPosition = summary.currentCash + summary.accountsReceivable - 
                             summary.accountsPayable - summary.contractorPayouts - summary.taxesOwed;
        
        // Get alerts
        const invoiceAlerts = this.getInvoiceSLAAlerts();
        const overdueAR = this.getARWithReminders().filter(ar => ar.reminderStatus && ar.reminderStatus.days > 0);
        
        summary.alerts = [
            ...invoiceAlerts.map(a => ({ type: 'invoice-sla', ...a })),
            ...overdueAR.map(ar => ({ type: 'overdue-ar', jobId: ar.jobId, ...ar.reminderStatus }))
        ];
        
        // Calculate weekly change
        const lastSummary = JSON.parse(localStorage.getItem('lastWeeklySummary') || 'null');
        if (lastSummary) {
            summary.weeklyChange = summary.netPosition - lastSummary.netPosition;
        }
        
        // Save current summary
        localStorage.setItem('lastWeeklySummary', JSON.stringify(summary));
        
        return summary;
    }

    sendARReminder(arId) {
        // Placeholder for email trigger
        const ar = this.accountsReceivable.find(a => a.id === arId);
        if (!ar) return;
        
        const reminderStatus = this.getARReminderStatus(ar);
        console.log(`[EMAIL TRIGGER] Sending ${reminderStatus.message} for AR ${arId}`);
        console.log(`Amount: $${ar.amount}, Days Past Due: ${reminderStatus.days}`);
        
        // Mark reminder sent
        ar.lastReminderSent = new Date().toISOString();
        ar.reminderCount = (ar.reminderCount || 0) + 1;
        this.saveData();
        
        return {
            success: true,
            message: `${reminderStatus.message} sent successfully`
        };
    }

    // Forecasting & Growth
    getForecastInputs() {
        return {
            avgJobsPerMonth: parseFloat(localStorage.getItem('forecast_avgJobsPerMonth') || '10'),
            avgRevenuePerJob: parseFloat(localStorage.getItem('forecast_avgRevenuePerJob') || '5000'),
            avgMarkupPercent: parseFloat(localStorage.getItem('forecast_avgMarkupPercent') || '25'),
            monthlyRecurringRevenue: parseFloat(localStorage.getItem('forecast_monthlyRecurringRevenue') || '0'),
            operatingExpensePercent: parseFloat(localStorage.getItem('forecast_operatingExpensePercent') || '15')
        };
    }

    saveForecastInputs(inputs) {
        localStorage.setItem('forecast_avgJobsPerMonth', inputs.avgJobsPerMonth.toString());
        localStorage.setItem('forecast_avgRevenuePerJob', inputs.avgRevenuePerJob.toString());
        localStorage.setItem('forecast_avgMarkupPercent', inputs.avgMarkupPercent.toString());
        localStorage.setItem('forecast_monthlyRecurringRevenue', inputs.monthlyRecurringRevenue.toString());
        localStorage.setItem('forecast_operatingExpensePercent', inputs.operatingExpensePercent.toString());
    }

    generate12MonthForecast(scenario = 'expected') {
        const inputs = this.getForecastInputs();
        const multiplier = scenario === 'conservative' ? 0.8 : scenario === 'aggressive' ? 1.2 : 1.0;
        
        const forecast = [];
        let cumulativeCash = this.getTotalCashOnHand();
        
        for (let month = 1; month <= 12; month++) {
            const jobsThisMonth = inputs.avgJobsPerMonth * multiplier;
            const revenuePerJob = inputs.avgRevenuePerJob;
            const markupPercent = inputs.avgMarkupPercent / 100;
            
            // Calculate contractor cost (reverse from markup)
            const contractorCostPerJob = revenuePerJob / (1 + markupPercent);
            
            const projectedRevenue = (jobsThisMonth * revenuePerJob) + inputs.monthlyRecurringRevenue;
            const contractorExpense = jobsThisMonth * contractorCostPerJob;
            const operatingExpense = projectedRevenue * (inputs.operatingExpensePercent / 100);
            const netProfit = projectedRevenue - contractorExpense - operatingExpense;
            
            cumulativeCash += netProfit;
            
            forecast.push({
                month: month,
                monthName: new Date(new Date().setMonth(new Date().getMonth() + month - 1)).toLocaleString('default', { month: 'short' }),
                projectedRevenue: projectedRevenue,
                contractorExpense: contractorExpense,
                operatingExpense: operatingExpense,
                netProfit: netProfit,
                cashReserveBalance: cumulativeCash
            });
        }
        
        return forecast;
    }

    getScenarioComparison() {
        return {
            conservative: this.generate12MonthForecast('conservative'),
            expected: this.generate12MonthForecast('expected'),
            aggressive: this.generate12MonthForecast('aggressive')
        };
    }

    // Profit Allocation & Wealth
    getAllocationBreakdown() {
        const totalNetProfit = this.jobs
            .filter(job => job.status === 'completed' && job.paymentReceivedDate)
            .reduce((sum, job) => sum + parseFloat(job.netProfit || 0), 0);
        
        return {
            totalNetProfit: totalNetProfit,
            growth: totalNetProfit * 0.50,
            taxReserve: totalNetProfit * 0.20,
            cashReserve: totalNetProfit * 0.20,
            longTermWealth: totalNetProfit * 0.10
        };
    }

    getWealthTracking() {
        return {
            totalRetainedEarnings: parseFloat(localStorage.getItem('wealth_retainedEarnings') || '0'),
            capitalReinvested: parseFloat(localStorage.getItem('wealth_capitalReinvested') || '0'),
            investmentAccountGrowth: parseFloat(localStorage.getItem('wealth_investmentGrowth') || '0'),
            equipmentAssetsOwned: parseFloat(localStorage.getItem('wealth_equipmentAssets') || '0')
        };
    }

    updateWealthTracking(data) {
        localStorage.setItem('wealth_retainedEarnings', data.totalRetainedEarnings.toString());
        localStorage.setItem('wealth_capitalReinvested', data.capitalReinvested.toString());
        localStorage.setItem('wealth_investmentGrowth', data.investmentAccountGrowth.toString());
        localStorage.setItem('wealth_equipmentAssets', data.equipmentAssetsOwned.toString());
    }

    getTotalWealth() {
        const allocation = this.getAllocationBreakdown();
        const tracking = this.getWealthTracking();
        
        return {
            allocatedWealth: allocation.longTermWealth,
            trackedWealth: tracking.totalRetainedEarnings + tracking.capitalReinvested + 
                          tracking.investmentAccountGrowth + tracking.equipmentAssetsOwned,
            totalWealth: allocation.longTermWealth + tracking.totalRetainedEarnings + 
                        tracking.capitalReinvested + tracking.investmentAccountGrowth + 
                        tracking.equipmentAssetsOwned
        };
    }

    // Executive Dashboard
    getExecutiveKPIs() {
        const completedJobs = this.jobs.filter(job => job.status === 'completed' && job.paymentReceivedDate);
        
        // Gross Margin %
        const totalRevenue = completedJobs.reduce((sum, job) => sum + parseFloat(job.grossRevenue || 0), 0);
        const totalContractorCost = completedJobs.reduce((sum, job) => sum + parseFloat(job.contractorBid || 0), 0);
        const grossMargin = totalRevenue > 0 ? ((totalRevenue - totalContractorCost) / totalRevenue * 100) : 0;
        
        // Net Margin %
        const totalNetProfit = completedJobs.reduce((sum, job) => sum + parseFloat(job.netProfit || 0), 0);
        const netMargin = totalRevenue > 0 ? (totalNetProfit / totalRevenue * 100) : 0;
        
        // AR Aging
        const arItems = this.getARWithReminders();
        const arAging = {
            current: arItems.filter(ar => !ar.reminderStatus || ar.reminderStatus.days <= 0).length,
            days15: arItems.filter(ar => ar.reminderStatus && ar.reminderStatus.days >= 15 && ar.reminderStatus.days < 30).length,
            days30: arItems.filter(ar => ar.reminderStatus && ar.reminderStatus.days >= 30 && ar.reminderStatus.days < 45).length,
            days45: arItems.filter(ar => ar.reminderStatus && ar.reminderStatus.days >= 45).length
        };
        
        // Average Days to Get Paid
        const paidJobs = completedJobs.filter(job => job.paymentReceivedDate && job.createdDate);
        const avgDaysToGetPaid = paidJobs.length > 0 ? 
            paidJobs.reduce((sum, job) => {
                const created = new Date(job.createdDate);
                const paid = new Date(job.paymentReceivedDate);
                return sum + Math.floor((paid - created) / (1000 * 60 * 60 * 24));
            }, 0) / paidJobs.length : 0;
        
        // Average Contractor Payout Delay
        const paidOutJobs = completedJobs.filter(job => job.contractorPaidDate && job.paymentReceivedDate);
        const avgPayoutDelay = paidOutJobs.length > 0 ?
            paidOutJobs.reduce((sum, job) => {
                const received = new Date(job.paymentReceivedDate);
                const paidOut = new Date(job.contractorPaidDate);
                return sum + Math.floor((paidOut - received) / (1000 * 60 * 60 * 24));
            }, 0) / paidOutJobs.length : 0;
        
        // Revenue Per Client
        const clientRevenue = {};
        completedJobs.forEach(job => {
            const client = job.customerName;
            clientRevenue[client] = (clientRevenue[client] || 0) + parseFloat(job.grossRevenue || 0);
        });
        const uniqueClients = Object.keys(clientRevenue).length;
        const revenuePerClient = uniqueClients > 0 ? totalRevenue / uniqueClients : 0;
        
        // Revenue Concentration Risk
        const maxClientRevenue = Math.max(...Object.values(clientRevenue), 0);
        const concentrationRisk = totalRevenue > 0 ? (maxClientRevenue / totalRevenue * 100) : 0;
        const hasConcentrationRisk = concentrationRisk >= 40;
        const topClient = Object.entries(clientRevenue).sort((a, b) => b[1] - a[1])[0];
        
        return {
            grossMargin,
            netMargin,
            arAging,
            avgDaysToGetPaid,
            avgPayoutDelay,
            revenuePerClient,
            concentrationRisk,
            hasConcentrationRisk,
            topClient: topClient ? { name: topClient[0], revenue: topClient[1] } : null,
            totalRevenue,
            totalNetProfit
        };
    }

    getBusinessValuation() {
        const multiple = parseFloat(localStorage.getItem('exec_valuationMultiple') || '3');
        const kpis = this.getExecutiveKPIs();
        
        // EBITDA approximation (Net Profit before interest, taxes, depreciation, amortization)
        // For simplicity, using net profit as EBITDA proxy
        const ebitda = kpis.totalNetProfit;
        const businessValue = ebitda * multiple;
        
        return {
            ebitda,
            multiple,
            businessValue
        };
    }

    setValuationMultiple(multiple) {
        localStorage.setItem('exec_valuationMultiple', multiple.toString());
    }

    getExecutiveOverview() {
        const valuation = this.getBusinessValuation();
        const allocation = this.getAllocationBreakdown();
        const tracking = this.getWealthTracking();
        
        // Annual Retained Profit (sum of completed jobs net profit)
        const annualRetainedProfit = allocation.totalNetProfit;
        
        // Investment Portfolio Balance
        const investmentPortfolio = tracking.investmentAccountGrowth;
        
        // Expansion Capital Reserve (Growth allocation)
        const expansionCapital = allocation.growth;
        
        // Debt Leverage Ratio (placeholder - would need debt data)
        const totalDebt = parseFloat(localStorage.getItem('exec_totalDebt') || '0');
        const totalAssets = tracking.equipmentAssetsOwned + this.getTotalCashOnHand();
        const debtLeverageRatio = totalAssets > 0 ? (totalDebt / totalAssets) : 0;
        
        return {
            businessValuation: valuation.businessValue,
            annualRetainedProfit,
            investmentPortfolio,
            expansionCapital,
            debtLeverageRatio,
            totalDebt,
            totalAssets
        };
    }

    setTotalDebt(amount) {
        localStorage.setItem('exec_totalDebt', amount.toString());
    }
}

// Global instance
const accountingSystem = new AccountingSystem();

// UI Update Functions
function updateAccountingDashboard() {
    document.getElementById('totalCashOnHand').textContent = `$${accountingSystem.getTotalCashOnHand().toFixed(2)}`;
    document.getElementById('totalAROutstanding').textContent = `$${accountingSystem.getTotalAR().toFixed(2)}`;
    document.getElementById('totalAPOutstanding').textContent = `$${accountingSystem.getTotalAP().toFixed(2)}`;
    document.getElementById('contractorPayoutsPending').textContent = `$${accountingSystem.getTotalContractorPayouts().toFixed(2)}`;
    document.getElementById('totalTaxesOwed').textContent = `$${accountingSystem.getTotalTaxesOwed().toFixed(2)}`;
    document.getElementById('totalOwnerProfit').textContent = `$${accountingSystem.getTotalOwnerProfit().toFixed(2)}`;
    
    // Update cash flow snapshot
    document.getElementById('outstandingInvoices').textContent = `$${accountingSystem.getOutstandingInvoices().toFixed(2)}`;
    document.getElementById('pendingContractorPayouts').textContent = `$${accountingSystem.getPendingContractorPayouts().toFixed(2)}`;
    document.getElementById('netProjected30').textContent = `$${accountingSystem.getNetProjectedCash30Days().toFixed(2)}`;
    document.getElementById('netProjected60').textContent = `$${accountingSystem.getNetProjectedCash60Days().toFixed(2)}`;
    document.getElementById('breakEvenOverhead').textContent = `$${accountingSystem.getBreakEvenMonthlyOverhead().toFixed(2)}`;
    
    loadJobsTable();
    loadARTable();
    loadDashboardAlerts();
}

function loadJobsTable() {
    const tbody = document.getElementById('jobsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = accountingSystem.jobs.map(job => {
        const slaAlert = accountingSystem.checkInvoiceSLA(job);
        const slaBadge = slaAlert ? `<span class="badge-alert" title="${slaAlert.message}">⚠️</span>` : '';
        
        return `
        <tr>
            <td>${job.jobName} ${slaBadge}</td>
            <td>${job.customerName}</td>
            <td>$${job.contractorBid.toFixed(2)}</td>
            <td>${job.markupPercent}%</td>
            <td>$${job.grossRevenue.toFixed(2)}</td>
            <td>$${job.grossProfit.toFixed(2)}</td>
            <td>$${job.netProfit.toFixed(2)}</td>
            <td><span class="status-badge ${job.status}">${job.status}</span></td>
            <td>
                <button onclick="viewJobDetail('${job.id}')" class="btn-icon" title="View"><i class="fas fa-eye"></i></button>
                <button onclick="editJob('${job.id}')" class="btn-icon" title="Edit"><i class="fas fa-edit"></i></button>
                ${!job.contractorPaidDate ? `<button onclick="payContractor('${job.id}')" class="btn-icon" title="Pay Contractor"><i class="fas fa-money-bill-wave"></i></button>` : ''}
                <button onclick="deleteJobConfirm('${job.id}')" class="btn-icon" title="Delete"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `;
    }).join('');
}

function loadARTable() {
    const tbody = document.getElementById('arTableBody');
    if (!tbody) return;
    
    const arWithReminders = accountingSystem.getARWithReminders();
    
    tbody.innerHTML = arWithReminders.map(ar => {
        const job = accountingSystem.getJob(ar.jobId);
        const reminderStatus = ar.reminderStatus || { status: 'current', message: 'Current' };
        
        return `
        <tr class="${reminderStatus.status}">
            <td>${job ? job.jobName : 'N/A'}</td>
            <td>$${ar.amount.toFixed(2)}</td>
            <td>${ar.dueDate ? new Date(ar.dueDate).toLocaleDateString() : 'N/A'}</td>
            <td><span class="reminder-badge ${reminderStatus.status}">${reminderStatus.message}</span></td>
            <td>${reminderStatus.days > 0 ? `${reminderStatus.days} days` : '-'}</td>
            <td>
                ${reminderStatus.days > 0 ? `<button onclick="sendReminder('${ar.id}')" class="btn-icon" title="Send Reminder"><i class="fas fa-envelope"></i></button>` : ''}
            </td>
        </tr>
    `;
    }).join('');
}

function loadDashboardAlerts() {
    const alertsContainer = document.getElementById('dashboardAlerts');
    if (!alertsContainer) return;
    
    const invoiceAlerts = accountingSystem.getInvoiceSLAAlerts();
    const overdueAR = accountingSystem.getARWithReminders().filter(ar => ar.reminderStatus && ar.reminderStatus.days > 0);
    
    const alerts = [
        ...invoiceAlerts.map(a => `
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>Invoice SLA Alert:</strong> ${a.jobName} - ${a.message} (${a.hoursPast}h past)
            </div>
        `),
        ...overdueAR.slice(0, 3).map(ar => {
            const job = accountingSystem.getJob(ar.jobId);
            return `
                <div class="alert alert-danger">
                    <i class="fas fa-clock"></i>
                    <strong>Overdue Invoice:</strong> ${job ? job.jobName : 'Unknown'} - ${ar.reminderStatus.message} (${ar.reminderStatus.days} days)
                </div>
            `;
        })
    ];
    
    alertsContainer.innerHTML = alerts.length > 0 ? alerts.join('') : '<div class="alert alert-success"><i class="fas fa-check-circle"></i> No alerts</div>';
}

function showAddJobModal() {
    document.getElementById('jobModalTitle').textContent = 'Add New Job';
    document.getElementById('jobForm').reset();
    document.getElementById('jobId').value = '';
    document.getElementById('jobModal').classList.add('active');
}

function closeJobModal() {
    document.getElementById('jobModal').classList.remove('active');
}

function saveJob(event) {
    event.preventDefault();
    
    const jobId = document.getElementById('jobId').value;
    const jobData = {
        jobName: document.getElementById('jobName').value,
        customerName: document.getElementById('jobCustomerName').value,
        contractorName: document.getElementById('jobContractorName').value,
        contractorBid: document.getElementById('contractorBid').value,
        markupPercent: document.getElementById('markupPercent').value,
        overheadAllocation: document.getElementById('overheadAllocation').value,
        paymentReceivedDate: document.getElementById('paymentReceivedDate').value || null,
        contractorPaidDate: document.getElementById('contractorPaidDate').value || null,
        dueDate: document.getElementById('jobDueDate').value || null,
        contractorDueDate: document.getElementById('contractorDueDate').value || null,
        status: document.getElementById('jobStatus').value
    };

    try {
        if (jobId) {
            accountingSystem.updateJob(jobId, jobData);
        } else {
            accountingSystem.addJob(jobData);
        }
        updateAccountingDashboard();
        closeJobModal();
    } catch (error) {
        alert(error.message);
    }
}

function payContractor(jobId) {
    const job = accountingSystem.getJob(jobId);
    if (!job) return;
    
    if (!job.paymentReceivedDate) {
        if (confirm(`WARNING: Payment not received from customer.\n\nJob: ${job.jobName}\nContractor Amount: $${job.contractorBid.toFixed(2)}\n\nDo you want to override and pay contractor anyway?`)) {
            showOverridePayoutModal(jobId);
        }
    } else {
        if (confirm(`Pay contractor for ${job.jobName}?\nAmount: $${job.contractorBid.toFixed(2)}`)) {
            accountingSystem.updateJob(jobId, { 
                contractorPaidDate: new Date().toISOString().split('T')[0] 
            });
            updateAccountingDashboard();
            alert('Contractor paid successfully!');
        }
    }
}

function showOverridePayoutModal(jobId) {
    const job = accountingSystem.getJob(jobId);
    document.getElementById('overrideJobId').value = jobId;
    document.getElementById('overrideJobName').textContent = job.jobName;
    document.getElementById('overrideAmount').textContent = `$${job.contractorBid.toFixed(2)}`;
    document.getElementById('overridePayoutModal').classList.add('active');
}

function closeOverridePayoutModal() {
    document.getElementById('overridePayoutModal').classList.remove('active');
    document.getElementById('overrideApprovalCode').value = '';
}

function confirmOverridePayout() {
    const jobId = document.getElementById('overrideJobId').value;
    const approvalCode = document.getElementById('overrideApprovalCode').value;
    const adminNotes = document.getElementById('overrideAdminNotes').value;
    
    if (!approvalCode || approvalCode.length < 4) {
        alert('Please enter admin approval code');
        return;
    }
    
    try {
        accountingSystem.updateJob(jobId, { 
            contractorPaidDate: new Date().toISOString().split('T')[0],
            overridePayoutApproval: true,
            overrideApprovalCode: approvalCode,
            overrideAdminNotes: adminNotes,
            overrideDate: new Date().toISOString()
        });
        
        updateAccountingDashboard();
        closeOverridePayoutModal();
        alert('Contractor payout approved with override!');
    } catch (error) {
        alert(error.message);
    }
}

function sendReminder(arId) {
    const result = accountingSystem.sendARReminder(arId);
    if (result.success) {
        alert(result.message);
        updateAccountingDashboard();
    }
}

function generateWeeklyCashReport() {
    const summary = accountingSystem.generateWeeklyCashSummary();
    
    const reportWindow = window.open('', '_blank');
    reportWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Weekly Cash Summary Report</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
                h1 { color: #2c3e50; border-bottom: 3px solid #2196F3; padding-bottom: 10px; }
                .summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 30px 0; }
                .summary-item { background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #2196F3; }
                .summary-item label { display: block; color: #7f8c8d; font-size: 14px; margin-bottom: 5px; }
                .summary-item .value { font-size: 24px; font-weight: bold; color: #2c3e50; }
                .positive { color: #4CAF50; }
                .negative { color: #f44336; }
                .alerts { margin-top: 30px; }
                .alert { padding: 15px; margin: 10px 0; border-radius: 5px; }
                .alert-warning { background: #fff3cd; border-left: 4px solid #ffc107; }
                .alert-danger { background: #f8d7da; border-left: 4px solid #dc3545; }
                .print-btn { background: #2196F3; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-top: 20px; }
                @media print { .print-btn { display: none; } }
            </style>
        </head>
        <body>
            <h1>Weekly Cash Summary Report</h1>
            <p><strong>Generated:</strong> ${new Date(summary.generatedDate).toLocaleString()}</p>
            
            <div class="summary-grid">
                <div class="summary-item">
                    <label>Current Cash</label>
                    <div class="value">$${summary.currentCash.toFixed(2)}</div>
                </div>
                <div class="summary-item">
                    <label>Accounts Receivable</label>
                    <div class="value">$${summary.accountsReceivable.toFixed(2)}</div>
                </div>
                <div class="summary-item">
                    <label>Accounts Payable</label>
                    <div class="value">$${summary.accountsPayable.toFixed(2)}</div>
                </div>
                <div class="summary-item">
                    <label>Contractor Payouts</label>
                    <div class="value">$${summary.contractorPayouts.toFixed(2)}</div>
                </div>
                <div class="summary-item">
                    <label>Taxes Owed</label>
                    <div class="value">$${summary.taxesOwed.toFixed(2)}</div>
                </div>
                <div class="summary-item">
                    <label>Net Position</label>
                    <div class="value ${summary.netPosition >= 0 ? 'positive' : 'negative'}">$${summary.netPosition.toFixed(2)}</div>
                </div>
            </div>
            
            ${summary.weeklyChange !== 0 ? `
                <div class="summary-item">
                    <label>Weekly Change</label>
                    <div class="value ${summary.weeklyChange >= 0 ? 'positive' : 'negative'}">
                        ${summary.weeklyChange >= 0 ? '+' : ''}$${summary.weeklyChange.toFixed(2)}
                    </div>
                </div>
            ` : ''}
            
            ${summary.alerts.length > 0 ? `
                <div class="alerts">
                    <h2>Alerts</h2>
                    ${summary.alerts.map(alert => `
                        <div class="alert ${alert.type === 'invoice-sla' ? 'alert-warning' : 'alert-danger'}">
                            <strong>${alert.type === 'invoice-sla' ? 'Invoice SLA' : 'Overdue AR'}:</strong> ${alert.message || alert.jobName}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            
            <button class="print-btn" onclick="window.print()">Print Report</button>
        </body>
        </html>
    `);
    reportWindow.document.close();
}

function editJob(jobId) {
    const job = accountingSystem.getJob(jobId);
    if (!job) return;

    document.getElementById('jobModalTitle').textContent = 'Edit Job';
    document.getElementById('jobId').value = job.id;
    document.getElementById('jobName').value = job.jobName;
    document.getElementById('jobCustomerName').value = job.customerName;
    document.getElementById('contractorBid').value = job.contractorBid;
    document.getElementById('markupPercent').value = job.markupPercent;
    document.getElementById('overheadAllocation').value = job.overheadAllocation;
    document.getElementById('paymentReceivedDate').value = job.paymentReceivedDate || '';
    document.getElementById('contractorPaidDate').value = job.contractorPaidDate || '';
    document.getElementById('jobStatus').value = job.status;
    
    document.getElementById('jobModal').classList.add('active');
}

function viewJobDetail(jobId) {
    const job = accountingSystem.getJob(jobId);
    if (!job) return;

    document.getElementById('detailJobName').textContent = job.jobName;
    document.getElementById('detailCustomerName').textContent = job.customerName;
    document.getElementById('detailContractorBid').textContent = `$${job.contractorBid.toFixed(2)}`;
    document.getElementById('detailMarkupPercent').textContent = `${job.markupPercent}%`;
    document.getElementById('detailGrossRevenue').textContent = `$${job.grossRevenue.toFixed(2)}`;
    document.getElementById('detailGrossProfit').textContent = `$${job.grossProfit.toFixed(2)}`;
    document.getElementById('detailOverheadAllocation').textContent = `$${job.overheadAllocation.toFixed(2)}`;
    document.getElementById('detailNetProfit').textContent = `$${job.netProfit.toFixed(2)}`;
    document.getElementById('detailPaymentReceived').textContent = job.paymentReceivedDate || 'Not Received';
    document.getElementById('detailContractorPaid').textContent = job.contractorPaidDate || 'Not Paid';
    document.getElementById('detailStatus').textContent = job.status;
    
    document.getElementById('jobDetailModal').classList.add('active');
}

function closeJobDetailModal() {
    document.getElementById('jobDetailModal').classList.remove('active');
}

function deleteJobConfirm(jobId) {
    if (confirm('Are you sure you want to delete this job?')) {
        accountingSystem.deleteJob(jobId);
        updateAccountingDashboard();
    }
}

function setMonthlyOverhead() {
    const amount = prompt('Enter Monthly Overhead Amount:', accountingSystem.overheadMonthly);
    if (amount !== null) {
        accountingSystem.setMonthlyOverhead(amount);
        updateAccountingDashboard();
    }
}

function switchAccountingTab(tabName) {
    // Remove active class from all tabs
    document.querySelectorAll('.accounting-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all tab contents
    document.querySelectorAll('.accounting-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Add active class to selected tab and content
    event.target.classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Load specific tab data
    if (tabName === 'forecast') {
        loadForecastTab();
    } else if (tabName === 'wealth') {
        loadWealthTab();
    } else if (tabName === 'executive') {
        loadExecutiveTab();
    }
}

function loadForecastTab() {
    const inputs = accountingSystem.getForecastInputs();
    
    document.getElementById('avgJobsPerMonth').value = inputs.avgJobsPerMonth;
    document.getElementById('avgRevenuePerJob').value = inputs.avgRevenuePerJob;
    document.getElementById('avgMarkupPercent').value = inputs.avgMarkupPercent;
    document.getElementById('monthlyRecurringRevenue').value = inputs.monthlyRecurringRevenue;
    document.getElementById('operatingExpensePercent').value = inputs.operatingExpensePercent;
    
    updateForecast();
}

function saveForecastInputs() {
    const inputs = {
        avgJobsPerMonth: parseFloat(document.getElementById('avgJobsPerMonth').value),
        avgRevenuePerJob: parseFloat(document.getElementById('avgRevenuePerJob').value),
        avgMarkupPercent: parseFloat(document.getElementById('avgMarkupPercent').value),
        monthlyRecurringRevenue: parseFloat(document.getElementById('monthlyRecurringRevenue').value),
        operatingExpensePercent: parseFloat(document.getElementById('operatingExpensePercent').value)
    };
    
    accountingSystem.saveForecastInputs(inputs);
    updateForecast();
}

function updateForecast() {
    const scenarios = accountingSystem.getScenarioComparison();
    
    // Update scenario summaries
    updateScenarioSummary('conservative', scenarios.conservative);
    updateScenarioSummary('expected', scenarios.expected);
    updateScenarioSummary('aggressive', scenarios.aggressive);
    
    // Render chart
    renderForecastChart(scenarios);
}

function updateScenarioSummary(scenario, forecast) {
    const totalRevenue = forecast.reduce((sum, m) => sum + m.projectedRevenue, 0);
    const totalProfit = forecast.reduce((sum, m) => sum + m.netProfit, 0);
    const endingCash = forecast[11].cashReserveBalance;
    
    document.getElementById(`${scenario}Revenue`).textContent = `$${totalRevenue.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    document.getElementById(`${scenario}Profit`).textContent = `$${totalProfit.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    document.getElementById(`${scenario}Cash`).textContent = `$${endingCash.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function renderForecastChart(scenarios) {
    const chartContainer = document.getElementById('forecastChart');
    const expected = scenarios.expected;
    
    const maxValue = Math.max(...expected.map(m => Math.max(m.projectedRevenue, m.cashReserveBalance)));
    
    chartContainer.innerHTML = `
        <div class="chart-legend">
            <div class="legend-item"><span class="legend-color" style="background: #2196F3;"></span> Revenue</div>
            <div class="legend-item"><span class="legend-color" style="background: #f44336;"></span> Contractor Expense</div>
            <div class="legend-item"><span class="legend-color" style="background: #FF9800;"></span> Operating Expense</div>
            <div class="legend-item"><span class="legend-color" style="background: #4CAF50;"></span> Net Profit</div>
            <div class="legend-item"><span class="legend-color" style="background: #9C27B0;"></span> Cash Reserve</div>
        </div>
        <div class="chart-grid">
            ${expected.map(month => `
                <div class="chart-month">
                    <div class="chart-bars">
                        <div class="chart-bar revenue" style="height: ${(month.projectedRevenue / maxValue * 200)}px" title="Revenue: $${month.projectedRevenue.toFixed(0)}"></div>
                        <div class="chart-bar contractor" style="height: ${(month.contractorExpense / maxValue * 200)}px" title="Contractor: $${month.contractorExpense.toFixed(0)}"></div>
                        <div class="chart-bar operating" style="height: ${(month.operatingExpense / maxValue * 200)}px" title="Operating: $${month.operatingExpense.toFixed(0)}"></div>
                        <div class="chart-bar profit" style="height: ${(Math.max(0, month.netProfit) / maxValue * 200)}px" title="Profit: $${month.netProfit.toFixed(0)}"></div>
                        <div class="chart-bar cash" style="height: ${(month.cashReserveBalance / maxValue * 200)}px" title="Cash: $${month.cashReserveBalance.toFixed(0)}"></div>
                    </div>
                    <div class="chart-label">${month.monthName}</div>
                </div>
            `).join('')}
        </div>
        <div class="chart-details">
            <h3>12-Month Projection Details (Expected Scenario)</h3>
            <table class="forecast-table">
                <thead>
                    <tr>
                        <th>Month</th>
                        <th>Revenue</th>
                        <th>Contractor</th>
                        <th>Operating</th>
                        <th>Net Profit</th>
                        <th>Cash Balance</th>
                    </tr>
                </thead>
                <tbody>
                    ${expected.map(month => `
                        <tr>
                            <td>${month.monthName}</td>
                            <td>$${month.projectedRevenue.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</td>
                            <td>$${month.contractorExpense.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</td>
                            <td>$${month.operatingExpense.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</td>
                            <td class="${month.netProfit >= 0 ? 'positive' : 'negative'}">$${month.netProfit.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</td>
                            <td class="${month.cashReserveBalance >= 0 ? 'positive' : 'negative'}">$${month.cashReserveBalance.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function loadWealthTab() {
    const allocation = accountingSystem.getAllocationBreakdown();
    const tracking = accountingSystem.getWealthTracking();
    const totalWealth = accountingSystem.getTotalWealth();
    
    // Update allocation breakdown
    document.getElementById('totalNetProfit').textContent = `$${allocation.totalNetProfit.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    document.getElementById('growthAllocation').textContent = `$${allocation.growth.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    document.getElementById('taxReserveAllocation').textContent = `$${allocation.taxReserve.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    document.getElementById('cashReserveAllocation').textContent = `$${allocation.cashReserve.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    document.getElementById('longTermWealthAllocation').textContent = `$${allocation.longTermWealth.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    
    // Update tracking fields
    document.getElementById('totalRetainedEarnings').value = tracking.totalRetainedEarnings;
    document.getElementById('capitalReinvested').value = tracking.capitalReinvested;
    document.getElementById('investmentAccountGrowth').value = tracking.investmentAccountGrowth;
    document.getElementById('equipmentAssetsOwned').value = tracking.equipmentAssetsOwned;
    
    // Update total wealth
    document.getElementById('totalWealthValue').textContent = `$${totalWealth.totalWealth.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    
    // Render pie chart
    renderAllocationPieChart(allocation);
}

function saveWealthTracking() {
    const data = {
        totalRetainedEarnings: parseFloat(document.getElementById('totalRetainedEarnings').value) || 0,
        capitalReinvested: parseFloat(document.getElementById('capitalReinvested').value) || 0,
        investmentAccountGrowth: parseFloat(document.getElementById('investmentAccountGrowth').value) || 0,
        equipmentAssetsOwned: parseFloat(document.getElementById('equipmentAssetsOwned').value) || 0
    };
    
    accountingSystem.updateWealthTracking(data);
    loadWealthTab();
    alert('Wealth tracking updated successfully!');
}

function renderAllocationPieChart(allocation) {
    const chartContainer = document.getElementById('allocationPieChart');
    
    if (allocation.totalNetProfit === 0) {
        chartContainer.innerHTML = '<div class="no-data">No profit data available. Complete jobs to see allocation.</div>';
        return;
    }
    
    const data = [
        { label: 'Growth (50%)', value: allocation.growth, color: '#4CAF50', percent: 50 },
        { label: 'Tax Reserve (20%)', value: allocation.taxReserve, color: '#FF9800', percent: 20 },
        { label: 'Cash Reserve (20%)', value: allocation.cashReserve, color: '#2196F3', percent: 20 },
        { label: 'Long-Term Wealth (10%)', value: allocation.longTermWealth, color: '#9C27B0', percent: 10 }
    ];
    
    let currentAngle = 0;
    const radius = 100;
    const centerX = 120;
    const centerY = 120;
    
    const slices = data.map(item => {
        const sliceAngle = (item.percent / 100) * 360;
        const startAngle = currentAngle;
        const endAngle = currentAngle + sliceAngle;
        
        const x1 = centerX + radius * Math.cos((startAngle - 90) * Math.PI / 180);
        const y1 = centerY + radius * Math.sin((startAngle - 90) * Math.PI / 180);
        const x2 = centerX + radius * Math.cos((endAngle - 90) * Math.PI / 180);
        const y2 = centerY + radius * Math.sin((endAngle - 90) * Math.PI / 180);
        
        const largeArc = sliceAngle > 180 ? 1 : 0;
        
        const pathData = [
            `M ${centerX} ${centerY}`,
            `L ${x1} ${y1}`,
            `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
            'Z'
        ].join(' ');
        
        currentAngle = endAngle;
        
        return { ...item, pathData };
    });
    
    chartContainer.innerHTML = `
        <svg viewBox="0 0 240 240" class="pie-chart">
            ${slices.map(slice => `
                <path d="${slice.pathData}" fill="${slice.color}" stroke="white" stroke-width="2">
                    <title>${slice.label}: $${slice.value.toFixed(2)}</title>
                </path>
            `).join('')}
        </svg>
        <div class="pie-legend">
            ${data.map(item => `
                <div class="pie-legend-item">
                    <span class="pie-color" style="background: ${item.color};"></span>
                    <span class="pie-label">${item.label}</span>
                    <span class="pie-value">$${item.value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function loadExecutiveTab() {
    const kpis = accountingSystem.getExecutiveKPIs();
    const valuation = accountingSystem.getBusinessValuation();
    const overview = accountingSystem.getExecutiveOverview();
    
    // Update KPI Metrics
    document.getElementById('grossMargin').textContent = `${kpis.grossMargin.toFixed(1)}%`;
    document.getElementById('netMargin').textContent = `${kpis.netMargin.toFixed(1)}%`;
    document.getElementById('avgDaysToGetPaid').textContent = `${Math.round(kpis.avgDaysToGetPaid)} days`;
    document.getElementById('avgPayoutDelay').textContent = `${Math.round(kpis.avgPayoutDelay)} days`;
    document.getElementById('revenuePerClient').textContent = `$${kpis.revenuePerClient.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    
    // Revenue Concentration Risk
    const concentrationEl = document.getElementById('concentrationRisk');
    concentrationEl.textContent = `${kpis.concentrationRisk.toFixed(1)}%`;
    if (kpis.hasConcentrationRisk) {
        concentrationEl.innerHTML += ' <span class="risk-badge">⚠️ HIGH RISK</span>';
        if (kpis.topClient) {
            document.getElementById('concentrationWarning').innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Revenue Concentration Risk:</strong> ${kpis.topClient.name} contributes ${kpis.concentrationRisk.toFixed(1)}% of total revenue ($${kpis.topClient.revenue.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')})
                </div>
            `;
        }
    } else {
        document.getElementById('concentrationWarning').innerHTML = '';
    }
    
    // AR Aging Breakdown
    document.getElementById('arCurrent').textContent = kpis.arAging.current;
    document.getElementById('ar15Days').textContent = kpis.arAging.days15;
    document.getElementById('ar30Days').textContent = kpis.arAging.days30;
    document.getElementById('ar45Days').textContent = kpis.arAging.days45;
    
    // Business Valuation
    document.getElementById('valuationMultiple').value = valuation.multiple;
    document.getElementById('ebitdaValue').textContent = `$${valuation.ebitda.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    document.getElementById('businessValue').textContent = `$${valuation.businessValue.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    
    // Executive Overview Cards
    document.getElementById('execBusinessValuation').textContent = `$${overview.businessValuation.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    document.getElementById('execAnnualProfit').textContent = `$${overview.annualRetainedProfit.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    document.getElementById('execInvestmentPortfolio').textContent = `$${overview.investmentPortfolio.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    document.getElementById('execExpansionCapital').textContent = `$${overview.expansionCapital.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    document.getElementById('execDebtLeverage').textContent = overview.debtLeverageRatio.toFixed(2);
    
    // Debt input
    document.getElementById('totalDebtInput').value = overview.totalDebt;
}

function updateValuationMultiple() {
    const multiple = parseFloat(document.getElementById('valuationMultiple').value);
    accountingSystem.setValuationMultiple(multiple);
    loadExecutiveTab();
}

function updateTotalDebt() {
    const debt = parseFloat(document.getElementById('totalDebtInput').value) || 0;
    accountingSystem.setTotalDebt(debt);
    loadExecutiveTab();
}
