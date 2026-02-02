// Dynamically detect API base URL based on current host
// This works for localhost, local network IP, ngrok, or any external URL
const API_BASE = `${window.location.origin}/api`;

let fieldsConfig = [];
let currentScoutingType = null;
let currentSortColumn = 'timestamp';
let currentSortOrder = 'desc';
let isAuthenticated = false;
let currentUser = null;
let canEditData = false;
let canUploadData = false;
let canManageUsers = false;
let scoutingTypesList = {};

// Build URL for View Data (for redirect after sign-in)
function getViewDataUrl() {
    const type = currentScoutingType || 'prematch';
    return `${window.location.pathname || '/'}?view=data&type=${type}`;
}

// Check auth state (permissions: canUpload, canEdit, canManageUsers)
async function checkAuth() {
    try {
        const res = await fetch(`${API_BASE}/me`, { credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            isAuthenticated = true;
            currentUser = data.user || null;
            canEditData = data.canEdit === true;
            canUploadData = data.canUpload === true;
            canManageUsers = data.canManageUsers === true;
        } else {
            isAuthenticated = false;
            currentUser = null;
            canEditData = false;
            canUploadData = false;
            canManageUsers = false;
        }
    } catch (e) {
        isAuthenticated = false;
        currentUser = null;
        canEditData = false;
        canUploadData = false;
        canManageUsers = false;
    }
    updateAuthUI();
    updateFormPermissions();
    return isAuthenticated;
}

function updateAuthUI() {
    const authLink = document.getElementById('auth-link');
    const logoutBtn = document.getElementById('logout-btn');
    const authStatus = document.getElementById('auth-status');
    const authHint = document.getElementById('auth-hint');
    if (!authLink) return;
    const returnTo = document.getElementById('view-data-section') && document.getElementById('view-data-section').style.display !== 'none'
        ? getViewDataUrl()
        : (window.location.pathname || '/') + (window.location.search || '');
    authLink.href = '/auth/google?returnTo=' + encodeURIComponent(returnTo);
    if (isAuthenticated && currentUser) {
        authLink.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
        if (authStatus) {
            authStatus.textContent = `Signed in as ${currentUser.displayName || currentUser.email || 'Google'}`;
            authStatus.style.display = 'inline';
        }
        if (authHint) {
            authHint.textContent = canEditData ? '' : (canUploadData ? 'You can submit data but only admins can edit or delete.' : 'Sign in with Google. Ask an admin to grant you upload or edit access.');
            authHint.style.display = (isAuthenticated && (canEditData || canUploadData)) ? 'none' : 'block';
        }
    } else {
        authLink.style.display = 'inline-block';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (authStatus) authStatus.style.display = 'none';
        if (authHint) authHint.style.display = 'block';
    }
}

async function logout() {
    try {
        await fetch(`${API_BASE}/logout`, { method: 'POST', credentials: 'include' });
    } catch (e) {}
    isAuthenticated = false;
    currentUser = null;
    canEditData = false;
    canUploadData = false;
    canManageUsers = false;
    updateAuthUI();
    updateFormPermissions();
    if (document.getElementById('view-data-section') && document.getElementById('view-data-section').style.display !== 'none') {
        loadData();
    }
}

// Show/hide submit vs QR based on canUpload; disable file inputs when !canUpload
function updateFormPermissions() {
    const submitBtn = document.querySelector('#scouting-form button[type="submit"]');
    const qrBtn = document.getElementById('create-qr-btn');
    const formHint = document.getElementById('form-submit-hint');
    if (submitBtn) submitBtn.style.display = canUploadData ? 'inline-block' : 'none';
    if (qrBtn) qrBtn.style.display = 'inline-block';
    if (formHint) {
        formHint.textContent = canUploadData ? '' : 'You can create a QR code so someone with access can submit this for you.';
        formHint.style.display = canUploadData ? 'none' : 'block';
    }
    document.querySelectorAll('#form-fields input[type="file"]').forEach(el => {
        el.disabled = !canUploadData;
        el.title = canUploadData ? '' : 'Sign in with upload access to add files';
    });
}

// Initialize app
async function init() {
    // Check if server is running
    try {
        const healthCheck = await fetch(`${API_BASE}/health`);
        if (!healthCheck.ok) {
            throw new Error('Server health check failed');
        }
        const health = await healthCheck.json();
        console.log('Server is running. Scouting types available:', health.scoutingTypes);
    } catch (error) {
        console.error('Server health check failed:', error);
        const grid = document.getElementById('scouting-types-grid');
        grid.innerHTML = `
            <div style="color: red; padding: 20px; text-align: center;">
                <p><strong>Cannot connect to server</strong></p>
                <p>Make sure the server is running:</p>
                <p><code>npm start</code></p>
                <p>Server should be at: ${API_BASE.replace('/api', '')}</p>
            </div>
        `;
        return;
    }
    
    await loadScoutingTypes();
    await checkAuth();
    addManageUsersCardIfNeeded();

    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'failed') {
        window.history.replaceState({}, '', window.location.pathname);
        showMessage('Google sign-in failed. Try again.', 'error');
    }
    if (params.get('payload')) {
        showPayloadView(params.get('payload'));
        return;
    }
    if (params.get('view') === 'data' && params.get('type')) {
        openViewDataSection(params.get('type'));
        if (params.get('auth') === 'success') {
            window.history.replaceState({}, '', getViewDataUrl());
            await checkAuth();
        }
    } else {
        if (params.get('auth') === 'success') {
            window.history.replaceState({}, '', window.location.pathname);
            await checkAuth();
        }
        showMainMenu();
    }
}

