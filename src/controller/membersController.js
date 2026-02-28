// src/controller/membersController.js
const { logActivity } = require('../utils/activityLogger');

function getDb(req) {
  return req.app.get('db');
}

/* ============================================================
   1. LẤY TẤT CẢ THÀNH VIÊN
============================================================ */
function getAllMembers(req, res) {
  const db = getDb(req);
  const userId = req.user.id;
  const userRole = req.user.role;

  if (userRole === 'viewer') {
    db.get(`SELECT owner_id FROM users WHERE id = ?`, [userId], (err, row) => {
      if (err || !row || !row.owner_id) {
        return res.status(403).json({ 
          success: false, 
          message: 'Không tìm thấy owner của viewer này' 
        });
      }
      
      fetchMembers(db, row.owner_id, res);
    });
  } else {
    fetchMembers(db, userId, res);
  }
}

function fetchMembers(db, ownerId, res) {
  const sql = `
    SELECT id, full_name, gender, birth_date, death_date, is_alive,
           avatar, biography, generation, notes, phone, job, address
    FROM people
    WHERE owner_id = ?
    ORDER BY generation ASC, full_name ASC
  `;

  db.all(sql, [ownerId], (err, rows) => {
    if (err) {
      console.error('Lỗi getAllMembers:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }

    return res.json({ success: true, members: rows });
  });
}

/* ============================================================
   2. LẤY CHI TIẾT 1 THÀNH VIÊN
============================================================ */
function getMemberById(req, res) {
  const db = getDb(req);
  const userId = req.user.id;
  const userRole = req.user.role;
  const memberId = req.params.id;

  if (userRole === 'viewer') {
    db.get(`SELECT owner_id FROM users WHERE id = ?`, [userId], (err, row) => {
      if (err || !row || !row.owner_id) {
        return res.status(403).json({ 
          success: false, 
          message: 'Không tìm thấy owner của viewer này' 
        });
      }
      
      fetchMemberById(db, memberId, row.owner_id, res);
    });
  } else {
    fetchMemberById(db, memberId, userId, res);
  }
}

function fetchMemberById(db, memberId, ownerId, res) {
  const sql = `
    SELECT id, full_name, gender, birth_date, death_date, is_alive,
           avatar, biography, generation, notes, phone, job, address
    FROM people
    WHERE id = ? AND owner_id = ?
  `;

  db.get(sql, [memberId, ownerId], (err, row) => {
    if (err) {
      console.error('Lỗi getMemberById:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }

    if (!row) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thành viên' });
    }

    // Lấy thông tin cha/mẹ
    const sqlParents = `
      SELECT p.id, p.full_name
      FROM people p
      INNER JOIN relationships r ON r.parent_id = p.id
      WHERE r.child_id = ?
    `;

    db.all(sqlParents, [memberId], (err2, parents) => {
      if (err2) {
        console.error('Lỗi lấy cha/mẹ:', err2.message);
        row.parents = [];
      } else {
        row.parents = parents;
      }

      // Lấy vợ/chồng
      const sqlSpouse = `
        SELECT 
          CASE 
            WHEN husband_id = ? THEN wife_id
            WHEN wife_id = ? THEN husband_id
          END as spouse_id,
          CASE 
            WHEN husband_id = ? THEN (SELECT full_name FROM people WHERE id = wife_id)
            WHEN wife_id = ? THEN (SELECT full_name FROM people WHERE id = husband_id)
          END as spouse_name
        FROM marriages
        WHERE husband_id = ? OR wife_id = ?
      `;

      db.get(sqlSpouse, [memberId, memberId, memberId, memberId, memberId, memberId], (err3, spouse) => {
        if (err3) {
          console.error('Lỗi lấy vợ/chồng:', err3.message);
          row.spouse = null;
        } else {
          row.spouse = spouse;
        }

        return res.json({ success: true, member: row });
      });
    });
  });
}

/* ============================================================
   3. THÊM THÀNH VIÊN MỚI
============================================================ */
/* ============================================================
   3. THÊM THÀNH VIÊN MỚI - CÓ VALIDATE THẾ HỆ
============================================================ */
function createMember(req, res) {
  const db = getDb(req);
  const ownerId = req.user.id;
  const userId = req.user.id;
  const userRole = req.user.role;

  const {
    full_name, gender, birth_date, death_date,
    avatar, biography, generation, notes,
    phone, job, address, parent_id, spouse_id,
    member_type // ✅ THÊM FIELD MỚI
  } = req.body;

  // ✅ VALIDATE CƠ BẢN
  if (!full_name || !full_name.trim()) {
    return res.status(400).json({ 
      success: false, 
      message: 'Họ tên không được để trống' 
    });
  }

  if (gender && !['Nam', 'Nữ'].includes(gender)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Giới tính phải là Nam hoặc Nữ' 
    });
  }

  // ✅ LOGIC XỬ LÝ GENERATION
  const requestedGeneration = parseInt(generation) || null;

  // TRƯỜNG HỢP 1: Thủy tổ (generation = 1)
  if (requestedGeneration === 1) {
    if (parent_id) {
      return res.status(400).json({
        success: false,
        message: '⚠️ Thủy tổ (đời 1) không được có cha/mẹ'
      });
    }

    // Insert thủy tổ (có thể có hoặc không có vợ/chồng)
    insertMemberWithGeneration(db, {
      ownerId, userId, userRole,
      full_name, gender, birth_date, death_date,
      avatar, biography, notes, phone, job, address,
      generation: 1,
      parent_id: null,
      spouse_id,
      member_type: 'blood' // Thủy tổ luôn là blood
    }, res);
    return;
  }

  // TRƯỜNG HỢP 2: Thế hệ > 1
  
  // Phải có ít nhất 1 trong 2: parent_id HOẶC spouse_id
  if (!parent_id && !spouse_id) {
    return res.status(400).json({
      success: false,
      message: '⚠️ Thành viên đời > 1 phải có cha/mẹ (con ruột) hoặc vợ/chồng (con dâu/rễ)'
    });
  }

  // SUB-CASE 2A: CÓ CHA/MẸ → Con ruột (ưu tiên)
  if (parent_id) {
    db.get(
      `SELECT generation FROM people WHERE id = ? AND owner_id = ?`,
      [parent_id, ownerId],
      (err, parent) => {
        if (err || !parent) {
          return res.status(400).json({
            success: false,
            message: '❌ Không tìm thấy thông tin cha/mẹ'
          });
        }

        const calculatedGeneration = parent.generation + 1;

        // Kiểm tra generation nhập vào có khớp không
        if (requestedGeneration && requestedGeneration !== calculatedGeneration) {
          return res.status(400).json({
            success: false,
            message: `⚠️ Thế hệ tự động tính là ${calculatedGeneration} (cha/mẹ là đời ${parent.generation})`
          });
        }

        // Insert con ruột
        insertMemberWithGeneration(db, {
          ownerId, userId, userRole,
          full_name, gender, birth_date, death_date,
          avatar, biography, notes, phone, job, address,
          generation: calculatedGeneration,
          parent_id,
          spouse_id,
          member_type: 'blood' // ✅ Con ruột
        }, res);
      }
    );
  }
  // SUB-CASE 2B: KHÔNG CÓ CHA/MẸ, CHỈ CÓ VỢ/CHỒNG → Con dâu/rễ
  else if (spouse_id) {
    db.get(
      `SELECT generation FROM people WHERE id = ? AND owner_id = ?`,
      [spouse_id, ownerId],
      (err, spouse) => {
        if (err || !spouse) {
          return res.status(400).json({
            success: false,
            message: '❌ Không tìm thấy thông tin vợ/chồng'
          });
        }

        const spouseGeneration = spouse.generation;

        // Kiểm tra generation nhập vào có khớp không
        if (requestedGeneration && requestedGeneration !== spouseGeneration) {
          return res.status(400).json({
            success: false,
            message: `⚠️ Thế hệ phải bằng thế hệ của vợ/chồng (đời ${spouseGeneration})`
          });
        }

        // Insert con dâu/rễ
        insertMemberWithGeneration(db, {
          ownerId, userId, userRole,
          full_name, gender, birth_date, death_date,
          avatar, biography, notes, phone, job, address,
          generation: spouseGeneration,
          parent_id: null,
          spouse_id,
          member_type: 'in_law' // ✅ Con dâu/rễ
        }, res);
      }
    );
  }
}

// ✅ HÀM HELPER INSERT MEMBER
function insertMemberWithGeneration(db, data, res) {
  const {
    ownerId, userId, userRole,
    full_name, gender, birth_date, death_date,
    avatar, biography, notes, phone, job, address,
    generation, parent_id, spouse_id, member_type
  } = data;

  const is_alive = death_date ? 0 : 1;
 const typeText = member_type === 'in_law' ? 'Con dâu/rễ' : 'Con ruột';
  const sql = `
    INSERT INTO people (
      owner_id, full_name, gender, birth_date, death_date, is_alive,
      avatar, biography, generation, notes, phone, job, address, member_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [
    ownerId, full_name, gender || null, birth_date || null, death_date || null, is_alive,
    avatar || null, biography || null, generation || null, notes || null,
    phone || null, job || null, address || null, member_type || 'blood'
  ], function(err) {
    if (err) {
      console.error('Lỗi createMember:', err.message);
      return res.status(500).json({ 
        success: false, 
        message: 'Lỗi tạo thành viên' 
      });
    }

    const newId = this.lastID;

    // Lấy tên user trước khi log
    db.get(`SELECT full_name FROM users WHERE id = ?`, [userId], (errUser, user) => {
      const actorName = user ? user.full_name : (userRole === 'owner' ? 'Admin' : 'Viewer');

      // Xác định type text
     

      // LOG HOẠT ĐỘNG
      logActivity(db, {
        owner_id: ownerId,
        actor_id: userId,
        actor_role: userRole,
        actor_name: actorName,
        action_type: 'create',
        entity_type: 'member',
        entity_name: full_name,
        description: `Đã thêm ${typeText}: ${full_name} (Đời ${generation || 'N/A'})`
      });
    });

    // Thêm quan hệ cha/mẹ nếu có
    if (parent_id) {
      const sqlRel = `INSERT INTO relationships (parent_id, child_id, relation_type) VALUES (?, ?, 'ruot')`;
      db.run(sqlRel, [parent_id, newId], (errRel) => {
        if (errRel) console.error('Lỗi thêm quan hệ:', errRel.message);
      });
    }

    // Thêm hôn nhân nếu có
    if (spouse_id) {
      db.get(`SELECT gender FROM people WHERE id = ?`, [newId], (errG, personRow) => {
        if (!errG && personRow) {
          let sqlMarriage = '';
          if (personRow.gender === 'Nam') {
            sqlMarriage = `INSERT INTO marriages (husband_id, wife_id) VALUES (?, ?)`;
            db.run(sqlMarriage, [newId, spouse_id]);
          } else {
            sqlMarriage = `INSERT INTO marriages (husband_id, wife_id) VALUES (?, ?)`;
            db.run(sqlMarriage, [spouse_id, newId]);
          }
        }
      });
    }

    return res.json({ 
      success: true, 
      message: `✅ Tạo thành viên thành công (${typeText}, Đời ${generation})`, 
      memberId: newId 
    });
  });
}
/* ============================================================
   4. SỬA THÔNG TIN THÀNH VIÊN
============================================================ */
/* ============================================================
   4. SỬA THÔNG TIN THÀNH VIÊN - THÊM VALIDATION
============================================================ */
function updateMember(req, res) {
  const db = getDb(req);
  const ownerId = req.user.id;
  const userId = req.user.id;
  const userRole = req.user.role;
  const memberId = req.params.id;

  const {
    full_name, gender, birth_date, death_date,
    avatar, biography, generation, notes,
    phone, job, address
  } = req.body;

  // Validate
  if (!full_name || !full_name.trim()) {
    return res.status(400).json({ success: false, message: 'Họ tên không được để trống' });
  }

  if (gender && !['Nam', 'Nữ'].includes(gender)) {
    return res.status(400).json({ success: false, message: 'Giới tính phải là Nam hoặc Nữ' });
  }

  // ✅ THÊM: Kiểm tra không cho thay đổi generation khi update
  // (Vì logic phức tạp - nếu đổi generation phải đổi cả con cháu)
  db.get(`SELECT generation FROM people WHERE id = ? AND owner_id = ?`, [memberId, ownerId], (err, currentMember) => {
    if (err || !currentMember) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thành viên' });
    }

    // Nếu generation bị thay đổi → báo lỗi
    if (generation && parseInt(generation) !== currentMember.generation) {
      return res.status(400).json({ 
        success: false, 
        message: '⚠️ Không thể thay đổi thế hệ sau khi đã tạo. Hãy xóa và tạo lại nếu cần.' 
      });
    }

    const is_alive = death_date ? 0 : 1;

    const sql = `
      UPDATE people SET
        full_name = ?, gender = ?, birth_date = ?, death_date = ?, is_alive = ?,
        avatar = ?, biography = ?, generation = ?, notes = ?,
        phone = ?, job = ?, address = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND owner_id = ?
    `;

    db.run(sql, [
      full_name, gender || null, birth_date || null, death_date || null, is_alive,
      avatar || null, biography || null, currentMember.generation, notes || null, // ← Dùng generation cũ
      phone || null, job || null, address || null,
      memberId, ownerId
    ], function(errUpdate) {
      if (errUpdate) {
        console.error('Lỗi updateMember:', errUpdate.message);
        return res.status(500).json({ success: false, message: 'Lỗi cập nhật thành viên' });
      }

      db.get(`SELECT full_name FROM users WHERE id = ?`, [userId], (errUser, user) => {
        const actorName = user ? user.full_name : (userRole === 'owner' ? 'Admin' : 'Viewer');

        logActivity(db, {
          owner_id: ownerId,
          actor_id: userId,
          actor_role: userRole,
          actor_name: actorName,
          action_type: 'update',
          entity_type: 'member',
          entity_name: full_name,
          description: `Đã cập nhật thông tin: ${full_name}`
        });
      });

      return res.json({ success: true, message: 'Cập nhật thành công' });
    });
  });
}
/* ============================================================
   5. XÓA THÀNH VIÊN - ✅ FIXED
============================================================ */
function deleteMember(req, res) {
  const db = getDb(req);
  const ownerId = req.user.id;
  const userId = req.user.id;
  const userRole = req.user.role;
  const memberId = req.params.id;

  // ✅ BƯỚC 1: Lấy tên member VÀ user trước
  db.get(`SELECT full_name FROM people WHERE id = ? AND owner_id = ?`, [memberId, ownerId], (errGet, member) => {
    if (errGet || !member) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thành viên' });
    }

    const memberName = member.full_name;

    // ✅ BƯỚC 2: Lấy tên user
    db.get(`SELECT full_name FROM users WHERE id = ?`, [userId], (errUser, user) => {
      const actorName = user ? user.full_name : (userRole === 'owner' ? 'Admin' : 'Viewer');

      // ✅ BƯỚC 3: Xóa các mối quan hệ
      db.run(`DELETE FROM relationships WHERE parent_id = ? OR child_id = ?`, [memberId, memberId], (errRel) => {
        if (errRel) console.error('Lỗi xóa relationships:', errRel.message);
      });

      db.run(`DELETE FROM marriages WHERE husband_id = ? OR wife_id = ?`, [memberId, memberId], (errMar) => {
        if (errMar) console.error('Lỗi xóa marriages:', errMar.message);
      });

      // ✅ BƯỚC 4: Xóa người
      const sql = `DELETE FROM people WHERE id = ? AND owner_id = ?`;
      db.run(sql, [memberId, ownerId], function(errDel) {
        if (errDel) {
          console.error('Lỗi deleteMember:', errDel.message);
          return res.status(500).json({ success: false, message: 'Lỗi xóa thành viên' });
        }

        // ✅ BƯỚC 5: LOG (KHÔNG BLOCKING)
        logActivity(db, {
          owner_id: ownerId,
          actor_id: userId,
          actor_role: userRole,
          actor_name: actorName, // ← ĐẢM BẢO KHÔNG NULL
          action_type: 'delete',
          entity_type: 'member',
          entity_name: memberName,
          description: `Đã xóa thành viên: ${memberName}`
        });

        // ✅ BƯỚC 6: RETURN (CHỈ 1 LẦN)
        return res.json({ success: true, message: 'Xóa thành viên thành công' });
      });
    });
  });
}

/* ============================================================
   6. TÌM KIẾM NÂNG CAO
============================================================ */
function searchMembers(req, res) {
  const db = getDb(req);
  const userId = req.user.id;
  const userRole = req.user.role;

  const {
    name, generation, gender, status, job, ageMin, ageMax, address
  } = req.body;

  if (userRole === 'viewer') {
    db.get(`SELECT owner_id FROM users WHERE id = ?`, [userId], (err, row) => {
      if (err || !row || !row.owner_id) {
        return res.status(403).json({ 
          success: false, 
          message: 'Không tìm thấy owner của viewer này' 
        });
      }
      
      performSearch(db, row.owner_id, req.body, res);
    });
  } else {
    performSearch(db, userId, req.body, res);
  }
}

function performSearch(db, ownerId, filters, res) {
  const { name, generation, gender, status, job, ageMin, ageMax, address } = filters;

  let sql = `
    SELECT id, full_name, gender, birth_date, death_date, is_alive,
           avatar, biography, generation, notes, phone, job, address
    FROM people
    WHERE owner_id = ?
  `;

  const params = [ownerId];

  if (name) {
    sql += ` AND full_name LIKE ?`;
    params.push(`%${name}%`);
  }

  if (generation) {
    sql += ` AND generation = ?`;
    params.push(generation);
  }

  if (gender === 'male') {
    sql += ` AND gender = 'Nam'`;
  } else if (gender === 'female') {
    sql += ` AND gender = 'Nữ'`;
  }

  if (status === 'living') {
    sql += ` AND is_alive = 1`;
  } else if (status === 'deceased') {
    sql += ` AND is_alive = 0`;
  }

  if (job) {
    sql += ` AND job LIKE ?`;
    params.push(`%${job}%`);
  }

  if (address) {
    sql += ` AND address LIKE ?`;
    params.push(`%${address}%`);
  }

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Lỗi searchMembers:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi tìm kiếm' });
    }

    let results = rows;

    if (ageMin || ageMax) {
      const currentYear = new Date().getFullYear();
      results = rows.filter(person => {
        if (!person.birth_date) return false;
        const birthYear = new Date(person.birth_date).getFullYear();
        const age = currentYear - birthYear;

        if (ageMin && age < parseInt(ageMin)) return false;
        if (ageMax && age > parseInt(ageMax)) return false;

        return true;
      });
    }

    return res.json({ success: true, members: results, count: results.length });
  });
}

module.exports = {
  getAllMembers,
  getMemberById,
  createMember,
  updateMember,
  deleteMember,
  searchMembers
};