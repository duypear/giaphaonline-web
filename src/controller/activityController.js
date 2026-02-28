// src/controller/activityController.js
const { logActivity } = require('../utils/activityLogger');

function getDb(req) {
  return req.app.get('db');
}

/* ============================================================
   1. LẤY DANH SÁCH ACTIVITY LOGS
============================================================ */
async function getActivityLogs(req, res) {
  const db = getDb(req);
  const userId = req.user.id;
  const userRole = req.user.role;

  // Xác định ownerId
  if (userRole === 'viewer') {
    db.get(`SELECT owner_id FROM users WHERE id = ?`, [userId], (err, row) => {
      if (err || !row || !row.owner_id) {
        return res.status(403).json({ 
          success: false, 
          message: 'Không tìm thấy owner của viewer này' 
        });
      }
      
      fetchActivityLogs(db, row.owner_id, res);
    });
  } else {
    fetchActivityLogs(db, userId, res);
  }
}

// Helper function
function fetchActivityLogs(db, ownerId, res) {
  const sql = `
    SELECT 
      id, actor_name, actor_role, action_type, entity_type, 
      entity_name, description, created_at
    FROM activity_logs
    WHERE owner_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `;

  db.all(sql, [ownerId], (err, rows) => {
    if (err) {
      console.error('Lỗi getActivityLogs:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }

    return res.json({ success: true, logs: rows });
  });
}

/* ============================================================
   2. XÓA 1 LOG (CHỈ OWNER)
============================================================ */
async function deleteLog(req, res) {
  const db = getDb(req);
  const userId = req.user.id;
  const userRole = req.user.role;
  const logId = req.params.id;

  if (userRole !== 'owner') {
    return res.status(403).json({ 
      success: false, 
      message: '⛔ Chỉ Admin mới có quyền xóa lịch sử' 
    });
  }

  const sql = `DELETE FROM activity_logs WHERE id = ? AND owner_id = ?`;

  db.run(sql, [logId, userId], function(err) {
    if (err) {
      console.error('Lỗi deleteLog:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi xóa log' });
    }

    return res.json({ success: true, message: 'Đã xóa lịch sử' });
  });
}

/* ============================================================
   3. XÓA TẤT CẢ LOGS (CHỈ OWNER)
============================================================ */
async function clearAllLogs(req, res) {
  const db = getDb(req);
  const userId = req.user.id;
  const userRole = req.user.role;

  if (userRole !== 'owner') {
    return res.status(403).json({ 
      success: false, 
      message: '⛔ Chỉ Admin mới có quyền xóa lịch sử' 
    });
  }

  const sql = `DELETE FROM activity_logs WHERE owner_id = ?`;

  db.run(sql, [userId], function(err) {
    if (err) {
      console.error('Lỗi clearAllLogs:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi xóa logs' });
    }

    return res.json({ success: true, message: `Đã xóa ${this.changes} lịch sử` });
  });
}

module.exports = {
  getActivityLogs,
  deleteLog,
  clearAllLogs
};