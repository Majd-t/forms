document.addEventListener('DOMContentLoaded', () => {
    
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const btn = document.getElementById('loginBtn');
            
            UI.showLoader(btn);
            try {
                const res = await Api.post('/auth/login', { email, password });
                if (res.token) {
                    localStorage.setItem('form_token', res.token);
                }
                UI.toast('تم تسجيل الدخول بنجاح');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1000);
            } catch (err) {
                UI.toast(err.message, 'error');
            } finally {
                UI.hideLoader(btn);
            }
        });
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const btn = document.getElementById('registerBtn');
            
            UI.showLoader(btn);
            try {
                await Api.post('/auth/register', { name, email, password });
                UI.toast('تم التسجيل بنجاح. يرجى تسجيل الدخول.');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1500);
            } catch (err) {
                UI.toast(err.message, 'error');
            } finally {
                UI.hideLoader(btn);
            }
        });
    }
});
