// src/routes/settingsRoutes.js
const express = require('express');
const router = express.Router();
const {
  exportPDF,
  importCSV,
  uploadMiddleware,
  resetData,
  deleteAllMembers
} = require('../controller/settingsController');

const { checkAuth, checkOwnerOnly } = require('../middleware/auth');

// ================== ROUTES ==================

// Export PDF - Cả owner & viewer
router.get('/export-pdf', checkAuth, exportPDF);

// Import CSV - CHỈ OWNER
router.post('/import-csv', checkAuth, checkOwnerOnly, uploadMiddleware, importCSV);

// Reset data - CHỈ OWNER
router.post('/reset-data', checkAuth, checkOwnerOnly, resetData);

// ✅ XÓA TOÀN BỘ THÀNH VIÊN - CHỈ OWNER
router.delete('/delete-all-members', checkAuth, checkOwnerOnly, deleteAllMembers);

module.exports = router;