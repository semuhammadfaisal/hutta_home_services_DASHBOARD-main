import re

with open('pages/admin-dashboard.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove all backtick-n patterns
content = content.replace('`n`n', '\n\n')
content = content.replace('`n', '\n')

# Find and fix the vendor cost section
pattern = r'(<input type="number" id="amount" step="0\.01" required>\s*</div>\s*</div>).*?(<div class="form-row">\s*<div class="form-group">\s*<label for="startDate">)'
replacement = r'\1\n\n                    <div class="form-row">\n                        <div class="form-group">\n                            <label for="vendorCost">Vendor Cost</label>\n                            <input type="number" id="vendorCost" step="0.01">\n                        </div>\n                    </div>\n\n                    \2'

content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('pages/admin-dashboard.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed!")
