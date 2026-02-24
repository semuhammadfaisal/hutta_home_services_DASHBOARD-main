# Pipeline Management Feature

A comprehensive pipeline management system for tracking projects through workflow stages with drag-and-drop functionality.

## Features

### ✅ Implemented Features

1. **Fixed Workflow Stages** (Default)
   - Work Order Received
   - Bidding
   - Bid Submitted to Client
   - Approved – Ready to Schedule
   - In Progress
   - Awaiting Documentation
   - Ready to Invoice
   - Invoice Sent
   - Paid
   - Closed

2. **Stage Management**
   - View all stages in vertical list
   - Add new custom stages
   - Edit existing stages (name, position, description)
   - Delete stages (with project reassignment)
   - Drag-and-drop stage reordering
   - Project count per stage
   - Active stage highlighting

3. **Project Management**
   - Drag projects between stages
   - Visual project cards with:
     - Project ID and name
     - Customer information
     - Priority indicator (high/medium/low)
     - Timestamp
   - Smooth animations and transitions

4. **Movement Logging**
   - Automatic logging of all project movements
   - Tracks: project ID, from/to stages, user, timestamp
   - Stored in localStorage (can be synced to backend)

5. **Permission System**
   - **Admin**: Full control (add/edit/delete stages, move projects)
   - **Manager**: Move projects between stages
   - **Staff**: View only

6. **Responsive Design**
   - Mobile-friendly layout
   - Touch-enabled drag-and-drop
   - Scrollable stage containers
   - Adapts to tablet and desktop

## File Structure

```
hutta_home_ervices/
├── pages/
│   └── admin-dashboard.html          # Updated with Pipeline section
├── assets/
│   ├── css/
│   │   └── pipeline.css              # Pipeline styles
│   └── js/
│       └── pipeline.js               # Pipeline logic
└── config/
    └── pipeline-api.js               # API documentation
```

## Setup Instructions

### 1. Frontend Setup (Already Complete)

The pipeline feature is already integrated into the dashboard:
- Sidebar menu item added
- CSS and JS files linked
- Modals for stage management included

### 2. Backend Setup (Required)

Implement the following API endpoints (see `config/pipeline-api.js` for details):

#### Stages Endpoints
- `GET /api/stages` - Get all stages
- `POST /api/stages` - Create new stage
- `PUT /api/stages/:id` - Update stage
- `DELETE /api/stages/:id` - Delete stage
- `PATCH /api/stages/reorder` - Reorder stages

#### Projects Endpoints
- `GET /api/projects` - Get all projects
- `PATCH /api/projects/:id` - Update project stage

#### Movement Logs
- `GET /api/projects/:id/movements` - Get movement history
- `POST /api/projects/:id/movements` - Log movement

### 3. Database Setup

#### SQL Example
```sql
CREATE TABLE pipeline_stages (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  position INT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE projects ADD COLUMN current_stage_id INT;
ALTER TABLE projects ADD FOREIGN KEY (current_stage_id) REFERENCES pipeline_stages(id);

CREATE TABLE project_movements (
  id INT PRIMARY KEY AUTO_INCREMENT,
  project_id VARCHAR(50) NOT NULL,
  from_stage_id INT,
  to_stage_id INT NOT NULL,
  user_id INT NOT NULL,
  moved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (from_stage_id) REFERENCES pipeline_stages(id),
  FOREIGN KEY (to_stage_id) REFERENCES pipeline_stages(id)
);
```

## Usage Guide

### For Administrators

#### Add a New Stage
1. Click "Pipeline" in the sidebar
2. Click "+ Add Stage" button
3. Fill in stage name, position, and description
4. Click "Save Stage"

#### Edit a Stage
1. Click the edit icon (pencil) on any stage header
2. Modify the stage details
3. Click "Save Stage"

#### Delete a Stage
1. Click the delete icon (trash) on any stage header
2. If projects exist, select a stage to reassign them to
3. Confirm deletion

#### Reorder Stages
1. Drag stages by their header
2. Drop in desired position
3. Order is automatically saved

### For Managers

#### Move Projects
1. Drag a project card from one stage
2. Drop it into another stage
3. Movement is logged automatically

### For Staff

- View-only access to pipeline
- Can see all stages and projects
- Cannot move or modify

## Customization

### Change Default Stages
Edit the `getDefaultStages()` method in `assets/js/pipeline.js`

### Modify Permissions
Update the `currentUser` object in `pipeline.js`

### Customize Colors
Edit `assets/css/pipeline.css`

## Fallback Mode

If backend APIs are not available, the pipeline operates in fallback mode:
- Uses localStorage for data persistence
- Default stages are pre-loaded
- Sample projects are provided
- All features work offline

## Enable/Disable Feature

### To Disable
1. Remove or comment out the Pipeline menu item in `admin-dashboard.html`
2. Remove the `<link>` tag for `pipeline.css`
3. Remove the `<script>` tag for `pipeline.js`

### To Enable
Ensure all three components are present (already done):
- Menu item in sidebar
- CSS link in `<head>`
- JS script before closing `</body>`

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile browsers (iOS Safari, Chrome Mobile)
