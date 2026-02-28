// src/controller/viewerController.js
const crypto = require('crypto');
const { logActivity } = require('../utils/activityLogger'); // ← THÊM DÒNG NÀY

function getDb(req) {
  return req.app.get('db');
}

// Hàm hash password đơn giản (dùng SHA256)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Hàm tạo viewer_code ngẫu nhiên (10 ký tự)
function generateViewerCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 10; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/* ============================================================
   1. TẠO TÀI KHOẢN VIEWER MỚI (CÓ MẬT KHẨU)
============================================================ */
function createViewer(req, res) {
  const db = getDb(req);
  const ownerId = req.user.id;

  const { full_name, password } = req.body;

  // Validate
  if (!full_name || !full_name.trim()) {
    return res.status(400).json({ success: false, message: 'Thiếu họ tên viewer' });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự' });
  }

  // Tạo viewer_code ngẫu nhiên
  let viewerCode = generateViewerCode();
  
  // Kiểm tra trùng lặp
  const checkSql = `SELECT id FROM users WHERE viewer_code = ?`;
  db.get(checkSql, [viewerCode], (err, existing) => {
    if (existing) {
      viewerCode = generateViewerCode() + Math.floor(Math.random() * 100);
    }

    // Hash password
    const passwordHash = hashPassword(password);

    // Insert viewer mới
    const insertSql = `
      INSERT INTO users (email, password, viewer_code, full_name, role, owner_id, password_hash)
      VALUES (?, ?, ?, ?, 'viewer', ?, ?)
    `;

    const dummyEmail = `viewer_${viewerCode}@system.local`;
    const dummyPassword = 'N/A';

    db.run(insertSql, [dummyEmail, dummyPassword, viewerCode, full_name.trim(), ownerId, passwordHash], function(errInsert) {
      if (errInsert) {
        console.error('Lỗi tạo viewer:', errInsert.message);
        return res.status(500).json({ success: false, message: 'Lỗi tạo viewer' });
      }

      // ===== THÊM LOG HOẠT ĐỘNG =====
      logActivity(db, {
        owner_id: ownerId,
        actor_id: ownerId,
        actor_role: 'owner',
        actor_name: 'Admin',
        action_type: 'create',
        entity_type: 'viewer',
        entity_name: full_name.trim(),
        description: `Đã tạo tài khoản viewer: ${full_name.trim()} (Mã: ${viewerCode})`
      });

      return res.json({
        success: true,
        message: 'Tạo viewer thành công',
        viewer: {
          id: this.lastID,
          full_name,
          viewer_code: viewerCode,
          password: password, // Trả về password gốc để admin có thể gửi cho viewer
          created_at: new Date().toISOString()
        }
      });
    });
  });
}

/* ============================================================
   2. LẤY DANH SÁCH VIEWER CỦA ADMIN
============================================================ */
function getViewers(req, res) {
  const db = getDb(req);
  const ownerId = req.user.id;

  const sql = `
    SELECT id, full_name, viewer_code, created_at
    FROM users
    WHERE owner_id = ? AND role = 'viewer'
    ORDER BY created_at DESC
  `;

  db.all(sql, [ownerId], (err, rows) => {
    if (err) {
      console.error('Lỗi getViewers:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }

    return res.json({ success: true, viewers: rows });
  });
}

/* ============================================================
   3. XÓA VIEWER
============================================================ */
function deleteViewer(req, res) {
  const db = getDb(req);
  const ownerId = req.user.id;
  const viewerId = req.params.id;

  // Kiểm tra viewer có thuộc về owner này không + lấy tên viewer
  const checkSql = `SELECT id, full_name FROM users WHERE id = ? AND owner_id = ? AND role = 'viewer'`;
  
  db.get(checkSql, [viewerId, ownerId], (err, viewer) => {
    if (err || !viewer) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy viewer' });
    }

    const viewerName = viewer.full_name; // ← SỬA: Lấy tên từ viewer object

    // Xóa viewer
    const deleteSql = `DELETE FROM users WHERE id = ?`;
    db.run(deleteSql, [viewerId], function(errDel) {
      if (errDel) {
        console.error('Lỗi xóa viewer:', errDel.message);
        return res.status(500).json({ success: false, message: 'Lỗi xóa viewer' });
      }

      // ===== THÊM LOG HOẠT ĐỘNG =====
      logActivity(db, {
        owner_id: ownerId,
        actor_id: ownerId,
        actor_role: 'owner',
        actor_name: 'Admin',
        action_type: 'delete',
        entity_type: 'viewer',
        entity_name: viewerName,
        description: `Đã xóa tài khoản viewer: ${viewerName}`
      });

      return res.json({ success: true, message: 'Đã xóa viewer' });
    });
  });
}

/* ============================================================
   4. CẬP NHẬT THÔNG TIN VIEWER
============================================================ */
function updateViewer(req, res) {
  const db = getDb(req);
  const ownerId = req.user.id;
  const viewerId = req.params.id;
  const { full_name } = req.body;

  if (!full_name || !full_name.trim()) {
    return res.status(400).json({ success: false, message: 'Thiếu họ tên' });
  }

  // Kiểm tra quyền sở hữu
  const checkSql = `SELECT id FROM users WHERE id = ? AND owner_id = ? AND role = 'viewer'`;
  
  db.get(checkSql, [viewerId, ownerId], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy viewer' });
    }

    // Cập nhật
    const updateSql = `UPDATE users SET full_name = ? WHERE id = ?`;
    db.run(updateSql, [full_name.trim(), viewerId], function(errUpdate) {
      if (errUpdate) {
        console.error('Lỗi update viewer:', errUpdate.message);
        return res.status(500).json({ success: false, message: 'Lỗi cập nhật' });
      }

      return res.json({ success: true, message: 'Cập nhật thành công' });
    });
  });
}

module.exports = {
  createViewer,
  getViewers,
  deleteViewer,
  updateViewer
};