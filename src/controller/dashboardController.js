// src/controller/dashboardController.js

function getDb(req) {
  return req.app.get('db');
}

function getDashboardStats(req, res) {
  const db = getDb(req);
  const userId = req.user.id;
  const userRole = req.user.role;

  // Nếu là viewer, lấy owner_id của viewer
  if (userRole === 'viewer') {
    db.get(`SELECT owner_id FROM users WHERE id = ?`, [userId], (err, userRow) => {
      if (err || !userRow || !userRow.owner_id) {
        return res.status(403).json({ 
          success: false, 
          message: 'Không tìm thấy owner của viewer này' 
        });
      }
      
      // Gọi hàm fetch stats với owner_id đúng
      fetchDashboardStats(db, userRow.owner_id, res);
    });
    return;
  }

  // Owner xem stats của chính mình
  fetchDashboardStats(db, userId, res);
}

// Hàm helper fetch stats
function fetchDashboardStats(db, ownerId, res) {
  const sqlSummary = `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN gender = 'Nam' THEN 1 ELSE 0 END) AS males,
      SUM(CASE WHEN gender = 'Nữ' THEN 1 ELSE 0 END) AS females,
      MAX(generation) AS maxGeneration
    FROM people
    WHERE owner_id = ?;
  `;

  db.get(sqlSummary, [ownerId], (err, row) => {
    if (err) {
      console.error('Lỗi query tổng quan:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }

    const total = row.total || 0;
    const males = row.males || 0;
    const females = row.females || 0;
    const maxGeneration = row.maxGeneration || 0;

    // Phân bố thế hệ
    const sqlGen = `
      SELECT generation, COUNT(*) AS count
      FROM people
      WHERE owner_id = ?
      GROUP BY generation
      ORDER BY generation ASC;
    `;
    
    db.all(sqlGen, [ownerId], (err2, genRows) => {
      if (err2) {
        console.error('Lỗi query generations:', err2.message);
        return res.status(500).json({ success: false, message: 'Lỗi server' });
      }

      const generations = genRows.map(r => ({
        generation: r.generation,
        count: r.count
      }));

      // Sinh nhật sắp tới
      const sqlBirthday = `
        SELECT id, full_name, birth_date
        FROM people
        WHERE owner_id = ?
          AND is_alive = 1
          AND birth_date IS NOT NULL
          AND birth_date != ''
      `;
      
      db.all(sqlBirthday, [ownerId], (err3, birthdayRows) => {
        if (err3) {
          console.error('Lỗi query birthdays:', err3.message);
          return res.status(500).json({ success: false, message: 'Lỗi server' });
        }

        const upcomingBirthdays = calcUpcomingBirthdays(birthdayRows, 45);

        // Query ngày giỗ
        const sqlDeceased = `
          SELECT id, full_name, birth_date, death_date, is_alive
          FROM people
          WHERE owner_id = ?
            AND is_alive = 0
            AND death_date IS NOT NULL
            AND death_date != ''
        `;
        
        db.all(sqlDeceased, [ownerId], (err4, deceasedRows) => {
          if (err4) {
            console.error('Lỗi query death anniversaries:', err4.message);
            return res.status(500).json({ success: false, message: 'Lỗi server' });
          }

          const upcomingDeathAnniversaries = calcUpcomingDeathAnniversaries(deceasedRows, 45);

          // Lấy activity logs
          const sqlActivities = `
            SELECT id, actor_name, actor_role, action_type, entity_type, 
                   entity_name, description, created_at
            FROM activity_logs
            WHERE owner_id = ?
            ORDER BY created_at DESC
            LIMIT 10
          `;

          db.all(sqlActivities, [ownerId], (err5, activityRows) => {
            if (err5) {
              console.error('Lỗi query activities:', err5.message);
              activityRows = [];
            }

            // RETURN TẤT CẢ DỮ LIỆU
            return res.json({
              success: true,
              stats: {
                total,
                males,
                females,
                maxGeneration,
                generations,
                upcomingBirthdays,
                upcomingDeathAnniversaries, // ← ĐÃ ĐƯỢC ĐỊNH NGHĨA
                activities: activityRows
              }
            });
          });
        });
      });
    });
  });
}

// Tính sinh nhật sắp tới
function calcUpcomingBirthdays(rows, daysAhead) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return rows
    .map(r => {
      if (!r.birth_date) return null;

      const birth = new Date(r.birth_date);
      let next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());

      if (next < today) {
        next = new Date(today.getFullYear() + 1, birth.getMonth(), birth.getDate());
      }

      const diffMs = next - today;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      return {
        id: r.id,
        full_name: r.full_name,
        birthday: r.birth_date,
        daysLeft: diffDays,
        nextBirthday: formatDateLocal(next)
      };
    })
    .filter(x => x && x.daysLeft >= 0 && x.daysLeft <= daysAhead)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

// Tính ngày giỗ sắp tới
function calcUpcomingDeathAnniversaries(rows, daysAhead) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return rows
    .map(r => {
      if (!r.death_date) return null;

      const death = new Date(r.death_date);
      let next = new Date(today.getFullYear(), death.getMonth(), death.getDate());

      if (next < today) {
        next = new Date(today.getFullYear() + 1, death.getMonth(), death.getDate());
      }

      const diffMs = next - today;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const yearsPassed = today.getFullYear() - death.getFullYear();

      return {
        id: r.id,
        full_name: r.full_name,
        death_date: r.death_date,
        daysLeft: diffDays,
        nextAnniversary: formatDateLocal(next),
        yearCount: yearsPassed
      };
    })
    .filter(x => x && x.daysLeft >= 0 && x.daysLeft <= daysAhead)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

// Helper format date
function formatDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

module.exports = {
  getDashboardStats
};