/**
 * Pipeline Management API Endpoints
 * 
 * This file documents the required API endpoints for the pipeline feature.
 * Implement these endpoints in your backend (Node.js, Python, PHP, etc.)
 */

// ============================================
// STAGES ENDPOINTS
// ============================================

/**
 * GET /api/stages
 * Get all pipeline stages
 * 
 * Response: 200 OK
 * [
 *   {
 *     "id": 1,
 *     "name": "Work Order Received",
 *     "position": 1,
 *     "description": "Initial work order intake",
 *     "createdAt": "2024-01-01T00:00:00Z",
 *     "updatedAt": "2024-01-01T00:00:00Z"
 *   },
 *   ...
 * ]
 */

/**
 * POST /api/stages
 * Create a new stage
 * 
 * Request Body:
 * {
 *   "name": "New Stage",
 *   "position": 11,
 *   "description": "Stage description"
 * }
 * 
 * Response: 201 Created
 * {
 *   "id": 11,
 *   "name": "New Stage",
 *   "position": 11,
 *   "description": "Stage description",
 *   "createdAt": "2024-01-01T00:00:00Z",
 *   "updatedAt": "2024-01-01T00:00:00Z"
 * }
 */

/**
 * PUT /api/stages/:id
 * Update an existing stage
 * 
 * Request Body:
 * {
 *   "name": "Updated Stage Name",
 *   "position": 5,
 *   "description": "Updated description"
 * }
 * 
 * Response: 200 OK
 * {
 *   "id": 5,
 *   "name": "Updated Stage Name",
 *   "position": 5,
 *   "description": "Updated description",
 *   "updatedAt": "2024-01-01T00:00:00Z"
 * }
 */

/**
 * DELETE /api/stages/:id
 * Delete a stage
 * 
 * Response: 204 No Content
 * 
 * Note: Should fail if projects exist in this stage
 * unless they are reassigned first
 */

/**
 * PATCH /api/stages/reorder
 * Reorder all stages
 * 
 * Request Body:
 * [
 *   { "id": 1, "position": 1 },
 *   { "id": 2, "position": 2 },
 *   ...
 * ]
 * 
 * Response: 200 OK
 * {
 *   "message": "Stages reordered successfully"
 * }
 */

// ============================================
// PROJECTS ENDPOINTS (Enhanced)
// ============================================

/**
 * GET /api/projects
 * Get all projects with their current stage
 * 
 * Response: 200 OK
 * [
 *   {
 *     "id": "P001",
 *     "name": "Kitchen Renovation",
 *     "customer": "John Doe",
 *     "priority": "high",
 *     "stageId": 5,
 *     "budget": 15000,
 *     "startDate": "2024-01-01",
 *     "endDate": "2024-02-01"
 *   },
 *   ...
 * ]
 */

/**
 * PATCH /api/projects/:id
 * Update project stage (move in pipeline)
 * 
 * Request Body:
 * {
 *   "stageId": 6
 * }
 * 
 * Response: 200 OK
 * {
 *   "id": "P001",
 *   "stageId": 6,
 *   "updatedAt": "2024-01-01T00:00:00Z"
 * }
 * 
 * Note: This should also create a movement log entry
 */

// ============================================
// MOVEMENT LOGS ENDPOINT
// ============================================

/**
 * GET /api/projects/:id/movements
 * Get movement history for a project
 * 
 * Response: 200 OK
 * [
 *   {
 *     "id": 1,
 *     "projectId": "P001",
 *     "fromStage": "Bidding",
 *     "toStage": "Bid Submitted to Client",
 *     "userId": 123,
 *     "userName": "Admin User",
 *     "movedAt": "2024-01-01T10:30:00Z"
 *   },
 *   ...
 * ]
 */

/**
 * POST /api/projects/:id/movements
 * Log a project movement (auto-called when moving projects)
 * 
 * Request Body:
 * {
 *   "fromStageId": 2,
 *   "toStageId": 3,
 *   "userId": 123
 * }
 * 
 * Response: 201 Created
 */

// ============================================
// DATABASE SCHEMA EXAMPLES
// ============================================

