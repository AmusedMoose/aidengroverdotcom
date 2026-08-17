// Global array to track carousel intervals across re-renders
let carouselIntervals = [];

// Stateful CSV parser handling embedded quotes, commas, and multiline cells
function parseCSV(text) {
    let rows = [];
    let currentRow = [];
    let currentField = '';
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        let nextChar = text[i + 1];

        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                currentField += '"';
                i++;
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (char === ',' && !insideQuotes) {
            currentRow.push(currentField);
            currentField = '';
        } else if ((char === '\r' || char === '\n') && !insideQuotes) {
            if (char === '\r' && nextChar === '\n') {
                i++;
            }
            currentRow.push(currentField);
            if (currentRow.length > 1 || currentRow[0] !== '') {
                rows.push(currentRow);
            }
            currentRow = [];
            currentField = '';
        } else {
            currentField += char;
        }
    }

    if (currentField !== '' || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }

    return rows;
}

function parseDescription(text) {
    if (!text) return '';

    let formatted = text;

    // 1. Convert literal '\n' sequences into actual newline breaks
    formatted = formatted.replace(/\\n/g, '\n');

    // 2. Parse Markdown Bold & Italic formatting
    // ***bold italic*** or ___bold italic___
    formatted = formatted.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    formatted = formatted.replace(/___(.*?)___/g, '<strong><em>$1</em></strong>');

    // **bold** or __bold__
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/__(.*?)__/g, '<strong>$1</strong>');

    // *italic* or _italic_
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/_(.*?)(?<!_)_{1}(?!_)/g, '<em>$1</em>');

    // 3. Parse Markdown links: [Anchor Text](https://link.com)
    formatted = formatted.replace(
        /\[([^\]]+)\]\(((?:https?:\/\/|\/|\.\/|\.\.\/|assets\/)[^\s\)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    // 4. Parse remaining raw http/https URLs
    formatted = formatted.replace(
        (/(^|[\s(])(https?:\/\/[^\s\)]+)/g),
        '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>'
    );

    return formatted;
}

async function loadProjects() {
    try {
        const response = await fetch('content.csv');
        if (!response.ok) throw new Error('Could not load content.csv. Make sure it is in the root directory!');
        const csvText = await response.text();

        const rows = parseCSV(csvText);
        if (rows.length < 2) return;

        const headers = rows[0].map(h => h.trim());
        const dataRows = rows.slice(1).filter(r => r.length > 1 && r[0] && r[0].trim() !== '');

        const categoryColumns = ['CAD', '3D Printing', 'LEGO', 'PCB Design / Electronics', 'Coding', 'Science Fair', 'Blender', 'Other'];

        let projects = dataRows.map(row => {
            let obj = {};
            headers.forEach((header, index) => {
                obj[header] = row[index] !== undefined ? row[index].trim() : '';
            });

            let activeCategories = [];
            categoryColumns.forEach(cat => {
                if (obj[cat] && obj[cat].toLowerCase() === 'x') {
                    activeCategories.push(cat);
                }
            });
            obj.activeCategories = activeCategories;

            return obj;
        });

        // Sort by Priority ascending
        projects.sort((a, b) => parseInt(a.Priority || 9999) - parseInt(b.Priority || 9999));

        renderUI(projects, categoryColumns);

    } catch (err) {
        document.getElementById('projects-container').innerHTML = `
            <div class="error">
                <strong>Error loading projects:</strong> ${err.message}<br><br>
                <small>Note: Run via a local web server (e.g., <code>python3 -m http.server</code>) to prevent browser CORS blocks.</small>
            </div>
        `;
    }
}

function renderUI(projects, allCategories) {
    const container = document.getElementById('projects-container');
    const filterBar = document.getElementById('filter-bar');

    container.innerHTML = '';

    // Create Category filter buttons dynamically
    allCategories.forEach(cat => {
        if (projects.some(p => p.activeCategories.includes(cat))) {
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            btn.dataset.filter = cat;
            btn.textContent = cat;
            filterBar.appendChild(btn);
        }
    });

    let currentFilter = 'All';
    filterBar.addEventListener('click', (e) => {
        if (!e.target.classList.contains('filter-btn')) return;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentFilter = e.target.dataset.filter;
        displayFilteredProjects();
    });

    function displayFilteredProjects() {
        // Stop all running carousel intervals when filter changes
        carouselIntervals.forEach(clearInterval);
        carouselIntervals = [];

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

            // 1. Header Media Rendering
            let imageHtml = '';
            if (p['Header Image']) {
                const mediaLines = p['Header Image'].split('\n').map(m => m.trim()).filter(m => m.length > 0);

                if (mediaLines.length > 0) {
                    const cleanedMedia = mediaLines.map(line => {
                        const parts = line.split('|');
                        const file = parts[0].trim();
                        const flags = parts.slice(1).map(f => f.toLowerCase().trim());
                        return { file, flags };
                    });

                    const isCarousel = cleanedMedia.some(item => item.flags.includes('carousel'));

                    if (isCarousel) {
                        let imgsHtml = cleanedMedia.map((item, idx) => {
                            const activeClass = idx === 0 ? ' active' : '';
                            return `<img src="${item.file}" alt="${p['Overall project title']}" class="carousel-img${activeClass}" onerror="this.style.display='none'">`;
                        }).join('');

                        imageHtml = `
                            <div class="project-image-container">
                                <div class="project-carousel">
                                    ${imgsHtml}
                                </div>
                            </div>
                        `;
                    } else {
                        let mediaElements = cleanedMedia.map(item => {
                            const file = item.file;
                            const hasAudio = item.flags.includes('sound') || item.flags.includes('audio');
                            const isVideo = file.toLowerCase().endsWith('.mov') ||
                                file.toLowerCase().endsWith('.mp4') ||
                                file.toLowerCase().endsWith('.webm');

                            if (isVideo) {
                                if (hasAudio) {
                                    return `
                                        <video class="project-media project-video" controls playsinline loop preload="metadata">
                                            <source src="${file}" type="video/mp4">
                                            <source src="${file}" type="video/quicktime">
                                        </video>
                                    `;
                                } else {
                                    return `
                                        <video class="project-media project-video" autoplay loop muted playsinline>
                                            <source src="${file}" type="video/mp4">
                                            <source src="${file}" type="video/quicktime">
                                        </video>
                                    `;
                                }
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
            }

            // 2. Links Section Parsing
            let linksHtml = '';
            if (p['Links']) {
                const rawLinks = p['Links'].split('\n');
                const validLinks = rawLinks.map(l => l.trim()).filter(l => l.length > 0);

                if (validLinks.length > 0) {
                    linksHtml = '<div class="links-container">' + validLinks.map(l => {
                        let isUrl = l.startsWith('http://') || l.startsWith('https://') || l.includes('.com') || l.includes('.org') || l.includes('.net') || l.includes('.pdf');
                        let url = l.startsWith('http') ? l : (l.startsWith('assets/') ? l : 'https://' + l);
                        let label = l.replace(/^https?:\/\//, '').split('/')[0];

                        if (!isUrl) {
                            return `<span class="project-link-note">📌 ${l}</span>`;
                        }

                        return `<a href="${url}" class="project-link" target="_blank" rel="noopener noreferrer">🔗 ${label}</a>`;
                    }).join('') + '</div>';
                }
            }

            // 3. Category Tags
            let tagsHtml = p.activeCategories.map(cat => `<span class="tag">${cat}</span>`).join('');

            // Build Project Card HTML
            card.innerHTML = `
                <div class="project-header">
                    <h2 class="project-title">${p['Overall project title']}</h2>
                    <span class="project-date">${p['Month (Range)']} ${p['Year (Range)']}</span>
                </div>
                ${imageHtml}
                <div class="tags-container">${tagsHtml}</div>
                <div class="project-desc">${parseDescription(p['Description'])}</div>
                ${linksHtml}
            `;
            container.appendChild(card);
        });

        initCarousels();
    }

    displayFilteredProjects();
}

function initCarousels() {
    const carousels = document.querySelectorAll('.project-carousel');
    carousels.forEach(carousel => {
        const images = carousel.querySelectorAll('.carousel-img');
        if (images.length <= 1) return;

        let currentIndex = 0;
        const intervalId = setInterval(() => {
            images[currentIndex].classList.remove('active');
            currentIndex = (currentIndex + 1) % images.length;
            images[currentIndex].classList.add('active');
        }, 2000);

        carouselIntervals.push(intervalId);
    });
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