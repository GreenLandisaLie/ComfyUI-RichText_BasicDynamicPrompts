import { app } from "../../../scripts/app.js";
import { PreviewTooltip } from "../widgets/loras_widget_components.js";

app.registerExtension({
    name: "Comfy.SILVER_BasicDynamicPrompts",
	
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "SILVER_BasicDynamicPrompts") return;
		
		let availableLoras = [];
		
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
			
			// LoRA
			work = work.replace(/<(lora|lora_a|lora_b):([^:>]+)(?::[^>]*)?>/gi, (match, prefix, name) => {
				const safeName = name.trim().toLowerCase();
				const exists = availableLoras.includes(safeName);
				
				let baseColor;
				// Determine base color based on the prefix used
				if (prefix.toLowerCase() === 'lora_a') {
					baseColor = "#ADFF2F"; // Example: GreenYellow for lora_a
				} else if (prefix.toLowerCase() === 'lora_b') {
					baseColor = "#7FFFD4"; // Example: Aquamarine for lora_B
				} else {
					baseColor = "#F4A460"; // Original: SandyBrown for lora
				}
			
				// Set the final tag color: baseColor if exists, or bright red if not
				const tagColor = exists ? baseColor : "#FF4444"; // baseColor or bright red
				const tagStyle = `color:${tagColor}; font-weight:bold;`;
				
				let innerRaw = match.slice(1, -1);
				let innerEsc = escapeHTML(innerRaw);
				
				// colorize weights
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
			
			// --- NEW: TOOLTIP SETUP ---
            // Instantiate the tooltip once, if the class is available
            let tooltip = null;
            if (PreviewTooltip) {
                tooltip = new PreviewTooltip();
            } else {
                console.warn("[SILVER_BasicDynamicPrompts] PreviewTooltip not found. Is ComfyUI-Lora-Manager or the component file loaded?");
            }

            let hoverTimeout = null;
            const HOVER_DELAY = 1000; // 1 second delay before showing tooltip
            let currentHoverElement = null;
            // ---------------------------
			
			// --- 1. GET AVAILABLE LORAS ---
            const available_loras_stem_widget = this.widgets?.find(w => w.name === "available_loras_stem");
			available_loras_stem_widget.computeSize = () => [0, 0];
			available_loras_stem_widget.y = -1000;
			available_loras_stem_widget.hidden = true;
			
			availableLoras = available_loras_stem_widget.value.split(',')
			
			
			// --- 2. SETUP PROMPT WIDGET AND CUSTOM EDITOR ---
            const prompt_widget = this.widgets?.find(w => w.name === "prompt");
			prompt_widget.computeSize = () => [0, 0]; // Force the widget to take 0 height and 0 width
			prompt_widget.y = -600; // Keep this just in case, to push it off-screen visually
            prompt_widget.hidden = true; 

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
			
			let editorFontSize = 14;          // default font size in px
			const minFontSize = 4;            // minimum safe font size
			const maxFontSize = 256;           // maximum safe font size
			editor.style.fontSize = `${editorFontSize}px`;
			
			
            // Function to synchronize the custom editor from the ComfyUI widget value
            const updateEditorContent = () => {
                const text = prompt_widget.value || "";
                editor.innerHTML = highlight(text);
                // Ensure the canvas updates its size if content changes on load
                this.setDirtyCanvas(true, true); 
            };
            
            // --- FIX FOR REFRESH: INITIAL VALUE LOADING ---
            // 1. Redefine onCreated to use the actual loaded value
            prompt_widget.onCreated = () => {
                // This ensures the custom editor is populated with the saved value
                // AFTER ComfyUI has loaded it from the backend.
                updateEditorContent(); 
            };
			
            // 2. Add an event listener to the ComfyUI widget to force a visual update
            // if the value is ever changed externally (e.g., via a Load function)
            prompt_widget.callback = updateEditorContent;
			
			// Explicitly call the update function at the end of onNodeCreated.
            // This forces the initial visual update using the value already confirmed to be
            // in prompt_widget.value for a newly created node.
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
			
					prompt_widget.value = plainText; // Update ComfyUI widget
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

                    prompt_widget.value = plainText; // Update ComfyUI widget
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
                prompt_widget.value = plainText; // Update ComfyUI widget
                
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
				if (e.ctrlKey) {
					e.preventDefault(); // prevent zooming the whole page
					const delta = Math.sign(e.deltaY);
					editorFontSize -= delta; // scroll up => smaller deltaY => zoom in
					editorFontSize = Math.max(minFontSize, Math.min(maxFontSize, editorFontSize));
					editor.style.fontSize = `${editorFontSize}px`;
					return; // do not forward this event to ComfyUI canvas
				}
				
				e.stopPropagation();
				e.preventDefault();
				// Re-dispatch to ComfyUI canvas manually
				const canvas = document.querySelector("#graph-canvas");
				if (canvas) {
					const newEvent = new WheelEvent(e.type, e);
					canvas.dispatchEvent(newEvent);
				}
			}, { passive: false });
			
			
			
			// ----------------------------------------------------
            // 3. NEW: MOUSE/HOVER EVENT LISTENERS FOR LORA PREVIEW
            // ----------------------------------------------------

            // 3a. Handle mouse movement/hover
            editor.addEventListener("mousemove", (e) => {
				if (!tooltip) return; // Exit if tooltip is not available (lora manager not installed)
			
				const target = e.target;
				
				// Check if the target is one of the highlighted LoRA spans
				// This looks for a SPAN containing the text content matching the lora tag pattern
				const isLoraSpan = target.tagName === 'SPAN' && target.textContent.startsWith('<lora');
			
				if (isLoraSpan) {
					// Extract the raw LoRA tag text
					const tagText = target.textContent; // e.g., <lora:name:1.0>
					
					// Use the same regex from your highlight function to get the clean name
					const match = tagText.match(/<(lora|lora_a|lora_b):([^:>]+)(?::[^>]*)?>/i);
					const loraName = match ? match[2].trim() : null;
			
					if (loraName) {
						// Check if we just started hovering over a new element or if the timer is inactive
						if (hoverTimeout === null) {
							
							// Clear any existing timeout just in case
							if (hoverTimeout) clearTimeout(hoverTimeout);
							
							// Set the delay before showing the preview
							hoverTimeout = setTimeout(async () => {
								hoverTimeout = null; // Clear the timer ID once triggered
								// e.clientX/Y are screen coordinates, perfect for fixed positioning
								// Show the tooltip using the mouse position
								await tooltip.show(loraName, e.clientX, e.clientY); 
							}, HOVER_DELAY);
						}
						
						// If the tooltip is already visible (meaning the timer has elapsed), keep updating its position
						if (tooltip.element.style.display === 'block') {
							tooltip.position(e.clientX, e.clientY);
						}
			
					} else {
						// The span looked like a LoRA but the name extraction failed, hide everything.
						if (hoverTimeout) clearTimeout(hoverTimeout);
						hoverTimeout = null;
						tooltip.hide();
					}
				} else {
					// Not hovering over a highlighted LoRA span.
					// Clear the timer and hide the tooltip.
					if (hoverTimeout) clearTimeout(hoverTimeout);
					hoverTimeout = null;
					tooltip.hide();
				}
			});
			
			editor.addEventListener("mouseleave", () => {
				if (!tooltip) return;
				if (hoverTimeout) clearTimeout(hoverTimeout);
				hoverTimeout = null;
				tooltip.hide();
			});
			
			
            
            // --- Use ComfyUI's DOM widget system ---
            const widget = this.addDOMWidget(`richprompt_widget_${this.id}`, "dom", editor, {
                //computeSize: (w, h) => [w, Math.max(50, Math.max(50, editor.scrollHeight + 10))]
				//computeSize: (w, h) => [w, h]
            });			
			
            
            this.setDirtyCanvas(true, true);
            
            // cleanup
			const origOnRemoved = this.onRemoved;
            this.onRemoved = function() {
				origOnRemoved?.apply(this, arguments);
                editor.remove();
				if (tooltip) {
                    tooltip.cleanup();
                }
            };
        };
		
	
	},
});


