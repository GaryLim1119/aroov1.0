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
    // 5. CALENDAR LOGIC (3-OPTION VERSION)
    // ==========================================
    const calendarEl = document.getElementById('calendar');
    
    if (calendarEl) {
        const modal = document.getElementById('event-modal');
        const modalRange = document.getElementById('modal-date-range');
        const noteInput = document.getElementById('event-note');
        const oldSaveBtn = document.getElementById('save-avail-btn'); // We will hide this
        const closeBtn = document.getElementById('close-modal-btn');
        
        // Setup Custom Buttons Container (Injects if missing)
        let customBtnContainer = document.getElementById('custom-modal-actions');
        if (!customBtnContainer && modal) {
            // Find where to insert buttons (after the note input)
            const parent = noteInput.parentNode;
            customBtnContainer = document.createElement('div');
            customBtnContainer.id = 'custom-modal-actions';
            customBtnContainer.className = 'flex flex-col gap-2 mt-4';
            parent.insertBefore(customBtnContainer, oldSaveBtn.parentNode); // Insert before the old footer
        }

        // Store current selection
        let currentSelectionInfo = null; 

        // Helper to Create the 3-Button Menu
        function showActionButtons() {
            // Hide default input and save button
            if(noteInput) noteInput.style.display = 'none';
            if(oldSaveBtn) oldSaveBtn.parentElement.style.display = 'none'; // Hide the footer row
            
            // Clear old buttons
            customBtnContainer.innerHTML = '';

            // 1. AVAILABLE BUTTON (Green)
            const btnAvail = document.createElement('button');
            btnAvail.className = 'w-full py-2 bg-green-500 text-white rounded hover:bg-green-600 font-medium';
            btnAvail.innerText = "Mark as Available (Green)";
            btnAvail.onclick = () => saveStatus('Available');

            // 2. BUSY BUTTON (Red)
            const btnBusy = document.createElement('button');
            btnBusy.className = 'w-full py-2 bg-red-500 text-white rounded hover:bg-red-600 font-medium';
            btnBusy.innerText = "Mark as Busy (Red)";
            btnBusy.onclick = () => saveStatus('Busy');

            // 3. CLEAR BUTTON (Gray)
            const btnClear = document.createElement('button');
            btnClear.className = 'w-full py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 font-medium';
            btnClear.innerText = "Clear / No Condition (Gray)";
            btnClear.onclick = () => deleteStatus();

            // 4. CANCEL (Small text)
            const btnCancel = document.createElement('button');
            btnCancel.className = 'w-full text-xs text-gray-400 mt-2 hover:text-gray-600';
            btnCancel.innerText = "Cancel";
            btnCancel.onclick = () => { modal.classList.add('hidden'); calendar.unselect(); };

            customBtnContainer.appendChild(btnAvail);
            customBtnContainer.appendChild(btnBusy);
            customBtnContainer.appendChild(btnClear);
            customBtnContainer.appendChild(btnCancel);
        }

        // --- CALENDAR SETUP ---
        const calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            selectable: true,
            editable: false,
            headerToolbar: { left: 'prev', center: 'title', right: 'next' },
            events: '/api/user/calendar',
            
            // DRAG or CLICK triggers the menu
            select: function(info) {
                currentSelectionInfo = info;
                
                // Format Date
                let endDate = new Date(info.endStr);
                endDate.setDate(endDate.getDate() - 1);
                modalRange.innerText = `${info.startStr} to ${endDate.toISOString().split('T')[0]}`;
                
                // Show Menu
                showActionButtons();
                modal.classList.remove('hidden');
            },

            eventClick: function(info) {
                // If clicking an existing event, treat it as a selection of that date
                if (info.event.extendedProps.type === 'user_busy') {
                    // Manually trigger selection logic for this single event
                    currentSelectionInfo = {
                        startStr: info.event.startStr,
                        endStr: info.event.endStr || info.event.startStr // Handle single days
                    };
                    
                    modalRange.innerText = `Edit: ${info.event.startStr}`;
                    showActionButtons();
                    modal.classList.remove('hidden');
                }
            }
        });
        calendar.render();

        // --- ACTION HANDLERS ---

        // SAVE (Available or Busy)
        async function saveStatus(statusNote) {
            if (!currentSelectionInfo) return;
            
            // 1. First, delete any existing overlap to avoid duplicates
            // (We do this by just overwriting on the server usually, but let's be safe)
            // Ideally, your INSERT logic handles overlaps, but simple INSERT is fine.
            
            const payload = {
                start_date: currentSelectionInfo.startStr,
                end_date: currentSelectionInfo.endStr,
                note: statusNote
            };

            try {
                // We use a helper endpoint or just the normal POST
                // NOTE: Ideally, the server should delete overlaps before inserting.
                // But since we are "overwriting", we can just Post.
                const res = await fetch('/api/user/availability', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if(res.ok) {
                    calendar.refetchEvents();
                    modal.classList.add('hidden');
                    calendar.unselect();
                } else {
                    alert("Error saving.");
                }
            } catch(e) { console.error(e); }
        }

        // DELETE (Clear / Gray)
        async function deleteStatus() {
            if (!currentSelectionInfo) return;
            
            // Since we selected a RANGE (potentially multiple events), 
            // we really need a "Delete by Range" endpoint. 
            // But to keep it simple, we will fetch events in this range and delete them 1 by 1.
            
            const allEvents = calendar.getEvents();
            const selStart = new Date(currentSelectionInfo.startStr);
            const selEnd = new Date(currentSelectionInfo.endStr);

            const eventsToDelete = allEvents.filter(e => {
                 return (e.extendedProps.type === 'user_busy') && 
                        (e.start < selEnd && (e.end || e.start) > selStart);
            });

            if (eventsToDelete.length === 0) {
                modal.classList.add('hidden');
                calendar.unselect();
                return;
            }

            // Loop delete
            for (let ev of eventsToDelete) {
                await fetch(`/api/user/availability/${ev.id}`, { method: 'DELETE' });
            }
            
            calendar.refetchEvents();
            modal.classList.add('hidden');
            calendar.unselect();
        }
    }

    // ==========================================
    // 6. SHARED SAVE FUNCTION (Profile Data)
    // ==========================================
    async function saveProfileData(password = null) {
        let typesVal = document.getElementById('types-input').value;
        let actsVal = document.getElementById('activities-input').value;

        let typesPayload = [];
        let actsPayload = [];
        try { typesPayload = JSON.parse(typesVal || "[]"); } catch(e) { typesPayload = []; }
        try { actsPayload = JSON.parse(actsVal || "[]"); } catch(e) { actsPayload = []; }

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

                const roleRadio = document.querySelector(`input[name="role"][value="${currentUserData.role}"]`);
                if(roleRadio) {
                    roleRadio.checked = true;
                    toggleUniversityField(currentUserData.role);
                }

                document.getElementById('display-name').value = data.name;
                document.getElementById('navUserName').textContent = data.name;
                if(data.picture) {
                    document.getElementById('navUserImg').src = data.picture;
                    document.getElementById('profile-pic-preview').src = data.picture;
                }

                if(data.university_id) {
                    const uni = allUniversities.find(u => u.university_id == data.university_id);
                    if(uni) selectUniversity(uni.university_id, uni.name);
                }

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