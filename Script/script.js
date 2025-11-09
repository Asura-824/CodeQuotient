// --- 1. UTILITY FUNCTIONS & MESSAGING ---

/**
 * Displays an alert message in the #message-display element (top-right corner).
 * This function is used by login, signup, and logout handlers.
 */
function displayMessage(message, type) {
    const displayElement = document.getElementById('message-display');
    if (!displayElement) return;

    displayElement.textContent = message;
    displayElement.style.display = 'block';
    displayElement.style.border = '1px solid'; // Ensure border is applied

    if (type === 'success') {
        displayElement.style.backgroundColor = '#d4edda'; 
        displayElement.style.color = '#155724';       
        displayElement.style.borderColor = '#c3e6cb';   
    } else if (type === 'error') {
        displayElement.style.backgroundColor = '#f8d7da'; 
        displayElement.style.color = '#721c24';       
        displayElement.style.borderColor = '#f5c6cb';   
    } else {
        // Default/Info
        displayElement.style.backgroundColor = '#fff3cd'; 
        displayElement.style.color = '#856404'; 
        displayElement.style.borderColor = '#ffeeba';
    }
    
    // Hide the message after a delay (5 seconds)
    setTimeout(() => {
        displayElement.style.display = 'none';
    }, 5000); 
}

/**
 * Toggles the header display between "Login/Signup" buttons and "User Info/Logout"
 * based on the server session status.
 */
function updateHeaderDisplay(isLoggedIn, userData = {}) {
    const loggedOutButtons = document.getElementById('logged-out-buttons');
    const userInfo = document.getElementById('user-info');
    const userNameDisplay = document.getElementById('display-user-email');
    const loginForm = document.getElementById('loginForm'); // Used on login.html
    
    if (isLoggedIn && userData.email) {
        const displayName = userData.username || userData.email;
        if (userNameDisplay) userNameDisplay.textContent = `Hello, ${displayName}!`;
        
        if (userInfo) userInfo.style.display = 'flex';
        if (loggedOutButtons) loggedOutButtons.style.display = 'none';
        
        // Disable the login form when logged in (only applies on login.html)
        if (loginForm) {
            loginForm.style.opacity = '0.5';
            loginForm.style.pointerEvents = 'none';
        }

    } else {
        if (userInfo) userInfo.style.display = 'none';
        if (loggedOutButtons) loggedOutButtons.style.display = 'flex';
        if (userNameDisplay) userNameDisplay.textContent = 'Hello, User!'; 
        
        // Enable the login form when logged out (only applies on login.html)
        if (loginForm) {
            loginForm.style.opacity = '1';
            loginForm.style.pointerEvents = 'auto';
        }
    }
}

/**
 * Handles the AJAX call for logging out and updates the UI.
 */
