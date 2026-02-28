-- Thêm cột owner_id
ALTER TABLE users ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- Owner tự tham chiếu
UPDATE users SET owner_id = id WHERE role = 'owner';