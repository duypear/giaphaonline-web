// src/controller/postsController.js
const { logActivity } = require('../utils/activityLogger');

function getDb(req) {
  return req.app.get('db');
}

/* ============================================================
   1. LẤY TẤT CẢ BÀI VIẾT
============================================================ */
async function getAllPosts(req, res) {
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
      
      fetchAllPosts(db, row.owner_id, res);
    });
  } else {
    fetchAllPosts(db, userId, res);
  }
}

function fetchAllPosts(db, ownerId, res) {
  const sql = `
    SELECT 
      p.id, p.title, p.content, p.category, p.is_pinned,
      p.created_at, p.updated_at,
      p.author_id, p.author_role,
      u.full_name as author_name
    FROM posts p
    LEFT JOIN users u ON p.author_id = u.id
    WHERE p.owner_id = ?
    ORDER BY p.is_pinned DESC, p.created_at DESC
  `;

  db.all(sql, [ownerId], (err, rows) => {
    if (err) {
      console.error('Lỗi getAllPosts:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }

    return res.json({ success: true, posts: rows });
  });
}

/* ============================================================
   2. LẤY CHI TIẾT 1 BÀI VIẾT
============================================================ */
async function getPostById(req, res) {
  const db = getDb(req);
  const userId = req.user.id;
  const userRole = req.user.role;
  const postId = req.params.id;

  if (userRole === 'viewer') {
    db.get(`SELECT owner_id FROM users WHERE id = ?`, [userId], (err, row) => {
      if (err || !row || !row.owner_id) {
        return res.status(403).json({ 
          success: false, 
          message: 'Không tìm thấy owner của viewer này' 
        });
      }
      
      fetchPostById(db, postId, row.owner_id, res);
    });
  } else {
    fetchPostById(db, postId, userId, res);
  }
}

function fetchPostById(db, postId, ownerId, res) {
  const sql = `
    SELECT 
      p.id, p.title, p.content, p.category, p.is_pinned,
      p.created_at, p.updated_at,
      p.author_id, p.author_role,
      u.full_name as author_name
    FROM posts p
    LEFT JOIN users u ON p.author_id = u.id
    WHERE p.id = ? AND p.owner_id = ?
  `;

  db.get(sql, [postId, ownerId], (err, row) => {
    if (err) {
      console.error('Lỗi getPostById:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }

    if (!row) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết' });
    }

    return res.json({ success: true, post: row });
  });
}

/* ============================================================
   3. TẠO BÀI VIẾT MỚI
============================================================ */
async function createPost(req, res) {
  const db = getDb(req);
  const userId = req.user.id;
  const userRole = req.user.role;

  const { title, content, category, is_pinned } = req.body;

  // Validate
  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, message: 'Tiêu đề không được để trống' });
  }

  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, message: 'Nội dung không được để trống' });
  }

  if (category && !['announcement', 'event', 'news'].includes(category)) {
    return res.status(400).json({ success: false, message: 'Danh mục không hợp lệ' });
  }

  if (userRole === 'viewer') {
    db.get(`SELECT owner_id FROM users WHERE id = ?`, [userId], (err, row) => {
      if (err || !row || !row.owner_id) {
        return res.status(403).json({ 
          success: false, 
          message: 'Không tìm thấy owner của viewer này' 
        });
      }

      insertPost(db, row.owner_id, userId, userRole, req.body, res);
    });
  } else {
    insertPost(db, userId, userId, userRole, req.body, res);
  }
}

