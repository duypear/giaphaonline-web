// src/routes/activityRoutes.js
const express = require('express');
const router = express.Router();
const {
  getActivityLogs,
  deleteLog,
  clearAllLogs
} = require('../controller/activityController');

const { checkAuth, checkOwnerOnly } = require('../middleware/auth');

// ================== ROUTES ==================

// Xem logs: Cả owner & viewer
router.get('/', checkAuth, getActivityLogs);

// Xóa logs: CHỈ OWNER
router.delete('/:id', checkAuth, checkOwnerOnly, deleteLog);
router.delete('/clear/all', checkAuth, checkOwnerOnly, clearAllLogs);

module.exports = router;