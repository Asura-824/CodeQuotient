// --- Updated JavaScript Code ---

// 1. Navigation and Sidebar Logic (DOM Content Loaded)
document.addEventListener('DOMContentLoaded', () => {
    // --- Navigation Highlighting and Event Handling ---
    const navItems = document.querySelectorAll('.internal-nav-link');
    // Get the current page's filename. Handle case where it might be empty (e.g., index.html or root)
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    navItems.forEach(item => {
        // Use a single attribute for the target URL for consistency and simplicity.
        const targetUrl = item.getAttribute('href') || item.getAttribute('data-target');

        if (targetUrl) {
            // Check if the item's target (or its end) matches the current page
            if (targetUrl.endsWith(currentPage)) {
                item.classList.add('active');
            }

            // Centralized click handling for *all* nav items with a target URL.
            item.addEventListener('click', (event) => {
                // Prevent default action only for buttons or if it's not a native link
                if (item.tagName === 'BUTTON' || (item.tagName === 'A' && targetUrl.startsWith('#') === false)) {
                    event.preventDefault();
                }
                window.location.href = targetUrl;
            });
        }
    });

    // --- "Previous" and "Next" Buttons ---
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

    // --- Sidebar Toggle for Mobile ---
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

        // Optional: close sidebar when clicking outside (mobile UX)
        document.addEventListener('click', (e) => {
            if (internalsidebar.classList.contains('active') && !internalsidebar.contains(e.target) && e.target !== sidebarToggleBtn) {
                hideSidebar();
            }
        });
        
        // Add listener for ESC key to close the sidebar for accessibility/UX
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && internalsidebar.classList.contains('active')) {
                hideSidebar();
            }
        });
    }
});

// 2. Pyodide/Plot Generation Code
const pyodideReadyPromise = loadPyodide(); // Assumes loadPyodide is defined globally

async function runPython() {
    const codeEl = document.getElementById("code");
    const outputEl = document.getElementById("output");

    if (!codeEl || !outputEl) {
        console.error("Missing 'code' textarea or 'output' div.");
        return;
    }
    
    const code = codeEl.value.trim();
    outputEl.innerHTML = "<em>⏳ Running...</em>";

    if (!code) {
        outputEl.innerHTML = "<span>Please enter some Python code to run.</span>";
        return;
    }

    try {
        const pyodide = await pyodideReadyPromise;
        
        // Load all core packages and micropip
        await pyodide.loadPackage(['micropip', 'matplotlib', 'numpy', 'pandas']);

        // Load seaborn using micropip
        const micropip = pyodide.pyimport("micropip");
        await micropip.install("seaborn");


        // --- Output Capture Setup ---
        pyodide.runPython(`
            import sys
            import io
            import matplotlib.pyplot as plt
            
            # Use io.StringIO for standard and robust output capturing
            sys.stdout = io.StringIO()
            sys.stderr = io.StringIO()
            
            # Close all plots before running new code to ensure a clean slate
            plt.close('all') 
        `);

        // Run user code
        await pyodide.runPythonAsync(code);
        
        // Retrieve captured output
        const stdout = pyodide.runPython("sys.stdout.getvalue()");
        const stderr = pyodide.runPython("sys.stderr.getvalue()");
        const result = stdout + stderr; // Combine both standard and error output

        // Detect plotting libraries
        const usesPlotLib = /(import\s+(?:matplotlib|seaborn|plotly|bokeh))|(\.(?:plot|hist|scatter|bar|boxplot|line|show|savefig)\()/.test(code);
        
        let imgBase64 = null;
        
        // --- Plot Generation and Encoding ---
        if (usesPlotLib) {
            await pyodide.runPythonAsync(`
                import base64
                from io import BytesIO
                # Try to save the plot. 
                try:
                    buf = BytesIO()
                    # Added bbox_inches for cleaner plots (removes excessive whitespace)
                    plt.savefig(buf, format='png', bbox_inches='tight') 
                    buf.seek(0)
                    # Expose the base64 string to JavaScript scope
                    img_base64_result = base64.b64encode(buf.read()).decode('utf-8')
                except Exception:
                    img_base64_result = None # Set to None if saving fails (e.g., no plot active)
            `);
            // Retrieve the result, which will be the string or None
            imgBase64 = pyodide.globals.get('img_base64_result');
        }
        
        // --- Display Output and Plot ---
        outputEl.innerHTML = "";
        
        // Process text output
        const lines = result.split('\n').filter(line => line.trim() !== "");
        
        if (lines.length > 0) {
            lines.forEach(line => {
                const div = document.createElement("div");
                div.textContent = line; 
                outputEl.appendChild(div);
            });
        }

        // Append plot image
        if (imgBase64) {
            const img = document.createElement("img");
            img.src = "data:image/png;base64," + imgBase64;
            img.alt = "Generated Plot";
            
            // --- FIXED PLOT SIZE: Use a dedicated CSS class ---
            img.classList.add('generated-plot-fixed'); 
            
            outputEl.appendChild(img);

            // Add zoom toggle on click 
            img.addEventListener("click", () => createZoomOverlay(img));
        }

        // Final status message
        if (lines.length === 0 && !imgBase64) {
            outputEl.innerHTML = "<span>✅ Code executed with no printed output or plot.</span>";
        }

    } catch (err) {
        // Display error from Pyodide
        outputEl.innerHTML = `<pre>❌ Error:\n${err.toString()}</pre>`;
    }
}

/**
 * Creates a full-screen overlay for zooming into an image.
 * @param {HTMLImageElement} imgElement - The original image element.
 */
function createZoomOverlay(imgElement) {
    const overlay = document.createElement("div");
    overlay.classList.add("fullscreen-overlay");

    const zoomedImg = document.createElement("img");
    zoomedImg.src = imgElement.src;
    zoomedImg.alt = imgElement.alt;

    overlay.appendChild(zoomedImg);
    document.body.appendChild(overlay);

    // Click anywhere on the overlay to close it
    overlay.addEventListener("click", () => {
        document.body.removeChild(overlay);
    });

    // Close on ESC key for better UX/accessibility
    document.addEventListener('keydown', function closeOnEsc(e) {
        if (e.key === 'Escape') {
            if (document.body.contains(overlay)) { // Check if overlay still exists
                document.body.removeChild(overlay);
            }
            // Remove the keydown listener after closing to prevent side effects
            document.removeEventListener('keydown', closeOnEsc);
        }
    });
}