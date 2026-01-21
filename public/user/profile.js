document.addEventListener('DOMContentLoaded', function() {
    
    // --- GLOBAL VARIABLES ---
    let allUniversities = [];
    let currentUserData = {
        role: 'student',       
        budget_min: 0,
        budget_max: 1000
    };

    // ==========================================
    // 1. MOBILE MENU TOGGLE
    // ==========================================
    const menuBtn = document.getElementById('mobile-menu-btn');
    const navLinks = document.getElementById('nav-links-container');
    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            menuBtn.classList.toggle('is-active');
        });
    }

    // ==========================================
    // 2. ROLE & UNIVERSITY LOGIC
    // ==========================================
    const uniSection = document.getElementById('uni-section');
    const roleRadios = document.querySelectorAll('input[name="role"]');

    function toggleUniversityField(role) {
        if (role === 'student') {
            uniSection.classList.remove('hidden', 'opacity-50', 'pointer-events-none');
        } else {
            uniSection.classList.add('hidden', 'opacity-50', 'pointer-events-none');
            // Optional: clear the selection if they switch to General
            document.getElementById('university-id').value = '';
            document.getElementById('uni-selected-text').textContent = 'Select University...';
        }
        currentUserData.role = role;
    }

    roleRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            toggleUniversityField(e.target.value);
        });
    });

    // ==========================================
    // 3. FETCH UNIVERSITIES
    // ==========================================
    const uniTrigger = document.getElementById('uni-dropdown-trigger');
    const uniList = document.getElementById('uni-dropdown-list');
    const uniSearch = document.getElementById('uni-search');
    const uniContainer = document.getElementById('uni-options-container');
    const uniHiddenInput = document.getElementById('university-id');
    const uniDisplayText = document.getElementById('uni-selected-text');

    async function loadUniversities() {
        try {
            const res = await fetch('/api/universities'); 
            if (!res.ok) throw new Error("Failed to load universities");
            allUniversities = await res.json();
            renderUniversities(); 
        } catch (err) {
            console.error(err);
            uniContainer.innerHTML = '<div class="p-3 text-red-500 text-sm">Error loading universities</div>';
        }
    }

    function renderUniversities(filterText = '') {
        uniContainer.innerHTML = '';
        const filtered = allUniversities.filter(u => 
            u.name.toLowerCase().includes(filterText.toLowerCase())
        );
        
        filtered.forEach(uni => {
            const div = document.createElement('div');
            div.className = 'uni-option';
            div.textContent = uni.name;
            div.onclick = () => selectUniversity(uni.university_id, uni.name);
            uniContainer.appendChild(div);
        });

        if (filtered.length === 0) uniContainer.innerHTML = '<div class="p-3 text-sm text-gray-400 text-center">No results found</div>';
    }

    function selectUniversity(id, name) {
        uniHiddenInput.value = id;
        uniDisplayText.textContent = name;
        uniDisplayText.classList.remove('text-gray-500');
        uniDisplayText.classList.add('text-gray-800', 'font-medium');
        uniList.classList.add('hidden'); 
    }

    if (uniTrigger) {
        uniTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            uniList.classList.toggle('hidden');
            if (!uniList.classList.contains('hidden')) {
                uniSearch.value = ''; renderUniversities(); uniSearch.focus();
            }
        });
    }
    document.addEventListener('click', () => { if(uniList) uniList.classList.add('hidden'); });
    if(uniSearch) {
        uniSearch.addEventListener('click', (e) => e.stopPropagation());
        uniSearch.addEventListener('input', (e) => renderUniversities(e.target.value));
    }

    // ==========================================
    // 4. TAGS LOGIC
    // ==========================================
    function setupTagGroup(btnClass, inputId) {
        const btns = document.querySelectorAll(btnClass);
        const input = document.getElementById(inputId);
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('selected');
                const selected = Array.from(document.querySelectorAll(`${btnClass}.selected`)).map(b => b.dataset.val);
                input.value = JSON.stringify(selected); 
            });
        });
    }

    setupTagGroup('.type-btn', 'types-input');
    setupTagGroup('.act-btn', 'activities-input');

    // ==========================================
    // 5. CALENDAR LOGIC (SMART TOGGLE VERSION)
    // ==========================================
    const calendarEl = document.getElementById('calendar');
    
    if (calendarEl) {
        const modal = document.getElementById('event-modal');
        const modalRange = document.getElementById('modal-date-range');
        const noteInput = document.getElementById('event-note');
        const saveAvailBtn = document.getElementById('save-avail-btn');
        const closeModalBtn = document.getElementById('close-modal-btn');
        
        // Store selection info globally
        let currentSelectionInfo = null; 

        const calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            selectable: true,
            editable: false,
            headerToolbar: { left: 'prev', center: 'title', right: 'next' },
            events: '/api/user/calendar',
            
            // --- SMART SELECT LOGIC ---
            select: async function(info) {
                const selStart = info.start;
                const selEnd = info.end;

                // 1. Check if we dragged over existing "Available" events
                const allEvents = calendar.getEvents();
                const overlappingEvents = allEvents.filter(event => {
                    // Check if event is 'user_busy' (Your Availability)
                    if (event.extendedProps.type !== 'user_busy') return false;

                    // Check for Date Overlap
                    // (Selection Start < Event End) AND (Selection End > Event Start)
                    return (selStart < event.end && selEnd > event.start);
                });

                // --- CONDITION A: If we dragged over GREEN -> DELETE IT (Back to Grey) ---
                if (overlappingEvents.length > 0) {
                    const confirmDelete = confirm(`Remove availability for these ${overlappingEvents.length} dates?`);
                    if (confirmDelete) {
                        for (let event of overlappingEvents) {
                            try {
                                await fetch(`/api/user/availability/${event.id}`, { method: 'DELETE' });
                                event.remove(); // Remove visually
                            } catch (e) { console.error(e); }
                        }
                    }
                    calendar.unselect();
                    return; // Stop here, do not open modal
                }

                // --- CONDITION B: If we dragged over GREY -> ADD NEW (Modal) ---
                currentSelectionInfo = info;
                
                // Format date text for Modal
                let endDate = new Date(info.endStr);
                endDate.setDate(endDate.getDate() - 1); // Adjust visual end date
                modalRange.innerText = `${info.startStr} to ${endDate.toISOString().split('T')[0]}`;
                
                // Reset Note & Show Modal
                noteInput.value = ''; 
                modal.classList.remove('hidden');
            },

            // Click is essentially same as drag-delete now, but good to keep as backup
            eventClick: async function(info) {
                if (info.event.extendedProps.type === 'user_busy') { 
                    if (confirm('Remove this availability slot?')) {
                        try {
                            const res = await fetch(`/api/user/availability/${info.event.id}`, { method: 'DELETE' });
                            if(res.ok) info.event.remove();
                        } catch(e) { console.error(e); }
                    }
                } else {
                    alert("This is a university schedule.");
                }
            }
        });
        calendar.render();

        // --- MODAL BUTTON LISTENERS ---

        // 1. Close Modal (Cancel)
        if(closeModalBtn) {
            closeModalBtn.addEventListener('click', () => { 
                modal.classList.add('hidden'); 
                calendar.unselect(); 
                currentSelectionInfo = null;
            });
        }

        // 2. Save Availability (Confirm)
        if(saveAvailBtn) {
            saveAvailBtn.addEventListener('click', async (e) => {
                e.preventDefault(); 
                
                if (!currentSelectionInfo) return;

                saveAvailBtn.innerText = "Saving...";
                
                const payload = {
                    start_date: currentSelectionInfo.startStr,
                    end_date: currentSelectionInfo.endStr,
                    note: noteInput.value || "Available"
                };

                try {
                    const res = await fetch('/api/user/availability', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if(res.ok) {
                        calendar.refetchEvents(); // Show the new Green block
                        modal.classList.add('hidden'); 
                        currentSelectionInfo = null;
                    } else {
                        alert("Error saving.");
                    }
                } catch(err) {
                    console.error("Network Error:", err);
                } finally {
                    saveAvailBtn.innerText = "Confirm";
                }
            });
        }
    }

    // ==========================================
    // 6. SHARED SAVE FUNCTION
    // ==========================================
    async function saveProfileData(password = null) {
        // Collect Tags
        let typesVal = document.getElementById('types-input').value;
        let actsVal = document.getElementById('activities-input').value;

        let typesPayload = [];
        let actsPayload = [];
        try { typesPayload = JSON.parse(typesVal || "[]"); } catch(e) { typesPayload = []; }
        try { actsPayload = JSON.parse(actsVal || "[]"); } catch(e) { actsPayload = []; }

        // Get Role directly from Checked Radio
        const selectedRoleEl = document.querySelector('input[name="role"]:checked');
        const roleValue = selectedRoleEl ? selectedRoleEl.value : 'student';

        const payload = {
            name: document.getElementById('display-name').value,
            university_id: document.getElementById('university-id').value,
            preferred_types: typesPayload,
            preferred_activities: actsPayload,
            role: roleValue, 
            budget_min: currentUserData.budget_min,
            budget_max: currentUserData.budget_max
        };

        if (password) payload.password = password;

        try {
            const res = await fetch('/api/user/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                alert(password ? 'Password updated!' : 'Profile updated successfully!');
                const navName = document.getElementById('navUserName');
                if(navName) navName.textContent = payload.name;
                return true;
            } else {
                const txt = await res.text();
                alert("Error: " + txt);
                return false;
            }
        } catch (err) {
            console.error(err);
            alert("Network error");
            return false;
        }
    }

    // ==========================================
    // 7. EVENT LISTENERS FOR FORMS
    // ==========================================
    const profileForm = document.getElementById('profile-form');
    if(profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = profileForm.querySelector('button[type="submit"]');
            btn.innerText = "Saving...";
            await saveProfileData();
            btn.innerText = "Save Profile";
        });
    }

    const passForm = document.getElementById('password-form');
    if(passForm) {
        passForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const p1 = document.getElementById('new-password').value;
            const p2 = document.getElementById('confirm-password').value;

            if(p1.length < 6) return alert("Password must be at least 6 characters");
            if(p1 !== p2) return alert("Passwords do not match");

            const success = await saveProfileData(p1);
            if(success) passForm.reset();
        });
    }

    // ==========================================
    // 8. INITIAL DATA LOAD
    // ==========================================
    async function loadData() {
        await loadUniversities(); 

        try {
            const res = await fetch('/api/user/profile');
            if(res.ok) {
                const data = await res.json();
                
                currentUserData.role = data.role || 'student';
                currentUserData.budget_min = data.budget_min || 0;
                currentUserData.budget_max = data.budget_max || 1000;

                // 1. Set Radio Button
                const roleRadio = document.querySelector(`input[name="role"][value="${currentUserData.role}"]`);
                if(roleRadio) {
                    roleRadio.checked = true;
                    toggleUniversityField(currentUserData.role);
                }

                // 2. Basic Info
                document.getElementById('display-name').value = data.name;
                document.getElementById('navUserName').textContent = data.name;
                if(data.picture) {
                    document.getElementById('navUserImg').src = data.picture;
                    document.getElementById('profile-pic-preview').src = data.picture;
                }

                // 3. University
                if(data.university_id) {
                    const uni = allUniversities.find(u => u.university_id == data.university_id);
                    if(uni) selectUniversity(uni.university_id, uni.name);
                }

                // 4. Tags
                let types = [];
                let activities = [];

                if (typeof data.preferred_types === 'string') {
                    try { types = JSON.parse(data.preferred_types); } catch(e) { types = data.preferred_types.split(','); }
                } else if (Array.isArray(data.preferred_types)) {
                    types = data.preferred_types;
                }

                if (typeof data.preferred_activities === 'string') {
                    try { activities = JSON.parse(data.preferred_activities); } catch(e) { activities = data.preferred_activities.split(','); }
                } else if (Array.isArray(data.preferred_activities)) {
                    activities = data.preferred_activities;
                }

                document.querySelectorAll('.type-btn').forEach(btn => {
                    if(types.includes(btn.dataset.val)) btn.classList.add('selected');
                });
                document.getElementById('types-input').value = JSON.stringify(types);

                document.querySelectorAll('.act-btn').forEach(btn => {
                    if(activities.includes(btn.dataset.val)) btn.classList.add('selected');
                });
                document.getElementById('activities-input').value = JSON.stringify(activities);
            }
        } catch(e) { console.log("Error loading user profile", e); }
    }

    // Upload Preview
    const fileInput = document.getElementById('profile-upload');
    const previewImg = document.getElementById('profile-pic-preview');
    if(fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if(file) {
                const reader = new FileReader();
                reader.onload = (e) => previewImg.src = e.target.result;
                reader.readAsDataURL(file);
            }
        });
    }

    loadData();
});