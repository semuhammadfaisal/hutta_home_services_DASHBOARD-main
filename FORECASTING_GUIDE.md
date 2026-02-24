# Forecasting & Growth Module

## Overview
The Forecasting & Growth tab provides 12-month revenue projections with three scenario models to help plan business growth and cash flow.

---

## 1️⃣ Revenue Forecast Inputs

### Input Fields:
1. **Average Jobs per Month**
   - Expected number of jobs to complete monthly
   - Default: 10 jobs
   - Used to calculate total monthly revenue

2. **Average Revenue per Job ($)**
   - Average gross revenue per completed job
   - Default: $5,000
   - Includes markup already applied

3. **Average Markup (%)**
   - Markup percentage over contractor cost
   - Default: 25%
   - Used to calculate contractor expense

4. **Monthly Recurring Revenue ($)**
   - Additional recurring revenue (subscriptions, retainers, etc.)
   - Default: $0
   - Added to job-based revenue each month

5. **Operating Expense (% of Revenue)**
   - Operating costs as percentage of revenue
   - Default: 15%
   - Includes overhead, salaries, rent, utilities, etc.

### How to Use:
1. Enter your business metrics in the input fields
2. Click "Calculate Forecast" button
3. System automatically generates all scenarios and charts

---

## 2️⃣ Three Scenario Models

### Conservative Scenario (80%)
- **Multiplier:** 0.8x
- **Purpose:** Worst-case planning
- **Use Case:** Risk assessment, minimum cash requirements
- **Calculation:** All inputs × 80%

### Expected Scenario (100%)
- **Multiplier:** 1.0x
- **Purpose:** Realistic planning
- **Use Case:** Budget planning, goal setting
- **Calculation:** Inputs as entered

### Aggressive Scenario (120%)
- **Multiplier:** 1.2x
- **Purpose:** Growth planning
- **Use Case:** Expansion planning, hiring decisions
- **Calculation:** All inputs × 120%

### Scenario Cards Display:
Each scenario shows 12-month totals:
- **Total Revenue** - Sum of all monthly revenue
- **Total Net Profit** - Sum of all monthly net profit
- **Ending Cash** - Final cash balance after 12 months

---

## 3️⃣ 12-Month Projection Chart

### Visual Chart Components:
**5 Bar Types per Month:**
1. **Revenue (Blue)** - Projected gross revenue
2. **Contractor Expense (Red)** - Cost to pay contractors
3. **Operating Expense (Orange)** - Operating costs
4. **Net Profit (Green)** - Monthly profit
5. **Cash Reserve (Purple)** - Cumulative cash balance

### Chart Features:
- Interactive hover tooltips showing exact values
- Color-coded legend
- Responsive design
- Scrollable for mobile devices
- Visual comparison across all 12 months

### Detailed Table Below Chart:
Shows exact numbers for each month:
- Month name
- Projected Revenue
- Contractor Expense
- Operating Expense
- Net Profit (color-coded: green if positive, red if negative)
- Cash Reserve Balance (cumulative)

---

## 4️⃣ Net Cash Rolling Calculation

### How It Works:

**Starting Point:**
- Begins with current cash on hand from accounting system
- Uses actual cash balance as Month 0

**Monthly Calculation:**
```
Month N Cash = Previous Month Cash + Net Profit
```

**Net Profit Formula:**
```
Net Profit = Revenue - Contractor Expense - Operating Expense
```

**Revenue Calculation:**
```
Revenue = (Jobs per Month × Revenue per Job) + Monthly Recurring Revenue
```

**Contractor Expense Calculation:**
```
Contractor Cost per Job = Revenue per Job ÷ (1 + Markup %)
Contractor Expense = Jobs per Month × Contractor Cost per Job
```

**Operating Expense Calculation:**
```
Operating Expense = Revenue × (Operating Expense % ÷ 100)
```

