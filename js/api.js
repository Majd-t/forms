const API_BASE = '/backend';

class Api {
    static async request(endpoint, method = 'GET', data = null) {
        const url = `${API_BASE}${endpoint}`;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        const token = localStorage.getItem('form_token');
        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        if (data) {
            options.body = JSON.stringify(data);
        }

        // Include credentials for sessions
        options.credentials = 'include';

        try {
            const response = await fetch(url, options);
            const result = await response.json();
            
            if (!response.ok) {
                if (response.status === 401 && !url.includes('/auth/login') && !url.includes('/auth/register')) {
                    // Unauthorized, maybe redirect to login if not public
                    if (!window.location.pathname.includes('login.html') && !window.location.pathname.includes('register.html') && !window.location.pathname.includes('form.html')) {
                        window.location.href = 'login.html';
                    }
                }
                throw new Error(result.message || 'حدث خطأ ما');
            }
            return result;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    static async get(endpoint) {
        return this.request(endpoint, 'GET');
    }

    static async post(endpoint, data) {
        return this.request(endpoint, 'POST', data);
    }

    static async put(endpoint, data) {
        return this.request(endpoint, 'PUT', data);
    }

    static async delete(endpoint) {
        return this.request(endpoint, 'DELETE');
    }
}

const UI = {
    toast(message, type = 'success') {
        let el = document.getElementById('toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'toast';
            el.className = 'toast';
            document.body.appendChild(el);
        }
        
        el.textContent = message;
        el.className = `toast show ${type}`;
        
        setTimeout(() => {
            el.classList.remove('show');
        }, 3000);
    },

    showLoader(btn) {
        if (!btn) return;
        const originalText = btn.innerHTML;
        btn.setAttribute('data-original', originalText);
        btn.innerHTML = `<span class="loader"></span>`;
        btn.disabled = true;
    },

    hideLoader(btn) {
        if (!btn) return;
        const originalText = btn.getAttribute('data-original');
        if (originalText) {
            btn.innerHTML = originalText;
        }
        btn.disabled = false;
    }
};

// Check Auth state immediately for protected pages
async function checkAuth() {
    const path = window.location.pathname;
    
    // Public pages: login, register, and public form pages
    // Public forms are served at /{code} (no .html in path) or directly as form.html
    const isLoginPage = path.includes('login.html');
    const isRegisterPage = path.includes('register.html');
    const isFormPage = path.includes('form.html');
    
    // Detect clean public form URL: /forms_db/{code} — a short alphanumeric segment
    const pathParts = path.split('/').filter(Boolean);
    const lastSegment = pathParts[pathParts.length - 1];
    const isCleanFormUrl = lastSegment && /^[a-zA-Z0-9]{4,}$/.test(lastSegment) && !lastSegment.includes('.');
    
    const isPublic = isLoginPage || isRegisterPage || isFormPage || isCleanFormUrl;
                     
    if (!isPublic) {
        try {
            await Api.get('/auth/me');
        } catch (e) {
            window.location.href = 'login.html';
        }
    } else if (isLoginPage || isRegisterPage) {
        try {
            await Api.get('/auth/me');
            window.location.href = 'index.html'; // already logged in
        } catch (e) {
            // expected
        }
    }
}

// Log out
async function logout() {
    try {
        await Api.post('/auth/logout');
        localStorage.removeItem('form_token');
        window.location.href = 'login.html';
    } catch (e) {
        UI.toast('فشل تسجيل الخروج', 'error');
    }
}

// Global init
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }
});
