// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { register, loginOwner, loginViewer } = require('../controller/authController');

/* ============================================================
   ROUTES
============================================================ */

// POST /api/auth/register - Đăng ký owner
router.post('/register', register);

// POST /api/auth/login - Đăng nhập (owner hoặc viewer)
router.post('/login', (req, res) => {
  const { role } = req.body;

  if (role === 'viewer') {
    loginViewer(req, res);
  } else {
    loginOwner(req, res);
  }
});

module.exports = router;