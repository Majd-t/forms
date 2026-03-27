const urlParams = new URLSearchParams(window.location.search);
let formId = urlParams.get('code') || urlParams.get('id');
if (!formId) {
    const parts = window.location.pathname.split('/').filter(p => p);
    const last = parts[parts.length - 1];
    if (last && !last.includes('.html')) formId = last;
}

let currentForm = null;
let saveTimeout = null;
let isSaving = false;
let currentCropper = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!formId) {
        window.location.href = 'index.html';
        return;
    }

    await loadForm();

    document.getElementById('formTitle').addEventListener('input', triggerAutoSave);
    document.getElementById('formDesc').addEventListener('input', triggerAutoSave);

    document.getElementById('themeColor').addEventListener('input', (e) => {
        document.documentElement.style.setProperty('--primary', e.target.value);
        triggerAutoSave();
    });

    setupImageUpload();

    document.getElementById('previewBtn').addEventListener('click', () => {
        window.open(`form.html?id=${formId}`, '_blank');
    });

    document.getElementById('shareBtn').addEventListener('click', () => {
        const url = `https://majd-t.github.io/forms/${currentForm.public_id || formId}`;
        navigator.clipboard.writeText(url).then(() => {
            UI.toast('تم نسخ الرابط للحافظة!');
        }).catch(() => {
            prompt('انسخ هذا الرابط:', url);
        });
    });

    const container = document.getElementById('questionsContainer');
    new Sortable(container, {
        animation: 150,
        handle: '.drag-handle',
        onEnd: async function () {
            await updateOrder();
        }
    });

    const confirmBtn = document.getElementById('confirmCropBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            if (!currentCropper) return;
            const btn = document.getElementById('confirmCropBtn');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = 'جاري القص...';
            btn.disabled = true;

            // Allow DOM to update before heavy canvas operation
            setTimeout(() => {
                currentCropper.getCroppedCanvas({
                    width: 1200
                }).toBlob((blob) => {
                    btn.innerHTML = originalHTML;
                    btn.disabled = false;
                    executeImageUploadApi(blob, "cover.jpg");
                    closeCropModal();
                }, 'image/jpeg', 0.85);
            }, 50);
        });
    }
});

function updateStatus(text, loading = false) {
    const status = document.getElementById('saveStatus');
    if (loading) {
        status.innerHTML = `<span class="loader" style="width:14px; height:14px; border-width: 2px;"></span> ${text}`;
    } else {
        status.innerHTML = text;
    }
}

function triggerAutoSave() {
    clearTimeout(saveTimeout);
    updateStatus('جاري الحفظ...', true);
    saveTimeout = setTimeout(saveFormMeta, 1000);
}

async function loadForm() {
    updateStatus('جاري التحميل...', true);
    try {
        currentForm = await Api.get(`/forms/${formId}`);
        document.getElementById('formTitle').value = currentForm.title;
        document.getElementById('formDesc').value = currentForm.description || '';

        if (!currentForm.settings) currentForm.settings = {};
        if (typeof currentForm.settings === 'string') {
            try { currentForm.settings = JSON.parse(currentForm.settings); } catch (e) { currentForm.settings = {}; }
        }

        const isActive = currentForm.settings.is_active !== false;
        document.getElementById('formActiveToggle').checked = isActive;
        if (currentForm.settings.start_date) document.getElementById('formStartDate').value = currentForm.settings.start_date;
        if (currentForm.settings.end_date) document.getElementById('formEndDate').value = currentForm.settings.end_date;

        const tc = currentForm.settings.theme_color || '#000000';
        document.getElementById('themeColor').value = tc;
        document.documentElement.style.setProperty('--primary', tc);

        const hi = currentForm.settings.header_image || '';
        document.getElementById('headerImage').value = hi;
        const previewBg = document.getElementById('coverImagePreview');
        const previewContainer = document.getElementById('coverImagePreviewContainer');
        if (hi) {
            previewBg.style.backgroundImage = `url('${hi}')`;
            if (previewContainer) previewContainer.style.display = 'block';
            document.getElementById('removeCoverBtn').style.display = 'block';
        } else {
            if (previewContainer) previewContainer.style.display = 'none';
            document.getElementById('removeCoverBtn').style.display = 'none';
        }

        renderQuestions();
        updateStatus('تم الحفظ بالكامل');
    } catch (err) {
        UI.toast('فشل تحميل النموذج', 'error');
        updateStatus('خطأ في التحميل');
    }
}

