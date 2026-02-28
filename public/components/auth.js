// public/components/auth.js

/* ============================================
    1. HIỆN / ẨN MẬT KHẨU
============================================ */
window.togglePassword = function (id) {
    const input = document.getElementById(id);
    const button = event.currentTarget;
    const icon = button.querySelector("i");

    if (!input) return;

    if (input.type === "password") {
        input.type = "text";
        icon.classList.replace("fa-eye", "fa-eye-slash");
    } else {
        input.type = "password";
        icon.classList.replace("fa-eye-slash", "fa-eye");
    }
};

/* ============================================
    2. CHUYỂN ĐỔI FORM LOGIN / REGISTER 
============================================ */
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const toggleBtn = document.getElementById("toggleBtn");
const toggleText = document.getElementById("toggleText");

toggleBtn.addEventListener("click", () => {
    const isLoginVisible = !loginForm.classList.contains("hidden");

    if (isLoginVisible) {
        loginForm.classList.add("hidden");
        registerForm.classList.remove("hidden");
        toggleText.textContent = "Đã có tài khoản?";
        toggleBtn.textContent = "Đăng Nhập";
    } else {
        registerForm.classList.add("hidden");
        loginForm.classList.remove("hidden");
        toggleText.textContent = "Chưa có tài khoản?";
        toggleBtn.textContent = "Đăng Ký";
    }
});

/* ============================================
    3. UI LOGIN THEO ROLE (owner / viewer)
============================================ */
const roleSelect = document.getElementById("loginRole");
const viewercodeInput = document.getElementById("viewercode");
const loginEmailInput = document.getElementById("loginUsername");
const loginPasswordInput = document.getElementById("loginPassword");

function updateLoginUI() {
    const role = roleSelect.value;

    if (role === "owner") {
        // Owner: hiện email + password, ẩn viewer code
        viewercodeInput.parentElement.style.display = "none";
        loginEmailInput.parentElement.style.display = "block";
        loginPasswordInput.parentElement.style.display = "block";

        loginEmailInput.required = true;
        loginPasswordInput.required = true;
        viewercodeInput.required = false;

    } else {
        // Viewer: hiện viewer code + password, ẩn email
        viewercodeInput.parentElement.style.display = "block";
        loginEmailInput.parentElement.style.display = "none";
        loginPasswordInput.parentElement.style.display = "block";

        viewercodeInput.required = true;
        loginPasswordInput.required = true;
        loginEmailInput.required = false;
    }
}

// Chạy khi load
updateLoginUI();
// Chạy khi đổi role
roleSelect.addEventListener("change", updateLoginUI);

/* ============================================
    4. REGISTER OWNER
============================================ */
document.getElementById("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const full_name = document.getElementById("registerFullname").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value.trim();
    const confirm = document.getElementById("registerConfirmPassword").value.trim();

    const errBox = document.getElementById("registerError");
    const successBox = document.getElementById("registerSuccess");

    errBox.textContent = "";
    successBox.style.display = "none";

    try {
        const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ full_name, email, password, confirm })
        });

        const data = await res.json();

        if (!data.success) {
            errBox.textContent = data.message;
            return;
        }

        successBox.style.display = "block";
        successBox.textContent = `Đăng ký thành công! Vui lòng đăng nhập.`;

    } catch (e) {
        errBox.textContent = "Không thể kết nối server.";
    }
});

/* ============================================
    5. LOGIN OWNER / VIEWER
============================================ */
document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const role = roleSelect.value;
    const errBox = document.getElementById("loginError");
    errBox.textContent = "";

    let payload = {};

    if (role === "owner") {
        // Owner: email + password
        payload = {
            role: "owner",
            email: loginEmailInput.value.trim(),
            password: loginPasswordInput.value.trim()
        };
    } else {
        // Viewer: viewer_code + password
        payload = {
            role: "viewer",
            viewerCode: viewercodeInput.value.trim(),
            password: loginPasswordInput.value.trim()
        };
    }

    try {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!data.success) {
            errBox.textContent = data.message;
            return;
        }

        // Lưu thông tin vào localStorage
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('userName', data.user.full_name);
        localStorage.setItem('userRole', data.user.role);

        // Redirect to dashboard
        window.location.href = "/dashboard";

    } catch (e) {
        errBox.textContent = "Không thể kết nối server.";
    }
});