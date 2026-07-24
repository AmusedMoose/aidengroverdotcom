/**
 * Dynamic Skills Generator
 * Recreates the semantic "bar" effect based on your technical content.
 */
const technicalArsenal = [
    "PCB Design",
    " KiCad",
    "STM32 MCU",
    "ARM Cortex",
    "Embedded C/C++",
    "Python",
    "CAD (Fusion 360)",
    "LEGO Set Design",
    "E-Commerce Automation",
    "Web Development (HTML/CSS/JS)",
    "Inventory Scaling",
    "Circuit Simulation"
];

function populateSkills() {
    const container = document.getElementById('skills-container');

    // Prevent errors if container isn't found
    if (!container) return;

    technicalArsenal.forEach(skill => {
        const span = document.createElement('span');
        span.classList.add('skill-tag');
        span.textContent = skill;
        container.appendChild(span);
    });
}

/**
 * Handle smooth scrolling for anchors manually if css behavior isn't supported,
 * and provide dynamic navbar effects on scroll.
 */
function initScrollEffects() {
    const nav = document.querySelector('.navbar');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            nav.style.backgroundColor = 'rgba(12, 12, 14, 0.95)';
            nav.style.backdropFilter = 'blur(10px)';
            nav.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';
            nav.style.padding = '1rem 2rem';
        } else {
            nav.style.backgroundColor = 'transparent';
            nav.style.backdropFilter = 'none';
            nav.style.boxShadow = 'none';
            nav.style.padding = '2rem';
        }
    });
}

// Ensure DOM is fully loaded before executing scripts
document.addEventListener('DOMContentLoaded', () => {
    populateSkills();
    initScrollEffects();
});