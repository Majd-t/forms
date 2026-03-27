const urlParams = new URLSearchParams(window.location.search);
let formId = urlParams.get('code') || urlParams.get('id');
if (!formId) {
    const parts = window.location.pathname.split('/').filter(p => p);
    const last = parts[parts.length - 1];
    if (last && !last.includes('.html')) formId = last;
}

let currentForm = null;
const formState = {};

let form, progressBar, submitBtn, floatingActions, successModal, clearBtn, scrollToSubmitBtn, progressTrackFill;
let observer = null;

document.addEventListener('DOMContentLoaded', async () => {
    form = document.getElementById('publicForm');
    progressBar = document.getElementById('progressBar');
    submitBtn = document.getElementById('submitBtn');
    floatingActions = document.getElementById('floatingActions');
    successModal = document.getElementById('successModal');
    clearBtn = document.getElementById('clearBtn');
    scrollToSubmitBtn = document.getElementById('scrollToSubmit');
    progressTrackFill = document.getElementById('progressTrackFill');

    if (!formId) {
        document.querySelector('.form-title').innerHTML = 'النموذج <span class="highlight">غير موجود</span>';
        document.querySelector('.form-description').textContent = 'نعتذر، لم نتمكن من العثور على النموذج المطلوب.';
        return;
    }

    try {
        currentForm = await Api.get(`/forms/${formId}`);
        document.title = currentForm.title;
        document.querySelector('.form-title').innerHTML = currentForm.title;
        document.querySelector('.form-description').textContent = currentForm.description || '';
        
        let settings = currentForm.settings || {};
        if (typeof settings === 'string') {
             try { settings = JSON.parse(settings); } catch(e){ settings = {}; }
        }
        
        if (settings.theme_color) {
            document.documentElement.style.setProperty('--accent', settings.theme_color);
        }
        
        if (settings.header_image) {
            const heroImageContainer = document.querySelector('.hero-image-container');
            const heroImage = document.querySelector('.hero-image');
            if(heroImageContainer && heroImage) {
                heroImage.src = settings.header_image;
                heroImageContainer.style.display = 'block';
            }
        }

        const now = new Date();
        const isActive = settings.is_active !== false;
        const startDate = settings.start_date ? new Date(settings.start_date) : null;
        const endDate = settings.end_date ? new Date(settings.end_date) : null;
        
        let isAvailable = isActive;
        let closedMessage = "هذا النموذج مغلق حالياً ولا يتلقى الردود.";

        if (isAvailable && startDate && now < startDate) {
            isAvailable = false;
            closedMessage = "هذا النموذج لم يفتح بعد. سيبدأ تلقي الردود في " + startDate.toLocaleString('ar-EG');
        }
        if (isAvailable && endDate && now > endDate) {
            isAvailable = false;
            closedMessage = "انتهى وقت الاستجابة لهذا النموذج.";
        }

        if (!isAvailable) {
            document.getElementById('submitContainer').style.display = 'none';
            if (document.getElementById('statsBar')) document.getElementById('statsBar').style.display = 'none';
            if (document.getElementById('sideProgress')) document.getElementById('sideProgress').style.display = 'none';
            if (progressBar) progressBar.parentElement.style.display = 'none';
            
            form.innerHTML = `
                <div class="question-card" style="text-align: center; padding: 4rem 2rem; border-top: 8px solid var(--danger);">
                    <div style="width: 64px; height: 64px; background: rgba(225, 29, 72, 0.1); color: var(--danger); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    </div>
                    <h3 style="font-size: 1.75rem; font-family: var(--font-heading); font-weight: 800; color: var(--text-main); margin-bottom: 0.75rem;">النموذج مغلق</h3>
                    <p style="color: var(--text-muted); font-size: 1.1rem;">${closedMessage}</p>
                </div>
            `;
            return;
        }

        currentForm.questions.forEach(q => {
            if (q.type !== 'statement') {
                if (q.type === 'checkbox') formState[q.id] = [];
                else if (q.type === 'radio_grid' || q.type === 'checkbox_grid') formState[q.id] = {};
                else formState[q.id] = '';
            }
        });

        // if there are questions, show submit UI
        if (currentForm.questions.length > 0) {
            document.getElementById('submitContainer').style.display = 'block';
            document.getElementById('statsBar').style.display = 'grid';
        }

        createSideProgress();
        renderQuestions();
        updateProgress();
        updateProgressTrack();

        if (submitBtn) submitBtn.addEventListener('click', submitFormToServer);
        if (clearBtn) clearBtn.addEventListener('click', clearAllAnswers);
        if (scrollToSubmitBtn) scrollToSubmitBtn.addEventListener('click', () => document.getElementById('submitContainer').scrollIntoView({ behavior: 'smooth' }));
        if (successModal) successModal.addEventListener('click', e => { if (e.target === successModal) successModal.classList.remove('active'); });
        
    } catch (err) {
        document.querySelector('.form-title').textContent = 'خطأ في التحميل';
        document.querySelector('.form-description').textContent = err.message || 'فشل جلب النموذج.';
    }
});

