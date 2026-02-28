// src/middleware/auth.js

/* ============================================================
   MIDDLEWARE KIỂM TRA AUTHENTICATION
   - Cho phép cả Owner và Viewer đăng nhập
   - Parse token và lưu thông tin user vào req.user
============================================================ */
function checkAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ 
      success: false, 
      message: 'Thiếu hoặc sai header Authorization' 
    });
  }

  const token = parts[1];

  try {
    const tokenParts = token.split('_');
    if (tokenParts.length < 3) {
      throw new Error('Token format invalid');
    }

    const prefix = tokenParts[0]; // 'id' (owner) hoặc 'viewer'
    const userIdPart = tokenParts[1];
    const randomPart = tokenParts.slice(2).join('_');

    // Validate prefix
    if (!['id', 'viewer'].includes(prefix)) {
      throw new Error('Token prefix invalid');
    }

    // Validate user ID
    const userId = Number(userIdPart);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error('User id invalid');
    }

    // Validate random part
    if (!randomPart || randomPart.trim() === '') {
      throw new Error('Random part invalid');
    }

    // Lưu thông tin user vào request
    req.user = {
      id: userId,
      role: prefix === 'viewer' ? 'viewer' : 'owner'
    };

    next();
  } catch (err) {
    return res.status(401).json({ 
      success: false, 
      message: 'Token không hợp lệ: ' + err.message 
    });
  }
}

/* ============================================================
   MIDDLEWARE CHỈ CHO PHÉP OWNER
   - Kiểm tra user phải là owner
   - Chặn viewer thực hiện các thao tác ghi (create/update/delete)
============================================================ */
function checkOwnerOnly(req, res, next) {
  // req.user phải đã được set bởi checkAuth
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      message: 'Chưa xác thực' 
    });
  }

  if (req.user.role !== 'owner') {
    return res.status(403).json({ 
      success: false, 
      message: '⛔ Bạn không có quyền thực hiện thao tác này. Chỉ Admin mới được phép.' 
    });
  }

  next();
}

module.exports = {
  checkAuth,
  checkOwnerOnly
};