// Load available scouting types
async function loadScoutingTypes() {
    try {
        const response = await fetch(`${API_BASE}/scouting-types`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('Received scouting types:', data);
        
        if (!data.scoutingTypes || Object.keys(data.scoutingTypes).length === 0) {
            console.error('No scouting types received');
            document.getElementById('scouting-types-grid').innerHTML = 
                '<p style="color: red; padding: 20px;">No scouting types configured. Please check the server configuration.</p>';
            return;
        }
        
        scoutingTypesList = data.scoutingTypes || {};
        renderScoutingTypes(scoutingTypesList);
    } catch (error) {
        console.error('Error loading scouting types:', error);
        const grid = document.getElementById('scouting-types-grid');
        grid.innerHTML = `
            <div style="color: red; padding: 20px; text-align: center;">
                <p><strong>Error loading scouting types</strong></p>
                <p>${error.message}</p>
                <p>Make sure the server is running on ${API_BASE}</p>
            </div>
        `;
    }
}

// Render main menu: scouting type cards + View Data card
function renderScoutingTypes(types) {
    const grid = document.getElementById('scouting-types-grid');
    grid.innerHTML = '';

    Object.keys(types).forEach(typeKey => {
        const type = types[typeKey];
        const card = document.createElement('div');
        card.className = 'scouting-type-card';
        card.onclick = () => selectScoutingType(typeKey);
        card.innerHTML = `<h3>${type.name}</h3><p>${type.description}</p>`;
        grid.appendChild(card);
    });

    const viewDataCard = document.createElement('div');
    viewDataCard.className = 'scouting-type-card view-data-card';
    viewDataCard.onclick = () => openViewDataSection(Object.keys(types)[0] || 'prematch');
    viewDataCard.innerHTML = '<h3>📊 View Data</h3><p>View, edit, or remove scouting data</p>';
    grid.appendChild(viewDataCard);
}

function addManageUsersCardIfNeeded() {
    if (!canManageUsers || document.querySelector('.manage-users-card')) return;
    const grid = document.getElementById('scouting-types-grid');
    if (!grid) return;
    const manageCard = document.createElement('div');
    manageCard.className = 'scouting-type-card manage-users-card';
    manageCard.onclick = () => openUserManagementSection();
    manageCard.innerHTML = '<h3>👥 Manage Users</h3><p>Add users and change permissions (admin only)</p>';
    grid.appendChild(manageCard);
}

// Select a scouting type (form only, no View Data tab)
async function selectScoutingType(type) {
    currentScoutingType = type;
    await loadFieldsConfig(type);
    renderForm();
    updateFormPermissions();
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('scouting-interface').style.display = 'block';
    document.getElementById('view-data-section').style.display = 'none';
}

// Open View Data section (separate from form)
async function openViewDataSection(type) {
    currentScoutingType = type;
    await loadFieldsConfig(type);
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('scouting-interface').style.display = 'none';
    document.getElementById('view-data-section').style.display = 'block';

    const typeSelect = document.getElementById('view-data-type');
    typeSelect.innerHTML = '';
    Object.keys(scoutingTypesList).forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = scoutingTypesList[key].name;
        if (key === type) opt.selected = true;
        typeSelect.appendChild(opt);
    });
    updateAuthUI();
    await checkAuth();
    loadData();
    window.history.replaceState({}, '', getViewDataUrl());
}

