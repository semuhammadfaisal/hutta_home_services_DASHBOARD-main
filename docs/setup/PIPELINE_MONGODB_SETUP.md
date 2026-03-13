# Pipeline MongoDB Setup

## ✅ Complete MongoDB Integration

### Files Created:

1. **Models** (MongoDB Schemas)
   - `backend/models/PipelineRecord.js` - Pipeline records schema
   - `backend/models/PipelineMovement.js` - Movement logs schema
   - `backend/models/Stage.js` - Already exists

2. **API Routes**
   - `backend/routes/pipelineRecords.js` - CRUD for records
   - `backend/routes/pipelineMovements.js` - Movement logging
   - `backend/routes/stages.js` - Already exists

3. **Frontend**
   - `assets/js/pipeline-mongodb.js` - MongoDB integration

4. **Initialization**
   - `backend/init-pipeline.js` - Setup default data

## Setup Instructions:

### 0. Whitelist Your IP in MongoDB Atlas (REQUIRED)
1. Go to https://cloud.mongodb.com
2. Select your cluster
3. Click "Network Access" in the left sidebar
4. Click "Add IP Address"
5. Click "Allow Access from Anywhere" (0.0.0.0/0) OR add your current IP
6. Click "Confirm"
7. Wait 1-2 minutes for changes to apply

### 1. Initialize Default Data
```bash
cd backend
node init-pipeline.js
```

This will create:
- 10 default workflow stages
- 5 sample records

### 2. Start Server
```bash
cd backend
npm start
```

### 3. Access Pipeline
Open `http://localhost:3000/pages/admin-dashboard.html` and click "Pipeline"

## API Endpoints:

### Stages
- `GET /api/stages` - Get all stages
- `POST /api/stages` - Create stage
- `PUT /api/stages/:id` - Update stage
- `DELETE /api/stages/:id` - Delete stage
- `PATCH /api/stages/reorder` - Reorder stages

### Records
- `GET /api/pipeline-records` - Get all records
- `GET /api/pipeline-records/stage/:stageId` - Get by stage
- `POST /api/pipeline-records` - Create record
- `PUT /api/pipeline-records/:id` - Update record
- `PATCH /api/pipeline-records/:id/stage` - Move to stage
- `DELETE /api/pipeline-records/:id` - Delete record

### Movements
- `GET /api/pipeline-movements` - Get all movements
- `GET /api/pipeline-movements/record/:recordId` - Get by record
- `POST /api/pipeline-movements` - Log movement

## Features:

✅ All stages stored in MongoDB
✅ All records stored in MongoDB  
✅ Movement logging in MongoDB
✅ Real-time updates
✅ Drag and drop with DB sync
✅ CRUD operations
✅ Stage reordering
✅ Automatic movement tracking

## MongoDB Collections:

1. **stages** - Workflow stages
2. **pipelinerecords** - Project records
3. **pipelinemovements** - Movement history

All data persists in MongoDB Atlas!