async function saveFormMeta() {
    const title = document.getElementById('formTitle').value.trim() || 'نموذج بدون عنوان';
    const description = document.getElementById('formDesc').value.trim();

    const theme_color = document.getElementById('themeColor').value;
    const header_image = document.getElementById('headerImage').value.trim();
    const is_active = document.getElementById('formActiveToggle').checked;
    const start_date = document.getElementById('formStartDate').value;
    const end_date = document.getElementById('formEndDate').value;
    currentForm.settings = { ...(currentForm.settings || {}), theme_color, header_image, is_active, start_date, end_date };

    try {
        await Api.put(`/forms/${currentForm.id}`, { title, description, settings: currentForm.settings });
        updateStatus('تم الحفظ بالكامل');
    } catch (err) {
        updateStatus('فشل الحفظ');
    }
}

async function updateOrder() {
    updateStatus('جاري الحفظ...', true);
    const nodes = document.querySelectorAll('.question-card');
    let promises = [];
    nodes.forEach((node, index) => {
        const qid = node.getAttribute('data-id');
        promises.push(Api.put(`/questions/${qid}`, { order_index: index }));
    });

    try {
        await Promise.all(promises);
        updateStatus('تم الحفظ بالكامل');
    } catch (e) {
        updateStatus('فشل حفظ الترتيب');
    }
}

async function addQuestion(type = 'text') {
    updateStatus('جاري الحفظ...', true);
    let options = [];
    if (type === 'radio' || type === 'checkbox' || type === 'dropdown') options = ['خيار 1'];
    if (type === 'linear_scale') options = ['سيئ جداً', 'ممتاز'];
    if (type === 'radio_grid' || type === 'checkbox_grid') options = ['R:صف 1', 'C:عمود 1', 'C:عمود 2'];

    let newQ = {
        form_id: currentForm.id,
        type: type,
        label: 'سؤال جديد',
        options: options,
        is_required: 0,
        order_index: currentForm.questions.length
    };

    try {
        const res = await Api.post('/questions', newQ);
        newQ.id = res.id;
        currentForm.questions.push(newQ);
        renderQuestions();
        updateStatus('تم الحفظ بالكامل');

        // Focus new question
        setTimeout(() => {
            const input = document.querySelector(`.question-card[data-id="${res.id}"] .q-label`);
            if (input) {
                input.focus();
                input.select();
            }
        }, 100);
    } catch (e) {
        updateStatus('فشل إضافة السؤال');
        UI.toast('فشل إرسال الطلب', 'error');
    }
}

async function updateQuestion(id, updates) {
    updateStatus('جاري الحفظ...', true);
    const qIndex = currentForm.questions.findIndex(q => q.id == id);
    if (qIndex !== -1) {
        currentForm.questions[qIndex] = { ...currentForm.questions[qIndex], ...updates };

        try {
            await Api.put(`/questions/${id}`, updates);
            updateStatus('تم الحفظ بالكامل');
        } catch (e) {
            updateStatus('فشل الحفظ');
        }
    }
}

async function deleteQuestion(id) {
    if (!confirm('هل أنت متأكد من حذف السؤال؟')) return;
    updateStatus('جاري الحفظ...', true);

    try {
        await Api.delete(`/questions/${id}`);
        currentForm.questions = currentForm.questions.filter(q => q.id != id);
        renderQuestions();
        updateStatus('تم الحفظ بالكامل');
    } catch (e) {
        updateStatus('فشل الحذف');
    }
}

