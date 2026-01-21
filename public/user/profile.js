// public/user/profile.js

let calendarInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    fetchUserProfileNav(); // Sets navbar name/image
    initProfileData();     // Loads user data from DB
    initCalendar();        // Setup FullCalendar
    
    // Tag Selection Logic (Visual toggle)
    document.querySelectorAll('.tag-item').forEach(tag => {
        tag.addEventListener('click', function() {
            this.classList.toggle('selected');
        });
    });
});

// --- 1. LOAD PROFILE DATA ---
async function initProfileData() {
    try {
        // Fetch User Info
        const res = await fetch('/api/user/profile');
        if (res.status === 401) return window.location.href = '/login'; // Redirect if not logged in
        const user = await res.json();

        // Fetch University List
        const uniRes = await fetch('/api/universities');
        const unis = await uniRes.json();
        
        // Populate Dropdown
        const uniSelect = document.getElementById('selectUni');
        uniSelect.innerHTML = `<option value="">-- Select University --</option>` + 
            unis.map(u => `<option value="${u.university_id}">${u.name}</option>`).join('');

        // Fill Form Fields
        document.getElementById('profileAvatar').src = user.picture || 'https://via.placeholder.com/100';
        document.getElementById('profileNameDisplay').textContent = user.name;
        document.getElementById('profileEmailDisplay').textContent = user.email;
        document.getElementById('inputName').value = user.name;
        document.getElementById('budgetMin').value = user.budget_min;
        document.getElementById('budgetMax').value = user.budget_max;

        // Set Role & Toggle UI
        if (user.role === 'student') {
            document.querySelector(`input[name="role"][value="student"]`).checked = true;
            toggleUniversity(true);
            uniSelect.value = user.university_id || "";
        } else {
            document.querySelector(`input[name="role"][value="general"]`).checked = true;
            toggleUniversity(false);
        }

        // Restore Selected Tags (Parse JSON from DB)
        restoreTags('typeTags', user.preferred_types);
        restoreTags('activityTags', user.preferred_activities);

    } catch (err) {
        console.error("Load Error:", err);
    }
}

function restoreTags(containerId, savedData) {
    if(!savedData) return;
    // Handle both JSON string or already parsed array
    const savedArray = typeof savedData === 'string' ? JSON.parse(savedData) : savedData;
    
    const container = document.getElementById(containerId);
    Array.from(container.children).forEach(tag => {
        if (savedArray.includes(tag.getAttribute('data-val'))) {
            tag.classList.add('selected');
        }
    });
}

// --- 2. FORM INTERACTION ---
// Shows/Hides University Dropdown based on Role
function toggleUniversity(isStudent) {
    const section = document.getElementById('uniSection');
    if(isStudent) {
        section.classList.remove('hidden');
    } else {
        section.classList.add('hidden');
        document.getElementById('selectUni').value = ""; // Reset if switched to traveler
    }
}

// SAVE BUTTON Logic
document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSave');
    btn.innerText = "Saving...";
    btn.disabled = true;

    // Collect Form Data
    const name = document.getElementById('inputName').value;
    const role = document.querySelector('input[name="role"]:checked').value;
    const university_id = document.getElementById('selectUni').value;
    const budget_min = document.getElementById('budgetMin').value;
    const budget_max = document.getElementById('budgetMax').value;
    const password = document.getElementById('inputPass').value;

    // Collect Tags
    const preferred_types = [];
    document.querySelectorAll('#typeTags .tag-item.selected').forEach(t => preferred_types.push(t.getAttribute('data-val')));

    const preferred_activities = [];
    document.querySelectorAll('#activityTags .tag-item.selected').forEach(t => preferred_activities.push(t.getAttribute('data-val')));

    const payload = {
        name, role, university_id, budget_min, budget_max, password,
        preferred_types, preferred_activities
    };

    try {
        const res = await fetch('/api/user/profile', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            alert("✅ Profile Updated!");
            calendarInstance.refetchEvents(); // Refresh calendar in case University changed
            fetchUserProfileNav(); // Update navbar
        } else {
            const data = await res.json();
            alert("⚠️ " + (data.error || "Update failed"));
        }
    } catch (err) {
        console.error(err);
        alert("Network Error");
    } finally {
        btn.innerText = "Save Changes";
        btn.disabled = false;
    }
});

// --- 3. CALENDAR LOGIC ---
function initCalendar() {
    const calendarEl = document.getElementById('calendar');

    calendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        height: 'auto',
        headerToolbar: { left: 'prev', center: 'title', right: 'next' },
        events: '/api/user/calendar', // Auto-fetches from our server route
        
        // Handle clicking a date to block/unblock
        dateClick: async function(info) {
            const dateStr = info.dateStr;
            const cell = info.dayEl;
            cell.style.opacity = '0.5'; // Visual feedback

            try {
                const res = await fetch('/api/user/calendar/toggle', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ date: dateStr })
                });
                
                if(res.ok) {
                    calendarInstance.refetchEvents(); // Refresh to show/hide grey block
                }
            } catch(err) {
                console.error(err);
            } finally {
                cell.style.opacity = '1';
            }
        }
    });

    calendarInstance.render();
}

// Helper to update Navbar Name/Pic
async function fetchUserProfileNav() {
    try {
        const res = await fetch('/api/user/profile'); 
        if (res.ok) {
            const user = await res.json();
            document.getElementById('navUserName').textContent = user.name || "Traveler"; 
            if (user.picture) document.getElementById('navUserImg').src = user.picture;
        }
    } catch (err) { }
}