function createSideProgress() {
    const sideProgress = document.getElementById('sideProgress');
    if (!sideProgress) return;

    let qIndex = 1;
    currentForm.questions.forEach((q) => {
        if (q.type === 'statement') return;

        const wrapper = document.createElement('div');
        wrapper.className = 'progress-dot-wrapper';

        const dot = document.createElement('div');
        dot.className = 'progress-dot empty';
        dot.dataset.questionId = q.id;
        dot.addEventListener('click', () => {
            const card = document.querySelector(`.question-card[data-question-id="${q.id}"]`);
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        const tooltip = document.createElement('div');
        tooltip.className = 'progress-tooltip';
        tooltip.textContent = `السؤال ${qIndex++}`;

        wrapper.appendChild(dot);
        wrapper.appendChild(tooltip);
        sideProgress.appendChild(wrapper);
    });
}

function updateProgressTrack() {
    if (!progressTrackFill) return;
    let answeredCount = 0;
    const realQuestions = currentForm.questions.filter(q => q.type !== 'statement');
    
    realQuestions.forEach(q => {
        const val = formState[q.id];
        let isAnswered = false;
        
        if (q.type === 'checkbox') isAnswered = val.length > 0;
        else if (q.type === 'radio_grid' || q.type === 'checkbox_grid') {
            const rowCount = q.options.filter(o => o.startsWith('R:')).length;
            const answeredRows = Object.keys(val || {}).filter(k => {
                const ans = val[k];
                return Array.isArray(ans) ? ans.length > 0 : !!ans;
            });
            if (q.is_required) {
                isAnswered = answeredRows.length === rowCount && rowCount > 0;
            } else {
                isAnswered = answeredRows.length > 0;
            }
        } 
        else {
            isAnswered = (val && val.toString().trim() !== '');
        }

        if (isAnswered) answeredCount++;
    });
    
    const percent = realQuestions.length ? (answeredCount / realQuestions.length) * 100 : 0;
    progressTrackFill.style.height = `${percent}%`;
}

function updateProgress() {
    let answered = 0;
    let requiredAnswered = 0;
    const realQuestions = currentForm.questions.filter(q => q.type !== 'statement');
    const requiredTotal = realQuestions.filter(q => q.is_required).length;

    realQuestions.forEach(q => {
        const value = formState[q.id];
        let isAnswered = false;
        if (Array.isArray(value)) {
            isAnswered = value.length > 0;
        } else if (value && typeof value === 'object') {
            // Grid: at least one row answered
            isAnswered = Object.keys(value).some(k => Array.isArray(value[k]) ? value[k].length > 0 : !!value[k]);
        } else {
            isAnswered = value && value.toString().trim() !== '';
        }
        if (isAnswered) { 
            answered++; 
            if (q.is_required) requiredAnswered++; 
        }
    });

    const percent = realQuestions.length ? Math.round((answered / realQuestions.length) * 100) : 0;
    if (progressBar) progressBar.style.width = `${percent}%`;

    const answeredEl = document.getElementById('answeredCount');
    const remainingEl = document.getElementById('remainingCount');
    const percentEl = document.getElementById('completionPercent');

    if (answeredEl) answeredEl.textContent = answered;
    if (remainingEl) remainingEl.textContent = realQuestions.length - answered;
    if (percentEl) percentEl.textContent = `${percent}%`;

    if (submitBtn) submitBtn.disabled = requiredAnswered < requiredTotal;
    if (floatingActions) floatingActions.classList.toggle('visible', answered > 0);
}

function renderQuestions() {
    if (!form || !currentForm) return;

    let qIndex = 1;
    form.innerHTML = currentForm.questions.map((q) => {
        if (q.type === 'statement') {
            return `
            <div class="question-card" data-question-id="${q.id}" style="border:none; box-shadow:none; background:transparent;">
                <h3 style="font-size: 1.75rem; color: var(--accent); font-weight: 800; border-bottom: 2px solid var(--gold); padding-bottom: 0.5rem; margin-bottom: 1rem;">${q.label}</h3>
            </div>`;
        }

        const html = `
        <div class="question-card" data-question-id="${q.id}">
            <div class="card-accent"></div>
            <div class="question-header">
                <div class="question-number">${qIndex++}</div>
                <div class="question-content">
                    <h3 class="question-text" style="margin-bottom: ${q.description ? '0.25rem' : '0'};">${q.label}${q.is_required ? '<span class="question-required">*</span>' : ''}</h3>
                    ${q.description ? `<p class="question-desc" style="font-size: 0.95rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 0;">${q.description}</p>` : ''}
                </div>
            </div>
            ${renderInput(q)}
        </div>`;
        return html;
    }).join('');

    attachEventListeners();
    initObserver();
}

function renderInput(q) {
    switch (q.type) {
        case 'text':
        case 'email':
        case 'number':
            return `<input type="${q.type}" class="form-input" placeholder="اكتب إجابتك هنا..." data-question-id="${q.id}" ${q.is_required ? 'required' : ''}>`;
        case 'date':
            return `<input type="date" class="form-input" data-question-id="${q.id}" ${q.is_required ? 'required' : ''}>`;
        case 'textarea':
            return `<textarea class="form-input" placeholder="اكتب إجابتك بالتفصيل..." data-question-id="${q.id}" ${q.is_required ? 'required' : ''}></textarea>`;
        case 'dropdown':
            return `
            <div class="dropdown-wrapper" style="position: relative; margin-top: 1rem;">
                <select class="form-input" data-question-id="${q.id}" ${q.is_required ? 'required' : ''} style="appearance: none; cursor: pointer; padding-right: 1.5rem; background: var(--bg-main);">
                    <option value="" disabled selected>اختر خياراً...</option>
                    ${(q.options || []).map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                </select>
                <div style="position: absolute; left: 1.5rem; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--primary);">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
            </div>`;
        case 'star_rating':
            return `
            <div class="star-rating-container" data-question-id="${q.id}">
                ${[5,4,3,2,1].map(i => `
                    <input type="radio" id="star-${q.id}-${i}" name="q-${q.id}" value="${i}" style="display:none;" data-question-id="${q.id}" ${q.is_required ? 'required' : ''}>
                    <label for="star-${q.id}-${i}" class="star-label">
                        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                    </label>
                `).join('')}
            </div>`;
        case 'linear_scale':
            const minLabel = q.options && q.options[0] ? q.options[0] : 'سيئ جداً';
            const maxLabel = q.options && q.options[1] ? q.options[1] : 'ممتاز';
            return `<div class="linear-scale-container" role="radiogroup" style="margin-top: 2rem;">
                <div style="display:flex; justify-content:space-between; align-items:flex-end; gap: 1rem;">
                    <span style="font-size: 0.95rem; font-weight: 500; color: var(--text-muted); text-align: left; flex: 1;">${minLabel}</span>
                    <div style="display:flex; justify-content:center; gap: min(2rem, 3vw); flex: 2;">
                        ${[1,2,3,4,5].map(i => `
                            <label style="display:flex; flex-direction:column; align-items:center; gap:0.75rem; cursor:pointer;" class="scale-item" tabindex="0">
                                <span style="font-size:1.1rem; font-weight:700; color:var(--text-main);">${i}</span>
                                <input type="radio" name="q-${q.id}" value="${i}" data-question-id="${q.id}" ${q.is_required ? 'required' : ''} style="display:none;">
                                <div class="scale-radio" style="width:28px; height:28px; border-radius:50%; border:2px solid var(--border-hover); transition:all 0.2s cubic-bezier(0.4, 0, 0.2, 1);"></div>
                            </label>
                        `).join('')}
                    </div>
                    <span style="font-size: 0.95rem; font-weight: 500; color: var(--text-muted); text-align: right; flex: 1;">${maxLabel}</span>
                </div>
            </div>`;
            
        case 'file_upload':
            return `
            <div class="file-upload-zone" id="upload-zone-${q.id}" data-question-id="${q.id}" style="margin-top: 1.5rem; border: 2px dashed var(--border-color); border-radius: 12px; padding: 2rem; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: all 0.3s ease; background: var(--bg-warm);">
                <input type="file" id="file-${q.id}" style="display:none;" data-question-id="${q.id}">
                <div class="upload-icon" style="margin-bottom: 0.75rem; color: var(--accent);">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                </div>
                <span style="font-size: 1.05rem; font-weight: 600; color: var(--text-main);">انقر لاختيار ملف أو اسحب الملف هنا</span>
                <span style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">الحد الأقصى للملف: ١٥ ميجابايت (صور، مستندات، ملفات صوتية أو مرئية)</span>
                
                <div class="upload-progress" id="progress-${q.id}" style="display:none; width: 100%; max-width: 300px; margin-top: 1.5rem;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem; font-size:0.85rem; font-weight:600; color:var(--text-main);">
                        <span>جاري الرفع...</span>
                        <span id="percent-${q.id}">0%</span>
                    </div>
                    <div style="height: 6px; background: var(--border-color); border-radius: 3px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);">
                        <div class="upload-bar" id="bar-${q.id}" style="height: 100%; width: 0%; background: linear-gradient(90deg, var(--accent), var(--gold)); transition: width 0.2s ease;"></div>
                    </div>
                </div>
                
                <div class="upload-preview" id="preview-${q.id}" style="display:none; margin-top: 1.5rem; text-align: center; width:100%;"></div>
            </div>`;
            
        case 'radio_grid':
        case 'checkbox_grid':
            const gOpts = q.options || [];
            const rows = gOpts.filter(o => o.startsWith('R:')).map(o => o.substring(2));
            const cols = gOpts.filter(o => o.startsWith('C:')).map(o => o.substring(2));
            const isCheckbox = q.type === 'checkbox_grid';
            
            let thead = `<thead><tr><th style="background:var(--bg-warm); position:sticky; right:0; z-index:2;"></th>${cols.map(c => `<th style="text-align:center; padding: 1.25rem 1rem; color:var(--text-main); font-weight:600; font-size: 0.95rem;">${c}</th>`).join('')}</tr></thead>`;
            
            let tbody = `<tbody>${rows.map((r, rIdx) => {
                return `<tr style="border-top: 1px solid var(--border-color); transition: background 0.2s;" class="grid-row">
                    <td style="padding: 1.25rem 1rem; font-weight: 500; color: var(--text-main); background:var(--bg-warm); position:sticky; right:0; z-index:2; min-width:150px;">${r}</td>
                    ${cols.map((c, cIdx) => `
                        <td style="text-align:center; padding: 1rem;">
                            <label style="display:inline-flex; justify-content:center; align-items:center; width: 44px; height: 44px; cursor: pointer; border-radius: 50%; transition: background 0.2s;" class="grid-cell-label" onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background='transparent'">
                                <input type="${isCheckbox ? 'checkbox' : 'radio'}" name="q-${q.id}-r${rIdx}" value="${c}" data-question-id="${q.id}" data-row="${rIdx}" style="display:none;" class="grid-input" ${q.is_required && !isCheckbox ? 'required' : ''}>
                                <div class="${isCheckbox ? 'option-checkbox' : 'option-radio'} grid-mark" style="margin: 0; pointer-events: none;"></div>
                            </label>
                        </td>
                    `).join('')}
                </tr>`;
            }).join('')}</tbody>`;

            return `<div class="grid-table-container" style="margin-top: 1.5rem; overflow-x: auto; border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.02); background: var(--bg);">
                <table style="width: 100%; border-collapse: collapse; text-align: right;">
                    ${thead}
                    ${tbody}
                </table>
            </div>`;
        case 'radio':
            return `<div class="options-list" role="radiogroup">${(q.options || []).map(opt => `
                <label class="option-item" tabindex="0">
                    <input type="radio" name="q-${q.id}" value="${opt}" data-question-id="${q.id}" ${q.is_required ? 'required' : ''}>
                    <span class="option-radio"></span>
                    <span class="option-text">${opt}</span>
                </label>
            `).join('')}</div>`;
        case 'checkbox':
            return `<div class="options-list" role="group">${(q.options || []).map(opt => `
                <label class="option-item" tabindex="0">
                    <input type="checkbox" name="q-${q.id}" value="${opt}" data-question-id="${q.id}">
                    <span class="option-checkbox"></span>
                    <span class="option-text">${opt}</span>
                </label>
            `).join('')}</div>`;
        default:
            return '';
    }
}

function initObserver() {
    if (observer) observer.disconnect();

    observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const qId = entry.target.dataset.questionId;
            const dot = document.querySelector(`.progress-dot[data-question-id="${qId}"]`);

            if (dot && !dot.classList.contains('completed')) {
                if (entry.isIntersecting) {
                    dot.classList.remove('empty');
                    dot.classList.add('active');
                } else {
                    dot.classList.remove('active');
                    if (!dot.classList.contains('completed')) {
                        dot.classList.add('empty');
                    }
                }
            }
        });
    }, { threshold: 0.4 });

    document.querySelectorAll('.question-card').forEach(card => observer.observe(card));
}

