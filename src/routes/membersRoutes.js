// src/routes/membersRoutes.js
const express = require('express');
const router = express.Router();
const {
  getAllMembers,
  getMemberById,
  createMember,
  updateMember,
  deleteMember,
  searchMembers
} = require('../controller/membersController');

// Import middleware phân quyền
const { checkAuth, checkOwnerOnly } = require('../middleware/auth');

// ================== ROUTES ==================

// Routes CHỈ ĐỌC - Cả viewer và owner đều được xem
router.get('/', checkAuth, getAllMembers);
router.get('/:id', checkAuth, getMemberById);
router.post('/search', checkAuth, searchMembers);

// Routes GHI - CHỈ OWNER mới được thêm/sửa/xóa
router.post('/', checkAuth, checkOwnerOnly, createMember);
router.put('/:id', checkAuth, checkOwnerOnly, updateMember);
router.delete('/:id', checkAuth, checkOwnerOnly, deleteMember);

module.exports = router;