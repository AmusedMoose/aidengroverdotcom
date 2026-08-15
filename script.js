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

// Parses raw URLs, local relative asset paths, and Markdown [Text](URL/Path) into clickable <a> tags
function parseLinks(text) {
    if (!text) return '';

    // 1. Parse Markdown links: [Anchor Text](https://link.com OR assets/file.pdf)
    let formatted = text.replace(
        /\[([^\]]+)\]\(((?:https?:\/\/|\/|\.\/|\.\.\/|assets\/)[^\s\)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    // 2. Parse remaining raw http/https URLs not already wrapped in <a> tags
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
        const dataRows = rows.slice(1).filter(r => r.length >= headers.length && r[0]);

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
                <small>Note: If opening directly via browser (file://), run a local server (e.g., <code>python3 -m http.server</code>) to bypass CORS restrictions.</small>
            </div>
        `;
    }
}

function renderUI(projects, allCategories) {
    const container = document.getElementById('projects-container');
    const filterBar = document.getElementById('filter-bar');

    container.innerHTML = '';

    // Add dynamic filter buttons for active categories
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

            // 1. Header Media Block (Supports multi-line images and videos)
            let imageHtml = '';
            if (p['Header Image']) {
                const mediaFiles = p['Header Image'].split('\n').map(m => m.trim()).filter(m => m.length > 0);

                if (mediaFiles.length > 0) {
                    let mediaElements = mediaFiles.map(file => {
                        const isVideo = file.toLowerCase().endsWith('.mov') || file.toLowerCase().endsWith('.mp4') || file.toLowerCase().endsWith('.webm');

                        if (isVideo) {
                            return `
                                <video class="project-media project-video" autoplay loop muted playsinline>
                                    <source src="${file}" type="video/quicktime">
                                    <source src="${file}" type="video/mp4">
                                    Your browser does not support the video tag.
                                </video>
                            `;
                        } else {
                            return `
                                <img src="${file}" alt="${p['Overall project title']}" class="project-media project-image" onerror="this.style.display='none'">
                            `;
                        }
                    }).join('');

                    imageHtml = `
                        <div class="project-image-container">
                            ${mediaElements}
                        </div>
                    `;
                }
            }

            // 2. Dedicated Links Block
            let linksHtml = '';
            if (p['Links']) {
                const rawLinks = p['Links'].split('\n');
                const validLinks = rawLinks.map(l => l.trim()).filter(l => l.length > 0);

                if (validLinks.length > 0) {
                    linksHtml = '<div class="links-container">' + validLinks.map(l => {
                        let isUrl = l.startsWith('http://') || l.startsWith('https://') || l.includes('.com') || l.includes('.org') || l.includes('.net');
                        let url = l.startsWith('http') ? l : 'https://' + l;
                        let label = l.replace(/^https?:\/\//, '').split('/')[0];

                        if (!isUrl) {
                            return `<span class="project-link-note">📌 ${l}</span>`;
                        }

                        return `<a href="${url}" class="project-link" target="_blank" rel="noopener noreferrer">🔗 ${label}</a>`;
                    }).join('') + '</div>';
                }
            }

            // 3. Category Tags Block
            let tagsHtml = p.activeCategories.map(cat => `<span class="tag">${cat}</span>`).join('');

            // Combine Elements into Card
            card.innerHTML = `
                <div class="project-header">
                    <h2 class="project-title">${p['Overall project title']}</h2>
                    <span class="project-date">${p['Month (Range)']} ${p['Year (Range)']}</span>
                </div>
                ${imageHtml}
                <div class="tags-container">${tagsHtml}</div>
                <div class="project-desc">${parseLinks(p['Description'])}</div>
                ${linksHtml}
            `;
            container.appendChild(card);
        });
    }

    displayFilteredProjects();
}

loadProjects();

// Cursor Glow Tracker
const glow = document.getElementById('cursor-glow');
if (glow) {
    window.addEventListener('mousemove', (e) => {
        glow.style.left = `${e.clientX}px`;
        glow.style.top = `${e.clientY}px`;
        if (glow.style.opacity !== '1') {
            glow.style.opacity = '1';
        }
    });

    document.addEventListener('mouseleave', () => {
        glow.style.opacity = '0';
    });
}