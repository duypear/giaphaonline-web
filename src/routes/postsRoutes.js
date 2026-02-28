// src/routes/postsRoutes.js
const express = require('express');
const router = express.Router();
const {
  getAllPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost
} = require('../controller/postsController');

// Import middleware
const { checkAuth } = require('../middleware/auth');

// ================== ROUTES ==================

// Tất cả người dùng (owner & viewer) đều có thể xem posts
router.get('/', checkAuth, getAllPosts);
router.get('/:id', checkAuth, getPostById);

// Tất cả người dùng đều có thể tạo post
router.post('/', checkAuth, createPost);

// Sửa/xóa: kiểm tra quyền trong controller
router.put('/:id', checkAuth, updatePost);
router.delete('/:id', checkAuth, deletePost);

module.exports = router;