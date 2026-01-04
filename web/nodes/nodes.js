import { app } from "../../../scripts/app.js";
import { PreviewTooltip } from "../widgets/loras_widget_components.js";

app.registerExtension({
    name: "Comfy.SILVER_BasicDynamicPrompts",
	
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "SILVER_BasicDynamicPrompts") return;
		
		let availableLoras = [];
		let availableLorasLowercase = [];
		
		let current_wildcard_directory = "";
		let stored_wildcard_directory = "";
		let hovered_wildcard_content = "";
		let hovered_lora_content = "";
		let wildcard_files = [];
		
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
				const content = match.slice(2, -2);
				const color = wildcard_files.includes(content.replace(/[\\/]+/g, "\\").toLowerCase()) ? "#FFD700" : "#FF4444";
				const safe = escapeHTML(match);
				return protect(`<span style="color:${color}; font-weight:bold;">${safe}</span>`);
			});
			
			// LoRA
			work = work.replace(/<(lora|lora_a|lora_b):([^:\n\r>]+)(?::[^\n\r>]*)?>/gi, (match, prefix, name) => {
				let baseColor;
				if (prefix.toLowerCase() === "lora_a") baseColor = "#ADFF2F";
				else if (prefix.toLowerCase() === "lora_b") baseColor = "#7FFFD4";
				else baseColor = "#F4A460";
		
				const tagColor = availableLorasLowercase.includes(name.trim().toLowerCase()) ? baseColor : "#FF4444";
				const tagStyle = `color:${tagColor}; font-weight:bold;`;
		
				let innerRaw = match.slice(1, -1);
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
        
		// EX: 'aaa ### bbb ###### ccc' -> 'aaa ### bbb # ccc'
		const fixCommentBody = (text) => {
			// Split the input text into individual lines
			const lines = text.split('\n');
			const fixedLines = [];
		
			for (const line of lines) {
				// 1. Find the index of the very first '#'
				const firstHashIndex = line.indexOf('#');
		
				if (firstHashIndex === -1) {
					// If no comment is found on this line, keep the line as is
					fixedLines.push(line);
					continue;
				}
		
				// 2. Determine the end index of the initial consecutive '#' sequence (the comment marker).
				// This ensures the full starting sequence (e.g., '#', '##', or '###') is preserved.
				let initialMarkerEndIndex = firstHashIndex + 1;
				while (initialMarkerEndIndex < line.length && line[initialMarkerEndIndex] === '#') {
					initialMarkerEndIndex++;
				}
		
				// 3. Separate the line into the preserved prefix (code + initial marker)
				// and the mutable comment body.
				const prefixPart = line.substring(0, initialMarkerEndIndex);
		
				// The body is the rest of the line, where the cleaning will occur.
				const commentBodyPart = line.substring(initialMarkerEndIndex);
		
				// 4. Apply replacement to the comment body:
				// The regex /##+/g matches two or more consecutive '#' characters and replaces
				// the entire match with a single '#' character.
				const fixedCommentBody = commentBodyPart.replace(/##+/g, '#');
		
				// 5. Reassemble the line and add it to the results
				const fixedLine = prefixPart + fixedCommentBody;
				fixedLines.push(fixedLine);
			}
		
			// Join the lines back together with newline characters
			return fixedLines.join('\n');
		};
		
		async function get_wildcard_files() {
			const resp = await fetch("/silver_basicdynamicprompts/get_wildcard_files", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({current_wildcard_dir: current_wildcard_directory})
			});
			const data = await resp.json();
			wildcard_files = data.wildcard_files || [];
		};
		// --- [End of helper functions] ---


        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            origOnNodeCreated?.apply(this, arguments);
            console.log("[SILVER_BasicDynamicPrompts] JS initialized for:", this.title);
			
			const toggleSpellCheckButton = this.addWidget("button", "Toggle SpellCheck", null, () => {
				if (editor) {
					editor.spellcheck = !editor.spellcheck;
					updateEditorContent();
				}
			});
			
			
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
			
			availableLoras = available_loras_stem_widget.value.split(',');
			availableLorasLowercase = available_loras_stem_widget.value.split(',').map(stem => stem.toLowerCase());
			
			
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
                this.setDirtyCanvas(true, true); // Ensure the canvas updates its size if content changes on load
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
				
				if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) return; // Support for native Ctrl+Enter command
				
                e.stopPropagation();
				
				if (e.key === 'Tab') { // add text editor behavior with the TAB key but use 4 spaces instead of '\t'
					e.preventDefault(); // CRITICAL: Stop the browser from blurring the element/changing focus
			
					const sel = window.getSelection();
					if (!sel || sel.rangeCount === 0) return;
			
					const plainOffset = getPlainCursorPosition(editor, sel);
					let plainText = editor.innerText;
					
					const indentation = '    '; // Using 4 spaces
					
					plainText = plainText.substring(0, plainOffset) + indentation + plainText.substring(plainOffset);
					
					const fixed_text = fixCommentBody(plainText);
					prompt_widget.value = fixed_text;  // Update ComfyUI widget
					
					updateEditorContent(); // Re-highlight (this calls editor.innerHTML = highlight(text);)
					
					// Set cursor to the position after the inserted characters
					setPlainCursorPosition(editor, plainOffset + indentation.length); 
				}
            });
			
            // Intercept 'Enter' to control newlines and cursor movement
            editor.addEventListener("keypress", (e) => {
                if (e.key === 'Enter') {
					
					if (e.ctrlKey || e.metaKey) return; // Support for native Ctrl+Enter command
					
                    e.preventDefault(); 
                    const sel = window.getSelection();
                    if (!sel || sel.rangeCount === 0) return;

                    const plainOffset = getPlainCursorPosition(editor, sel);
                    let plainText = editor.innerText;
                    plainText = plainText.substring(0, plainOffset) + "\n" + plainText.substring(plainOffset);
					
					const fixed_text = fixCommentBody(plainText);
					prompt_widget.value = fixed_text;  // Update ComfyUI widget
					
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
				
				const fixed_text = fixCommentBody(plainText);
				prompt_widget.value = fixed_text;  // Update ComfyUI widget
                
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
				if (e.ctrlKey || e.metaKey) {
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
			
			// --- Quick Wildcard Edit ---
			editor.addEventListener("mousedown", (e) => {
				if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
					if (hovered_wildcard_content !== "") {
						e.preventDefault();
						e.stopPropagation();
						
						const wildcard_file_path = current_wildcard_directory + "\\" + (hovered_wildcard_content.toLowerCase().endsWith(".txt") ? hovered_wildcard_content : hovered_wildcard_content + ".txt");
						fetch("/silver_basicdynamicprompts/quick_open_wildcard", {
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify({ file_path: wildcard_file_path })
						});

					}
					if (hovered_lora_content !== "") {
						e.preventDefault();
						e.stopPropagation();
						
						fetch("/silver_basicdynamicprompts/quick_open_lora_location", {
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify({ lora_name: hovered_lora_content })
						});

					}
				}
			});
			
			
			
			// ----------------------------------------------------
            // 3. NEW: MOUSE/HOVER EVENT LISTENERS FOR LORA PREVIEW + WILDCARD QUICK EDIT
            // ----------------------------------------------------
			
            // 3a. Handle mouse movement/hover
			editor.addEventListener("mousemove", (e) => {
				if (!tooltip) return; // Exit if tooltip is not available (lora manager not installed)
			
				// Clear early if no mouse coords
				const x = e.clientX;
				const y = e.clientY;
				if (typeof x !== 'number' || typeof y !== 'number') return;
			
				// Helper: get caret range from point (cross-browser)
				const getRangeFromPoint = (x, y) => {
					if (document.caretRangeFromPoint) {
						return document.caretRangeFromPoint(x, y);
					}
					// Firefox
					if (document.caretPositionFromPoint) {
						const pos = document.caretPositionFromPoint(x, y);
						if (!pos) return null;
						const r = document.createRange();
						r.setStart(pos.offsetNode, pos.offset);
						r.setEnd(pos.offsetNode, pos.offset);
						return r;
					}
					return null;
				};
			
				// Helper: gather all text nodes under an element in document order
				const collectTextNodes = (root) => {
					const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
					const nodes = [];
					let n;
					while ((n = walker.nextNode())) nodes.push(n);
					return nodes;
				};
			
				// Helper: given a container element and a Range, compute the caret index within
				// the container's concatenated text (or return null).
				const caretIndexInElement = (elem, range) => {
					if (!elem || !range) return null;
					// get text nodes under elem
					const textNodes = collectTextNodes(elem);
					if (textNodes.length === 0) return null;
			
					// Determine which text node the range.startContainer is
					let offsetNode = range.startContainer;
					let offset = range.startOffset;
			
					// If the startContainer is an element, try to find nearest text child at offset
					if (offsetNode.nodeType !== Node.TEXT_NODE) {
						// If it's an element, try to get the text node at/after the child index
						const child = offsetNode.childNodes[offset] || offsetNode.childNodes[Math.max(0, offset - 1)];
						// find nearest text node descendant
						offsetNode = (child && (child.nodeType === Node.TEXT_NODE)) ? child :
									(child ? collectTextNodes(child)[0] : null) || null;
						if (!offsetNode) {
							// fallback: try the first text node of elem
							offsetNode = textNodes[0];
							offset = 0;
						} else {
							// if we found a text node inside the child, set offset to 0 (approx)
							offset = 0;
						}
					}
			
					// find index of offsetNode in textNodes
					let idx = -1;
					for (let i = 0; i < textNodes.length; i++) {
						if (textNodes[i] === offsetNode) {
							idx = i;
							break;
						}
					}
					if (idx === -1) {
						// The offsetNode might be outside elem; fallback to first text node
						offsetNode = textNodes[0];
						idx = 0;
						offset = 0;
					}
			
					// sum lengths of previous nodes
					let caretIndex = offset;
					for (let i = 0; i < idx; i++) caretIndex += textNodes[i].textContent.length;
			
					return { caretIndex, textNodes };
				};
			
				// Get the range under the mouse pointer
				const range = getRangeFromPoint(x, y);
				if (!range) {
					// couldn't determine caret: hide tooltip (same behavior)
					if (hoverTimeout) clearTimeout(hoverTimeout);
					hoverTimeout = null;
					tooltip.hide();
					return;
				}
			
				// We will try to find the smallest relevant element to compute the local text.
				// Prefer the nearest ancestor element of the range.startContainer that is inside editor.
				let startNode = range.startContainer;
				let elementForSearch = (startNode.nodeType === Node.TEXT_NODE) ? startNode.parentElement : startNode;
			
				// Sanity: ensure elementForSearch is within the editor; otherwise fallback to the event target
				if (!elementForSearch || !editor.contains(elementForSearch)) {
					elementForSearch = e.target && editor.contains(e.target) ? e.target : editor;
				}
			
				// Compute caret index and concatenated text for this element
				const ci = caretIndexInElement(elementForSearch, range);
				if (!ci) {
					if (hoverTimeout) clearTimeout(hoverTimeout);
					hoverTimeout = null;
					tooltip.hide();
					return;
				}
				const { caretIndex, textNodes } = ci;
			
				// Build the concatenated text for the element (only once)
				let fullText = "";
				for (const tn of textNodes) fullText += tn.textContent;
				
				
				// Wildcard Quick Edit with CTRL + Left Click
				const wildcardRegex = /__.*?__/g;
				let wm;
				while ((wm = wildcardRegex.exec(fullText)) !== null) {
					const start = wm.index;
					const end = start + wm[0].length;
					if (caretIndex >= start && caretIndex <= end) {
						const content = wm[0].slice(2, -2).replace(/[\\/]+/g, "\\");
						if (content && wildcard_files.includes(content.toLowerCase())) {
							hovered_wildcard_content = content;
							return;
						}
						break;
					}
				}
				hovered_wildcard_content = "";
				hovered_lora_content = "";
				
			
				// LoRA regex (same as highlight)
				const loraRegex = /<(lora|lora_a|lora_b):([^:\n\r>]+)(?::[^\n\r>]*)?>/gi;
				let foundLora = null;
				let lm;
				while ((lm = loraRegex.exec(fullText)) !== null) {
					const start = lm.index;
					const end = start + lm[0].length;
					// If caret is inside this match (inclusive)
					if (caretIndex >= start && caretIndex <= end) {
						// Use the last captured match (case-insensitive)
						foundLora = { match: lm[0], prefix: lm[1], name: lm[2], start, end };
						break;
					}
				}
			
				if (foundLora) {
					const loraName = foundLora.name ? foundLora.name.trim() : null;
					if (loraName) {
						
						const originalCasedMatch = availableLoras.find(availableName =>
							availableName.toLowerCase() === loraName.toLowerCase()
						);
						let finalLoraName = loraName; // Use loraName as default
						if (originalCasedMatch) {
							finalLoraName = originalCasedMatch;
							hovered_lora_content = loraName;
						}
						
						// Start hover delay timer if not already running
						if (hoverTimeout === null) {
							if (hoverTimeout) clearTimeout(hoverTimeout);
			
							hoverTimeout = setTimeout(async () => {
								hoverTimeout = null;
								await tooltip.show(finalLoraName, x, y);
							}, HOVER_DELAY);
						}
			
						// Update tooltip position if already visible
						if (tooltip.element && tooltip.element.style.display === 'block') {
							tooltip.position(x, y);
						}
						return;
					}
				}
				
				
				// Not inside a LoRA match -> hide
				if (hoverTimeout) clearTimeout(hoverTimeout);
				hoverTimeout = null;
				tooltip.hide();
			});
            
			
			// 3b. Handle mouse leave
			editor.addEventListener("mouseleave", () => {
				hovered_wildcard_content = "";
				hovered_lora_content = "";
				if (!tooltip) return;
				if (hoverTimeout) clearTimeout(hoverTimeout);
				hoverTimeout = null;
				tooltip.hide();
			});
			
			
			
			// Support for wildcard pattern re-color based on file existance
            const wildcard_directory_widget = this.widgets?.find(w => w.name === "wildcard_directory");
            if (wildcard_directory_widget) {
                // update immediately if value exists
                current_wildcard_directory = wildcard_directory_widget.value || "";

                // --- 1️⃣ Watch for user changes in UI ---
                const original_callback = wildcard_directory_widget.callback;
                wildcard_directory_widget.callback = async function(value) {
                    current_wildcard_directory = value;
					if (current_wildcard_directory !== stored_wildcard_directory) {
						stored_wildcard_directory = current_wildcard_directory;
						await get_wildcard_files();
						updateEditorContent();
					}
                    if (original_callback) original_callback(value);
                };

                // --- 2️⃣ Catch async load after workflow restore ---
                setTimeout(async () => {
                    current_wildcard_directory = wildcard_directory_widget.value || "";
					stored_wildcard_directory = current_wildcard_directory;
					await get_wildcard_files();
					updateEditorContent();
                }, 2000);
            }
			
			
            
            // --- Use ComfyUI's DOM widget system ---
            const widget = this.addDOMWidget(`richprompt_widget_${this.id}`, "dom", editor, {
                //computeSize: (w, h) => [w, Math.max(50, Math.max(50, editor.scrollHeight + 10))]
				//computeSize: (w, h) => [w, h]
            });
			
			const stopPropagation = (e) => {
				// Prevent the event from bubbling up to the ComfyUI canvas listeners
				e.stopPropagation();
				
				// Optional: Stop the default action, though the browser should handle it
				// for contentEditable elements correctly if propagation is stopped.
				// e.preventDefault(); 
			};
			
			// FIX issue caused by: https://github.com/Comfy-Org/ComfyUI_frontend/pull/6087/files
			editor.addEventListener("copy", stopPropagation);
			editor.addEventListener("paste", stopPropagation);
			editor.addEventListener("cut", stopPropagation);			
            
			
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