function renderQuestions() {
    const container = document.getElementById('questionsContainer');
    container.innerHTML = '';

    currentForm.questions.forEach((q) => {
        const card = document.createElement('div');
        card.className = 'question-card animate-slide-up';
        card.setAttribute('data-id', q.id);

        let optionsHtml = '';
        if (q.type === 'radio' || q.type === 'checkbox' || q.type === 'dropdown') {
            optionsHtml = `<div class="options-container" id="opts-${q.id}" style="margin-top: 1.5rem; border-top: 1px dashed var(--border-color); padding-top: 1rem;">`;
            const opts = q.options || [];
            opts.forEach((opt, idx) => {
                const icon = q.type === 'radio' ? '○' : (q.type === 'checkbox' ? '□' : `${idx + 1}.`);
                optionsHtml += `
                    <div class="option-row" style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
                        <span style="color:var(--text-light); width: 24px; text-align: center;">${icon}</span>
                        <input type="text" class="form-control" value="${opt}" placeholder="خيار ${idx + 1}" style="flex:1;" oninput="updateOption(${q.id}, ${idx}, this.value)">
                        <button class="btn-ghost btn-icon-only" style="color: var(--danger); opacity: 0.6;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6" onclick="removeOption(${q.id}, ${idx})" tabindex="-1">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                `;
            });
            optionsHtml += `
                <div style="display: flex; align-items: center; gap: 0.75rem; padding-left: calc(24px + 0.75rem); margin-top: 1rem;">
                    <button class="btn-ghost" style="padding: 0.25rem 0.75rem; font-size: 0.85rem; border: 1px dashed var(--border-color);" onclick="addOption(${q.id})">+ إضافة خيار</button>
                </div>
            </div>`;
        }

        if (q.type === 'linear_scale') {
            optionsHtml = `<div class="options-container" id="opts-${q.id}" style="margin-top: 1.5rem; border-top: 1px dashed var(--border-color); padding-top: 1rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1rem;">
                    <div style="flex:1; padding-left:1rem;">
                        <label style="font-size:0.8rem; color:var(--text-muted); display:block; margin-bottom:0.25rem;">التسمية الدنيا (1)</label>
                        <input type="text" class="form-control" value="${(q.options && q.options[0]) || 'سيئ جداً'}" oninput="updateOption(${q.id}, 0, this.value)">
                    </div>
                    <div style="flex:1; padding-right:1rem;">
                        <label style="font-size:0.8rem; color:var(--text-muted); display:block; margin-bottom:0.25rem;">التسمية القصوى (5)</label>
                        <input type="text" class="form-control" value="${(q.options && q.options[1]) || 'ممتاز'}" oninput="updateOption(${q.id}, 1, this.value)">
                    </div>
                </div>
            </div>`;
        }

        if (q.type === 'radio_grid' || q.type === 'checkbox_grid') {
            const opts = q.options || [];
            let rowsHtml = '';
            let colsHtml = '';

            opts.forEach((opt, idx) => {
                const isRow = opt.startsWith('R:');
                const isCol = opt.startsWith('C:');
                if (!isRow && !isCol) return;

                const val = opt.substring(2);
                const html = `
                    <div class="option-row" style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                        <span style="color:var(--text-light); width: 24px; text-align: center;">${isRow ? '≡' : '○'}</span>
                        <input type="text" class="form-control" value="${val}" placeholder="نص..." style="flex:1; padding:0.5rem;" oninput="updateGridOption(${q.id}, ${idx}, '${isRow ? 'R:' : 'C:'}', this.value)">
                        <button class="btn-ghost btn-icon-only" style="color: var(--danger); opacity: 0.6; padding:0.25rem;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6" onclick="removeOption(${q.id}, ${idx})" tabindex="-1">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>`;

                if (isRow) rowsHtml += html;
                if (isCol) colsHtml += html;
            });

            optionsHtml = `<div class="options-container" id="opts-${q.id}" style="margin-top: 1.5rem; border-top: 1px dashed var(--border-color); padding-top: 1rem; display:flex; gap: 2rem;">
                <div style="flex:1;">
                    <h5 style="margin-bottom:0.75rem; color:var(--text-main); font-weight:600; font-size: 0.95rem;">الصفوف</h5>
                    ${rowsHtml}
                    <button class="btn-ghost" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; border: 1px dashed var(--border-color); margin-top:0.5rem;" onclick="addGridOption(${q.id}, 'R:صف جديد')">+ إضافة صف</button>
                </div>
                <div style="width:1px; background:var(--border-color);"></div>
                <div style="flex:1;">
                    <h5 style="margin-bottom:0.75rem; color:var(--text-main); font-weight:600; font-size: 0.95rem;">الأعمدة</h5>
                    ${colsHtml}
                    <button class="btn-ghost" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; border: 1px dashed var(--border-color); margin-top:0.5rem;" onclick="addGridOption(${q.id}, 'C:عمود جديد')">+ إضافة عمود</button>
                </div>
            </div>`;
        }

        let inputHtml = '';
        if (q.type === 'text') inputHtml = `<input type="text" class="form-control" placeholder="نص إجابة قصير" disabled style="margin-top: 1rem; border-bottom: 1px dashed var(--text-light); border-top:none; border-left:none; border-right:none; border-radius: 0; background: transparent; padding-left: 0;">`;
        if (q.type === 'number') inputHtml = `<input type="number" class="form-control" placeholder="إجابة رقمية (مثال: رقم الهاتف أو العمر)" disabled style="margin-top: 1rem; border-bottom: 1px dashed var(--text-light); border-top:none; border-left:none; border-right:none; border-radius: 0; background: transparent; padding-left: 0;">`;
        if (q.type === 'textarea') inputHtml = `<textarea class="form-control" placeholder="نص إجابة طويل" disabled style="margin-top: 1rem; border: 1px dashed var(--text-light); background: var(--bg-main);" rows="3"></textarea>`;
        if (q.type === 'date') inputHtml = `<input type="date" class="form-control" disabled style="margin-top: 1rem; width: 200px;">`;
        if (q.type === 'statement') inputHtml = `<p style="margin-top: 1rem; color: var(--text-muted); font-size: 0.95rem; font-style: italic;">هذا القسم مخصص لعرض النص ولا يتطلب أي إجابة.</p>`;

        if (q.type === 'star_rating') {
            inputHtml = `<div style="display:flex; gap:0.5rem; margin-top:1rem; opacity:0.8; pointer-events:none;">
                ${[1, 2, 3, 4, 5].map(i => `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`).join('')}
            </div>`;
        }

        if (q.type === 'linear_scale') {
            inputHtml = `<div style="display:flex; justify-content:space-between; align-items:center; margin-top:1rem; opacity:0.8; pointer-events:none; padding: 0 1rem;">
                ${[1, 2, 3, 4, 5].map(i => `<div style="display:flex; flex-direction:column; align-items:center; gap:0.5rem;">
                    <span style="font-size:1.1rem; font-weight:600; color:var(--text-main);">${i}</span>
                    <div style="width:24px; height:24px; border-radius:50%; border:2px solid var(--primary);"></div>
                </div>`).join('')}
            </div>`;
        }

        if (q.type === 'file_upload') {
            inputHtml = `<div style="margin-top: 1rem; border: 2px dashed var(--border-color); border-radius: 12px; padding: 2rem; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0.8; pointer-events: none; background: var(--bg-surface);">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5" style="margin-bottom: 0.5rem;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                <span style="font-size: 1rem; font-weight: 500; color: var(--text-main);">منطقة رفع الملفات والمرفقات</span>
            </div>`;
        }

        if (q.type === 'radio_grid' || q.type === 'checkbox_grid') {
            inputHtml = `<div style="margin-top: 1rem; opacity: 0.6; pointer-events: none; background: var(--bg-surface); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-color); display:flex; align-items:center; justify-content:center;">
                <span style="font-size: 0.9rem; color: var(--text-muted);">معاينة الشبكة تظهر في صفحة النموذج مباشرة</span>
            </div>`;
        }

        card.innerHTML = `
            <div class="drag-handle" style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); cursor: grab; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-full); padding: 0.15rem 0.5rem; display: flex; color: var(--text-light); box-shadow: var(--shadow-sm); z-index: 2;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
            </div>
            
            <div class="q-header" style="display: flex; gap: 1.5rem; align-items: flex-start; margin-bottom: 1rem;">
                <div style="flex: 1; display: flex; flex-direction: column;">
                    <input type="text" class="form-control q-label" placeholder="عنوان السؤال" value="${q.label}" style="font-weight: 600; font-size: 1.15rem; border: none; background: transparent; padding: 0.5rem; outline: none; border-bottom: 2px solid transparent; transition: border-color 0.2s;" onfocus="this.style.borderBottomColor='var(--primary)'" onblur="this.style.borderBottomColor='transparent'" oninput="debounceUpdateQ(${q.id}, 'label', this.value)">
                    <input type="text" class="form-control q-desc" placeholder="وصف توضيحي للإجابة (اختياري)" value="${q.description || ''}" style="font-size: 0.9rem; color: var(--text-muted); border: none; background: transparent; padding: 0.5rem; outline: none; border-bottom: 2px solid transparent; transition: border-color 0.2s; margin-top: 0.25rem;" onfocus="this.style.borderBottomColor='var(--primary)'" onblur="this.style.borderBottomColor='transparent'" oninput="debounceUpdateQ(${q.id}, 'description', this.value)">
                </div>
                
                <div style="width: 200px; flex-shrink: 0;">
                    <select class="form-control" style="font-size: 0.9rem; font-weight: 500;" onchange="changeType(${q.id}, this.value)">
                        <option value="text" ${q.type === 'text' ? 'selected' : ''}>إجابة قصيرة</option>
                        <option value="number" ${q.type === 'number' ? 'selected' : ''}>رقم / هاتف</option>
                        <option value="textarea" ${q.type === 'textarea' ? 'selected' : ''}>فقرة</option>
                        <option value="radio" ${q.type === 'radio' ? 'selected' : ''}>خيارات متعددة</option>
                        <option value="checkbox" ${q.type === 'checkbox' ? 'selected' : ''}>مربعات اختيار</option>
                        <option value="dropdown" ${q.type === 'dropdown' ? 'selected' : ''}>قائمة منسدلة</option>
                        <option value="star_rating" ${q.type === 'star_rating' ? 'selected' : ''}>تقييم بالنجوم</option>
                        <option value="linear_scale" ${q.type === 'linear_scale' ? 'selected' : ''}>مقياس خطي</option>
                        <option value="radio_grid" ${q.type === 'radio_grid' ? 'selected' : ''}>شبكة خيارات متعددة</option>
                        <option value="checkbox_grid" ${q.type === 'checkbox_grid' ? 'selected' : ''}>شبكة مربعات اختيار</option>
                        <option value="file_upload" ${q.type === 'file_upload' ? 'selected' : ''}>رفع ملف</option>
                        <option value="date" ${q.type === 'date' ? 'selected' : ''}>تاريخ</option>
                        <option value="statement" ${q.type === 'statement' ? 'selected' : ''}>عنوان قسم / نص</option>
                    </select>
                </div>
            </div>
            
            <div style="padding: 0 0.5rem;">
                ${inputHtml}
                ${optionsHtml}
            </div>
            
            <div style="margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 1rem; display: flex; justify-content: flex-end; align-items: center; gap: 1.5rem;">
                <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.9rem; font-weight: 500; cursor:pointer; color: var(--text-muted);">
                    مطلوب
                    <label class="toggle-switch">
                        <input type="checkbox" ${q.is_required ? 'checked' : ''} onchange="updateQuestion(${q.id}, {is_required: this.checked ? 1 : 0})">
                        <span class="slider"></span>
                    </label>
                </label>
                
                <div style="width: 1px; height: 24px; background: var(--border-color);"></div>
                
                <button class="btn-ghost btn-icon-only" style="color: var(--danger); opacity: 0.7;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7" onclick="deleteQuestion(${q.id})" title="حذف السؤال">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

let qTimeouts = {};
function debounceUpdateQ(id, field, value) {
    if (qTimeouts[id]) clearTimeout(qTimeouts[id]);
    updateStatus('جاري الحفظ...', true);
    qTimeouts[id] = setTimeout(() => {
        updateQuestion(id, { [field]: value });
    }, 800);
}

function changeType(id, newType) {
    const q = currentForm.questions.find(q => q.id == id);
    if (!q) return;

    let options = q.options;
    if ((newType === 'radio' || newType === 'checkbox' || newType === 'dropdown') && (!options || options.length === 0)) {
        options = ['خيار 1'];
    }
    if (newType === 'linear_scale' && (!options || options.length < 2)) {
        options = ['سيئ جداً', 'ممتاز'];
    }
    if ((newType === 'radio_grid' || newType === 'checkbox_grid') && (!options || options.length < 2 || (!options[0].startsWith('R:') && !options[0].startsWith('C:')))) {
        options = ['R:صف 1', 'C:عمود 1', 'C:عمود 2'];
    }
    updateQuestion(id, { type: newType, options: options }).then(() => renderQuestions());
}

function updateGridOption(qId, optIdx, prefix, val) {
    const q = currentForm.questions.find(q => q.id == qId);
    if (!q) return;
    q.options[optIdx] = prefix + val;
    debounceUpdateQ(qId, 'options', q.options);
}

function addGridOption(qId, newVal) {
    const q = currentForm.questions.find(q => q.id == qId);
    if (!q) return;
    q.options.push(newVal);
    updateQuestion(qId, { options: q.options }).then(() => renderQuestions());
}

function updateOption(qId, optIdx, val) {
    const q = currentForm.questions.find(q => q.id == qId);
    if (!q) return;
    q.options[optIdx] = val;
    debounceUpdateQ(qId, 'options', q.options);
}

function addOption(qId) {
    const q = currentForm.questions.find(q => q.id == qId);
    if (!q) return;
    q.options.push(`خيار ${q.options.length + 1}`);
    updateQuestion(qId, { options: q.options }).then(() => renderQuestions());
}

function removeOption(qId, optIdx) {
    const q = currentForm.questions.find(q => q.id == qId);
    if (!q) return;
    q.options.splice(optIdx, 1);
    updateQuestion(qId, { options: q.options }).then(() => renderQuestions());
}

function setupImageUpload() {
    const dropZone = document.getElementById('imageUploadZone');
    const fileInput = document.getElementById('imageFileInput');

    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                fileInput.files = e.dataTransfer.files;
                handleImageUpload(e.dataTransfer.files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) {
                handleImageUpload(e.target.files[0]);
            }
        });
    }
}

function handleImageUpload(file) {
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
        return UI.toast('نوع الملف غير مدعوم. اختر صورة صالحة.', 'error');
    }

    if (file.size > 5 * 1024 * 1024) {
        return UI.toast('حجم الصورة كبير جداً. الحد الأقصى 5 ميجابايت.', 'error');
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const ratio = img.width / img.height;
            // Bypass crop completely if image is reasonably wide and large enough
            if (ratio >= 1.6 && ratio <= 3.2 && img.width >= 600) {
                fetch(e.target.result).then(r => r.blob()).then(blob => {
                    executeImageUploadApi(blob, file.name || "cover.jpg");
                });
                return;
            }

            // Otherwise, open crop modal
            const modal = document.getElementById('cropModalOverlay');
            const imageTarget = document.getElementById('cropImageTarget');

            imageTarget.src = e.target.result;
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('show'), 10);

            if (currentCropper) currentCropper.destroy();

            setTimeout(() => {
                currentCropper = new Cropper(imageTarget, {
                    aspectRatio: NaN, // Allow free cropping for maximum flexibility
                    viewMode: 1,
                    autoCropArea: 1,
                    background: false
                });
            }, 100);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function closeCropModal() {
    const modal = document.getElementById('cropModalOverlay');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        if (currentCropper) {
            currentCropper.destroy();
            currentCropper = null;
        }
        document.getElementById('cropImageTarget').src = '';
        document.getElementById('imageFileInput').value = '';
    }, 300);
}

function executeImageUploadApi(blob, filename) {
    const formData = new FormData();
    formData.append('image', new File([blob], filename, { type: 'image/jpeg' }));

    const progressDiv = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('uploadProgressBar');
    const progressText = document.getElementById('uploadPercent');

    progressDiv.style.display = 'block';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_BASE + '/upload', true);
    xhr.withCredentials = true;

    xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = percent + '%';
            progressText.textContent = percent + '%';
        }
    };

    xhr.onload = function () {
        progressDiv.style.display = 'none';
        progressBar.style.width = '0%';
        if (xhr.status === 200) {
            const res = JSON.parse(xhr.responseText);
            const url = res.url;

            document.getElementById('headerImage').value = url;
            const previewBg = document.getElementById('coverImagePreview');
            const previewContainer = document.getElementById('coverImagePreviewContainer');
            previewBg.style.backgroundImage = `url('${url}')`;
            if (previewContainer) previewContainer.style.display = 'block';
            document.getElementById('removeCoverBtn').style.display = 'block';

            UI.toast('تم رفع الصورة بنجاح');
            triggerAutoSave();
        } else {
            let errorMsg = 'فشل رفع الصورة';
            try { errorMsg = JSON.parse(xhr.responseText).message || errorMsg; } catch (e) { }
            UI.toast(errorMsg, 'error');
        }
        document.getElementById('imageFileInput').value = '';
    };

    xhr.onerror = function () {
        progressDiv.style.display = 'none';
        progressBar.style.width = '0%';
        UI.toast('حدث خطأ في الاتصال بالخادم', 'error');
        document.getElementById('imageFileInput').value = '';
    };

    xhr.send(formData);
}

window.removeCoverImage = function () {
    document.getElementById('headerImage').value = '';
    document.getElementById('coverImagePreview').style.backgroundImage = 'none';
    const previewContainer = document.getElementById('coverImagePreviewContainer');
    if (previewContainer) previewContainer.style.display = 'none';
    document.getElementById('removeCoverBtn').style.display = 'none';
    triggerAutoSave();
}
