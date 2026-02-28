// src/controller/settingsController.js
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { logActivity } = require('../utils/activityLogger');
function getDb(req) {
  return req.app.get('db');
}

// ============================================================
// CẤU HÌNH MULTER CHO UPLOAD FILE
// ============================================================
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Chỉ chấp nhận file CSV
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file CSV'));
    }
  }
});

/* ============================================================
   1. XUẤT PDF GIA PHẢ
============================================================ */
function exportPDF(req, res) {
  const db = getDb(req);
  const ownerId = req.user.id;

  // Lấy tất cả thành viên
  const sql = `
    SELECT id, full_name, gender, birth_date, death_date, is_alive,
           generation, notes, phone, job, address
    FROM people
    WHERE owner_id = ?
    ORDER BY generation ASC, full_name ASC
  `;

  db.all(sql, [ownerId], (err, members) => {
    if (err) {
      console.error('Lỗi exportPDF:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }

    try {
      // Tạo PDF document
      const doc = new PDFDocument({ margin: 50 });

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=gia-pha.pdf');

      // Pipe PDF vào response
      doc.pipe(res);

      // Tiêu đề
      doc.fontSize(24)
         .text('GIA PHA DONG HO', { align: 'center' })
         .moveDown();

      doc.fontSize(12)
         .text(`Ngay xuat: ${new Date().toLocaleDateString('vi-VN')}`, { align: 'center' })
         .moveDown(2);

      // Thống kê tổng quan
      const total = members.length;
      const males = members.filter(m => m.gender === 'Nam').length;
      const females = members.filter(m => m.gender === 'Nữ').length;
      const living = members.filter(m => m.is_alive === 1).length;

      doc.fontSize(14)
         .text('THONG KE TONG QUAN', { underline: true })
         .moveDown(0.5);

      doc.fontSize(11)
         .text(`Tong so thanh vien: ${total}`)
         .text(`Nam: ${males} nguoi`)
         .text(`Nu: ${females} nguoi`)
         .text(`Dang song: ${living} nguoi`)
         .moveDown(2);

      // Danh sách thành viên theo thế hệ
      doc.fontSize(14)
         .text('DANH SACH THANH VIEN', { underline: true })
         .moveDown(0.5);

      // Nhóm theo thế hệ
      const generations = {};
      members.forEach(m => {
        const gen = m.generation || 0;
        if (!generations[gen]) {
          generations[gen] = [];
        }
        generations[gen].push(m);
      });

      // In từng thế hệ
      Object.keys(generations).sort((a, b) => a - b).forEach(gen => {
        doc.fontSize(12)
           .text(`\nDoi ${gen}:`, { bold: true })
           .moveDown(0.3);

        generations[gen].forEach(member => {
          const statusIcon = member.is_alive ? 'Song' : 'Mat';
          const genderIcon = member.gender === 'Nam' ? 'Nam' : 'Nu';
          
          doc.fontSize(10)
             .text(`[${statusIcon}] ${member.full_name} (${genderIcon})`, { continued: true })
             .fontSize(9)
             .fillColor('#666666')
             .text(` - ${member.birth_date || 'N/A'} den ${member.death_date || 'N/A'}`)
             .fillColor('#000000');

          if (member.phone) {
            doc.fontSize(9)
               .fillColor('#666666')
               .text(`   SDT: ${member.phone}`)
               .fillColor('#000000');
          }

          if (member.job) {
            doc.fontSize(9)
               .fillColor('#666666')
               .text(`   Nghe: ${member.job}`)
               .fillColor('#000000');
          }

          doc.moveDown(0.5);

          // Xuống trang mới nếu gần hết trang
          if (doc.y > 700) {
            doc.addPage();
          }
        });
      });

      // Footer
      doc.fontSize(8)
         .fillColor('#999999')
         .text(`Xuat tu he thong Gia Pha Online - ${new Date().toISOString()}`, 
               50, doc.page.height - 50, { align: 'center' });

      // Kết thúc PDF
      doc.end();
// ===== THÊM LOG HOẠT ĐỘNG =====
logActivity(db, {
  owner_id: ownerId,
  actor_id: ownerId,
  actor_role: 'owner',
  actor_name: 'Admin',
  action_type: 'create',
  entity_type: 'setting',
  entity_name: 'Export PDF',
  description: `Đã xuất gia phả ra file PDF (${total} thành viên)`
});
    } catch (error) {
      console.error('Lỗi tạo PDF:', error);
      return res.status(500).json({ success: false, message: 'Lỗi tạo PDF' });
    }
  });
}

/* ============================================================
   2. NHẬP DỮ LIỆU TỪ CSV
============================================================ */
/* ============================================================
   2. NHẬP DỮ LIỆU TỪ CSV - HOÀN CHỈNH
============================================================ */
function importCSV(req, res) {
  const db = getDb(req);
  const ownerId = req.user.id;

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Chưa chọn file' });
  }

  try {
    const csvContent = req.file.buffer.toString('utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true // Xử lý UTF-8 BOM
    });

    if (records.length === 0) {
      return res.status(400).json({ success: false, message: 'File CSV rỗng' });
    }

    // ✅ VALIDATE CÁC CỘT BẮT BUỘC
    const requiredColumns = ['full_name', 'gender', 'birth_date'];
    const csvColumns = Object.keys(records[0]);
    const missingColumns = requiredColumns.filter(col => !csvColumns.includes(col));

    if (missingColumns.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `❌ Thiếu các cột bắt buộc: ${missingColumns.join(', ')}\n\n📋 Cần có: full_name, gender, birth_date` 
      });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // ✅ MAP để lưu tên → ID (cho relationships & marriages)
    const nameToIdMap = {};

    // ===== GIAI ĐOẠN 1: INSERT TẤT CẢ MEMBERS =====
    console.log('📥 Bắt đầu import members...');

    const insertPromises = records.map((row, index) => {
      return new Promise((resolve) => {
        const {
          full_name, gender, birth_date, death_date,
          generation, notes, phone, job, address
        } = row;

        // Validate tên
        if (!full_name || !full_name.trim()) {
          errors.push(`Dòng ${index + 2}: ❌ Thiếu họ tên`);
          errorCount++;
          resolve();
          return;
        }

        // Validate giới tính
        if (!gender || !['Nam', 'Nữ', 'nam', 'nữ'].includes(gender)) {
          errors.push(`Dòng ${index + 2}: ❌ Giới tính phải là 'Nam' hoặc 'Nữ' (hiện tại: "${gender}")`);
          errorCount++;
          resolve();
          return;
        }

        // Chuẩn hóa giới tính
        const normalizedGender = gender === 'Nam' || gender === 'nam' ? 'Nam' : 'Nữ';

        // Validate ngày sinh
        if (!birth_date || birth_date.trim() === '') {
          errors.push(`Dòng ${index + 2}: ❌ Thiếu ngày sinh`);
          errorCount++;
          resolve();
          return;
        }

        // Validate format ngày (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(birth_date)) {
          errors.push(`Dòng ${index + 2}: ❌ Ngày sinh sai format, cần YYYY-MM-DD (ví dụ: 2000-01-15)`);
          errorCount++;
          resolve();
          return;
        }

        const is_alive = death_date ? 0 : 1;

        const sql = `
          INSERT INTO people (
            owner_id, full_name, gender, birth_date, death_date, is_alive,
            generation, notes, phone, job, address
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.run(sql, [
          ownerId,
          full_name.trim(),
          normalizedGender,
          birth_date.trim(),
          death_date ? death_date.trim() : null,
          is_alive,
          generation ? parseInt(generation) : null,
          notes ? notes.trim() : null,
          phone ? phone.trim() : null,
          job ? job.trim() : null,
          address ? address.trim() : null
        ], function(err) {
          if (err) {
            console.error(`❌ Lỗi insert dòng ${index + 2}:`, err.message);
            errors.push(`Dòng ${index + 2}: ${err.message}`);
            errorCount++;
          } else {
            successCount++;
            nameToIdMap[full_name.trim()] = this.lastID;
            console.log(`✅ Đã thêm: ${full_name.trim()} (ID: ${this.lastID})`);
          }
          resolve();
        });
      });
    });

    // Chờ tất cả insert hoàn tất
    Promise.all(insertPromises).then(() => {
      console.log(`\n📊 Hoàn tất INSERT: ${successCount} thành công, ${errorCount} lỗi`);

     // ===== GIAI ĐOẠN 2: TẠO RELATIONSHIPS & MARRIAGES =====
let relationCount = 0;
let marriageCount = 0;
let relationErrors = [];

const relationPromises = records.map((row, index) => {
  return new Promise((resolve) => {
    const childName = row.full_name.trim();
    const parentName = row.parent_name ? row.parent_name.trim() : null;
    const spouseName = row.spouse_name ? row.spouse_name.trim() : null;

    const childId = nameToIdMap[childName];

    if (!childId) {
      resolve();
      return;
    }

    // ✅ TẠO RELATIONSHIP (cha/mẹ → con)
    if (parentName) {
      const parentId = nameToIdMap[parentName];

      if (!parentId) {
        relationErrors.push(`Dòng ${index + 2}: ⚠️ Không tìm thấy cha/mẹ "${parentName}" cho "${childName}"`);
        resolve();
        return;
      }

      const sqlRel = `
        INSERT OR IGNORE INTO relationships (parent_id, child_id, relation_type)
        VALUES (?, ?, 'ruot')
      `;

      db.run(sqlRel, [parentId, childId], function(errRel) {
        if (errRel) {
          console.error(`❌ Lỗi tạo relationship dòng ${index + 2}:`, errRel.message);
        } else if (this.changes > 0) {
          relationCount++;
          console.log(`✅ Relationship: ${parentName} → ${childName}`);
        }

        // ✅ TẠO MARRIAGE (vợ ↔ chồng)
        if (spouseName) {
          const spouseId = nameToIdMap[spouseName];

          if (!spouseId) {
            relationErrors.push(`Dòng ${index + 2}: ⚠️ Không tìm thấy vợ/chồng "${spouseName}" cho "${childName}"`);
            resolve();
            return;
          }

          // Lấy giới tính
          db.get(`SELECT gender FROM people WHERE id = ?`, [childId], (errG, person) => {
            if (errG || !person) {
              resolve();
              return;
            }

            let husbandId, wifeId;

            if (person.gender === 'Nam') {
              husbandId = childId;
              wifeId = spouseId;
            } else {
              husbandId = spouseId;
              wifeId = childId;
            }

            const sqlMarriage = `
              INSERT OR IGNORE INTO marriages (husband_id, wife_id)
              VALUES (?, ?)
            `;

            db.run(sqlMarriage, [husbandId, wifeId], function(errMar) {
              if (errMar) {
                console.error(`❌ Lỗi tạo marriage dòng ${index + 2}:`, errMar.message);
              } else if (this.changes > 0) {
                marriageCount++;
                console.log(`💑 Marriage: ${childName} ↔ ${spouseName}`);
              }
              resolve();
            });
          });
        } else {
          resolve();
        }
      });
    } else if (spouseName) {
      // Trường hợp chỉ có spouse_name mà không có parent_name
      const spouseId = nameToIdMap[spouseName];

      if (!spouseId) {
        relationErrors.push(`Dòng ${index + 2}: ⚠️ Không tìm thấy vợ/chồng "${spouseName}" cho "${childName}"`);
        resolve();
        return;
      }

      db.get(`SELECT gender FROM people WHERE id = ?`, [childId], (errG, person) => {
        if (errG || !person) {
          resolve();
          return;
        }

        let husbandId, wifeId;

        if (person.gender === 'Nam') {
          husbandId = childId;
          wifeId = spouseId;
        } else {
          husbandId = spouseId;
          wifeId = childId;
        }

        const sqlMarriage = `
          INSERT OR IGNORE INTO marriages (husband_id, wife_id)
          VALUES (?, ?)
        `;

        db.run(sqlMarriage, [husbandId, wifeId], function(errMar) {
          if (errMar) {
            console.error(`❌ Lỗi tạo marriage dòng ${index + 2}:`, errMar.message);
          } else if (this.changes > 0) {
            marriageCount++;
            console.log(`💑 Marriage: ${childName} ↔ ${spouseName}`);
          }
          resolve();
        });
      });
    } else {
      resolve();
    }
  });
});

Promise.all(relationPromises).then(() => {
  console.log(`\n✅ HOÀN TẤT IMPORT!`);
  console.log(`📊 Thống kê:`);
  console.log(`   - Thành viên: ${successCount}`);
  console.log(`   - Quan hệ: ${relationCount}`);
  console.log(`   - Hôn nhân: ${marriageCount}`);
  console.log(`   - Lỗi: ${errorCount}`);

  return res.json({
    success: true,
    message: `✅ Import hoàn tất!`,
    successCount,
    errorCount,
    relationCount,
    marriageCount,
    errors: [...errors, ...relationErrors].slice(0, 20),
    warnings: relationErrors
  });
});
    });

  } catch (error) {
    console.error('❌ Lỗi importCSV:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Lỗi xử lý file CSV: ' + error.message 
    });
  }
}
/* ============================================================
   3. RESET DỮ LIỆU VỀ MẪU BAN ĐẦU
============================================================ */
function resetData(req, res) {
  const db = getDb(req);
  const ownerId = req.user.id;

  // Xóa toàn bộ dữ liệu của owner này
  db.run(`DELETE FROM relationships WHERE child_id IN (SELECT id FROM people WHERE owner_id = ?)`, [ownerId]);
  db.run(`DELETE FROM marriages WHERE husband_id IN (SELECT id FROM people WHERE owner_id = ?) OR wife_id IN (SELECT id FROM people WHERE owner_id = ?)`, [ownerId, ownerId]);
  db.run(`DELETE FROM people WHERE owner_id = ?`, [ownerId], function(err) {
    if (err) {
      console.error('Lỗi xóa dữ liệu:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi xóa dữ liệu' });
    }

    // Load lại dữ liệu mẫu
    loadSampleData(db, ownerId, (errLoad) => {
      if (errLoad) {
        return res.status(500).json({ success: false, message: 'Lỗi load dữ liệu mẫu' });
      }
       // ===== THÊM LOG HOẠT ĐỘNG =====
    logActivity(db, {
      owner_id: ownerId,
      actor_id: ownerId,
      actor_role: 'owner',
      actor_name: 'Admin',
      action_type: 'delete',
      entity_type: 'setting',
      entity_name: 'Reset Data',
      description: `Đã reset toàn bộ dữ liệu và load lại dữ liệu mẫu`
    });

      return res.json({ success: true, message: 'Đã reset dữ liệu về mẫu ban đầu' });
    });
  });
}

/* ============================================================
   4. HÀM LOAD DỮ LIỆU MẪU
============================================================ */
function loadSampleData(db, ownerId, callback) {
  // Thế hệ 1 (thủy tổ)
  const gen1 = [
    { full_name: 'Nguyễn Văn A', gender: 'Nam', birth_date: '1880-01-15', death_date: '1945-08-20', generation: 1, notes: 'Thủy tổ' },
    { full_name: 'Trần Thị B', gender: 'Nữ', birth_date: '1885-03-10', death_date: '1952-06-12', generation: 1, notes: 'Vợ cụ A' }
  ];

  // Thế hệ 2
  const gen2 = [
    { full_name: 'Nguyễn Văn C', gender: 'Nam', birth_date: '1905-04-20', death_date: '1975-12-30', generation: 2 },
    { full_name: 'Lê Thị D', gender: 'Nữ', birth_date: '1910-07-05', death_date: '1980-02-14', generation: 2 },
    { full_name: 'Nguyễn Thị E', gender: 'Nữ', birth_date: '1908-11-18', death_date: '1990-09-22', generation: 2 }
  ];

  // Thế hệ 3
  const gen3 = [
    { full_name: 'Nguyễn Văn F', gender: 'Nam', birth_date: '1930-01-25', death_date: null, generation: 3 },
    { full_name: 'Phạm Thị G', gender: 'Nữ', birth_date: '1935-06-08', death_date: null, generation: 3 },
    { full_name: 'Nguyễn Văn H', gender: 'Nam', birth_date: '1940-05-17', death_date: null, generation: 3 }
  ];

  const allPeople = [...gen1, ...gen2, ...gen3];
  let insertCount = 0;

  allPeople.forEach(person => {
    const is_alive = person.death_date ? 0 : 1;
    
    const sql = `
      INSERT INTO people (
        owner_id, full_name, gender, birth_date, death_date, is_alive, generation, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [
      ownerId,
      person.full_name,
      person.gender,
      person.birth_date,
      person.death_date,
      is_alive,
      person.generation,
      person.notes || null
    ], function(err) {
      if (err) {
        console.error('Lỗi insert sample:', err.message);
      }
      
      insertCount++;
      
      if (insertCount === allPeople.length) {
        callback(null);
      }
    });
  });
}
/* ============================================================
   4. XÓA TOÀN BỘ THÀNH VIÊN - CHỈ OWNER
============================================================ */
function deleteAllMembers(req, res) {
  const db = getDb(req);
  const ownerId = req.user.id;
  const userRole = req.user.role;

  // ✅ CHỈ OWNER MỚI ĐƯỢC XÓA
  if (userRole !== 'owner') {
    return res.status(403).json({ 
      success: false, 
      message: '⛔ Chỉ Admin mới có quyền xóa toàn bộ thành viên' 
    });
  }

  // ✅ XÓA THEO THỨ TỰ: relationships → marriages → people
  
  // 1. Xóa relationships
  db.run(`DELETE FROM relationships WHERE child_id IN (SELECT id FROM people WHERE owner_id = ?)`, [ownerId], (errRel) => {
    if (errRel) {
      console.error('Lỗi xóa relationships:', errRel.message);
      return res.status(500).json({ success: false, message: 'Lỗi xóa quan hệ' });
    }

    // 2. Xóa marriages
    db.run(`DELETE FROM marriages WHERE husband_id IN (SELECT id FROM people WHERE owner_id = ?) OR wife_id IN (SELECT id FROM people WHERE owner_id = ?)`, 
      [ownerId, ownerId], (errMar) => {
        if (errMar) {
          console.error('Lỗi xóa marriages:', errMar.message);
          return res.status(500).json({ success: false, message: 'Lỗi xóa hôn nhân' });
        }

        // 3. Đếm số thành viên trước khi xóa
        db.get(`SELECT COUNT(*) as count FROM people WHERE owner_id = ?`, [ownerId], (errCount, row) => {
          const deletedCount = row ? row.count : 0;

          // 4. Xóa people
          db.run(`DELETE FROM people WHERE owner_id = ?`, [ownerId], function(errPeople) {
            if (errPeople) {
              console.error('Lỗi xóa people:', errPeople.message);
              return res.status(500).json({ success: false, message: 'Lỗi xóa thành viên' });
            }

            // ✅ LOG HOẠT ĐỘNG
            logActivity(db, {
              owner_id: ownerId,
              actor_id: ownerId,
              actor_role: 'owner',
              actor_name: 'Admin',
              action_type: 'delete',
              entity_type: 'setting',
              entity_name: 'Delete All Members',
              description: `Đã xóa toàn bộ ${deletedCount} thành viên khỏi gia phả`
            });

            return res.json({ 
              success: true, 
              message: `✅ Đã xóa toàn bộ ${deletedCount} thành viên`,
              deletedCount: deletedCount
            });
          });
        });
      }
    );
  });
}
/* ============================================================
   EXPORT TẤT CẢ - CHỈ 1 LẦN DUY NHẤT Ở CUỐI FILE
============================================================ */
module.exports = {
  exportPDF,
  importCSV,
  uploadMiddleware: upload.single('file'),
  resetData,
  deleteAllMembers  // ← THÊM DÒNG NÀY
};