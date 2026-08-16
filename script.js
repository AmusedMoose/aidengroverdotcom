// Global array to manage active carousel timers
let carouselIntervals = [];

// Stateful CSV parser that correctly handles multiline values inside quoted fields
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
                // Handle escaped quotes ("")
                currentField += '"';
                i++;
            } else {
                // Toggle quote state
                insideQuotes = !insideQuotes;
            }
        } else if (char === ',' && !insideQuotes) {
            // End of field
            currentRow.push(currentField);
            currentField = '';
        } else if ((char === '\r' || char === '\n') && !insideQuotes) {
            // End of row (skip \r in \r\n pairs)
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

    // Push final field/row if text doesn't end with a newline
    if (currentField !== '' || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }

    return rows;
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
        if (!response.ok) throw new Error('Could not load content.csv');
        const csvText = await response.text();

        const rows = parseCSV(csvText);
        if (rows.length < 2) return;

        const headers = rows[0].map(h => h.trim());
        // Updated filter logic: ensure row exists and has at least a title
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

        projects.sort((a, b) => parseInt(a.Priority || 9999) - parseInt(b.Priority || 9999));
        renderUI(projects, categoryColumns);

    } catch (err) {
        document.getElementById('projects-container').innerHTML = `
            <div class="error">
                <strong>Error loading projects:</strong> ${err.message}
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
        // Clear any running carousel intervals before re-rendering
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

            // 1. Header Media Block (Supports images, videos, audio flags, and carousels)
            let imageHtml = '';
            if (p['Header Image']) {
                const mediaLines = p['Header Image'].split('\n').map(m => m.trim()).filter(m => m.length > 0);

                if (mediaLines.length > 0) {
                    // Parse paths and metadata flags
                    const cleanedMedia = mediaLines.map(line => {
                        const parts = line.split('|');
                        const file = parts[0].trim();
                        const flags = parts.slice(1).map(f => f.toLowerCase().trim());
                        return { file, flags };
                    });

                    const isCarousel = cleanedMedia.some(item => item.flags.includes('carousel'));

                    if (isCarousel) {
                        // Render Carousel Container
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
                        // Standard Vertical Media List
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
                                            Your browser does not support the video tag.
                                        </video>
                                    `;
                                } else {
                                    return `
                                        <video class="project-media project-video" autoplay loop muted playsinline>
                                            <source src="${file}" type="video/mp4">
                                            <source src="${file}" type="video/quicktime">
                                            Your browser does not support the video tag.
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

        // Initialize Carousel Timers (Flips every 1000ms)
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
        }, 1000); // 1 second interval

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