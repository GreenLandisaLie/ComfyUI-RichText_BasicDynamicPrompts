## ComfyUI-RichText_BasicDynamicPrompts
A node with basic Dynamic Prompts support that uses javascript to simulate a Rich Text textbox.

I highly recommend you use it along side the 'CLIP Text Encoder (Prompt) with Cache' node I made here: https://github.com/GreenLandisaLie/ComfyUI-Silver_Pack

<img width="1074" height="1834" alt="1" src="https://github.com/user-attachments/assets/f549e109-dae0-4201-810a-07dd54d19200" />


# Changelog
- v3.6.0
  - Fixed a major stupid bug that was preventing 'lora_visual' and 'lora_audio' patterns from working and always defaulting back to normal 'lora' load behavior (all weights).

- v3.5.0
  - Added support for native ComfyUI's CTRL+UP/DOWN text weighting feature
  - Improved the logic for retrieval of the user's LoRA list to be used in lora pattern highlighting - no longer uses a hidden widget for that so the user's entire LoRA list no longer shows up in a saved workflow. EDIT: this will break saved workflows with prior versions of this node until the user updates the inputs manually - I apologize for this but there's nothing I can do about it. I do not plan on adding/removing any more widgets to this node so this will be the last time it happens.

- v3.4.0
  - Added the ability to specify audio-only/visual-only weights when loading a lora from prompt - read more in the instructions provided when you place a new node in a workflow.

- v3.3.0
  - Fixed loras not loading in some cases when their filenames contain dots '.'
  - Fixed a bug that occasionally caused the cursor style to change when hovering over the node's prompt editor
  
- v3.2.0
  - Support for native Comfyui Ctrl+Enter command
  - Fixed comments within multi-line combinations not being ignored

- v3.1.0
  - Added a 'Toggle SpellCheck' button - very useful to spot typos
  - CTRL + Left Mouse Click on a non-red LoRA pattern -> opens Windows Explorer at that lora's location with it pre-selected. Does the equivalent of that for MacOS and Linux.

- v3.0.0
  - Fixed major copy/paste bugs introduced in comfyui-frontend-package==1.30.2

- v2.7.2
  - Fixed a minor bug that was caused by having medium/large comments within normal comments and/or large comments within medium ones.

- v2.7.1
  - Fixed a bug in lora pattern regex that caused problems when user starts writing a lora pattern before already writen lora patterns.

- v2.7.0
  - CTRL + Left Mouse Click on a Yellow wildcard -> opens the file with your default text editor (Notepad++ recommended)

- v2.6.0
  - Wildcard patterns now become red when pointing to a .txt file that does not exist

- v2.5.2
  - Bug fix: Lora Preview Tooltips are no longer case sensitive

- v2.5.1
  - [Lora Manager](https://github.com/willmiao/ComfyUI-Lora-Manager) preview tooltips now show up on Lora patterns even if they are within comments 

- v2.5.0
  - Placing the mouse over Lora patterns will now display a preview tooltip with an image/video IF you have [willmiao/ComfyUI-Lora-Manager](https://github.com/willmiao/ComfyUI-Lora-Manager) installed and its managing your loras.

- v2.0.0
  - Adjust Font Size with CTRL + Mouse Wheel Up/Down 
  - Wildcards now support sub-directories like so: '\_\_Folder1\Folder2\filename\_\_'
  - Added LORA loading from prompt support and it supports up to 2 model/clip

- v1.1.0
  - hardcoded font case to white instead of foreground var to prevent possible conflicts whith custom ComfyUI Themes
  - fixed mouse wheel up/down overriding default's ComfyUI behavior
  - TAB key now adds 4 consequent spaces

- v1.0.0
  - Initial release
