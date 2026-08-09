// Robust CSV parser handling multiline quotes and commas
function parseCSV(text) {
    let p = '', row = [''], ret = [row], i = 0, r = 0, s = !0;
    for (let l of text) {
        if ('"' === l) {
            if (s && l === p) row[row.length - 1] += l;
            s = !s;
        } else if (',' === l && s) {
            row.push(p = '');
        } else if ('\r' === l && s) {
            // skip carriage return
        } else if ('\n' === l && s) {
            if (p === '' && row.length === 1 && row[0] === '') {
                continue;
            }
            row = [p = ''];
            ret.push(row);
        } else {
            p += l;
            row[row.length - 1] = p;
        }
    }
    return ret;
}

// Parses raw URLs and Markdown [Text](URL) into clickable <a> tags
function parseLinks(text) {
    if (!text) return '';

    // 1. Parse Markdown links [Anchor Text](https://link.com)
    let formatted = text.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    // 2. Parse remaining raw http/https URLs not already in <a> tags
    formatted = formatted.replace(
        (/(^|[\s(])(https?:\/\/[^\s\)]+)/g),
        '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>'
    );

    return formatted;
}

async function loadProjects() {
    try {
        const response = await fetch('content.csv');
        if (!response.ok) throw new Error('Could not load content.csv. Make sure it is in the same directory!');
        const csvText = await response.text();

        const rows = parseCSV(csvText);
        if (rows.length < 2) return;

        const headers = rows[0].map(h => h.trim());
        const dataRows = rows.slice(1).filter(r => r.length >= headers.length && r[1]); // Row index 1 matches Priority

        const categoryColumns = ['CAD', '3D Printing', 'LEGO', 'PCB Design / Electronics', 'Coding', 'Science Fair', 'Blender', 'Other'];

        let projects = dataRows.map(row => {
            let obj = {};
            headers.forEach((header, index) => {
                obj[header] = row[index] !== undefined ? row[index].trim() : '';
            });

            // Extract active categories marked with 'x'
            let activeCategories = [];
            categoryColumns.forEach(cat => {
                if (obj[cat] && obj[cat].toLowerCase() === 'x') {
                    activeCategories.push(cat);
                }
            });
            obj.activeCategories = activeCategories;

            return obj;
        });

        // Sort by Priority ascending (1, 2, 3...)
        projects.sort((a, b) => parseInt(a.Priority || 99) - parseInt(b.Priority || 99));

        renderUI(projects, categoryColumns);

    } catch (err) {
        document.getElementById('projects-container').innerHTML = `
            <div class="error">
                <strong>Error loading projects:</strong> ${err.message}<br><br>
                <small>Note: If opening directly via browser (file://), run a quick local server (e.g., <code>python3 -m http.server</code>) to bypass CORS restrictions.</small>
            </div>
        `;
    }
}

function renderUI(projects, allCategories) {
    const container = document.getElementById('projects-container');
    const filterBar = document.getElementById('filter-bar');

    container.innerHTML = '';

    // Add dynamic filter buttons
    allCategories.forEach(cat => {
        if (projects.some(p => p.activeCategories.includes(cat))) {
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            btn.dataset.filter = cat;
            btn.textContent = cat;
            filterBar.appendChild(btn);
        }
    });

    // Filter handling
    let currentFilter = 'All';
    filterBar.addEventListener('click', (e) => {
        if (!e.target.classList.contains('filter-btn')) return;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentFilter = e.target.dataset.filter;
        displayFilteredProjects();
    });

    function displayFilteredProjects() {
        container.innerHTML = '';
        const filtered = currentFilter === 'All'
            ? projects
            : projects.filter(p => p.activeCategories.includes(currentFilter));

        if (filtered.length === 0) {
            container.innerHTML = '<div class="loading">No projects found in this category.</div>';
            return;
        }

        filtered.forEach(p => {
            const card = document.createElement('div');
            card.className = 'project-card';

            // Format footer links
            let linksHtml = '';
            if (p['Image/link/etc']) {
                const rawLinks = p['Image/link/etc'].split('\n');
                linksHtml = '<div class="links-container">' + rawLinks.map(l => {
                    l = l.trim();
                    if (!l) return '';
                    let url = l.startsWith('http') ? l : 'https://' + l;
                    let label = l.replace(/^https?:\/\//, '').split('/')[0];
                    return `<a href="${url}" class="project-link" target="_blank" rel="noopener noreferrer">🔗 ${label}</a>`;
                }).join('') + '</div>';
            }

            // Format tags
            let tagsHtml = p.activeCategories.map(cat => `<span class="tag">${cat}</span>`).join('');

            card.innerHTML = `
                <div class="project-header">
                    <h2 class="project-title">${p['Overall project title']}</h2>
                    <span class="project-date">${p['Month (Range)']} ${p['Year (Range)']}</span>
                </div>
                <div class="tags-container">${tagsHtml}</div>
                <div class="project-desc">${parseLinks(p.Description)}</div>
                ${linksHtml}
            `;
            container.appendChild(card);
        });
    }

    displayFilteredProjects();
}

loadProjects();