function attachEventListeners() {
    document.querySelectorAll('.form-input').forEach(input => {
        input.addEventListener('input', handleInputChange);
        input.addEventListener('change', handleInputChange);
    });
    document.querySelectorAll('.option-item, .scale-item, .star-label').forEach(item => {
        item.addEventListener('click', handleOptionClick);
        item.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOptionClick(e); }
        });
    });
    document.querySelectorAll('.star-rating-container input[type="radio"], .linear-scale-container input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', handleRadioChangeDirect);
    });
    
    document.querySelectorAll('.grid-input').forEach(input => {
        input.addEventListener('change', handleGridChange);
    });
    
    // File Upload Drag & Drop
    document.querySelectorAll('.file-upload-zone').forEach(zone => {
        const input = zone.querySelector('input[type="file"]');
        const qId = zone.dataset.questionId;
        
        zone.addEventListener('click', (e) => {
            if(e.target !== input) input.click();
        });
        
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.style.borderColor = 'var(--accent)';
            zone.style.background = 'var(--accent-light)';
        });
        
        zone.addEventListener('dragleave', () => {
            zone.style.borderColor = 'var(--border-color)';
            zone.style.background = 'var(--bg-warm)';
        });
        
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.style.borderColor = 'var(--border-color)';
            zone.style.background = 'var(--bg-warm)';
            if (e.dataTransfer.files.length) {
                handleFileUpload(e.dataTransfer.files[0], qId, zone);
            }
        });
        
        input.addEventListener('change', (e) => {
            if (e.target.files.length) {
                handleFileUpload(e.target.files[0], qId, zone);
            }
        });
    });
}