function onViewDataTypeChange() {
    const type = document.getElementById('view-data-type').value;
    currentScoutingType = type;
    loadFieldsConfig(type).then(() => loadData());
    window.history.replaceState({}, '', getViewDataUrl());
}

// Show main menu
function showMainMenu() {
    currentScoutingType = null;
    document.getElementById('main-menu').style.display = 'block';
    document.getElementById('scouting-interface').style.display = 'none';
    document.getElementById('view-data-section').style.display = 'none';
    if (document.getElementById('payload-view-section')) document.getElementById('payload-view-section').style.display = 'none';
    if (document.getElementById('user-management-section')) document.getElementById('user-management-section').style.display = 'none';
    window.history.replaceState({}, '', window.location.pathname || '/');
}

// Load field configuration from server
async function loadFieldsConfig(type) {
    try {
        const response = await fetch(`${API_BASE}/fields/${type}`);
        const config = await response.json();
        fieldsConfig = config.fields || [];
    } catch (error) {
        console.error('Error loading fields config:', error);
        showMessage('Error loading form configuration', 'error');
    }
}

// Render form based on field configuration
function renderForm() {
    const formFields = document.getElementById('form-fields');
    formFields.innerHTML = '';

    fieldsConfig.forEach(field => {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';

        const label = document.createElement('label');
        label.textContent = field.label;
        if (field.required) {
            label.innerHTML += ' <span style="color: red;">*</span>';
        }
        formGroup.appendChild(label);

        let input;
        
        switch (field.type) {
            case 'file':
                input = document.createElement('input');
                input.type = 'file';
                input.id = field.id;
                input.accept = field.accept || '*/*';
                input.onchange = (e) => handleFileUpload(e, field.id);
                
                const previewContainer = document.createElement('div');
                previewContainer.id = `${field.id}-preview`;
                previewContainer.style.marginTop = '10px';
                formGroup.appendChild(input);
                formGroup.appendChild(previewContainer);
                formFields.appendChild(formGroup);
                return;
                
            case 'select':
                input = document.createElement('select');
                input.id = field.id;
                input.required = field.required || false;
                
                if (field.options) {
                    field.options.forEach(option => {
                        const optionEl = document.createElement('option');
                        optionEl.value = option;
                        optionEl.textContent = option;
                        input.appendChild(optionEl);
                    });
                }
                break;
                
            case 'textarea':
                input = document.createElement('textarea');
                input.id = field.id;
                input.required = field.required || false;
                input.placeholder = field.placeholder || '';
                break;
                
            case 'checkbox':
                const checkboxGroup = document.createElement('div');
                checkboxGroup.className = 'checkbox-group';
                input = document.createElement('input');
                input.type = 'checkbox';
                input.id = field.id;
                checkboxGroup.appendChild(input);
                const checkboxLabel = document.createElement('label');
                checkboxLabel.textContent = field.label;
                checkboxLabel.style.fontWeight = 'normal';
                checkboxLabel.style.marginBottom = '0';
                checkboxGroup.appendChild(checkboxLabel);
                formGroup.innerHTML = '';
                formGroup.appendChild(checkboxGroup);
                formFields.appendChild(formGroup);
                return;
                
            default:
                input = document.createElement('input');
                input.type = field.type || 'text';
                input.id = field.id;
                input.required = field.required || false;
                input.placeholder = field.placeholder || '';
        }

        formGroup.appendChild(input);
        formFields.appendChild(formGroup);
    });
}

