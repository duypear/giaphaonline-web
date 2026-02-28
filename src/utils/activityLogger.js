// src/utils/activityLogger.js

/**
 * Ghi log hoạt động vào database
 * @param {Object} db - Database instance
 * @param {Object} params - Log parameters
 * @param {number} params.owner_id - ID chủ sở hữu
 * @param {number} params.actor_id - ID người thực hiện
 * @param {string} params.actor_role - Role: 'owner' hoặc 'viewer'
 * @param {string} params.actor_name - Tên người thực hiện
 * @param {string} params.action_type - 'create', 'update', 'delete'
 * @param {string} params.entity_type - 'member', 'post', 'viewer', 'setting'
 * @param {string} params.entity_name - Tên đối tượng (optional)
 * @param {string} params.description - Mô tả chi tiết
 */
function logActivity(db, params) {
  const {
    owner_id,
    actor_id,
    actor_role,
    actor_name,
    action_type,
    entity_type,
    entity_name,
    description
  } = params;

  const sql = `
    INSERT INTO activity_logs 
    (owner_id, actor_id, actor_role, actor_name, action_type, entity_type, entity_name, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [
    owner_id,
    actor_id,
    actor_role,
    actor_name,
    action_type,
    entity_type,
    entity_name || null,
    description
  ], (err) => {
    if (err) {
      console.error('❌ Lỗi ghi activity log:', err.message);
    }
  });
}

module.exports = {
  logActivity
};