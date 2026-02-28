-- =====================================================================
-- BẢNG ACTIVITY LOGS - LỊCH SỬ HOẠT ĐỘNG
-- =====================================================================

CREATE TABLE IF NOT EXISTS activity_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id        INTEGER NOT NULL,           -- Chủ sở hữu cây gia phả
    actor_id        INTEGER NOT NULL,           -- Người thực hiện hành động
    actor_role      TEXT NOT NULL CHECK(actor_role IN ('owner', 'viewer')),
    actor_name      TEXT NOT NULL,              -- Tên người thực hiện
    action_type     TEXT NOT NULL,              -- Loại hành động: create, update, delete
    entity_type     TEXT NOT NULL,              -- Loại đối tượng: member, post, viewer, setting
    entity_name     TEXT,                       -- Tên đối tượng (nếu có)
    description     TEXT NOT NULL,              -- Mô tả chi tiết
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index tối ưu
CREATE INDEX IF NOT EXISTS idx_activity_owner ON activity_logs(owner_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity_logs(actor_id);