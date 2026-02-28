// src/routes/familyTreeRoutes.js
const express = require('express');
const router = express.Router();
const { getFamilyTreeData } = require('../controller/familyTreeController');
const { checkAuth } = require('../middleware/auth');

// GET /api/dashboard/family-tree
router.get('/family-tree', checkAuth, getFamilyTreeData);

module.exports = router;