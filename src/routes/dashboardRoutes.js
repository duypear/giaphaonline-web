// src/routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controller/dashboardController');

// Import middleware phân quyền
const { checkAuth } = require('../middleware/auth');

// ================== ROUTES DASHBOARD ==================

// GET /api/dashboard/stats - Cả viewer và owner đều xem được
router.get('/stats', checkAuth, getDashboardStats);

module.exports = router;