function handleInputChange(e) {
    const qId = parseInt(e.target.dataset.questionId);
    formState[qId] = e.target.value;

    const card = e.target.closest('.question-card');
    const dot = document.querySelector(`.progress-dot[data-question-id="${qId}"]`);

    if (e.target.value.trim()) {
        e.target.classList.add('has-value');
        if (card) card.classList.add('answered');
        if (dot) { dot.classList.remove('empty', 'active'); dot.classList.add('completed'); }
    } else {
        e.target.classList.remove('has-value');
        if (card) card.classList.remove('answered');
        if (dot) { dot.classList.remove('completed'); dot.classList.add('empty'); }
    }

    updateProgress();
    updateProgressTrack();
}

function handleRadioChangeDirect(e) {
    const input = e.target;
    const qId = parseInt(input.dataset.questionId);
    const card = input.closest('.question-card');
    const dot = document.querySelector(`.progress-dot[data-question-id="${qId}"]`);

    formState[qId] = input.value;
    card.classList.add('answered');
    if (dot) { dot.classList.remove('empty', 'active'); dot.classList.add('completed'); }

    updateProgress();
    updateProgressTrack();
}

function handleOptionClick(e) {
    let input = e.currentTarget.querySelector('input');
    // For star labels, the `for` attribute automatically targets the input, 
    // so we handle those separately via handleRadioChangeDirect, but just in case:
    if (!input && e.currentTarget.classList.contains('star-label')) {
        const inputId = e.currentTarget.getAttribute('for');
        if (inputId) input = document.getElementById(inputId);
    }
    
    if (!input) return;
    if (e.target === input) return;
    
    const qId = parseInt(input.dataset.questionId);
    const card = e.currentTarget.closest('.question-card');
    const dot = document.querySelector(`.progress-dot[data-question-id="${qId}"]`);

    if (input.type === 'radio') {
        card.querySelectorAll('.option-item').forEach(item => item.classList.remove('selected'));
        e.currentTarget.classList.add('selected');
        input.checked = true;
        formState[qId] = input.value;
        card.classList.add('answered');
        if (dot) { dot.classList.remove('empty', 'active'); dot.classList.add('completed'); }
    } else {
        e.currentTarget.classList.toggle('selected');
        input.checked = !input.checked;
        const checkedInputs = card.querySelectorAll('input:checked');
        formState[qId] = Array.from(checkedInputs).map(inp => inp.value);

        if (formState[qId].length > 0) {
            card.classList.add('answered');
            if (dot) { dot.classList.remove('empty', 'active'); dot.classList.add('completed'); }
        } else {
            card.classList.remove('answered');
            if (dot) { dot.classList.remove('completed'); dot.classList.add('empty'); }
        }
    }

    updateProgress();
    updateProgressTrack();
}