async function handleLogout() {
    try {
        const response = await fetch('/api/logout', { method: 'POST' });
        if (response.ok) {
            displayMessage('You have been successfully logged out.', 'success');
            // Clear inputs if on the login page
            const emailInput = document.getElementById('emailInput');
            const passwordInput = document.getElementById('passwordInput');
            if(emailInput) emailInput.value = '';
            if(passwordInput) passwordInput.value = '';

            updateHeaderDisplay(false);
        } else {
            displayMessage('Logout failed. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Logout error:', error);
        displayMessage('An unexpected error occurred during logout.', 'error');
    }
}

// --- 2. TUTORIAL / PYODIDE LOGIC ---

// Assumes loadPyodide is defined globally by a separate script tag (in HTML head)
const pyodideReadyPromise = loadPyodide(); 

async function runPython() {
    const codeEl = document.getElementById("code");
    const outputEl = document.getElementById("output");

    if (!codeEl || !outputEl) return;
    
    const code = codeEl.value.trim();
    outputEl.innerHTML = "<em>⏳ Running...</em>";

    if (!code) {
        outputEl.innerHTML = "<span>Please enter some Python code to run.</span>";
        return;
    }

    try {
        const pyodide = await pyodideReadyPromise;
        
        // Load required packages
        await pyodide.loadPackage(['micropip', 'matplotlib', 'numpy', 'pandas']);
        const micropip = pyodide.pyimport("micropip");
        await micropip.install("seaborn");

        // Set up output capture
        pyodide.runPython(`
            import sys
            import io
            import matplotlib.pyplot as plt
            
            sys.stdout = io.StringIO()
            sys.stderr = io.StringIO()
            plt.close('all') 
        `);

        await pyodide.runPythonAsync(code);
        
        const stdout = pyodide.runPython("sys.stdout.getvalue()");
        const stderr = pyodide.runPython("sys.stderr.getvalue()");
        const result = stdout + stderr;

        const usesPlotLib = /(import\s+(?:matplotlib|seaborn|plotly|bokeh))|(\.(?:plot|hist|scatter|bar|boxplot|line|show|savefig)\()/.test(code);
        
        let imgBase64 = null;
        
        // Plot Generation and Encoding
        if (usesPlotLib) {
            await pyodide.runPythonAsync(`
                import base64
                from io import BytesIO
                try:
                    buf = BytesIO()
                    plt.savefig(buf, format='png', bbox_inches='tight') 
                    buf.seek(0)
                    img_base64_result = base64.b64encode(buf.read()).decode('utf-8')
                except Exception:
                    img_base64_result = None
            `);
            imgBase64 = pyodide.globals.get('img_base64_result');
        }
        
        // Display Output and Plot
        outputEl.innerHTML = "";
        const lines = result.split('\n').filter(line => line.trim() !== "");
        
        if (lines.length > 0) {
            lines.forEach(line => {
                const div = document.createElement("div");
                div.textContent = line; 
                outputEl.appendChild(div);
            });
        }

        if (imgBase64) {
            const img = document.createElement("img");
            img.src = "data:image/png;base64," + imgBase64;
            img.alt = "Generated Plot";
            img.classList.add('generated-plot-fixed'); 
            outputEl.appendChild(img);
            img.addEventListener("click", () => createZoomOverlay(img));
        }

        if (lines.length === 0 && !imgBase64) {
            outputEl.innerHTML = "<span>✅ Code executed with no printed output or plot.</span>";
        }

    } catch (err) {
        outputEl.innerHTML = `<pre>❌ Error:\n${err.toString()}</pre>`;
    }
}

/**
 * Creates a full-screen overlay for zooming into an image.
 */
function createZoomOverlay(imgElement) {
    const overlay = document.createElement("div");
    overlay.classList.add("fullscreen-overlay");

    const zoomedImg = document.createElement("img");
    zoomedImg.src = imgElement.src;
    zoomedImg.alt = imgElement.alt;

    overlay.appendChild(zoomedImg);
    document.body.appendChild(overlay);

    overlay.addEventListener("click", () => {
        document.body.removeChild(overlay);
    });

    document.addEventListener('keydown', function closeOnEsc(e) {
        if (e.key === 'Escape') {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
            document.removeEventListener('keydown', closeOnEsc);
        }
    });
}

// --- 3. MAIN DOM CONTENT LOADED LISTENER ---

document.addEventListener('DOMContentLoaded', () => {
    // --- Session/Auth Elements ---
    const logoutButton = document.querySelector('#user-info .logout-button');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');

    // --- A. Initial Session Check ---
    async function checkSession() {
        try {
            const response = await fetch('/api/session');
            const result = await response.json();
            // result should contain { loggedIn: true/false, email: '...', username: '...' }
            updateHeaderDisplay(result.loggedIn, result);
        } catch (error) {
            console.error('Session check failed:', error);
            updateHeaderDisplay(false); 
        }
    }
    checkSession();

    // Attach listener for the logout button
    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
    
    // --- B. Login Form Submission Handler (AJAX) ---
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            
            const email = document.getElementById('emailInput').value;
            // Assumes password input has name/id for accessing its value
            const password = loginForm.elements.password ? loginForm.elements.password.value : ''; 
            const loginButton = loginForm.querySelector('.button');

            loginButton.textContent = 'Logging in...';
            loginButton.disabled = true;

            try {
                const response = await fetch('/api/login', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                
                const result = await response.json();

                if (response.ok) {
                    displayMessage('Login successful!', 'success');
                    updateHeaderDisplay(true, result); 
                } else {
                    displayMessage(result.message || 'Invalid email or password.', 'error');
                    updateHeaderDisplay(false);
                }
            } catch (error) {
                console.error('Login error:', error);
                displayMessage('An unexpected error occurred. Please try again.', 'error');
            } finally {
                loginButton.textContent = 'Login';
                loginButton.disabled = false;
            }
        });
    }

    // --- C. Signup Form Submission Handler (AJAX) ---
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            
            const username = document.getElementById('usernameInput').value;
            const email = document.getElementById('emailInput').value;
            const password = document.getElementById('passwordInput').value;
            const submitButton = signupForm.querySelector('.button');

            submitButton.textContent = 'Creating...';
            submitButton.disabled = true;

            try {
                const response = await fetch('/api/signup', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password })
                });
                
                const result = await response.json();

                if (response.ok && response.status === 201) {
                    displayMessage('Signup successful! Redirecting to login...', 'success');
                    signupForm.reset(); 
                    
                    setTimeout(() => {
                        window.location.href = '/login.html'; 
                    }, 2000);

                } else {
                    displayMessage(result.message || 'Signup failed. Please try again.', 'error');
                }
            } catch (error) {
                console.error('Signup error:', error);
                displayMessage('An unexpected network error occurred.', 'error');
            } finally {
                 submitButton.textContent = 'Create account';
                 submitButton.disabled = false;
            }
        });
    }

    // --- D. Navigation and Sidebar Logic ---

    const navItems = document.querySelectorAll('.internal-nav-link');
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    navItems.forEach(item => {
        const targetUrl = item.getAttribute('href') || item.getAttribute('data-target');

        if (targetUrl && targetUrl.endsWith(currentPage)) {
            item.classList.add('active');
        }
    });

    const handleNavigationButton = (selector) => {
        const button = document.querySelector(selector);
        if (button) {
            button.addEventListener('click', () => {
                const url = button.getAttribute('data-target');
                if (url) {
                    window.location.href = url;
                }
            });
        }
    };

    handleNavigationButton('.prev-topic-button');
    handleNavigationButton('.next-topic-button');

    // Sidebar Toggle for Mobile
    const sidebarToggleBtn = document.getElementById('sidebar-toggle');
    const internalsidebar = document.getElementById('internalsidebar');

    if (sidebarToggleBtn && internalsidebar) {
        const showSidebar = () => {
            internalsidebar.classList.add('active');
            sidebarToggleBtn.style.setProperty('display', 'none', 'important');
        };

        const hideSidebar = () => {
            internalsidebar.classList.remove('active');
            sidebarToggleBtn.style.setProperty('display', 'block', 'important');
        };

        sidebarToggleBtn.onclick = showSidebar;

        document.addEventListener('click', (e) => {
            if (internalsidebar.classList.contains('active') && !internalsidebar.contains(e.target) && e.target !== sidebarToggleBtn) {
                hideSidebar();
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && internalsidebar.classList.contains('active')) {
                hideSidebar();
            }
        });
    }
});