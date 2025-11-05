## ComfyUI-RichText_BasicDynamicPrompts
A node with basic Dynamic Prompts support that uses javascript to simulate a Rich Text textbox.

<img width="1074" height="1834" alt="1" src="https://github.com/user-attachments/assets/f549e109-dae0-4201-810a-07dd54d19200" />


# Changelog
- v2.5.0
  - Placing the mouse over Lora patterns will now display a preview tooltip with an image/video IF you have 'willmiao/ComfyUI-Lora-Manager' installed and its managing your loras.

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
