let calendarInstance = null;
let selectedDates = null; // Store dates from drag selection

document.addEventListener('DOMContentLoaded', () => {
    // 1. Mobile Menu Toggle Logic
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const navLinks = document.getElementById('nav-links-container');

    mobileBtn.addEventListener('click', () => {
        navLinks.classList.toggle('active');
    });

    // 2. Initial Data Load
    fetchUserProfileNav();
    initProfileData();
    initCalendar();
    
    // 3. Tag Logic
    document.querySelectorAll('.tag-item').forEach(tag => {
        tag.addEventListener('click', function() {
            this.classList.toggle('selected');
        });
    });
});

// --- CALENDAR LOGIC (User Availability) ---
function initCalendar() {
    const calendarEl = document.getElementById('calendar');

    calendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: { left: 'prev', center: 'title', right: 'next' },
        selectable: true, // Allows drag selection
        events: '/api/user/calendar', // Fetches Uni events AND User Availability
        
        // When user drags across dates
        select: function(info) {
            selectedDates = {
                start: info.startStr,
                end: info.endStr // FullCalendar end date is exclusive (correct for DB)
            };
            
            // Show Modal
            document.getElementById('modalDateRange').innerText = 
                `From ${info.startStr} to ${getDateBefore(info.endStr)}`;
            document.getElementById('availNote').value = ""; // Clear input
            document.getElementById('availModal').classList.remove('hidden');
        },

        // When user clicks an existing event
        eventClick: async function(info) {
            // Only allow deleting user's own busy events (marked grey)
            if (info.event.backgroundColor === '#555' || info.event.extendedProps.type === 'user_busy') {
                if(confirm("Remove this busy period?")) {
                    await deleteAvailability(info.event.id);
                }
            }
        }
    });

    calendarInstance.render();
}

// --- MODAL FUNCTIONS ---
function closeModal() {
    document.getElementById('availModal').classList.add('hidden');
    calendarInstance.unselect(); // Clear visual selection
}

async function saveAvailability() {
    const note = document.getElementById('availNote').value;
    const btn = document.querySelector('.btn-confirm');
    btn.innerText = "Saving...";

    try {
        const payload = {
            start_date: selectedDates.start,
            end_date: selectedDates.end,
            note: note
        };

        const res = await fetch('/api/user/availability', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });

        if(res.ok) {
            calendarInstance.refetchEvents(); // Reload calendar to show new grey block
            closeModal();
        } else {
            alert("Failed to save dates.");
        }
    } catch(err) {
        console.error(err);
    } finally {
        btn.innerText = "Mark as Busy";
    }
}

async function deleteAvailability(avail_id) {
    try {
        const res = await fetch(`/api/user/availability/${avail_id}`, { method: 'DELETE' });
        if(res.ok) calendarInstance.refetchEvents();
    } catch(err) { console.error(err); }
}

// Helper: FullCalendar end date is exclusive, so visual needs -1 day
function getDateBefore(dateStr) {
    let date = new Date(dateStr);
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
}

// --- PROFILE DATA LOGIC (Same as before) ---
async function initProfileData() {
    try {
        const res = await fetch('/api/user/profile');
        if (res.status === 401) return window.location.href = '/login';
        const user = await res.json();

        // Load University Options
        const uniRes = await fetch('/api/universities');
        const unis = await uniRes.json();
        const uniSelect = document.getElementById('selectUni');
        uniSelect.innerHTML = `<option value="">-- Select University --</option>` + 
            unis.map(u => `<option value="${u.university_id}">${u.name}</option>`).join('');

        // Fill Fields
        document.getElementById('profileAvatar').src = user.picture || 'https://via.placeholder.com/100';
        document.getElementById('profileNameDisplay').textContent = user.name;
        document.getElementById('profileEmailDisplay').textContent = user.email;
        document.getElementById('inputName').value = user.name;
        document.getElementById('budgetMin').value = user.budget_min;
        document.getElementById('budgetMax').value = user.budget_max;

        if (user.role === 'student') {
            document.querySelector(`input[name="role"][value="student"]`).checked = true;
            toggleUniversity(true);
            uniSelect.value = user.university_id || "";
        } else {
            document.querySelector(`input[name="role"][value="general"]`).checked = true;
            toggleUniversity(false);
        }

        restoreTags('typeTags', user.preferred_types);
        restoreTags('activityTags', user.preferred_activities);

    } catch (err) { console.error(err); }
}

function restoreTags(id, data) {
    if(!data) return;
    const arr = typeof data === 'string' ? JSON.parse(data) : data;
    const container = document.getElementById(id);
    Array.from(container.children).forEach(tag => {
        if(arr.includes(tag.getAttribute('data-val'))) tag.classList.add('selected');
    });
}

function toggleUniversity(isStudent) {
    const s = document.getElementById('uniSection');
    isStudent ? s.classList.remove('hidden') : s.classList.add('hidden');
}

// Update Navbar
async function fetchUserProfileNav() {
    try {
        const res = await fetch('/api/user/profile'); 
        if (res.ok) {
            const user = await res.json();
            document.getElementById('navUserName').textContent = user.name; 
            if (user.picture) document.getElementById('navUserImg').src = user.picture;
        }
    } catch (e) {}
}

// Form Submit
document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSave');
    btn.disabled = true; btn.innerText = "Saving...";

    const payload = {
        name: document.getElementById('inputName').value,
        role: document.querySelector('input[name="role"]:checked').value,
        university_id: document.getElementById('selectUni').value,
        budget_min: document.getElementById('budgetMin').value,
        budget_max: document.getElementById('budgetMax').value,
        preferred_types: Array.from(document.querySelectorAll('#typeTags .selected')).map(t=>t.dataset.val),
        preferred_activities: Array.from(document.querySelectorAll('#activityTags .selected')).map(t=>t.dataset.val)
    };

    try {
        await fetch('/api/user/profile', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        alert("Saved!");
        calendarInstance.refetchEvents();
    } catch(err) { alert("Error"); }
    finally { btn.disabled = false; btn.innerText = "Save Changes"; }
});