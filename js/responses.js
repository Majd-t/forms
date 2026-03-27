const urlParams = new URLSearchParams(window.location.search);
let formId = urlParams.get('code') || urlParams.get('id');
if (!formId) {
    const parts = window.location.pathname.split('/').filter(p => p);
    const last = parts[parts.length - 1];
    if (last && !last.includes('.html')) formId = last;
}

let currentForm = null;

let allResponsesData = [];
let allQuestionsObj = [];
let currentSortCol = null;
let currentSortAsc = true;

document.addEventListener('DOMContentLoaded', async () => {
    if (!formId) {
        window.location.href = 'index.html';
        return;
    }

    // Tabs logic
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(tab.getAttribute('data-target')).classList.add('active');
        });
    });

    document.getElementById('exportCsvBtn').addEventListener('click', () => {
        window.location.href = `/backend/responses/${currentForm ? currentForm.id : formId}/export`;
    });

    try {
        currentForm = await Api.get(`/forms/${formId}`);
        document.getElementById('fTitle').textContent = currentForm.title;
        
        await Promise.all([
            loadAnalytics(),
            loadResponsesTable()
        ]);

    } catch (err) {
        UI.toast('فشل تحميل البيانات', 'error');
        document.getElementById('fTitle').textContent = 'خطأ في تحميل النموذج';
    }
});

async function loadAnalytics() {
    try {
        const stats = await Api.get(`/analytics/${currentForm.id}`);
        document.getElementById('totalResponses').textContent = stats.total_responses;

        const container = document.getElementById('chartsContainer');
        container.innerHTML = '';

        if (stats.total_responses === 0) {
            container.innerHTML = '<p style="color:var(--text-muted)">لا توجد ردود بعد لعرض الإحصائيات.</p>';
            return;
        }

        Object.keys(stats.question_stats).forEach(qid => {
            const qStat = stats.question_stats[qid];
            if (!qStat.data || qStat.data.length === 0) return;

            const box = document.createElement('div');
            box.className = 'chart-container';
            box.innerHTML = `
                <h3 style="margin-bottom: 1rem; font-size: 1.05rem; color: var(--text-main); font-weight: 600;">${qStat.label}</h3>
                <div style="position: relative; height: 260px; width: 100%; display: flex; justify-content: center; align-items: center;">
                    <canvas id="chart_${qid}"></canvas>
                </div>
            `;
            container.appendChild(box);

            const ctx = document.getElementById(`chart_${qid}`).getContext('2d');
            
            const labels = qStat.data.map(d => {
                try {
                    const parsed = JSON.parse(d.answer);
                    return Array.isArray(parsed) ? parsed.join(', ') : d.answer;
                } catch(e) { return d.answer; }
            });
            const values = qStat.data.map(d => d.count);
            
            // Random vibrant colors
            const bgColors = labels.map((_, i) => `hsl(${i * 360 / labels.length}, 70%, 50%)`);

            const type = (qStat.type === 'radio' || qStat.type === 'dropdown') ? 'pie' : 'bar';

            new Chart(ctx, {
                type: type,
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'الردود',
                        data: values,
                        backgroundColor: bgColors,
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.2)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: type === 'pie' ? 'right' : 'none' }
                    }
                }
            });
        });

    } catch (e) {
        console.error('Analytics Error:', e);
    }
}

async function loadResponsesTable() {
    try {
        const responses = await Api.get(`/responses/${currentForm.id}`);
        allResponsesData = responses;
        allQuestionsObj = currentForm.questions.filter(q => q.type !== 'statement');
        renderTable();
    } catch (e) {
        console.error('Responses Error:', e);
    }
}

function renderTable() {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    if (allResponsesData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="100%" style="text-align:center;">لا توجد ردود بعد</td></tr>';
        return;
    }

    // Build Sortable Header
    let headRow = '<tr>';
    const cols = [{id: 'date', label: 'تاريخ التقديم', type: 'date'}, ...allQuestionsObj];
    
    cols.forEach((c, index) => {
        let sortIcon = '⇅';
        if (currentSortCol === index) {
            sortIcon = currentSortAsc ? '↑' : '↓';
        }
        headRow += `<th style="cursor: pointer; user-select: none;" onclick="sortTable(${index})" title="انقر للترتيب">
            <div style="display:flex; align-items:center; justify-content:space-between; gap: 0.5rem; color: ${currentSortCol === index ? 'var(--primary)' : 'inherit'}">
                ${c.label} <span style="font-size: 0.85em; opacity: ${currentSortCol === index ? '1' : '0.4'};">${sortIcon}</span>
            </div>
        </th>`;
    });
    headRow += '</tr>';
    thead.innerHTML = headRow;

    // Build Data Rows
    allResponsesData.forEach(r => {
        let row = `<tr class="animate-fade-in"><td>${new Date(r.submitted_at).toLocaleString()}</td>`;
        allQuestionsObj.forEach(q => {
            let ans = r.answers[q.id] || '';
            try {
                const parsed = JSON.parse(ans);
                ans = Array.isArray(parsed) ? parsed.join(', ') : ans;
            } catch(e) {}
            row += `<td>${ans}</td>`;
        });
        row += `</tr>`;
        tbody.innerHTML += row;
    });
}

window.sortTable = function(index) {
    if (currentSortCol === index) {
        currentSortAsc = !currentSortAsc; // Toggle direction
    } else {
        currentSortCol = index;
        currentSortAsc = true; // Default to ascending for new column
    }

    allResponsesData.sort((a, b) => {
        let valA, valB;
        if (index === 0) {
            valA = new Date(a.submitted_at).getTime();
            valB = new Date(b.submitted_at).getTime();
        } else {
            const qId = allQuestionsObj[index - 1].id;
            valA = a.answers[qId] || '';
            valB = b.answers[qId] || '';
            
            // Normalize JSON arrays for sorting
            try { const pA = JSON.parse(valA); if (Array.isArray(pA)) valA = pA.join(', '); } catch(e){}
            try { const pB = JSON.parse(valB); if (Array.isArray(pB)) valB = pB.join(', '); } catch(e){}
        }

        if (valA < valB) return currentSortAsc ? -1 : 1;
        if (valA > valB) return currentSortAsc ? 1 : -1;
        return 0;
    });

    renderTable();
};
