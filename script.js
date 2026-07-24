// script.js for rendering dynamic technical skills tags
document.addEventListener("DOMContentLoaded", () => {
    const skills = [
        "Embedded Systems", "STM32", "Arduino IDE", "KiCad",
        "PCB Design", "Python", "JavaScript", "HTML/CSS",
        "CAD / 3D Modeling", "G-code", "Photogrammetry"
    ];

    const skillsContainer = document.getElementById("skills-container");
    if (skillsContainer) {
        skills.forEach(skill => {
            const tag = document.createElement("span");
            tag.className = "skill-tag";
            tag.textContent = skill;
            skillsContainer.appendChild(tag);
        });
    }
});