// Handle file upload
async function handleFileUpload(event, fieldId) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });

        const result = await response.json();

        if (response.ok) {
            // Store file path in hidden input
            let hiddenInput = document.getElementById(`${fieldId}-hidden`);
            if (!hiddenInput) {
                hiddenInput = document.createElement('input');
                hiddenInput.type = 'hidden';
                hiddenInput.id = `${fieldId}-hidden`;
                document.getElementById(fieldId).parentElement.appendChild(hiddenInput);
            }
            hiddenInput.value = result.filePath;

            // Show preview
            const previewContainer = document.getElementById(`${fieldId}-preview`);
            if (previewContainer) {
                previewContainer.innerHTML = `
                    <img src="${result.filePath}" alt="Preview" class="image-preview">
                `;
            }
        } else {
            if (response.status === 401) showMessage('Sign in with Google to upload files.', 'error');
            else if (response.status === 403) showMessage('Your account does not have upload permission.', 'error');
            else showMessage(result.error || 'Error uploading file', 'error');
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        showMessage('Error uploading file', 'error');
    }
}

// —— Create QR code (anyone can use; no login required) ——
function createQRCode() {
    if (!currentScoutingType) {
        showMessage('No scouting type selected', 'error');
        return;
    }
    const formData = collectFormData(false); // allow partial data for QR
    const payload = { type: currentScoutingType, data: formData };
    const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const url = `${window.location.origin}${window.location.pathname || '/'}?payload=${encodeURIComponent(base64)}`;
    const container = document.getElementById('qr-code-container');
    container.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
        new QRCode(container, { text: url, width: 256, height: 256 });
    } else {
        container.innerHTML = '<p>QR library not loaded. Open: <a href="' + url + '" target="_blank">' + url + '</a></p>';
    }
    document.getElementById('qr-modal').style.display = 'flex';
}

function closeQRModal() {
    document.getElementById('qr-modal').style.display = 'none';
}

function collectFormData(requireValid) {
    const formData = {};
    let valid = true;
    fieldsConfig.forEach(field => {
        if (field.type === 'file') {
            const hiddenInput = document.getElementById(`${field.id}-hidden`);
            formData[field.id] = hiddenInput ? hiddenInput.value : null;
        } else {
            const input = document.getElementById(field.id);
            if (input) {
                if (field.type === 'checkbox') {
                    formData[field.id] = input.checked ? 1 : 0;
                } else {
                    formData[field.id] = input.value;
                }
                if (field.required && (input.value === '' || (field.type === 'checkbox' && !input.checked))) valid = false;
            }
        }
    });
    if (requireValid === false) return formData; // for QR: always return data
    return (valid || Object.keys(formData).length) ? formData : null;
}

document.getElementById('create-qr-btn').addEventListener('click', createQRCode);

// —— Payload view (when someone scans the QR) ——
let payloadData = null;
let payloadType = null;