function clearAllAnswers() {
    currentForm.questions.forEach(q => {
        if (q.type !== 'statement') formState[q.id] = q.type === 'checkbox' ? [] : '';
    });
    document.querySelectorAll('.form-input').forEach(input => { input.value = ''; input.classList.remove('has-value'); });
    document.querySelectorAll('.option-item').forEach(item => { item.classList.remove('selected'); const input = item.querySelector('input'); if (input) input.checked = false; });
    document.querySelectorAll('.question-card').forEach(card => { card.classList.remove('answered'); });
    document.querySelectorAll('.progress-dot').forEach(dot => { dot.classList.remove('completed', 'active'); dot.classList.add('empty'); });
    updateProgress();
    updateProgressTrack();
}

async function submitFormToServer() {
    const answers = [];
    let allRequiredAnswered = true;

    currentForm.questions.forEach(q => {
        if (q.type === 'statement') return;

        const value = formState[q.id];
        let isAnswered = false;
        if (Array.isArray(value)) isAnswered = value.length > 0;
        else if (value && typeof value === 'object') isAnswered = Object.keys(value).some(k => Array.isArray(value[k]) ? value[k].length > 0 : !!value[k]);
        else isAnswered = value && value.toString().trim() !== '';

        if (q.is_required && !isAnswered) {
            allRequiredAnswered = false;
            const card = document.querySelector(`.question-card[data-question-id="${q.id}"]`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.style.animation = 'shake 0.4s ease';
                setTimeout(() => card.style.animation = '', 400);
            }
        }

        if (isAnswered) {
            let finalAnswer = value;
            if (typeof value === 'object') finalAnswer = JSON.stringify(value);
            answers.push({ question_id: q.id, answer: finalAnswer });
        }
    });

    if (!allRequiredAnswered) {
        UI.toast('يرجى ملء جميع الحقول المطلوبة', 'error');
        return;
    }

    const btn = document.getElementById('submitBtn');
    UI.showLoader(btn);

    try {
        await Api.post(`/responses/${currentForm.id}`, { answers });
        document.getElementById('formWrapper').style.display = 'none';
        if (document.getElementById('floatingActions')) document.getElementById('floatingActions').style.display = 'none';
        if (successModal) successModal.classList.add('active');
    } catch (err) {
        UI.toast('فشل إرسال النموذج: ' + (err.message || ''), 'error');
        UI.hideLoader(btn);
    }
}