/**
 * SQL Schema Example:
 * 
 * CREATE TABLE pipeline_stages (
 *   id INT PRIMARY KEY AUTO_INCREMENT,
 *   name VARCHAR(255) NOT NULL,
 *   position INT NOT NULL,
 *   description TEXT,
 *   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
 * );
 * 
 * ALTER TABLE projects ADD COLUMN current_stage_id INT;
 * ALTER TABLE projects ADD FOREIGN KEY (current_stage_id) REFERENCES pipeline_stages(id);
 * 
 * CREATE TABLE project_movements (
 *   id INT PRIMARY KEY AUTO_INCREMENT,
 *   project_id VARCHAR(50) NOT NULL,
 *   from_stage_id INT,
 *   to_stage_id INT NOT NULL,
 *   user_id INT NOT NULL,
 *   moved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *   FOREIGN KEY (project_id) REFERENCES projects(id),
 *   FOREIGN KEY (from_stage_id) REFERENCES pipeline_stages(id),
 *   FOREIGN KEY (to_stage_id) REFERENCES pipeline_stages(id),
 *   FOREIGN KEY (user_id) REFERENCES users(id)
 * );
 */

/**
 * MongoDB Schema Example:
 * 
 * // Stages Collection
 * {
 *   _id: ObjectId,
 *   name: String,
 *   position: Number,
 *   description: String,
 *   createdAt: Date,
 *   updatedAt: Date
 * }
 * 
 * // Projects Collection (add field)
 * {
 *   _id: ObjectId,
 *   projectId: String,
 *   name: String,
 *   customer: String,
 *   currentStageId: ObjectId, // Reference to stages
 *   ...
 * }
 * 
 * // Project Movements Collection
 * {
 *   _id: ObjectId,
 *   projectId: String,
 *   fromStageId: ObjectId,
 *   toStageId: ObjectId,
 *   userId: ObjectId,
 *   movedAt: Date
 * }
 */

// ============================================
// PERMISSION MIDDLEWARE EXAMPLE
// ============================================

/**
 * Example Express.js middleware for permissions:
 * 
 * const checkPipelinePermission = (action) => {
 *   return (req, res, next) => {
 *     const userRole = req.user.role; // admin, manager, staff
 *     
 *     switch(action) {
 *       case 'view':
 *         // All roles can view
 *         return next();
 *       
 *       case 'move':
 *         // Admin and Manager can move projects
 *         if (['admin', 'manager'].includes(userRole)) {
 *           return next();
 *         }
 *         break;
 *       
 *       case 'manage':
 *         // Only Admin can add/edit/delete stages
 *         if (userRole === 'admin') {
 *           return next();
 *         }
 *         break;
 *     }
 *     
 *     return res.status(403).json({ error: 'Insufficient permissions' });
 *   };
 * };
 * 
 * // Usage:
 * app.get('/api/stages', checkPipelinePermission('view'), getStages);
 * app.post('/api/stages', checkPipelinePermission('manage'), createStage);
 * app.patch('/api/projects/:id', checkPipelinePermission('move'), moveProject);
 */

// ============================================
// SAMPLE IMPLEMENTATION (Node.js/Express)
// ============================================

/**
 * Example implementation:
 * 
 * const express = require('express');
 * const router = express.Router();
 * 
 * // Get all stages
 * router.get('/stages', async (req, res) => {
 *   try {
 *     const stages = await db.query('SELECT * FROM pipeline_stages ORDER BY position');
 *     res.json(stages);
 *   } catch (error) {
 *     res.status(500).json({ error: error.message });
 *   }
 * });
 * 
 * // Create stage
 * router.post('/stages', checkPipelinePermission('manage'), async (req, res) => {
 *   try {
 *     const { name, position, description } = req.body;
 *     const result = await db.query(
 *       'INSERT INTO pipeline_stages (name, position, description) VALUES (?, ?, ?)',
 *       [name, position, description]
 *     );
 *     res.status(201).json({ id: result.insertId, name, position, description });
 *   } catch (error) {
 *     res.status(500).json({ error: error.message });
 *   }
 * });
 * 
 * // Move project
 * router.patch('/projects/:id', checkPipelinePermission('move'), async (req, res) => {
 *   try {
 *     const { id } = req.params;
 *     const { stageId } = req.body;
 *     
 *     // Get current stage
 *     const project = await db.query('SELECT current_stage_id FROM projects WHERE id = ?', [id]);
 *     const fromStageId = project[0].current_stage_id;
 *     
 *     // Update project
 *     await db.query('UPDATE projects SET current_stage_id = ? WHERE id = ?', [stageId, id]);
 *     
 *     // Log movement
 *     await db.query(
 *       'INSERT INTO project_movements (project_id, from_stage_id, to_stage_id, user_id) VALUES (?, ?, ?, ?)',
 *       [id, fromStageId, stageId, req.user.id]
 *     );
 *     
 *     res.json({ id, stageId });
 *   } catch (error) {
 *     res.status(500).json({ error: error.message });
 *   }
 * });
 * 
 * module.exports = router;
 */
