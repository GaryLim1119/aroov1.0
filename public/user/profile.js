let calendarInstance = null;
let selectedDates = null; // Store dates from drag selection

document.addEventListener('DOMContentLoaded', function() {
    
    // --- 1. MOBILE MENU ---
    const menuBtn = document.getElementById('mobile-menu-btn');
    const navLinks = document.getElementById('nav-links-container');
    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            menuBtn.classList.toggle('is-active');
        });
    }

    // --- 2. UNIVERSITY SELECT (Modern) ---
    const uniTrigger = document.getElementById('uni-dropdown-trigger');
    const uniList = document.getElementById('uni-dropdown-list');
    const uniSearch = document.getElementById('uni-search');
    const uniContainer = document.getElementById('uni-options-container');
    const uniHiddenInput = document.getElementById('university-id');
    const uniDisplayText = document.getElementById('uni-selected-text');

    const universities = [
        { id: 1, name: "Taylor's University" },
        { id: 2, name: "Sunway University" },
        { id: 3, name: "Monash University" },
        { id: 4, name: "APU (Asia Pacific University)" },
        { id: 5, name: "University of Malaya (UM)" },
        { id: 6, name: "UCSI University" },
        { id: 7, name: "UiTM" },
        { id: 8, name: "Nottingham University" }
    ];

    function renderUniversities(filter = '') {
        uniContainer.innerHTML = '';
        const filtered = universities.filter(u => u.name.toLowerCase().includes(filter.toLowerCase()));
        filtered.forEach(uni => {
            const div = document.createElement('div');
            div.className = 'uni-option';
            div.textContent = uni.name;
            div.onclick = () => {
                uniHiddenInput.value = uni.id;
                uniDisplayText.textContent = uni.name;
                uniDisplayText.classList.add('text-gray-800', 'font-medium');
                uniList.classList.add('hidden');
            };
            uniContainer.appendChild(div);
        });
        if(filtered.length === 0) uniContainer.innerHTML = '<div class="p-3 text-center text-gray-400 text-sm">No results</div>';
    }

    if(uniTrigger) {
        uniTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            uniList.classList.toggle('hidden');
            if(!uniList.classList.contains('hidden')) { uniSearch.value=''; renderUniversities(); uniSearch.focus(); }
        });
    }
    document.addEventListener('click', () => { if(uniList) uniList.classList.add('hidden'); });
    if(uniSearch) {
        uniSearch.addEventListener('click', (e) => e.stopPropagation());
        uniSearch.addEventListener('input', (e) => renderUniversities(e.target.value));
    }

    // --- 3. TAGS LOGIC (Separated Types & Activities) ---
    
    // Helper to setup toggle logic
    function setupTagGroup(btnClass, inputId) {
        const btns = document.querySelectorAll(btnClass);
        const input = document.getElementById(inputId);
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('selected');
                const selected = Array.from(document.querySelectorAll(`${btnClass}.selected`)).map(b => b.dataset.val);
                input.value = selected.join(',');
            });
        });
    }

    setupTagGroup('.type-btn', 'types-input');       // For Preferred Types
    setupTagGroup('.act-btn', 'activities-input');   // For Preferred Activities


    // --- 4. CALENDAR LOGIC ---
    const calendarEl = document.getElementById('calendar');
    const modal = document.getElementById('event-modal');
    const modalRange = document.getElementById('modal-date-range');
    const noteInput = document.getElementById('event-note');
    const saveAvailBtn = document.getElementById('save-avail-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');
    let currentSelection = null;

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        selectable: true,
        headerToolbar: { left: 'prev', center: 'title', right: 'next' },
        events: '/api/user/calendar',
        select: function(info) {
            currentSelection = info;
            let endDate = new Date(info.endStr);
            endDate.setDate(endDate.getDate() - 1);
            modalRange.innerText = `${info.startStr} to ${endDate.toISOString().split('T')[0]}`;
            modal.classList.remove('hidden');
        },
        eventClick: async function(info) {
            if (info.event.extendedProps.type === 'user_avail') {
                if (confirm('Delete this availability?')) {
                    await fetch(`/api/user/availability/${info.event.id}`, { method: 'DELETE' });
                    info.event.remove();
                }
            }
        }
    });
    calendar.render();

    if(closeModalBtn) closeModalBtn.addEventListener('click', () => { modal.classList.add('hidden'); calendar.unselect(); });

    if(saveAvailBtn) {
        saveAvailBtn.addEventListener('click', async () => {
            if(!currentSelection) return;
            const payload = {
                start_date: currentSelection.startStr,
                end_date: currentSelection.endStr,
                note: noteInput.value
            };
            try {
                const res = await fetch('/api/user/availability', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });
                if(res.ok) { calendar.refetchEvents(); modal.classList.add('hidden'); noteInput.value=''; }
                else alert('Failed to save availability');
            } catch(e) { console.error(e); }
        });
    }

    // --- 5. SAVE PROFILE (Fixed Separate Fields) ---
    const profileForm = document.getElementById('profile-form');
    if(profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = profileForm.querySelector('button[type="submit"]');
            btn.innerText = "Saving...";
            
            // Get values from hidden inputs
            const payload = {
                name: document.getElementById('display-name').value,
                university_id: document.getElementById('university-id').value,
                preferred_types: document.getElementById('types-input').value,       // New Field
                preferred_activities: document.getElementById('activities-input').value // New Field
            };

            try {
                // Using POST or PUT depending on your backend routes. Usually PUT for update.
                const res = await fetch('/api/user/profile', {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if(res.ok) {
                    alert('Profile updated!');
                    const navName = document.getElementById('navUserName');
                    if(navName) navName.textContent = payload.name;
                } else {
                    alert('Error saving profile. Check console.');
                }
            } catch(err) { console.error(err); alert('Server error'); }
            finally { btn.innerText = "Save Profile"; }
        });
    }

    // --- 6. CHANGE PASSWORD ---
    const passForm = document.getElementById('password-form');
    if(passForm) {
        passForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPass = document.getElementById('new-password').value;
            const confirmPass = document.getElementById('confirm-password').value;

            if(newPass.length < 6) return alert("Password must be at least 6 characters");
            if(newPass !== confirmPass) return alert("Passwords do not match");

            try {
                const res = await fetch('/api/user/password', {
                    method: 'POST', // or PUT
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ password: newPass })
                });
                if(res.ok) { alert("Password changed successfully!"); passForm.reset(); }
                else alert("Failed to change password.");
            } catch(e) { console.error(e); }
        });
    }

    // --- 7. LOAD DATA (Populate Separate Tags) ---
    async function loadData() {
        try {
            const res = await fetch('/api/user/me');
            if(res.ok) {
                const data = await res.json();
                
                // Name & Pic
                if(data.name) {
                    document.getElementById('display-name').value = data.name;
                    document.getElementById('navUserName').textContent = data.name;
                }
                if(data.picture) {
                    document.getElementById('navUserImg').src = data.picture;
                    document.getElementById('profile-pic-preview').src = data.picture;
                }

                // University
                if(data.university_id) {
                    const uni = universities.find(u => u.id == data.university_id);
                    if(uni) {
                        uniHiddenInput.value = uni.id;
                        uniDisplayText.textContent = uni.name;
                    }
                }

                // REPOPULATE TYPES
                if(data.preferred_types) {
                    const types = data.preferred_types.split(','); // Assumes comma-separated string in DB
                    document.querySelectorAll('.type-btn').forEach(btn => {
                        if(types.includes(btn.dataset.val)) btn.classList.add('selected');
                    });
                    document.getElementById('types-input').value = data.preferred_types;
                }

                // REPOPULATE ACTIVITIES
                if(data.preferred_activities) {
                    const acts = data.preferred_activities.split(','); 
                    document.querySelectorAll('.act-btn').forEach(btn => {
                        if(acts.includes(btn.dataset.val)) btn.classList.add('selected');
                    });
                    document.getElementById('activities-input').value = data.preferred_activities;
                }
            }
        } catch(e) { console.log("Error loading user data", e); }
    }

    loadData();
});