function handleGridChange(e) {
    const input = e.target;
    const qId = parseInt(input.dataset.questionId);
    const rowIdx = parseInt(input.dataset.row);
    const card = input.closest('.question-card');
    const dot = document.querySelector(`.progress-dot[data-question-id="${qId}"]`);

    if (!formState[qId] || typeof formState[qId] !== 'object' || Array.isArray(formState[qId])) {
        formState[qId] = {};
    }
    
    if (input.type === 'radio') {
        formState[qId][rowIdx] = input.value;
        // Visually mark the row
        const marks = card.querySelectorAll(`input[data-row="${rowIdx}"] ~ .grid-mark, input[data-row="${rowIdx}"]`);
        card.querySelectorAll(`.grid-mark`).forEach(m => {
            const rowInput = m.closest('label').querySelector('input');
            if (rowInput && parseInt(rowInput.dataset.row) === rowIdx) {
                m.classList.remove('checked');
            }
        });
        const mark = input.parentElement.querySelector('.grid-mark');
        if (mark) mark.classList.add('checked');
    } else {
        if (!formState[qId][rowIdx]) formState[qId][rowIdx] = [];
        if (input.checked) {
            if (!formState[qId][rowIdx].includes(input.value)) formState[qId][rowIdx].push(input.value);
            const mark = input.parentElement.querySelector('.grid-mark');
            if (mark) mark.classList.add('checked');
        } else {
            formState[qId][rowIdx] = formState[qId][rowIdx].filter(v => v !== input.value);
            const mark = input.parentElement.querySelector('.grid-mark');
            if (mark) mark.classList.remove('checked');
        }
    }

    if (card) card.classList.add('answered');
    if (dot) { dot.classList.remove('empty', 'active'); dot.classList.add('completed'); }
    updateProgress();
    updateProgressTrack();
}

