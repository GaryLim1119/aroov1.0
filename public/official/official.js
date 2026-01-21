document.addEventListener('DOMContentLoaded', () => {
    loadDestinations();
    setupModalListeners();
});


// Mobile Menu Toggle Logic
const menuToggle = document.querySelector('#mobile-menu');
const navLinks = document.querySelector('.nav-links');

menuToggle.addEventListener('click', () => {
    // Toggle the menu opening/closing
    navLinks.classList.toggle('active');
    
    // Optional: Animate the hamburger icon into an 'X'
    const bars = document.querySelectorAll('.bar');
    if (navLinks.classList.contains('active')) {
        bars[0].style.transform = 'translateY(8px) rotate(45deg)';
        bars[1].style.opacity = '0';
        bars[2].style.transform = 'translateY(-8px) rotate(-45deg)';
    } else {
        bars[0].style.transform = 'none';
        bars[1].style.opacity = '1';
        bars[2].style.transform = 'none';
    }
});

// Helper function to close menu when a link is clicked
function closeMenu() {
    if (window.innerWidth <= 768) {
        navLinks.classList.remove('active');
        // Reset icon
        const bars = document.querySelectorAll('.bar');
        bars[0].style.transform = 'none';
        bars[1].style.opacity = '1';
        bars[2].style.transform = 'none';
    }
}


// --- 1. FETCH AND RENDER DATA ---
async function loadDestinations() {
    try {
        // CHANGED: We now ask the server for "random" destinations
        const response = await fetch('/api/destinations/random');
        const data = await response.json();
        const grid = document.getElementById('destinations-grid');

        grid.innerHTML = ''; // Clear loading content

        if (data.length === 0) {
            grid.innerHTML = '<p style="color:white;text-align:center">No destinations found.</p>';
            return;
        }

        data.forEach(item => {
            // Fix Image Path
            let imgUrl = item.images;
            if (imgUrl && !imgUrl.startsWith('http') && !imgUrl.startsWith('/')) {
                imgUrl = '/uploads/' + imgUrl;
            }

            // Create List Item
            const li = document.createElement('li');
            
            // Create Card Div
            const card = document.createElement('div');
            card.className = 'card';
            
            // Add HTML Content
            card.innerHTML = `
                <div class="card-image" style="background-image: url('${imgUrl}')"></div>
                <div class="card-content">
                    <h2>${item.name}</h2>
                    <p>${item.state}</p>
                    <div class="card-tags">
                        <span>${item.type}</span>
                        <span>RM${item.price_min}</span>
                    </div>
                </div>
            `;

            // Add Click Listener
            card.addEventListener('click', () => openModal(item, imgUrl));

            li.appendChild(card);
            grid.appendChild(li);
        });

    } catch (error) {
        console.error('Error:', error);
        document.getElementById('destinations-grid').innerHTML = '<p style="color:white;text-align:center">Failed to load data.</p>';
    }
}

// --- 2. MODAL LOGIC (Standard) ---
function openModal(item, imgUrl) {
    document.getElementById('modal-title').textContent = item.name;
    document.getElementById('modal-image').src = imgUrl;
    document.getElementById('modal-description').textContent = item.description || "No description.";
    
    document.getElementById('modal-state').textContent = item.state || "-";
    document.getElementById('modal-type').textContent = item.type || "-";
    document.getElementById('modal-activities').textContent = item.activities || "-";
    document.getElementById('modal-price').textContent = `RM${item.price_min} - RM${item.price_max}`;

    const gmapBtn = document.getElementById('modal-gmap-link');
    const mapContainer = document.querySelector('.map-container');
    const mapFrame = document.getElementById('modal-map-frame');

    // Button Link
    if (item.maps_place_id && item.maps_place_id.startsWith('http')) {
        gmapBtn.href = item.maps_place_id;
    } else {
        const query = (item.latitude && item.longtitude) 
            ? `${item.latitude},${item.longtitude}` 
            : encodeURIComponent(item.name);
        gmapBtn.href = `https://www.google.com/maps/search/?api=1&query=${query}`;
    }

    // Embedded Map
    if (item.latitude && item.longtitude) {
        mapContainer.style.display = 'block';
        mapFrame.src = `https://maps.google.com/maps?q=${item.latitude},${item.longtitude}&z=15&output=embed`;
    } else {
        mapContainer.style.display = 'none';
    }

    const modal = document.getElementById('modal');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function setupModalListeners() {
    const modal = document.getElementById('modal');
    const closeBtn = document.getElementById('close-modal-btn');
    const closeModal = () => {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        document.getElementById('modal-map-frame').src = ""; 
    };
    closeBtn.addEventListener('click', closeModal);
    window.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}