function insertPost(db, ownerId, authorId, authorRole, data, res) {
  const { title, content, category, is_pinned } = data;

  const sql = `
    INSERT INTO posts (owner_id, author_id, author_role, title, content, category, is_pinned)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [
    ownerId,
    authorId,
    authorRole,
    title.trim(),
    content.trim(),
    category || 'announcement',
    is_pinned ? 1 : 0
  ], function(err) {
    if (err) {
      console.error('Lỗi createPost:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi tạo bài viết' });
    }

    // ✅ LẤY TÊN USER TRƯỚC KHI LOG
    db.get(`SELECT full_name FROM users WHERE id = ?`, [authorId], (errUser, user) => {
      const actorName = user ? user.full_name : (authorRole === 'owner' ? 'Admin' : 'Viewer');

      logActivity(db, {
        owner_id: ownerId,
        actor_id: authorId,
        actor_role: authorRole,
        actor_name: actorName,
        action_type: 'create',
        entity_type: 'post',
        entity_name: title.trim(),
        description: `Đã tạo bài viết: ${title.trim()}`
      });
    });

    return res.json({ 
      success: true, 
      message: 'Tạo bài viết thành công',
      postId: this.lastID 
    });
  });
}

/* ============================================================
   4. SỬA BÀI VIẾT
============================================================ */
async function updatePost(req, res) {
  const db = getDb(req);
  const userId = req.user.id;
  const userRole = req.user.role;
  const postId = req.params.id;

  const { title, content, category, is_pinned } = req.body;

  // Validate
  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, message: 'Tiêu đề không được để trống' });
  }

  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, message: 'Nội dung không được để trống' });
  }

  if (category && !['announcement', 'event', 'news'].includes(category)) {
    return res.status(400).json({ success: false, message: 'Danh mục không hợp lệ' });
  }

 checkEditPermission(db, postId, userId, userRole, (err, hasPermission, ownerId) => {
    if (err || !hasPermission) {
      return res.status(403).json({ 
        success: false, 
        message: '⛔ Bạn không có quyền sửa bài viết này' 
      });
    }

    const sql = `
      UPDATE posts SET
        title = ?, content = ?, category = ?, is_pinned = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND owner_id = ?
    `;

    db.run(sql, [
      title.trim(),
      content.trim(),
      category || 'announcement',
      is_pinned ? 1 : 0,
      postId,
      ownerId
    ], function(errUpdate) {
      if (errUpdate) {
        console.error('Lỗi updatePost:', errUpdate.message);
        return res.status(500).json({ success: false, message: 'Lỗi cập nhật bài viết' });
      }

      // ✅ LẤY TÊN USER TRƯỚC KHI LOG
      db.get(`SELECT full_name FROM users WHERE id = ?`, [userId], (errUser, user) => {
        const actorName = user ? user.full_name : (userRole === 'owner' ? 'Admin' : 'Viewer');

        logActivity(db, {
          owner_id: ownerId,
          actor_id: userId,
          actor_role: userRole,
          actor_name: actorName,
          action_type: 'update',
          entity_type: 'post',
          entity_name: title.trim(),
          description: `Đã cập nhật bài viết: ${title.trim()}`
        });
      });

      return res.json({ success: true, message: 'Cập nhật bài viết thành công' });
    });
  });
}

/* ============================================================
   5. XÓA BÀI VIẾT
============================================================ */
async function deletePost(req, res) {
  const db = getDb(req);
  const userId = req.user.id;
  const userRole = req.user.role;
  const postId = req.params.id;

  checkDeletePermission(db, postId, userId, userRole, (err, hasPermission, ownerId) => {
    if (err || !hasPermission) {
      return res.status(403).json({ 
        success: false, 
        message: '⛔ Bạn không có quyền xóa bài viết này' 
      });
    }

    // Lấy title trước khi xóa
    db.get(`SELECT title FROM posts WHERE id = ?`, [postId], (errGet, post) => {
      if (errGet || !post) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết' });
      }

      const postTitle = post.title;

      // Lấy tên user
      db.get(`SELECT full_name FROM users WHERE id = ?`, [userId], (errUser, user) => {
        const actorName = user ? user.full_name : (userRole === 'owner' ? 'Admin' : 'Viewer');

        // Tiến hành xóa
        const sql = `DELETE FROM posts WHERE id = ? AND owner_id = ?`;

        db.run(sql, [postId, ownerId], function(errDel) {
          if (errDel) {
            console.error('Lỗi deletePost:', errDel.message);
            return res.status(500).json({ success: false, message: 'Lỗi xóa bài viết' });
          }

          // LOG HOẠT ĐỘNG
          logActivity(db, {
            owner_id: ownerId,
            actor_id: userId,
            actor_role: userRole,
            actor_name: actorName,
            action_type: 'delete',
            entity_type: 'post',
            entity_name: postTitle,
            description: `Đã xóa bài viết: ${postTitle}`
          });

          return res.json({ success: true, message: 'Xóa bài viết thành công' });
        });
      });
    });
  });
}

/* ============================================================
   6. HELPER: KIỂM TRA QUYỀN
============================================================ */
/* ============================================================
   HELPER: KIỂM TRA QUYỀN SỬA (EDIT)
   - Owner chỉ được sửa bài viết của chính mình
   - Viewer chỉ được sửa bài viết của chính mình
============================================================ */
function checkEditPermission(db, postId, userId, userRole, callback) {
  const sql = `
    SELECT p.owner_id, p.author_id, u.owner_id as viewer_owner_id
    FROM posts p
    LEFT JOIN users u ON u.id = ?
    WHERE p.id = ?
  `;

  db.get(sql, [userId, postId], (err, row) => {
    if (err || !row) {
      return callback(err || new Error('Post not found'), false, null);
    }

    const ownerId = userRole === 'viewer' ? row.viewer_owner_id : userId;

    // CHỈ CÓ THỂ SỬA BÀI VIẾT CỦA CHÍNH MÌNH
    if (row.author_id === userId) {
      return callback(null, true, ownerId);
    }

    return callback(null, false, null);
  });
}

/* ============================================================
   HELPER: KIỂM TRA QUYỀN XÓA (DELETE)
   - Owner có thể xóa TẤT CẢ bài viết (kể cả của viewer)
   - Viewer chỉ được xóa bài viết của chính mình
============================================================ */
function checkDeletePermission(db, postId, userId, userRole, callback) {
  const sql = `
    SELECT p.owner_id, p.author_id, u.owner_id as viewer_owner_id
    FROM posts p
    LEFT JOIN users u ON u.id = ?
    WHERE p.id = ?
  `;

  db.get(sql, [userId, postId], (err, row) => {
    if (err || !row) {
      return callback(err || new Error('Post not found'), false, null);
    }

    const ownerId = userRole === 'viewer' ? row.viewer_owner_id : userId;

    // OWNER: Xóa tất cả bài viết trong hệ thống của mình
    if (userRole === 'owner' && row.owner_id === userId) {
      return callback(null, true, ownerId);
    }

    // VIEWER: Chỉ xóa bài viết của chính mình
    if (userRole === 'viewer' && row.author_id === userId) {
      return callback(null, true, ownerId);
    }

    return callback(null, false, null);
  });
}

module.exports = {
  getAllPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost
};