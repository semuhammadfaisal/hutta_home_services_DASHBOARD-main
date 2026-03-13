# Customer CSV Import - Quick Reference Card

## 🚀 Quick Start

1. Click **Import CSV** button in Customers section
2. Select your CSV file
3. Wait for import to complete
4. Check success message

## 📋 CSV Format

### Minimum Required
```csv
name,email
John Smith,john@example.com
Jane Doe,jane@example.com
```

### Full Format
```csv
name,email,phone,address,city,state,zip,type,status,notes
John Smith,john@example.com,555-0101,123 Main St,Springfield,IL,62701,permanent,active,Regular customer
```

## ✅ Required Fields
- **name** (or "customer name")
- **email**

## 📝 Optional Fields
- phone, address, city, state, zip
- type (permanent/one-time)
- status (active/inactive)
- notes

## 🔄 Type Values
| CSV Value | Result |
|-----------|--------|
| permanent, recurring, regular | permanent |
| one-time, onetime, single | one-time |
| (empty) | one-time |

## 🎯 Status Values
| CSV Value | Result |
|-----------|--------|
| active | active |
| inactive, disabled | inactive |
| (empty) | active |

## 📁 Template File
Use: `CUSTOMER_CSV_TEMPLATE.csv`

## 🔍 Troubleshooting

**No data found**
→ Check file has headers + data rows

**Import failed**
→ Verify name and email columns exist

**Some failed**
→ Check console (F12) for details

## 💡 Tips
- Test with 2-3 rows first
- Use template as starting point
- Check console for detailed errors
- Avoid special characters

## 📊 Success Indicators
✅ Toast: "Imported X customers successfully"
✅ Table auto-refreshes
✅ New customers appear in list

## 🎨 UI Location
```
Customers Section
├── [Import CSV] ← Click here
└── [+ Add Customer]
```

## 🔗 Related Files
- HTML: `pages/admin-dashboard.html` (line 545)
- JS: `assets/js/csv-import.js`
- Template: `CUSTOMER_CSV_TEMPLATE.csv`
- Guide: `CUSTOMER_CSV_IMPORT_GUIDE.md`
