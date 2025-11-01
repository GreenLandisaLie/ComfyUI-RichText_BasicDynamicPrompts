import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "Comfy.SILVER_BasicDynamicPrompts",
    beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "SILVER_BasicDynamicPrompts") return;

        // Advanced syntax highlighting with fixed comment typing behavior
		const highlight = (text) => {
			let work = text;
		
			const tokens = [];
			const protect = (frag) => {
				const tok = `@@@TOKEN${tokens.length}@@@`;
				tokens.push(frag);
				return tok;
			};
		
			const escapeHTML = (s) => s
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;")
				.replace(/"/g, "&quot;")
				.replace(/'/g, "&#39;");
		
			// ------------------------
			// 1) Structural highlighting (comments, wildcards, tags)
			// ------------------------
		
			// LARGE comments: ### ...
			work = work.replace(/(^|[^<])###(.*)$/gm, (_, pre, body) => {
				const safe = escapeHTML(body);
				return pre + protect(
					`<span style="color:#FFA500; font-style:italic; font-size:2em;">###${safe}</span>`
				);
			});
			
			// MEDIUM comments: ## ...
			work = work.replace(/(^|[^<])##(?!#)(.*)$/gm, (_, pre, body) => {
				const safe = escapeHTML(body);
				return pre + protect(
					`<span style="color:#A020F0; font-style:italic; font-size:1.5em;">##${safe}</span>`
				);
			});
			
			// REGULAR comments: single #
			work = work.replace(/(^|[^<])#(?!#)(.*)$/gm, (_, pre, body) => {
				const safe = escapeHTML(body);
				return pre + protect(
					`<span style="color:#6A9955; font-style:italic;">#${safe}</span>`
				);
			});
		
			// Wildcards
			work = work.replace(/__.*?__/g, (match) => {
				const safe = escapeHTML(match);
				return protect(`<span style="color:#FFD700; font-weight:bold;">${safe}</span>`);
			});
		
			// LoRA / Embedding tags
			const tagStyle = "color:#F4A460; font-weight:bold;";
			work = work.replace(/<[^<>]*>/g, (match) => {
				const innerRaw = match.slice(1, -1);
				let innerEsc = escapeHTML(innerRaw);
				innerEsc = innerEsc.replace(/:([0-9]+(?:\.[0-9]+)?)/g, (m, n) =>
					`<span style="color:#4aa3ff; font-weight:bold;">:${n}</span>`
				);
				const frag = `<span style="${tagStyle}">&lt;${innerEsc}&gt;</span>`;
				return protect(frag);
			});
		
			// Escape remaining text
			work = work.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
		
			// Weight numbers
			work = work.replace(/:([0-9]+(?:\.[0-9]+)?)(?=[^)]*?\))/g, (m) =>
				`<span style="color:#4aa3ff; font-weight:bold;">${m}</span>`
			);
		
			// Parentheses
			const parenStyle = "color:#00FFFF; font-weight:bold;";
			work = work.replace(/\(([^)]*?)\)/g, (_, inner) =>
				`<span style="${parenStyle}">(</span>${inner}<span style="${parenStyle}">)</span>`
			);
		
			// Dynamic prompt weights
			work = work.replace(/([0-9]+(?:\.[0-9]+)?::)/g, (m) =>
				`<span style="color:#4aa3ff; font-weight:bold;">${m}</span>`
			);
		
			// Combo separators
			const comboStyle = "color:#ff6644; font-weight:bold;";
			work = work.replace(/\{/g, `<span style="${comboStyle}">{</span>`)
					.replace(/\}/g, `<span style="${comboStyle}">}</span>`)
					.replace(/\|/g, `<span style="${comboStyle}">|</span>`);
		
			// Punctuation
			const punctuationStyle = "color:#FFFF00; font-weight:bold;";
			work = work.replace(/,/g, `<span style="${punctuationStyle}">,</span>`)
					.replace(/\.(?![0-9]|\.)/g, `<span style="${punctuationStyle}">.</span>`);
		
			// Restore tokens
			for (let i = 0; i < tokens.length; i++) {
				work = work.split(`@@@TOKEN${i}@@@`).join(tokens[i]);
			}
		
			return work;
		};

		
		// --- Helper: find matching bracket pair indices ---
		// TODO: implement this for custom highlight of valid, closed () and {} pairs when the cursor is next to their limiters
		function findMatchingPair(text, cursorPos) {
			const pairs = { '(': ')', ')': '(', '{': '}', '}': '{' };
			const char = text[cursorPos] || text[cursorPos - 1];
			if (!pairs[char]) return null;
		
			let open = ['(', '{'].includes(char) ? char : pairs[char];
			let close = pairs[open];
			let dir = ['(', '{'].includes(char) ? 1 : -1;
			let stack = 0;
		
			if (dir === 1) {
				for (let i = cursorPos; i < text.length; i++) {
					if (text[i] === open) stack++;
					else if (text[i] === close) {
						stack--;
						if (stack === 0) return [cursorPos, i];
					}
				}
			} else {
				for (let i = cursorPos - 1; i >= 0; i--) {
					if (text[i] === close) stack++;
					else if (text[i] === open) {
						stack--;
						if (stack === 0) return [i, cursorPos - 1];
					}
				}
			}
			return null;
		}
		
		
		
        
        // ... (Include getPlainCursorPosition and setPlainCursorPosition here)
        // Ensure you use the robust versions you have now, especially the latest 
        // setPlainCursorPosition for end-of-content handling.
        
        // --- [Paste the helper functions here for a complete node file] ---

        const getPlainCursorPosition = (editor, selection) => {
            const range = selection.getRangeAt(0);
            const preRange = range.cloneRange();
            preRange.selectNodeContents(editor);
            preRange.setEnd(range.startContainer, range.startOffset);
            return preRange.cloneContents().textContent.length;
        };

        const setPlainCursorPosition = (editor, offset) => {
            let currentOffset = 0;
            const walker = document.createTreeWalker(
                editor,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            let node;

            while (currentOffset <= offset && (node = walker.nextNode())) {
                const nodeLength = node.textContent.length;
                
                if (currentOffset + nodeLength >= offset) {
                    const range = document.createRange();
                    range.setStart(node, offset - currentOffset);
                    range.collapse(true);

                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                    return;
                }
                currentOffset += nodeLength;
            }
            
            if (offset >= currentOffset) {
                const range = document.createRange();
                range.selectNodeContents(editor);
                range.collapse(false);

                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
        };
		

        // --- [End of helper functions] ---


        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            origOnNodeCreated?.apply(this, arguments);
            console.log("[SILVER_BasicDynamicPrompts] JS initialized for:", this.title);

            const w = this.widgets?.find(w => w.name === "prompt");
			w.computeSize = () => [0, 0]; // Force the widget to take 0 height and 0 width
			w.y = -600; // Keep this just in case, to push it off-screen visually
            w.hidden = true; 

            const editor = document.createElement("div");
            editor.contentEditable = "true";
			editor.spellcheck = false;
			
            // ... (CSS styles for editor)
			editor.style.cssText = `
                border: 1px solid var(--border-color);
                border-radius: 6px;
                padding: 6px;
                min-height: 50px;
                white-space: pre-wrap;
                overflow-y: auto;
                font-family: monospace;
                color: #ffffff;
                background: #222222;
                outline: none;
            `;
			
            // Function to synchronize the custom editor from the ComfyUI widget value
            const updateEditorContent = () => {
                const text = w.value || "";
                editor.innerHTML = highlight(text);
                // Ensure the canvas updates its size if content changes on load
                this.setDirtyCanvas(true, true); 
            };
            
            // --- FIX FOR REFRESH: INITIAL VALUE LOADING ---
            // 1. Redefine onCreated to use the actual loaded value
            w.onCreated = () => {
                // This ensures the custom editor is populated with the saved value
                // AFTER ComfyUI has loaded it from the backend.
                updateEditorContent(); 
            };
			
            // 2. Add an event listener to the ComfyUI widget to force a visual update
            // if the value is ever changed externally (e.g., via a Load function)
            w.callback = updateEditorContent;
			
			// Explicitly call the update function at the end of onNodeCreated.
            // This forces the initial visual update using the value already confirmed to be
            // in w.value for a newly created node.
            updateEditorContent();
			
            // Stop ComfyUI shortcuts
            editor.addEventListener("keydown", (e) => {
                e.stopPropagation();
				
				if (e.key === 'Tab') { // add text editor behavior with the TAB key but use 4 spaces instead of '\t'
					e.preventDefault(); // CRITICAL: Stop the browser from blurring the element/changing focus
			
					const sel = window.getSelection();
					if (!sel || sel.rangeCount === 0) return;
			
					const plainOffset = getPlainCursorPosition(editor, sel);
					let plainText = editor.innerText;
					
					const indentation = '    '; // Using 4 spaces
					
					plainText = plainText.substring(0, plainOffset) + indentation + plainText.substring(plainOffset);
			
					w.value = plainText; // Update ComfyUI widget
					updateEditorContent(); // Re-highlight (this calls editor.innerHTML = highlight(text);)
					
					// Set cursor to the position after the inserted characters
					setPlainCursorPosition(editor, plainOffset + indentation.length); 
				}
            });
			
            // Intercept 'Enter' to control newlines and cursor movement
            editor.addEventListener("keypress", (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault(); 
                    const sel = window.getSelection();
                    if (!sel || sel.rangeCount === 0) return;

                    const plainOffset = getPlainCursorPosition(editor, sel);
                    let plainText = editor.innerText;
                    plainText = plainText.substring(0, plainOffset) + "\n" + plainText.substring(plainOffset);

                    w.value = plainText; // Update ComfyUI widget
                    updateEditorContent(); // Re-highlight
                    
                    setPlainCursorPosition(editor, plainOffset + 1);
                }
            });

            // Refactored input handler for cursor stability
            editor.addEventListener("input", () => {
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) return;
                
                const plainOffset = getPlainCursorPosition(editor, sel);
                const plainText = editor.innerText;
                w.value = plainText; // Update ComfyUI widget
                
                updateEditorContent(); // Re-highlight
			
                setPlainCursorPosition(editor, plainOffset);
            });
			
			// --- Ensure the element is truly deselected on leaving focus ---
			editor.addEventListener('blur', () => {
				const sel = window.getSelection();
				// Crucial: remove any active selection ranges from the contentEditable element
				if (sel.rangeCount > 0) {
					sel.removeAllRanges();
				}
				// Explicitly call blur
				editor.blur();
			});
			
			// --- Allow ComfyUI default zoom behavior with mouse wheel ---
			editor.addEventListener("wheel", (e) => {
				e.stopPropagation();
				e.preventDefault();
				// Re-dispatch to ComfyUI canvas manually
				const canvas = document.querySelector("#graph-canvas");
				if (canvas) {
					const newEvent = new WheelEvent(e.type, e);
					canvas.dispatchEvent(newEvent);
				}
			}, { passive: false });
			
            
            // --- Use ComfyUI's DOM widget system ---
            const widget = this.addDOMWidget(`richprompt_widget_${this.id}`, "dom", editor, {
                //computeSize: (w, h) => [w, Math.max(50, Math.max(50, editor.scrollHeight + 10))]
				//computeSize: (w, h) => [w, h]
            });			
			
            
            this.setDirtyCanvas(true, true);
            
            // cleanup
            this.onRemoved = function() {
                editor.remove();
            };
        };
    },
});