function showPayloadView(encoded) {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('scouting-interface').style.display = 'none';
    document.getElementById('view-data-section').style.display = 'none';
    document.getElementById('user-management-section').style.display = 'none';
    document.getElementById('payload-view-section').style.display = 'block';

    try {
        const json = decodeURIComponent(escape(atob(encoded)));
        const parsed = JSON.parse(json);
        payloadType = parsed.type;
        payloadData = parsed.data;
        if (!payloadType || !payloadData) throw new Error('Invalid payload');
    } catch (e) {
        document.getElementById('payload-data-display').innerHTML = '<p class="error">Invalid or corrupted QR data.</p>';
        document.getElementById('payload-submit-area').style.display = 'none';
        document.getElementById('payload-sign-in-hint').style.display = 'none';
        return;
    }

    const display = document.getElementById('payload-data-display');
    display.innerHTML = '<table class="data-table"><tbody></tbody></table>';
    const tbody = display.querySelector('tbody');
    Object.keys(payloadData).forEach(key => {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td><strong>' + key + '</strong></td><td>' + (payloadData[key] != null ? payloadData[key] : '') + '</td>';
        tbody.appendChild(tr);
    });

    const submitArea = document.getElementById('payload-submit-area');
    const signInHint = document.getElementById('payload-sign-in-hint');
    const signInLink = document.getElementById('payload-sign-in-link');
    if (canUploadData) {
        submitArea.style.display = 'block';
        signInHint.style.display = 'none';
    } else {
        submitArea.style.display = 'none';
        signInHint.style.display = 'block';
        if (signInLink) signInLink.href = '/auth/google?returnTo=' + encodeURIComponent(window.location.href);
    }
}

function closePayloadView() {
    window.history.replaceState({}, '', window.location.pathname || '/');
    document.getElementById('payload-view-section').style.display = 'none';
    showMainMenu();
}

document.getElementById('payload-submit-btn').addEventListener('click', async () => {
    if (!payloadData || !payloadType || !canUploadData) return;
    try {
        const res = await fetch(`${API_BASE}/submit/${payloadType}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadData),
            credentials: 'include'
        });
        const result = await res.json();
        const msgEl = document.getElementById('payload-message');
        msgEl.textContent = res.ok ? 'Data submitted successfully.' : (result.error || 'Submit failed.');
        msgEl.className = res.ok ? 'success' : 'error';
        msgEl.style.display = 'block';
        if (res.ok) setTimeout(closePayloadView, 1500);
    } catch (e) {
        document.getElementById('payload-message').textContent = 'Network error.';
        document.getElementById('payload-message').className = 'error';
        document.getElementById('payload-message').style.display = 'block';
    }
});

// —— User management (admin only) ——
async function openUserManagementSection() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('scouting-interface').style.display = 'none';
    document.getElementById('view-data-section').style.display = 'none';
    document.getElementById('payload-view-section').style.display = 'none';
    document.getElementById('user-management-section').style.display = 'block';
    await loadUsers();
}

function closeUserManagement() {
    document.getElementById('user-management-section').style.display = 'none';
    showMainMenu();
}

async function loadUsers() {
    const container = document.getElementById('users-list-container');
    container.innerHTML = '<p class="loading">Loading users...</p>';
    try {
        const res = await fetch(`${API_BASE}/users`, { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) {
            container.innerHTML = '<p class="error">' + (data.error || 'Failed to load users') + '</p>';
            return;
        }
        const users = data.users || [];
        container.innerHTML = '';
        if (users.length === 0) {
            container.innerHTML = '<p class="empty-state">No users yet. Add one above.</p>';
            return;
        }
        const table = document.createElement('table');
        table.className = 'data-table';
        table.innerHTML = '<thead><tr><th>Email</th><th>Role</th><th>Actions</th></tr></thead><tbody></tbody>';
        const tbody = table.querySelector('tbody');
        users.forEach(u => {
            const tr = document.createElement('tr');
            const roleSelect = document.createElement('select');
            roleSelect.innerHTML = '<option value="upload"' + (u.role === 'upload' ? ' selected' : '') + '>Upload only</option><option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>Admin</option>';
            roleSelect.onchange = () => updateUserRole(u.email, roleSelect.value);
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-danger btn-sm';
            removeBtn.textContent = 'Remove';
            removeBtn.onclick = () => removeUser(u.email);
            tr.innerHTML = '<td>' + u.email + '</td><td></td><td></td>';
            tr.querySelector('td:nth-child(2)').appendChild(roleSelect);
            tr.querySelector('td:nth-child(3)').appendChild(removeBtn);
            tbody.appendChild(tr);
        });
        container.appendChild(table);
    } catch (e) {
        container.innerHTML = '<p class="error">Failed to load users.</p>';
    }
}

async function addUser() {
    const emailInput = document.getElementById('new-user-email');
    const roleInput = document.getElementById('new-user-role');
    const email = (emailInput.value || '').trim().toLowerCase();
    if (!email) {
        showUserMessage('Enter an email address.', 'error');
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, role: roleInput.value }),
            credentials: 'include'
        });
        const data = await res.json();
        if (res.ok) {
            showUserMessage('User added.', 'success');
            emailInput.value = '';
            loadUsers();
        } else {
            showUserMessage(data.error || 'Failed to add user', 'error');
        }
    } catch (e) {
        showUserMessage('Network error.', 'error');
    }
}

async function updateUserRole(email, role) {
    try {
        const res = await fetch(`${API_BASE}/users/${encodeURIComponent(email)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role }),
            credentials: 'include'
        });
        const data = await res.json();
        if (res.ok) {
            showUserMessage('Role updated.', 'success');
        } else {
            showUserMessage(data.error || 'Update failed', 'error');
            loadUsers();
        }
    } catch (e) {
        showUserMessage('Network error.', 'error');
        loadUsers();
    }
}

