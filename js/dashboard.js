document.addEventListener('DOMContentLoaded', () => {
    loadUser();
    loadForms();

    document.getElementById('createFormBtn').addEventListener('click', () => {
        document.getElementById('createModal').style.display = 'flex';
        document.getElementById('newFormTitle').focus();
    });

    document.getElementById('cancelCreateBtn').addEventListener('click', () => {
        document.getElementById('createModal').style.display = 'none';
        document.getElementById('newFormTitle').value = '';
    });

    document.getElementById('confirmCreateBtn').addEventListener('click', async () => {
        const title = document.getElementById('newFormTitle').value.trim();
        if (!title) return UI.toast('يرجى إدخال عنوان النموذج', 'error');

        const btn = document.getElementById('confirmCreateBtn');
        UI.showLoader(btn);
        
        try {
            const res = await Api.post('/forms', {
                title: title,
                description: '',
                settings: { theme: 'light', public: true }
            });
            UI.toast('تم إنشاء النموذج بنجاح');
            window.location.href = `b/${res.public_id}`;
        } catch (err) {
            UI.toast(err.message, 'error');
            UI.hideLoader(btn);
        }
    });

    // Handle enter key in modal
    document.getElementById('newFormTitle').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('confirmCreateBtn').click();
        }
    });
});

async function loadUser() {
    try {
        const user = await Api.get('/auth/me');
        const display = document.getElementById('userNameDisplay');
        if (display) display.textContent = `مرحباً، ${user.name}`;
    } catch (err) {
        // Will be redirected by api.js
    }
}

async function loadForms() {
    const loader = document.getElementById('formsLoading');
    const empty = document.getElementById('formsEmpty');
    const grid = document.getElementById('formsGrid');

    loader.style.display = 'block';
    empty.style.display = 'none';
    grid.innerHTML = '';

    try {
        const forms = await Api.get('/forms');
        loader.style.display = 'none';

        if (forms.length === 0) {
            empty.style.display = 'block';
            return;
        }

        forms.forEach(form => {
            const date = new Date(form.created_at).toLocaleDateString();
            const responsesCount = form.response_count || 0;
            
            const card = document.createElement('div');
            card.className = 'form-card';
            card.innerHTML = `
                <div class="form-card-header">
                    <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--text-main); line-height: 1.3; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${form.title}</h3>
                </div>
                <div class="form-card-body">
                    <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem;">
                        <span class="stat-badge">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                            ${date}
                        </span>
                        <span class="stat-badge badge-success" style="background: var(--success-bg); color: var(--success);">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                            ${responsesCount} ردود
                        </span>
                    </div>
                    
                    <div style="display: flex; gap: 0.75rem;">
                        <button class="btn-primary" style="flex:1" onclick="window.location.href='b/${form.public_id}'">تعديل النموذج</button>
                        <button class="btn-secondary" style="flex:1" onclick="window.location.href='r/${form.public_id}'">النتائج</button>
                    </div>
                </div>
                <div class="form-card-footer">
                    <button class="btn-ghost" style="flex:1; padding: 0.5rem;" onclick="shareForm('${form.public_id}')" title="مشاركة">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                    </button>
                    <button class="btn-ghost" style="flex:1; padding: 0.5rem; color: var(--danger);" onclick="deleteForm(${form.id}, this)" title="حذف">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            `;
            grid.appendChild(card);
        });

    } catch (err) {
        loader.style.display = 'none';
        UI.toast('فشل تحميل النماذج', 'error');
    }
}

async function deleteForm(id, btn) {
    if (!confirm('هل أنت متأكد من حذف هذا النموذج؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    
    UI.showLoader(btn);
    try {
        await Api.delete(`/forms/${id}`);
        UI.toast('تم حذف النموذج');
        loadForms(); // reload
    } catch (err) {
        UI.toast(err.message, 'error');
        UI.hideLoader(btn);
    }
}

function shareForm(publicId) {
    const url = `${window.location.origin}/${publicId}`;
    navigator.clipboard.writeText(url).then(() => {
        UI.toast('تم نسخ الرابط العام للحافظة!');
    }).catch(() => {
        prompt('انسخ هذا الرابط:', url);
    });
}