function handleFileUpload(file, qId, zone) {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return UI.toast('حجم الملف كبير جداً. الحد الأقصى 15MB', 'error');

    const formData = new FormData();
    formData.append('file', file);

    const progressDiv = document.getElementById(`progress-${qId}`);
    const progressBarEl = document.getElementById(`bar-${qId}`);
    const percentText = document.getElementById(`percent-${qId}`);
    const previewDiv = document.getElementById(`preview-${qId}`);
    
    if (progressDiv) progressDiv.style.display = 'block';
    
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/upload`, true);
    xhr.withCredentials = true;
    
    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && progressBarEl && percentText) {
            const p = Math.round((e.loaded / e.total) * 100);
            progressBarEl.style.width = p + '%';
            percentText.textContent = p + '%';
        }
    };
    
    xhr.onload = () => {
        if (progressDiv) progressDiv.style.display = 'none';
        if (xhr.status === 200) {
            const res = JSON.parse(xhr.responseText);
            formState[qId] = res.url;
            zone.style.borderColor = 'var(--accent)';
            zone.style.background = 'var(--accent-light)';
            if (previewDiv) {
                if (file.type.startsWith('image/')) {
                    previewDiv.innerHTML = `<img src="${res.url}" style="max-height:150px; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.1);">`;
                } else {
                    previewDiv.innerHTML = `<div style="display:inline-flex;align-items:center;gap:0.5rem;background:var(--card);padding:0.5rem 1rem;border-radius:8px;border:1px solid var(--border-color);color:var(--text-main);font-weight:500;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg><span>${file.name}</span></div>`;
                }
                previewDiv.style.display = 'block';
            }
            const card = zone.closest('.question-card');
            if (card) {
                card.classList.add('answered');
                const dot = document.querySelector(`.progress-dot[data-question-id="${qId}"]`);
                if (dot) { dot.classList.remove('empty', 'active'); dot.classList.add('completed'); }
            }
            updateProgress();
            updateProgressTrack();
            UI.toast('تم رفع الملف بنجاح ✅');
        } else {
            let msg = 'فشل رفع الملف';
            try { msg = JSON.parse(xhr.responseText).message || msg; } catch(e){}
            UI.toast(msg, 'error');
            zone.style.borderColor = 'var(--danger)';
        }
    };
    
    xhr.onerror = () => {
        if (progressDiv) progressDiv.style.display = 'none';
        UI.toast('خطأ في الاتصال أثناء رفع الملف', 'error');
    };
    
    xhr.send(formData);
}