async function removeUser(email) {
    if (!confirm('Remove user ' + email + '?')) return;
    try {
        const res = await fetch(`${API_BASE}/users/${encodeURIComponent(email)}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const data = await res.json();
        if (res.ok) {
            showUserMessage('User removed.', 'success');
            loadUsers();
        } else {
            showUserMessage(data.error || 'Remove failed', 'error');
        }
    } catch (e) {
        showUserMessage('Network error.', 'error');
    }
}

function showUserMessage(msg, type) {
    const el = document.getElementById('user-management-message');
    el.textContent = msg;
    el.className = type;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// Handle form submission (requires upload or admin)
document.getElementById('scouting-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentScoutingType) {
        showMessage('No scouting type selected', 'error');
        return;
    }
    
    const formData = collectFormData(true);
    if (!formData) {
        showMessage('Fill in required fields', 'error');
        return;
    }
    const missing = [];
    fieldsConfig.forEach(f => {
        if (f.required && (formData[f.id] == null || formData[f.id] === '')) missing.push(f.label);
    });
    if (missing.length) {
        showMessage('Missing required fields: ' + missing.join(', '), 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/submit/${currentScoutingType}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData),
            credentials: 'include'
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('Scouting data saved successfully!', 'success');
            document.getElementById('scouting-form').reset();
            // Clear file previews
            fieldsConfig.forEach(field => {
                if (field.type === 'file') {
                    const previewContainer = document.getElementById(`${field.id}-preview`);
                    if (previewContainer) {
                        previewContainer.innerHTML = '';
                    }
                    const hiddenInput = document.getElementById(`${field.id}-hidden`);
                    if (hiddenInput) {
                        hiddenInput.remove();
                    }
                }
            });
            if (document.getElementById('view-tab') && document.getElementById('view-tab').classList.contains('active')) {
                loadData();
            }
        } else {
            if (response.status === 401) {
                showMessage('Sign in with Google to submit data.', 'error');
            } else if (response.status === 403) {
                showMessage(result.error || 'Your account does not have permission to submit. Ask an admin for access.', 'error');
            } else {
                showMessage(result.error || 'Failed to save data', 'error');
            }
            if (result.missingFields) {
                showMessage('Missing: ' + result.missingFields.join(', '), 'error');
            }
        }
    } catch (error) {
        console.error('Error submitting form:', error);
        showMessage('Error connecting to server. Make sure the server is running.', 'error');
    }
});

// Load and display data
async function loadData() {
    if (!currentScoutingType) return;
    
    const container = document.getElementById('data-container');
    container.innerHTML = '<p class="loading">Loading data...</p>';

    try {
        const response = await fetch(`${API_BASE}/data/${currentScoutingType}?sortBy=${currentSortColumn}&sortOrder=${currentSortOrder}`);
        const data = await response.json();

        if (data.length === 0) {
            container.innerHTML = '<p class="empty-state">No scouting data yet. Start scouting to see data here!</p>';
            return;
        }

        // Create table
        const table = document.createElement('table');
        table.className = 'data-table';

        // Create header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        // Add timestamp header
        const timestampHeader = document.createElement('th');
        timestampHeader.textContent = 'Timestamp';
        timestampHeader.className = 'sortable';
        timestampHeader.onclick = () => sortData('timestamp');
        if (currentSortColumn === 'timestamp') {
            timestampHeader.className += ` sort-${currentSortOrder}`;
        }
        headerRow.appendChild(timestampHeader);

        // Add field headers
        fieldsConfig.forEach(field => {
            const th = document.createElement('th');
            th.textContent = field.label;
            
            if (field.sortable) {
                th.className = 'sortable';
                th.onclick = () => sortData(field.id);
                if (currentSortColumn === field.id) {
                    th.className += ` sort-${currentSortOrder}`;
                }
            }
            
            headerRow.appendChild(th);
        });

        // Add actions header (only when allowed to edit)
        if (canEditData) {
            const actionsHeader = document.createElement('th');
            actionsHeader.textContent = 'Actions';
            headerRow.appendChild(actionsHeader);
        }

        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create body
        const tbody = document.createElement('tbody');
        data.forEach(row => {
            const tr = document.createElement('tr');

            // Timestamp cell
            const timestampCell = document.createElement('td');
            const date = new Date(row.timestamp);
            timestampCell.textContent = date.toLocaleString();
            tr.appendChild(timestampCell);

            // Field cells
            fieldsConfig.forEach(field => {
                const td = document.createElement('td');
                let value = row[field.id];
                
                if (field.type === 'file' && value) {
                    td.className = 'image-cell';
                    // Ensure image path is relative to current origin
                    const imageSrc = value.startsWith('http') ? value : (value.startsWith('/') ? value : `/${value}`);
                    td.innerHTML = `<img src="${imageSrc}" alt="Robot" onerror="this.style.display='none'">`;
                } else {
                    if (value === null || value === undefined) {
                        value = '-';
                    } else if (field.type === 'checkbox') {
                        value = value ? 'Yes' : 'No';
                    }
                    td.textContent = value;
                }
                
                tr.appendChild(td);
            });

            // Actions cell (only when allowed to edit)
            if (canEditData) {
                const actionsCell = document.createElement('td');
                actionsCell.className = 'actions-cell';
                const editBtn = document.createElement('button');
                editBtn.className = 'btn btn-secondary';
                editBtn.style.marginRight = '8px';
                editBtn.textContent = 'Edit';
                editBtn.onclick = () => openEditModal(row);
                actionsCell.appendChild(editBtn);
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn btn-danger';
                deleteBtn.textContent = 'Delete';
                deleteBtn.onclick = () => deleteEntry(row.id);
                actionsCell.appendChild(deleteBtn);
                tr.appendChild(actionsCell);
            }

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        container.innerHTML = '';
        const scrollWrapper = document.createElement('div');
        scrollWrapper.className = 'data-table-scroll-wrapper';
        scrollWrapper.appendChild(table);
        container.appendChild(scrollWrapper);
    } catch (error) {
        console.error('Error loading data:', error);
        container.innerHTML = '<p class="empty-state" style="color: #e74c3c;">Error loading data. Make sure the server is running.</p>';
    }
}

// Sort data
function sortData(column) {
    if (currentSortColumn === column) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortOrder = 'asc';
    }
    loadData();
}

let editingRowId = null;

function openEditModal(row) {
    editingRowId = row.id;
    const container = document.getElementById('edit-form-fields');
    container.innerHTML = '';
    fieldsConfig.forEach(field => {
        if (field.type === 'file') {
            const formGroup = document.createElement('div');
            formGroup.className = 'form-group';
            const label = document.createElement('label');
            label.textContent = field.label;
            formGroup.appendChild(label);
            const input = document.createElement('input');
            input.type = 'file';
            input.id = 'edit-' + field.id;
            input.accept = field.accept || '*/*';
            formGroup.appendChild(input);
            const preview = document.createElement('div');
            preview.id = 'edit-' + field.id + '-preview';
            if (row[field.id]) {
                const img = document.createElement('img');
                img.src = row[field.id].startsWith('/') ? row[field.id] : '/' + row[field.id];
                img.className = 'image-preview';
                img.onerror = () => { img.style.display = 'none'; };
                preview.appendChild(img);
            }
            formGroup.appendChild(preview);
            container.appendChild(formGroup);
            return;
        }
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        const label = document.createElement('label');
        label.textContent = field.label;
        formGroup.appendChild(label);
        let input;
        if (field.type === 'select') {
            input = document.createElement('select');
            input.id = 'edit-' + field.id;
            (field.options || []).forEach(opt => {
                const o = document.createElement('option');
                o.value = opt;
                o.textContent = opt;
                if (row[field.id] === opt) o.selected = true;
                input.appendChild(o);
            });
        } else if (field.type === 'textarea') {
            input = document.createElement('textarea');
            input.id = 'edit-' + field.id;
            input.value = row[field.id] || '';
        } else if (field.type === 'checkbox') {
            const wrap = document.createElement('div');
            wrap.className = 'checkbox-group';
            input = document.createElement('input');
            input.type = 'checkbox';
            input.id = 'edit-' + field.id;
            input.checked = !!row[field.id];
            wrap.appendChild(input);
            const lbl = document.createElement('label');
            lbl.textContent = field.label;
            lbl.style.fontWeight = 'normal';
            wrap.appendChild(lbl);
            formGroup.appendChild(wrap);
            container.appendChild(formGroup);
            return;
        } else {
            input = document.createElement('input');
            input.type = field.type || 'text';
            input.id = 'edit-' + field.id;
            input.value = row[field.id] != null ? row[field.id] : '';
        }
        formGroup.appendChild(input);
        container.appendChild(formGroup);
    });
    document.getElementById('edit-modal').style.display = 'flex';
}

function closeEditModal() {
    editingRowId = null;
    document.getElementById('edit-modal').style.display = 'none';
}

document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editingRowId || !currentScoutingType) return;
    const formData = {};
    for (const field of fieldsConfig) {
        const input = document.getElementById('edit-' + field.id);
        if (!input) continue;
        if (field.type === 'file') {
            if (input.files && input.files[0]) {
                const fd = new FormData();
                fd.append('file', input.files[0]);
                const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: fd, credentials: 'include' });
                const data = await res.json();
                if (data.filePath) formData[field.id] = data.filePath;
            } else {
                const row = await fetch(`${API_BASE}/data/${currentScoutingType}/${editingRowId}`).then(r => r.json()).catch(() => ({}));
                formData[field.id] = row[field.id] || null;
            }
        } else {
            formData[field.id] = field.type === 'checkbox' ? (input.checked ? 1 : 0) : input.value;
        }
    }
    try {
        const res = await fetch(`${API_BASE}/data/${currentScoutingType}/${editingRowId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
            credentials: 'include'
        });
        const result = await res.json();
        if (res.ok) {
            showMessage('Entry updated successfully', 'success');
            closeEditModal();
            loadData();
        } else {
            showMessage(result.error || 'Failed to update entry', 'error');
            if (res.status === 403) await checkAuth();
        }
    } catch (err) {
        showMessage('Error connecting to server', 'error');
    }
});

// Delete entry
async function deleteEntry(id) {
    if (!confirm('Are you sure you want to delete this entry?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/data/${currentScoutingType}/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('Entry deleted successfully', 'success');
            loadData();
        } else {
            showMessage(result.error || 'Failed to delete entry', 'error');
            if (response.status === 403) await checkAuth();
        }
    } catch (error) {
        console.error('Error deleting entry:', error);
        showMessage('Error connecting to server', 'error');
    }
}

// Show message (form or view-data section)
function showMessage(message, type) {
    const messageEl = document.getElementById('data-message') || document.getElementById('form-message');
    if (!messageEl) return;
    messageEl.textContent = message;
    messageEl.className = type;
    messageEl.style.display = 'block';
    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 5000);
}

// Initialize on page load
init();
