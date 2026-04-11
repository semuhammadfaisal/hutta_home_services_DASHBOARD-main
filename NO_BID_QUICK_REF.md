# NO BID Stage - Quick Reference

## 🚀 Quick Start

### Create NO BID Stage
1. Pipeline tab → "Add Stage"
2. Enter name (e.g., "NO BID")
3. ✅ Check "Mark as NO BID stage"
4. Save

### Move Order to NO BID
- Drag order → Drop in NO BID stage
- Order hidden from Orders tab ✅
- Excluded from KPIs ✅

### Recover Order
- Drag from NO BID → Drop in any other stage
- Order visible again ✅
- Included in KPIs ✅

---

## 🎯 What NO BID Does

| Feature | Effect |
|---------|--------|
| Orders Tab | ❌ Hidden |
| Payments Tab | ✅ Visible (payments still tracked) |
| Pipeline View | ✅ Visible |
| Total Orders Count | ❌ Not counted |
| Monthly Revenue | ❌ Not counted |
| Dashboard KPIs | ❌ Not counted |
| Order History | ✅ Preserved |
| Payment History | ✅ Preserved |
| Can Edit Order | ✅ Yes |
| Can Edit Payment | ✅ Yes |
| Can Recover | ✅ Yes |

---

## 🎨 Visual Indicators

```
🚫 NO BID Stage
├─ Red header (#dc2626)
├─ Red background (#fee2e2)
├─ Dashed red border
└─ Ban icon (🚫)
```

---

## 💡 Common Use Cases

```
✅ Lost to competitor
✅ Customer declined
✅ Budget too low
✅ Not a good fit
✅ Wrong timing
✅ Future opportunity
```

---

## 📊 Impact Example

### Before NO BID
```
Total Orders: 100
Revenue: $50,000
(includes 15 lost deals worth $8,000)
```

### After NO BID
```
Total Orders: 85
Revenue: $42,000
NO BID: 15 orders (tracked separately)
```

---

## ⚡ Key Points

1. **Not Deleted** - Orders preserved in database
2. **Reversible** - Drag back anytime
3. **Multiple Stages** - Create many NO BID stages
4. **Visual** - Easy to identify (red color)
5. **Automatic** - KPIs update instantly

---

## 🔧 API Reference

### Create NO BID Stage
```javascript
POST /api/stages
{
  "name": "NO BID",
  "position": 5,
  "isNoBid": true
}
```

### Update Stage to NO BID
```javascript
PUT /api/stages/:id
{
  "isNoBid": true
}
```

---

## 📝 Stage Naming Ideas

```
NO BID - Lost
NO BID - Declined
NO BID - Budget
NO BID - Timing
NO BID - Competitor
NO BID - Future
NO BID - Not Qualified
```

---

## ✅ Checklist

- [ ] Create NO BID stage
- [ ] Check "Mark as NO BID stage"
- [ ] Move lost orders to NO BID
- [ ] Verify orders hidden from Orders tab
- [ ] Check KPIs updated correctly
- [ ] Test dragging order back

---

## 🎯 Remember

> **NO BID stages keep your pipeline clean and your metrics accurate!**

- Orders in NO BID = Not counted
- Orders in other stages = Counted
- Drag to move between stages
- Changes take effect immediately

---

## 🆘 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Order still visible | Refresh page |
| KPIs not updated | Clear cache, refresh |
| Can't create NO BID | Check checkbox is checked |
| Want to undo | Drag order to another stage |

---

**That's it! Start using NO BID stages now! 🚀**
