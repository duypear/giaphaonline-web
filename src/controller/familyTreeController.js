// src/controller/familyTreeController.js

function getDb(req) {
  return req.app.get('db');
}

/**
 * Lấy toàn bộ dữ liệu gia phả của owner (HỖ TRỢ VIEWER)
 * GET /api/dashboard/family-tree
 */
function getFamilyTreeData(req, res) {
  const db = getDb(req);
  const userId = req.user.id;
  const userRole = req.user.role;

  // ✅ XÁC ĐỊNH OWNER ID
  if (userRole === 'viewer') {
    db.get(`SELECT owner_id FROM users WHERE id = ?`, [userId], (err, row) => {
      if (err || !row || !row.owner_id) {
        return res.status(403).json({ 
          success: false, 
          message: 'Không tìm thấy owner của viewer này' 
        });
      }
      
      // Lấy dữ liệu của owner
      fetchFamilyTreeData(db, row.owner_id, res);
    });
  } else {
    // Owner xem dữ liệu của chính mình
    fetchFamilyTreeData(db, userId, res);
  }
}

/**
 * HELPER: Fetch dữ liệu cây gia phả
 */
function fetchFamilyTreeData(db, ownerId, res) {
  // 1. Lấy tất cả people thuộc owner này
  const sqlPeople = `
    SELECT 
      id,
      full_name,
      gender,
      birth_date,
      death_date,
      is_alive,
      generation,
      avatar,
      biography,
      notes
    FROM people
    WHERE owner_id = ?
    ORDER BY generation ASC, id ASC
  `;

  db.all(sqlPeople, [ownerId], (err, people) => {
    if (err) {
      console.error('Lỗi lấy dữ liệu people:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }

    // 2. Lấy quan hệ cha mẹ - con
    const sqlRelationships = `
      SELECT 
        r.id,
        r.parent_id,
        r.child_id,
        r.relation_type
      FROM relationships r
      INNER JOIN people p ON r.child_id = p.id
      WHERE p.owner_id = ?
    `;

    db.all(sqlRelationships, [ownerId], (err2, relationships) => {
      if (err2) {
        console.error('Lỗi lấy relationships:', err2.message);
        return res.status(500).json({ success: false, message: 'Lỗi server' });
      }

      // 3. Lấy quan hệ hôn nhân
      const sqlMarriages = `
        SELECT 
          m.id,
          m.husband_id,
          m.wife_id,
          m.marriage_date,
          m.divorce_date,
          m.notes
        FROM marriages m
        INNER JOIN people p1 ON m.husband_id = p1.id
        WHERE p1.owner_id = ?
      `;

      db.all(sqlMarriages, [ownerId], (err3, marriages) => {
        if (err3) {
          console.error('Lỗi lấy marriages:', err3.message);
          return res.status(500).json({ success: false, message: 'Lỗi server' });
        }

        // ✅ RETURN DỮ LIỆU
        return res.json({
          success: true,
          data: {
            people,
            relationships,
            marriages
          }
        });
      });
    });
  });
}

module.exports = {
  getFamilyTreeData
};