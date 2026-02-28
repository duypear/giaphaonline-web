// src/components/auth.js
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const crypto = require('crypto');

/* Kết nối database */
const db = new sqlite3.Database(
    path.join(__dirname, "../../database/giapha.db"),
    sqlite3.OPEN_READWRITE,
    (err) => {
        if (err) console.error("DB Error:", err);
        else console.log("Auth Service connected");
    }
);

/* Generate viewer_code (10 ký tự) */
function generateViewerCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let code = "";
    for (let i = 0; i < 10; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/* ============================================================
   REGISTER OWNER → sinh viewer_code
============================================================ */
function register(db, { full_name, email, password, confirm }) {
  return new Promise((resolve) => {

    // 1. Kiểm tra đầu vào
    if (!email || !password || !full_name) {
      return resolve({ success: false, message: "Thiếu thông tin!" });
    }

    if (password !== confirm) {
      return resolve({ success: false, message: "Mật khẩu không trùng khớp!" });
    }

    // 2. Tạo viewer_code ngẫu nhiên
    const viewerCode = generateViewerCode();

    const insertUser = `
      INSERT INTO users (email, password, viewer_code, full_name, role)
      VALUES (?, ?, ?, ?, 'owner')
    `;

    // 3. Chỉ insert vào bảng users
    db.run(insertUser, [email, password, viewerCode, full_name], function (err) {
      if (err) {
        return resolve({
          success: false,
          message: "Email đã tồn tại."
        });
      }

      return resolve({
        success: true,
        message: "Đăng ký thành công!",
        viewer_code: viewerCode
      });
    });
  });
}
 
/* ============================================================
   LOGIN OWNER
============================================================ */
function loginOwner(db, email, password) {
    return new Promise((resolve) => {
        db.get(`SELECT * FROM users WHERE email = ?`, [email.toLowerCase()], (err, user) => {
            if (err || !user) {
                return resolve({ success: false, message: "Email không tồn tại!" });
            }

            if (user.password !== password) {
                return resolve({ success: false, message: "Sai mật khẩu!" });
            }

            // Tạo token: owner_{id}_{random 16 ký tự}
            const randomPart = crypto.randomBytes(8).toString('hex');
            const token = `id_${user.id}_${randomPart}`;

            resolve({
                success: true,
                message: "Đăng nhập thành công!",
                token: token,
                user: {
                    id: user.id,
                    full_name: user.full_name,
                    role: 'owner',
                }
            });
        });
    });
}

/* ============================================================
   LOGIN VIEWER
============================================================ */
/* ============================================================
   LOGIN VIEWER
============================================================ */
/* ============================================================
   LOGIN VIEWER - CÓ KIỂM TRA PASSWORD
============================================================ */
function loginViewer(db, viewerCode, password) {
    return new Promise((resolve) => {
        db.get(`SELECT * FROM users WHERE viewer_code = ? AND role = 'viewer'`, [viewerCode.toUpperCase()], (err, user) => {
            if (err || !user) {
                return resolve({ success: false, message: "Mã Viewer không hợp lệ!" });
            }

            // Kiểm tra password
            if (!password) {
                return resolve({ success: false, message: "Vui lòng nhập mật khẩu!" });
            }

            // Hash password nhập vào
            const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

            // So sánh với password_hash trong database
            if (user.password_hash !== passwordHash) {
                return resolve({ success: false, message: "Mật khẩu không đúng!" });
            }

            // Đăng nhập thành công - Tạo token
            const randomPart = crypto.randomBytes(8).toString('hex');
            const token = `viewer_${user.id}_${randomPart}`;

            resolve({
                success: true,
                message: "Đăng nhập Viewer thành công!",
                token: token,
                user: {
                    id: user.id,
                    full_name: user.full_name,
                    role: 'viewer',
                    owner_id: user.owner_id
                }
            });
        });
    });
}
module.exports = {
    register,
    loginOwner,
    loginViewer
};
