-- =====================================================================
-- BẢNG POSTS - BÀI VIẾT
-- =====================================================================

CREATE TABLE IF NOT EXISTS posts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id        INTEGER NOT NULL,           -- Chủ sở hữu cây gia phả
    author_id       INTEGER NOT NULL,           -- Người tạo bài viết (owner hoặc viewer)
    author_role     TEXT NOT NULL CHECK(author_role IN ('owner', 'viewer')),
    title           TEXT NOT NULL,
    content         TEXT NOT NULL,
    category        TEXT DEFAULT 'announcement' CHECK(category IN ('announcement', 'event', 'news')),
    is_pinned       INTEGER DEFAULT 0,          -- 1 = ghim, 0 = không ghim
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(author_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Trigger auto-update updated_at
CREATE TRIGGER IF NOT EXISTS trg_posts_updated_at
AFTER UPDATE ON posts
FOR EACH ROW
BEGIN
    UPDATE posts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Index tối ưu
CREATE INDEX IF NOT EXISTS idx_posts_owner ON posts(owner_id);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_pinned ON posts(is_pinned);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);