const express = require('express');
const Project = require('../models/Project');
const authenticateToken = require('../middleware/auth');
const router = express.Router();

// Get all projects
router.get('/', authenticateToken, async (req, res) => {
  try {
    const projects = await Project.find()
      .populate('customer', 'name email')
      .populate('assignedEmployees', 'name role')
      .populate('vendor', 'name category')
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single project
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('customer')
      .populate('assignedEmployees')
      .populate('vendor');
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new project
router.post('/', authenticateToken, async (req, res) => {
  try {
    const projectCount = await Project.countDocuments();
    const projectId = `PRJ-${String(projectCount + 1).padStart(3, '0')}`;
    
    const project = new Project({ ...req.body, projectId });
    await project.save();
    
    const populatedProject = await Project.findById(project._id)
      .populate('customer', 'name email')
      .populate('assignedEmployees', 'name role')
      .populate('vendor', 'name category');
    
    res.status(201).json(populatedProject);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update project
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true }
    )
    .populate('customer', 'name email')
    .populate('assignedEmployees', 'name role')
    .populate('vendor', 'name category');
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    res.json(project);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete project
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;