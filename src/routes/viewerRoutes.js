// src/routes/viewerRoutes.js
const express = require('express');
const router = express.Router();
const {
  createViewer,
  getViewers,
  deleteViewer,
  updateViewer
} = require('../controller/viewerController');

// Import middleware - CHỈ DÙNG checkOwnerOnly vì chỉ admin mới quản lý viewer
const { checkAuth, checkOwnerOnly } = require('../middleware/auth');

// ================== ROUTES ==================
// Tất cả routes này chỉ owner mới được dùng

router.post('/', checkAuth, checkOwnerOnly, createViewer);
router.get('/', checkAuth, checkOwnerOnly, getViewers);
router.put('/:id', checkAuth, checkOwnerOnly, updateViewer);
router.delete('/:id', checkAuth, checkOwnerOnly, deleteViewer);

module.exports = router;