### Cumulative Growth:
- Each month carries forward the previous balance
- Shows true cash position over time
- Accounts for profit accumulation
- Highlights potential cash shortfalls

### Example:
```
Starting Cash: $10,000

Month 1:
- Revenue: $50,000
- Contractor: $40,000
- Operating: $7,500
- Net Profit: $2,500
- Ending Cash: $12,500

Month 2:
- Revenue: $50,000
- Contractor: $40,000
- Operating: $7,500
- Net Profit: $2,500
- Ending Cash: $15,000 (carried forward from Month 1)

... and so on for 12 months
```

---

## 📊 Business Insights

### What the Forecast Tells You:

1. **Cash Runway**
   - How long can you operate with current cash?
   - When will you need additional funding?

2. **Growth Capacity**
   - Can you afford to hire more staff?
   - When can you invest in equipment?

3. **Risk Assessment**
   - What if sales drop 20%? (Conservative scenario)
   - Can you survive a slow period?

4. **Goal Setting**
   - What revenue do you need to hit profit targets?
   - How many jobs per month to reach goals?

5. **Pricing Strategy**
   - Is your markup sufficient?
   - Should you adjust pricing?

---

## 🎯 Use Cases

### Monthly Planning
- Review expected scenario
- Adjust operations to meet targets
- Track actual vs. forecast

### Quarterly Reviews
- Compare actual results to forecast
- Adjust inputs based on performance
- Update projections

### Annual Budgeting
- Use conservative scenario for budget
- Plan capital expenditures
- Set revenue targets

### Investor Presentations
- Show all three scenarios
- Demonstrate growth potential
- Prove financial viability

### Hiring Decisions
- Check if cash supports new hires
- Plan hiring timeline
- Calculate break-even on new staff

---

## 💡 Tips for Accurate Forecasting

1. **Use Historical Data**
   - Review past 6-12 months
   - Calculate actual averages
   - Adjust for seasonality

2. **Be Conservative**
   - Better to exceed conservative forecast
   - Plan for worst case
   - Build cash buffer

3. **Update Regularly**
   - Refresh inputs monthly
   - Compare actual to forecast
   - Adjust assumptions

4. **Consider Seasonality**
   - Adjust jobs per month by season
   - Account for slow periods
   - Plan cash reserves accordingly

5. **Factor in Growth**
   - Marketing investments
   - New service offerings
   - Market expansion

---

## 🔧 Technical Details

### Data Storage:
- Inputs saved to localStorage
- Persists across sessions
- Can be updated anytime

### Calculations:
- Real-time updates
- Automatic recalculation
- No manual refresh needed

### Performance:
- Instant chart rendering
- Smooth animations
- Responsive design

---

## 📈 Key Metrics Tracked

### Revenue Metrics:
- Monthly revenue
- Annual revenue (12-month total)
- Revenue growth rate

### Expense Metrics:
- Contractor costs
- Operating expenses
- Total expenses

### Profitability Metrics:
- Monthly net profit
- Annual net profit
- Profit margin

### Cash Metrics:
- Starting cash
- Ending cash (12 months)
- Cash growth
- Minimum cash point

---

## 🚀 Future Enhancements

Potential additions:
- Export to Excel/PDF
- Multiple forecast scenarios saved
- Actual vs. forecast comparison
- Seasonality adjustments
- Custom expense categories
- Tax calculations
- Break-even analysis
- ROI calculator

---

## ✅ Benefits

✅ **Strategic Planning** - Make informed business decisions

✅ **Cash Flow Management** - Avoid cash shortfalls

✅ **Growth Planning** - Know when you can expand

✅ **Risk Mitigation** - Prepare for downturns

✅ **Goal Setting** - Set realistic targets

✅ **Investor Ready** - Professional financial projections

✅ **Quick Updates** - Adjust assumptions instantly

✅ **Visual Clarity** - Easy to understand charts

---

The Forecasting & Growth module provides the financial visibility needed to grow your business confidently!
